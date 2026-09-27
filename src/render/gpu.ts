/**
 * WebGPU renderer: the whole piece is one fullscreen pass (grid.wgsl) drawn straight to the canvas at native
 * resolution — the room, the wait, the performance and the black are its modes. Text comes from two atlases painted
 * once at boot: the digits, and every name the grid shows (show/grid.ts LABELS).
 */
import commonWGSL from './shaders/common.wgsl?raw';
import gridWGSL from './shaders/grid.wgsl?raw';
import { FRAME_BYTES, frameStructWGSL } from './frame.ts';
import { LABELS } from '../show/grid.ts';

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
  private rectBuf!: GPUBuffer;
  private pipe!: GPURenderPipeline;
  private bg!: GPUBindGroup;
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
    this.rectBuf = d.createBuffer({ size: 32 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
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
      { binding: 4, resource: { buffer: this.rectBuf } },
    ] });
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

  /** The marked cells' rectangles this frame (show/grid.ts keyRects()). */
  setRects(data: Float32Array) {
    this.d.queue.writeBuffer(this.rectBuf, 0, data);
  }

  render(frame: Float32Array) {
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
