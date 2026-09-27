/**
 * WebGPU renderer: one render pass straight to the canvas at native resolution — a fullscreen triangle (grid.wgsl:
 * the room, the wait, the performance and the black are its modes), then, during a step that shows a space, its
 * points and lines (space.wgsl) in the step's rectangle. Text comes from two atlases painted once at boot: the
 * digits, and every name the grid shows (show/grid.ts LABELS).
 */
import commonWGSL from './shaders/common.wgsl?raw';
import gridWGSL from './shaders/grid.wgsl?raw';
import spaceWGSL from './shaders/space.wgsl?raw';
import { FRAME_BYTES, frameStructWGSL } from './frame.ts';
import { LABELS } from '../show/grid.ts';
import type { Geometry } from '../show/space.ts';

/** A space to draw this frame: its camera, palette and rectangle (device px), and which points and lines. */
export type SpaceDraw = { cam: Float32Array; rect: [number, number, number, number]; points: [number, number]; lines: [number, number] };

export class Renderer {
  /** Canvas size in device pixels. */
  width = 0;
  height = 0;
  dpr = 1;
  /** Last measured GPU time of a frame, in ms (dev only; -1 when unavailable). */
  gpuMs = -1;
  readonly canvas: HTMLCanvasElement;
  private d!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private fBuf!: GPUBuffer;
  private scoreBuf!: GPUBuffer;
  private pipe!: GPURenderPipeline;
  private bg!: GPUBindGroup;
  private camBuf!: GPUBuffer;
  private pointPipe!: GPURenderPipeline;
  private linePipe!: GPURenderPipeline;
  private camBg!: GPUBindGroup;
  private pointBuf: GPUBuffer | null = null;
  private lineBuf: GPUBuffer | null = null;
  private qs: GPUQuerySet | null = null;
  private qResolve: GPUBuffer | null = null;
  private qRead: GPUBuffer | null = null;
  private qBusy = false;

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
    const d = (this.d = await adapter.requestDevice({ requiredFeatures: timing ? ['timestamp-query'] : [] }));
    if (timing) {
      this.qs = d.createQuerySet({ type: 'timestamp', count: 2 });
      this.qResolve = d.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
      this.qRead = d.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    }
    d.lost.then((i) => console.error('GPU device lost', i.message));
    this.ctx = this.canvas.getContext('webgpu')!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: d, format, alphaMode: 'opaque' });

    this.fBuf = d.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.scoreBuf = d.createBuffer({ size: 16 * 1024, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.camBuf = d.createBuffer({ size: 56 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    await document.fonts.load('400 40px "IBM Plex Mono"');
    const m = d.createShaderModule({ label: 'grid', code: commonWGSL + '\n' + frameStructWGSL() + '\n' + gridWGSL });
    this.pipe = await d.createRenderPipelineAsync({
      label: 'grid', layout: 'auto',
      vertex: { module: m, entryPoint: 'vs_full' },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format }] },
    });
    this.bg = d.createBindGroup({ layout: this.pipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.fBuf } },
      { binding: 1, resource: atlas(d, 16, 40, 60, 44, [...'0123456789ABCDEF.-x:'], 'center').createView() },
      { binding: 2, resource: { buffer: this.scoreBuf } },
      { binding: 3, resource: atlas(d, 4, 512, 48, 34, LABELS, 'left').createView() },
    ] });
    // the spaces: additive light, no depth (points and lines add up where they crowd)
    const sm = d.createShaderModule({ label: 'space', code: spaceWGSL });
    const add: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
    const camLayout = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }] });
    const layout = d.createPipelineLayout({ bindGroupLayouts: [camLayout] });
    const vtx = (stepMode: GPUVertexStepMode): GPUVertexBufferLayout => ({ arrayStride: 16, stepMode, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] });
    this.pointPipe = await d.createRenderPipelineAsync({
      label: 'points', layout,
      vertex: { module: sm, entryPoint: 'vs_point', buffers: [vtx('instance')] },
      fragment: { module: sm, entryPoint: 'fs_point', targets: [{ format, blend: add }] },
    });
    this.linePipe = await d.createRenderPipelineAsync({
      label: 'lines', layout, primitive: { topology: 'line-list' },
      vertex: { module: sm, entryPoint: 'vs_line', buffers: [vtx('vertex')] },
      fragment: { module: sm, entryPoint: 'fs_line', targets: [{ format, blend: add }] },
    });
    this.camBg = d.createBindGroup({ layout: camLayout, entries: [{ binding: 0, resource: { buffer: this.camBuf } }] });
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (w === this.width && h === this.height) return;
    this.canvas.width = this.width = w;
    this.canvas.height = this.height = h;
  }

  /** This performance's score (show/grid.ts pack()). */
  setScore(data: Float32Array) {
    this.d.queue.writeBuffer(this.scoreBuf, 0, data);
  }

  /** This performance's spaces (show/space.ts build()). */
  setSpaces(geo: Geometry) {
    const up = (data: Float32Array) => {
      const b = this.d.createBuffer({ size: Math.max(16, data.byteLength), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.d.queue.writeBuffer(b, 0, data);
      return b;
    };
    this.pointBuf?.destroy();
    this.lineBuf?.destroy();
    this.pointBuf = up(geo.points);
    this.lineBuf = up(geo.lines);
  }

  render(frame: Float32Array, space: SpaceDraw | null) {
    const d = this.d;
    d.queue.writeBuffer(this.fBuf, 0, frame);
    const enc = d.createCommandEncoder();
    const timed = !!this.qs && !this.qBusy;
    const p = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }],
      ...(timed ? { timestampWrites: { querySet: this.qs!, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {}),
    });
    p.setPipeline(this.pipe);
    p.setBindGroup(0, this.bg);
    p.draw(3);
    if (space && this.pointBuf && this.lineBuf) {
      const [x, y, w, h] = space.rect;
      d.queue.writeBuffer(this.camBuf, 0, space.cam);
      p.setViewport(x, y, w, h, 0, 1);
      p.setScissorRect(x, y, w, h);
      p.setBindGroup(0, this.camBg);
      p.setPipeline(this.linePipe);
      p.setVertexBuffer(0, this.lineBuf);
      p.draw(space.lines[1], 1, space.lines[0]);
      p.setPipeline(this.pointPipe);
      p.setVertexBuffer(0, this.pointBuf);
      p.draw(6, space.points[1], 0, space.points[0]);
    }
    p.end();
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
}

/** Strings painted white in IBM Plex Mono, one per slot (w × h px, `perRow` a row), for the shader to read. */
function atlas(d: GPUDevice, perRow: number, w: number, h: number, px: number, items: string[], align: CanvasTextAlign): GPUTexture {
  const c = new OffscreenCanvas(w * perRow, h * Math.ceil(items.length / perRow));
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.font = `400 ${px}px "IBM Plex Mono", monospace`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  items.forEach((s, i) => g.fillText(s, (i % perRow) * w + (align === 'center' ? w / 2 : 0), Math.floor(i / perRow) * h + h / 2 + 2));
  const tex = d.createTexture({
    size: [c.width, c.height], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  d.queue.copyExternalImageToTexture({ source: c }, { texture: tex }, [c.width, c.height]);
  return tex;
}
