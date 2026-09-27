/**
 * WebGPU renderer: one scene per frame (room, appraisal, a verdict clip, or
 * black) into an HDR target, then bloom and the film composite. Scenes are
 * fullscreen shaders except relief (compute height field + shading), sand
 * (compute simulation + camera + lens), data (points in 3D, instanced, with
 * their own bokeh), ink (a fluid simulation, its dye lit as a surface) and solids
 * (a traced cluster of spheres, placed and packed once a frame by a compute pass).
 */
import commonWGSL from './shaders/common.wgsl?raw';
import roomWGSL from './shaders/room.wgsl?raw';
import appraisalWGSL from './shaders/appraisal.wgsl?raw';
import reliefWGSL from './shaders/relief.wgsl?raw';
import fieldWGSL from './shaders/field.wgsl?raw';
import sandWGSL from './shaders/sand.wgsl?raw';
import sandDrawWGSL from './shaders/sand_draw.wgsl?raw';
import inkWGSL from './shaders/ink.wgsl?raw';
import solidsWGSL from './shaders/solids.wgsl?raw';
import matrixWGSL from './shaders/matrix.wgsl?raw';
import threadsWGSL from './shaders/threads.wgsl?raw';
import { PLUGINS, PLUGIN_NAMES, type PluginName } from '../show/species/index.ts';
import blitWGSL from './shaders/blit.wgsl?raw';
import dofWGSL from './shaders/dof.wgsl?raw';
import bloomWGSL from './shaders/bloom.wgsl?raw';
import compositeWGSL from './shaders/composite.wgsl?raw';
import { FRAME_BYTES, frameStructWGSL } from './frame.ts';

export type Layer = 'room' | 'black' | 'appraisal' | 'matrix' | 'relief' | 'sand' | 'data' | 'ink' | 'solids' | PluginName;

const PLUGIN_WGSL: Record<PluginName, string> = { threads: threadsWGSL };

const HDR: GPUTextureFormat = 'rgba16float';
const BLOOM_LEVELS = 6;
const TAPE_MAX = 1024;
const RELIEF_RES = 512;
/** Points drawn by the data layer. */
const FIELD_N = 250_000;
const SAND_N = 512;
/** The ink's velocity and dye grids (keep in step with ink.wgsl VN, DN), and its pressure iterations. */
const INK_VEL = 256;
const INK_DYE = 1280;
const INK_JACOBI = 24;
const WORD_W = 2048;
const WORD_H = 160;

type Target = { tex: GPUTexture; view: GPUTextureView };

export class Renderer {
  /** Canvas (output) size in device pixels. */
  width = 0;
  height = 0;
  dpr = 1;
  /** Size of the soft layers' scene target (CSS pixels × quality). */
  lowW = 0;
  lowH = 0;
  /** 1, 0.75 or 0.5: the soft layers' resolution and the data layer's point count (lowered on slow devices). */
  quality = 1;
  /** The share of the data layer's points a formation uses (the dense geometric ones all; the costly soft ones fewer). */
  dataShare = 1;
  private d!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private fBuf!: GPUBuffer;
  private tapeBuf!: GPUBuffer;
  private sandVel!: GPUBuffer;
  private camBuf!: GPUBuffer;
  private partBuf!: GPUBuffer;
  private sandTex!: GPUTexture;
  private wrapSampler!: GPUSampler;
  private sand: GPUBuffer[] = [];
  private inkVel: GPUTexture[] = [];
  private inkP: GPUTexture[] = [];
  private inkDiv!: GPUTexture;
  private inkDye: GPUTexture[] = [];
  private inkFib: GPUTexture[] = [];
  private solidsBuf!: GPUBuffer;
  /** The reading's numbers for the matrix (show/matrix.ts pack()). */
  private readingBuf!: GPUBuffer;
  /** The plug-in species (src/show/species): pipelines, state, and their own last two frames (trails). */
  private plug: Partial<Record<PluginName, { setup: GPUComputePipeline; draw: GPURenderPipeline; bgSetup: GPUBindGroup; state: GPUBuffer; hist: Target[]; bgDraw: GPUBindGroup[]; bgDof: GPUBindGroup[]; flip: number }>> = {};
  private drawLayout!: GPUBindGroupLayout;
  private sampler!: GPUSampler;
  private atlas!: GPUTexture;
  private heightTex!: GPUTexture;
  private wordTex!: GPUTexture;
  private scene!: Target;   // soft layers, CSS resolution
  private sceneHi!: Target; // the appraisal's data, native resolution
  private trail!: Target;
  private bloomMips: GPUTexture[] = [];
  private bloomPasses: { view: GPUTextureView; bg: GPUBindGroup; up: boolean; ub: GPUBuffer }[] = [];
  private p: Record<string, GPURenderPipeline> = {};
  private c: Record<string, GPUComputePipeline> = {};
  private bg: Record<string, GPUBindGroup> = {};
  private qs: GPUQuerySet | null = null;
  private qResolve: GPUBuffer | null = null;
  private qRead: GPUBuffer | null = null;
  private qBusy = false;
  /** Last measured GPU time of a frame, in ms (dev only; -1 when unavailable). */
  gpuMs = -1;

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  static async supported(): Promise<boolean> {
    return !!navigator.gpu && !!(await navigator.gpu.requestAdapter());
  }

  async init() {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('WebGPU adapter unavailable');
    // dev: true GPU time per frame (timestamp queries), read by the perf check
    const timing = import.meta.env.DEV && adapter.features.has('timestamp-query');
    this.d = await adapter.requestDevice({ requiredFeatures: timing ? ['timestamp-query'] : [] });
    if (timing) {
      this.qs = this.d.createQuerySet({ type: 'timestamp', count: 2 });
      this.qResolve = this.d.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.qRead = this.d.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    }
    this.d.lost.then((i) => console.error('GPU device lost', i.message));
    this.ctx = this.canvas.getContext('webgpu')!;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: this.d, format: this.format, alphaMode: 'opaque' });
    const d = this.d;

    this.fBuf = d.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.tapeBuf = d.createBuffer({ size: TAPE_MAX * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.sand = [0, 1].map(() => d.createBuffer({ size: SAND_N * SAND_N * 4, usage: GPUBufferUsage.STORAGE }));
    this.sandVel = d.createBuffer({ size: SAND_N * SAND_N * 8, usage: GPUBufferUsage.STORAGE });
    this.camBuf = d.createBuffer({ size: 5 * 16, usage: GPUBufferUsage.STORAGE });
    this.partBuf = d.createBuffer({ size: FIELD_N * 32, usage: GPUBufferUsage.STORAGE });
    this.sandTex = d.createTexture({ size: [SAND_N, SAND_N], format: HDR, usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING });
    this.wrapSampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' });
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    this.atlas = await makeGlyphAtlas(d);
    this.wordTex = d.createTexture({ size: [WORD_W, WORD_H], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    const inkTex = (n: number) => d.createTexture({ size: [n, n], format: HDR,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST });
    this.inkVel = [inkTex(INK_VEL), inkTex(INK_VEL)];
    this.inkP = [inkTex(INK_VEL), inkTex(INK_VEL)];
    this.inkDiv = inkTex(INK_VEL);
    this.inkDye = [inkTex(INK_DYE), inkTex(INK_DYE)];
    this.inkFib = [inkTex(INK_DYE), inkTex(INK_DYE)];
    this.solidsBuf = d.createBuffer({ size: (6 + 4 * 96) * 16, usage: GPUBufferUsage.STORAGE }); // camera, bound, count, 96 spheres + their physics (solids.wgsl)
    this.heightTex = d.createTexture({
      size: [RELIEF_RES, RELIEF_RES], format: HDR,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });

    const pre = commonWGSL + '\n' + frameStructWGSL();
    const mod = (label: string, code: string) => {
      const m = d.createShaderModule({ label, code });
      m.getCompilationInfo().then((info) => info.messages.filter((x) => x.type === 'error')
        .forEach((x) => console.error(`[${label}.wgsl] ${x.lineNum}:${x.linePos} ${x.message}`)));
      return m;
    };
    const full = (label: string, code: string, format: GPUTextureFormat = HDR) => {
      const m = mod(label, pre + code);
      return d.createRenderPipeline({
        label, layout: 'auto',
        vertex: { module: m, entryPoint: 'vs_full' },
        fragment: { module: m, entryPoint: 'fs', targets: [{ format }] },
      });
    };
    const add: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };

    this.p.room = full('room', roomWGSL);
    this.p.appraisal = full('appraisal', appraisalWGSL);
    this.p.matrix = full('matrix', matrixWGSL);
    this.readingBuf = d.createBuffer({ size: 64 * 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.p.blit = full('blit', blitWGSL);
    this.p.dof = full('dof', dofWGSL);
    this.p.composite = full('composite', compositeWGSL, this.format);

    const relief = mod('relief', pre + reliefWGSL);
    this.c.reliefHeight = d.createComputePipeline({ layout: 'auto', compute: { module: relief, entryPoint: 'height' } });
    this.p.relief = d.createRenderPipeline({
      layout: 'auto', vertex: { module: relief, entryPoint: 'vs_full' },
      fragment: { module: relief, entryPoint: 'fs', targets: [{ format: HDR }] },
    });

    const field = mod('field', pre + fieldWGSL);
    this.c.dataCamera = d.createComputePipeline({ layout: 'auto', compute: { module: field, entryPoint: 'camera' } });
    this.c.dataSim = d.createComputePipeline({ layout: 'auto', compute: { module: field, entryPoint: 'simulate' } });
    this.p.data = d.createRenderPipeline({
      layout: 'auto', vertex: { module: field, entryPoint: 'vs' },
      fragment: { module: field, entryPoint: 'fs', targets: [{ format: HDR, blend: add }] },
      primitive: { topology: 'triangle-strip' },
    });

    const sand = mod('sand', pre + sandWGSL);
    this.c.sandVelocity = d.createComputePipeline({ layout: 'auto', compute: { module: sand, entryPoint: 'velocity' } });
    this.c.sandTransport = d.createComputePipeline({ layout: 'auto', compute: { module: sand, entryPoint: 'transport' } });
    this.c.sandBake = d.createComputePipeline({ layout: 'auto', compute: { module: sand, entryPoint: 'bake' } });
    this.c.sandRepose = d.createComputePipeline({ layout: 'auto', compute: { module: sand, entryPoint: 'repose' } });
    const sandDraw = mod('sand_draw', pre + sandDrawWGSL);
    this.p.sand = d.createRenderPipeline({
      layout: 'auto', vertex: { module: sandDraw, entryPoint: 'vs_full' },
      fragment: { module: sandDraw, entryPoint: 'fs', targets: [{ format: HDR }] },
    });

    const ink = mod('ink', pre + inkWGSL);
    for (const e of ['force', 'divergence', 'jacobi', 'project', 'dye']) this.c[`ink_${e}`] = d.createComputePipeline({ layout: 'auto', compute: { module: ink, entryPoint: e } });
    this.p.ink = d.createRenderPipeline({
      layout: 'auto', vertex: { module: ink, entryPoint: 'vs_full' },
      fragment: { module: ink, entryPoint: 'fs', targets: [{ format: HDR }] },
    });

    const solids = mod('solids', pre + solidsWGSL);
    this.c.solidsSetup = d.createComputePipeline({ layout: 'auto', compute: { module: solids, entryPoint: 'setup' } });
    this.p.solids = d.createRenderPipeline({
      layout: 'auto', vertex: { module: solids, entryPoint: 'vs_full' },
      fragment: { module: solids, entryPoint: 'fs', targets: [{ format: HDR }] },
    });

    const bloom = mod('bloom', bloomWGSL);
    const bl = (entry: string, blend?: GPUBlendState) => d.createRenderPipeline({
      layout: 'auto', vertex: { module: bloom, entryPoint: 'vs' },
      fragment: { module: bloom, entryPoint: entry, targets: [{ format: HDR, blend }] },
    });
    this.p.bloomDown = bl('fs_down');
    this.p.bloomUp = bl('fs_up', add);

    const uni = { buffer: this.fBuf };
    const group = (name: string, pipe: GPURenderPipeline | GPUComputePipeline, entries: GPUBindGroupEntry[]) => {
      this.bg[name] = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
    };
    for (const k of ['room']) group(k, this.p[k], [{ binding: 0, resource: uni }]);
    group('matrix', this.p.matrix, [
      { binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } },
      { binding: 2, resource: this.atlas.createView() }, { binding: 3, resource: { buffer: this.readingBuf } },
    ]);
    group('appraisal', this.p.appraisal, [
      { binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } },
      { binding: 2, resource: this.atlas.createView() },
      { binding: 4, resource: this.wordTex.createView() },
    ]);
    group('reliefHeight', this.c.reliefHeight, [{ binding: 0, resource: uni }, { binding: 1, resource: this.heightTex.createView() }]);
    group('relief', this.p.relief, [{ binding: 0, resource: uni }, { binding: 2, resource: this.heightTex.createView() }, { binding: 3, resource: this.sampler }]);
    // sand ping-pong: transport A→B, repose B→A (the drawing reads A)
    const sb = (b: GPUBuffer) => ({ buffer: b });
    group('sandV', this.c.sandVelocity, [{ binding: 0, resource: uni }, { binding: 4, resource: sb(this.sandVel) }]);
    group('sandT', this.c.sandTransport, [{ binding: 0, resource: uni }, { binding: 1, resource: sb(this.sand[0]) }, { binding: 2, resource: sb(this.sand[1]) }, { binding: 4, resource: sb(this.sandVel) }]);
    group('sandR', this.c.sandRepose, [{ binding: 0, resource: uni }, { binding: 1, resource: sb(this.sand[1]) }, { binding: 2, resource: sb(this.sand[0]) }]);
    group('sandB', this.c.sandBake, [{ binding: 1, resource: sb(this.sand[0]) }, { binding: 5, resource: this.sandTex.createView() }]);
    group('sand', this.p.sand, [{ binding: 0, resource: uni }, { binding: 1, resource: this.sandTex.createView() }, { binding: 3, resource: this.wrapSampler }]);
    group('dataCam', this.c.dataCamera, [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 3, resource: { buffer: this.camBuf } }]);
    group('dataSim', this.c.dataSim, [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 5, resource: { buffer: this.partBuf } }]);
    group('data', this.p.data, [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 2, resource: { buffer: this.camBuf } }, { binding: 4, resource: { buffer: this.partBuf } }]);
    // ink: velocity A → (force) B → (divergence, pressure A⇄B) → (project) A; dye A → B, copied back to A
    const v = (t: GPUTexture) => t.createView();
    const [vA, vB] = this.inkVel, [pA, pB] = this.inkP, [dA, dB] = this.inkDye;
    const lin = { binding: 10, resource: this.sampler };
    group('ink_force', this.c.ink_force, [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 2, resource: v(vA) }, { binding: 3, resource: v(vB) }, { binding: 8, resource: v(dA) }, lin]);
    group('ink_divergence', this.c.ink_divergence, [{ binding: 2, resource: v(vB) }, { binding: 7, resource: v(this.inkDiv) }]);
    group('ink_jacobiA', this.c.ink_jacobi, [{ binding: 0, resource: uni }, { binding: 4, resource: v(pA) }, { binding: 5, resource: v(pB) }, { binding: 6, resource: v(this.inkDiv) }]);
    group('ink_jacobiB', this.c.ink_jacobi, [{ binding: 0, resource: uni }, { binding: 4, resource: v(pB) }, { binding: 5, resource: v(pA) }, { binding: 6, resource: v(this.inkDiv) }]);
    group('ink_project', this.c.ink_project, [{ binding: 2, resource: v(vB) }, { binding: 3, resource: v(vA) }, { binding: 4, resource: v(pA) }]);
    const [fA, fB] = this.inkFib;
    group('ink_dye', this.c.ink_dye, [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 2, resource: v(vA) }, { binding: 8, resource: v(dA) }, { binding: 9, resource: v(dB) }, lin, { binding: 11, resource: v(fA) }, { binding: 12, resource: v(fB) }]);
    group('ink', this.p.ink, [{ binding: 0, resource: uni }, { binding: 8, resource: v(dA) }, lin, { binding: 11, resource: v(fA) }]);
    group('solidsSetup', this.c.solidsSetup, [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 2, resource: { buffer: this.solidsBuf } }]);
    group('solids', this.p.solids, [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 3, resource: { buffer: this.solidsBuf } }]);
    // the plug-in species: one fixed contract (explicit layouts, so a shader may leave any binding unused)
    const C = GPUShaderStage.COMPUTE, Fr = GPUShaderStage.FRAGMENT;
    const setupLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: C, buffer: { type: 'uniform' } }, { binding: 1, visibility: C, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: C, buffer: { type: 'storage' } }] });
    this.drawLayout = d.createBindGroupLayout({ entries: [
      { binding: 0, visibility: Fr, buffer: { type: 'uniform' } }, { binding: 1, visibility: Fr, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: Fr, buffer: { type: 'read-only-storage' } }, { binding: 5, visibility: Fr, texture: { sampleType: 'float' } },
      { binding: 6, visibility: Fr, sampler: { type: 'filtering' } }] });
    for (const name of PLUGIN_NAMES) {
      const m = mod(name, pre + PLUGIN_WGSL[name]);
      const state = d.createBuffer({ size: PLUGINS[name].state * 16, usage: GPUBufferUsage.STORAGE });
      const setup = d.createComputePipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [setupLayout] }), compute: { module: m, entryPoint: 'setup' } });
      const draw = d.createRenderPipeline({
        layout: d.createPipelineLayout({ bindGroupLayouts: [this.drawLayout] }), vertex: { module: m, entryPoint: 'vs_full' },
        fragment: { module: m, entryPoint: 'fs', targets: [{ format: HDR }] },
      });
      const bgSetup = d.createBindGroup({ layout: setupLayout, entries: [{ binding: 0, resource: uni }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 2, resource: { buffer: state } }] });
      this.plug[name] = { setup, draw, bgSetup, state, hist: [], bgDraw: [], bgDof: [], flip: 0 };
    }
    this.resize();
  }

  /** Draw the typed word once for the appraisal's opening cut (any script; never stored). */
  setWord(text: string) {
    const c = new OffscreenCanvas(WORD_W, WORD_H);
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, WORD_W, WORD_H);
    g.fillStyle = '#fff';
    // a word is drawn large; a sentence at the size that fits the texture's width, never squeezed
    g.font = '400 120px "IBM Plex Mono", ui-monospace, monospace';
    const size = Math.min(120, (120 * (WORD_W - 40)) / Math.max(1, g.measureText(text).width));
    g.font = `400 ${size.toFixed(1)}px "IBM Plex Mono", ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, WORD_W / 2, WORD_H / 2);
    this.d.queue.copyExternalImageToTexture({ source: c }, { texture: this.wordTex }, [WORD_W, WORD_H]);
  }

  /** The reading's numbers for the matrix, for this performance. */
  setReading(data: Float32Array) {
    this.d.queue.writeBuffer(this.readingBuf, 0, data);
  }

  setTape(tape: Float32Array) {
    this.d.queue.writeBuffer(this.tapeBuf, 0, tape.length > TAPE_MAX ? tape.subarray(0, TAPE_MAX) : tape);
  }

  resize(): boolean {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (w === this.width && h === this.height && this.scene && this.lowW === Math.max(1, Math.round((w / this.dpr) * this.quality))) return false;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const mk = (): Target => {
      const tex = this.d.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      return { tex, view: tex.createView() };
    };
    this.lowW = Math.max(1, Math.round((w / this.dpr) * this.quality));
    this.lowH = Math.max(1, Math.round((h / this.dpr) * this.quality));
    const mkLow = (): Target => {
      const tex = this.d.createTexture({ size: [this.lowW, this.lowH], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
      return { tex, view: tex.createView() };
    };
    this.scene?.tex.destroy();
    this.sceneHi?.tex.destroy();
    this.trail?.tex.destroy();
    this.scene = mkLow();
    this.sceneHi = mk();
    this.trail = mkLow();
    this.buildBloom();
    this.bg.blit = this.d.createBindGroup({ layout: this.p.blit.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.trail.view }] });
    this.bg.dof = this.d.createBindGroup({ layout: this.p.dof.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.trail.view }] });
    // each plug-in species keeps its own last frame (ping-pong): drawn into one, reading the other
    for (const name of PLUGIN_NAMES) {
      const pl = this.plug[name]!;
      for (const h of pl.hist) h.tex.destroy();
      pl.hist = [mkLow(), mkLow()];
      pl.bgDraw = [0, 1].map((k) => this.d.createBindGroup({ layout: this.drawLayout, entries: [
        { binding: 0, resource: { buffer: this.fBuf } }, { binding: 1, resource: { buffer: this.tapeBuf } }, { binding: 3, resource: { buffer: pl.state } },
        { binding: 5, resource: pl.hist[1 - k].view }, { binding: 6, resource: this.sampler }] }));
      pl.bgDof = [0, 1].map((k) => this.d.createBindGroup({ layout: this.p.dof.getBindGroupLayout(0), entries: [{ binding: 0, resource: pl.hist[k].view }] }));
    }
    this.bg.composite = this.d.createBindGroup({
      layout: this.p.composite.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.fBuf } }, { binding: 1, resource: this.scene.view },
        { binding: 2, resource: this.sampler }, { binding: 3, resource: this.bloomMips[0].createView() },
        { binding: 4, resource: this.sceneHi.view },
      ],
    });
    return true;
  }

  private buildBloom() {
    const d = this.d;
    for (const t of this.bloomMips) t.destroy();
    for (const p of this.bloomPasses) p.ub.destroy();
    this.bloomMips = [];
    this.bloomPasses = [];
    let w = this.lowW, h = this.lowH;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      this.bloomMips.push(d.createTexture({ size: [w, h], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }));
    }
    const pass = (src: GPUTexture, dst: GPUTexture, up: boolean, karis: boolean) => {
      const ub = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(ub, 0, new Float32Array([1 / src.width, 1 / src.height, 1, karis ? 1 : 0]));
      const pl = up ? this.p.bloomUp : this.p.bloomDown;
      return {
        view: dst.createView(), up, ub,
        bg: d.createBindGroup({
          layout: pl.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: src.createView() }, { binding: 1, resource: this.sampler }, { binding: 2, resource: { buffer: ub } }],
        }),
      };
    };
    this.bloomMips.forEach((m, i) => this.bloomPasses.push(pass(i === 0 ? this.scene.tex : this.bloomMips[i - 1], m, false, i === 0)));
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) this.bloomPasses.push(pass(this.bloomMips[i + 1], this.bloomMips[i], true, false));
  }

  /**
   * Draw one frame of `layer`. `frame` is the full uniform block (time, local
   * time, appraisal…). `hi`
   * draws the appraisal at native resolution (text and lines).
   */
  render(layer: Layer, frame: Float32Array, hi = false) {
    const d = this.d;
    d.queue.writeBuffer(this.fBuf, 0, frame);
    this.lastLayer = layer;
    const enc = d.createCommandEncoder();
    const timed = !!this.qs && !this.qBusy;
    // the frame's first pass stamps its start; the composite stamps its end
    let first = timed;
    const stamp = (): { timestampWrites?: GPURenderPassTimestampWrites } => {
      if (!first) return {};
      first = false;
      return { timestampWrites: { querySet: this.qs!, beginningOfPassWriteIndex: 0 } };
    };
    const fullPass = (pipe: GPURenderPipeline, bg: GPUBindGroup, view = this.scene.view, extra: object = stamp()) => {
      const p = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }], ...extra });
      p.setPipeline(pipe);
      p.setBindGroup(0, bg);
      p.draw(3);
      p.end();
    };

    if (layer === 'black') {
      enc.beginRenderPass({ colorAttachments: [{ view: this.scene.view, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }], ...stamp() }).end();
    } else if (layer === 'relief') {
      this.reliefHeight(enc, stamp);
      fullPass(this.p.relief, this.bg.relief);
    } else if (layer === 'sand') {
      const cp = enc.beginComputePass(stamp() as GPUComputePassDescriptor);
      const wg = Math.ceil(SAND_N / 16);
      for (let k = 0; k < 2; k++) { // two steps a frame (the flow is scaled for it in sand.wgsl)
        cp.setPipeline(this.c.sandVelocity); cp.setBindGroup(0, this.bg.sandV); cp.dispatchWorkgroups(wg, wg);
        cp.setPipeline(this.c.sandTransport); cp.setBindGroup(0, this.bg.sandT); cp.dispatchWorkgroups(wg, wg);
        cp.setPipeline(this.c.sandRepose); cp.setBindGroup(0, this.bg.sandR); cp.dispatchWorkgroups(wg, wg);
      }
      cp.setPipeline(this.c.sandBake); cp.setBindGroup(0, this.bg.sandB); cp.dispatchWorkgroups(wg, wg);
      cp.end();
      // the camera draws into the spare low-res target with its blur in alpha; the lens resolves it into the scene
      fullPass(this.p.sand, this.bg.sand, this.trail.view);
      fullPass(this.p.dof, this.bg.dof, this.scene.view, {});
    } else if (layer === 'data') {
      // the camera once, then the points into the spare target (cleared: no trails), then onto the scene
      const cp = enc.beginComputePass(stamp() as GPUComputePassDescriptor);
      cp.setPipeline(this.c.dataCamera); cp.setBindGroup(0, this.bg.dataCam); cp.dispatchWorkgroups(1);
      const n = Math.round(FIELD_N * this.dataShare);
      cp.setPipeline(this.c.dataSim); cp.setBindGroup(0, this.bg.dataSim); cp.dispatchWorkgroups(Math.ceil(n / 256));
      cp.end();
      const tp = enc.beginRenderPass({ colorAttachments: [{ view: this.trail.view, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      tp.setPipeline(this.p.data);
      tp.setBindGroup(0, this.bg.data);
      tp.draw(4, Math.round(n * this.quality));
      tp.end();
      fullPass(this.p.blit, this.bg.blit);
    } else if (layer === 'ink') {
      const cp = enc.beginComputePass(stamp() as GPUComputePassDescriptor);
      const run = (pipe: string, bg: string, n: number) => { cp.setPipeline(this.c[pipe]); cp.setBindGroup(0, this.bg[bg]); cp.dispatchWorkgroups(n / 16, n / 16); };
      run('ink_force', 'ink_force', INK_VEL);
      run('ink_divergence', 'ink_divergence', INK_VEL);
      for (let k = 0; k < INK_JACOBI; k++) run('ink_jacobi', k % 2 ? 'ink_jacobiB' : 'ink_jacobiA', INK_VEL);
      run('ink_project', 'ink_project', INK_VEL);
      run('ink_dye', 'ink_dye', INK_DYE);
      cp.end();
      enc.copyTextureToTexture({ texture: this.inkDye[1] }, { texture: this.inkDye[0] }, [INK_DYE, INK_DYE]);
      enc.copyTextureToTexture({ texture: this.inkFib[1] }, { texture: this.inkFib[0] }, [INK_DYE, INK_DYE]);
      fullPass(this.p.ink, this.bg.ink);
    } else if (layer === 'solids') {
      const cp = enc.beginComputePass(stamp() as GPUComputePassDescriptor);
      cp.setPipeline(this.c.solidsSetup); cp.setBindGroup(0, this.bg.solidsSetup); cp.dispatchWorkgroups(1);
      cp.end();
      // like the sand: drawn with its blur in alpha into the spare target, resolved by the lens
      fullPass(this.p.solids, this.bg.solids, this.trail.view, {});
      fullPass(this.p.dof, this.bg.dof, this.scene.view, {});
    } else if (layer in this.plug) {
      // a plug-in species: its setup, its frame (into its own history, its blur in alpha), then the lens
      const pl = this.plug[layer as PluginName]!;
      const cp = enc.beginComputePass(stamp() as GPUComputePassDescriptor);
      cp.setPipeline(pl.setup); cp.setBindGroup(0, pl.bgSetup); cp.dispatchWorkgroups(PLUGINS[layer as PluginName].groups);
      cp.end();
      const k = pl.flip;
      pl.flip = 1 - k;
      fullPass(pl.draw, pl.bgDraw[k], pl.hist[k].view, {});
      fullPass(this.p.dof, pl.bgDof[k], this.scene.view, {});
    } else if ((layer === 'appraisal' || layer === 'matrix') && hi) {
      fullPass(this.p[layer], this.bg[layer], this.sceneHi.view);
      enc.beginRenderPass({ colorAttachments: [{ view: this.scene.view, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] }).end();
    } else {
      fullPass(this.p[layer], this.bg[layer]);
    }

    for (const b of this.bloomPasses) {
      const bp = enc.beginRenderPass({ colorAttachments: [{ view: b.view, loadOp: b.up ? 'load' : 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      bp.setPipeline(b.up ? this.p.bloomUp : this.p.bloomDown);
      bp.setBindGroup(0, b.bg);
      bp.draw(3);
      bp.end();
    }
    fullPass(this.p.composite, this.bg.composite, this.ctx.getCurrentTexture().createView(),
      timed ? { timestampWrites: { querySet: this.qs!, endOfPassWriteIndex: 1 } } : {});
    if (timed) {
      enc.resolveQuerySet(this.qs!, 0, 2, this.qResolve!, 0);
      enc.copyBufferToBuffer(this.qResolve!, 0, this.qRead!, 0, 16);
    }
    d.queue.submit([enc.finish()]);
    if (timed) {
      this.qBusy = true;
      this.qRead!.mapAsync(GPUMapMode.READ).then(() => {
        const t = new BigUint64Array(this.qRead!.getMappedRange());
        this.gpuMs = Number(t[1] - t[0]) / 1e6;
        this.qRead!.unmap();
        this.qBusy = false;
      });
    }
  }

  private lastLayer: Layer = 'room';
  private heightTick = 0;
  private heightLayer: Layer | null = null;
  /** The relief's height field drifts slowly: recomputed every other frame (and at once when its layer starts). */
  private reliefHeight(enc: GPUCommandEncoder, stamp: () => { timestampWrites?: GPURenderPassTimestampWrites }) {
    if (this.heightTick++ % 2 === 1 && this.heightLayer === this.lastLayer) return;
    this.heightLayer = this.lastLayer;
    const cp = enc.beginComputePass(stamp() as GPUComputePassDescriptor);
    cp.setPipeline(this.c.reliefHeight);
    cp.setBindGroup(0, this.bg.reliefHeight);
    cp.dispatchWorkgroups(RELIEF_RES / 16, RELIEF_RES / 16);
    cp.end();
  }

  /** Draw every layer once so no pipeline compiles mid-performance. */
  warmUp(frame: Float32Array) {
    for (const l of ['room', 'appraisal', 'matrix', 'relief', 'sand', 'data', 'ink', 'solids', ...PLUGIN_NAMES, 'black'] as Layer[]) this.render(l, frame, l === 'appraisal' || l === 'matrix');
  }

}

/** Glyphs for the appraisal numbers: row 0 "0-9A-F", row 1 ".-x:" then blank. */
async function makeGlyphAtlas(d: GPUDevice): Promise<GPUTexture> {
  await document.fonts.load('400 40px "IBM Plex Mono"');
  const cw = 40, ch = 60;
  const c = new OffscreenCanvas(cw * 16, ch * 2);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.font = '400 44px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  ['0123456789ABCDEF', '.-x:'].forEach((r, y) => [...r].forEach((ch2, x) => g.fillText(ch2, x * cw + cw / 2, y * ch + ch / 2 + 2)));
  const tex = d.createTexture({
    size: [c.width, c.height], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  d.queue.copyExternalImageToTexture({ source: c }, { texture: tex }, [c.width, c.height]);
  return tex;
}
