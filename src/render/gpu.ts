/**
 * WebGPU renderer: compute simulation + velocity-aligned streaks into an HDR
 * persistence buffer, then a composite pass (halation, tonemap, grain).
 */
import commonWGSL from './shaders/common.wgsl?raw';
import simHead from './shaders/sim_head.wgsl?raw';
import simMain from './shaders/sim_main.wgsl?raw';
import particlesWGSL from './shaders/particles.wgsl?raw';
import fadeWGSL from './shaders/fade.wgsl?raw';
import compositeWGSL from './shaders/composite.wgsl?raw';
import bloomWGSL from './shaders/bloom.wgsl?raw';
import splatWGSL from './shaders/splat.wgsl?raw';
import mipWGSL from './shaders/mipdown.wgsl?raw';
import { uniformStructWGSL, UNIFORM_SLOT_BYTES } from '../engine/uniforms';

const behaviourFiles = import.meta.glob('./shaders/behaviours/*.wgsl', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const MAX_STEPS = 4;
const PARTICLE_BYTES = 64;
const ACCUM_FORMAT: GPUTextureFormat = 'rgba16float';
const BLOOM_LEVELS = 6;
const MATTER_MIPS = 5;

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly count: number;
  private device!: GPUDevice;
  private ctx!: GPUCanvasContext;
  private format!: GPUTextureFormat;
  private uniformBuf!: GPUBuffer;
  private particleBuf!: GPUBuffer;
  private simPipe!: GPUComputePipeline;
  private simBG!: GPUBindGroup;
  private fadePipe!: GPURenderPipeline;
  private partPipe!: GPURenderPipeline;
  private partBG!: GPUBindGroup;
  private compPipe!: GPURenderPipeline;
  private compBG!: GPUBindGroup;
  private compLayout!: GPUBindGroupLayout;
  private sampler!: GPUSampler;
  private accum!: GPUTexture;
  private bloomDown!: GPURenderPipeline;
  private bloomUp!: GPURenderPipeline;
  private bloomLayout!: GPUBindGroupLayout;
  private bloomMips: GPUTexture[] = [];
  private bloomPasses: { target: GPUTextureView; bg: GPUBindGroup; up: boolean; ub: GPUBuffer }[] = [];
  bloomRadius = 1;
  private splatPipe!: GPUComputePipeline;
  private resolvePipe!: GPUComputePipeline;
  private splatLayout!: GPUBindGroupLayout;
  private splatBG!: GPUBindGroup;
  private mipPipe!: GPURenderPipeline;
  private mipLayout!: GPUBindGroupLayout;
  private matterTex!: GPUTexture;
  private densBuf!: GPUBuffer;
  private mipPasses: { target: GPUTextureView; bg: GPUBindGroup }[] = [];
  matterW = 1;
  matterScale = 0.6;
  matterH = 1;
  width = 0;
  height = 0;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement, count: number) {
    this.canvas = canvas;
    this.count = count;
  }

  static async supported(): Promise<boolean> {
    return !!navigator.gpu && !!(await navigator.gpu.requestAdapter());
  }

  async init(initial: Float32Array) {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('WebGPU adapter unavailable');
    this.device = await adapter.requestDevice();
    this.device.lost.then((info) => console.error('GPU device lost', info.message));
    this.ctx = this.canvas.getContext('webgpu')!;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.ctx.configure({ device: this.device, format: this.format, alphaMode: 'opaque' });

    const d = this.device;
    const prelude = commonWGSL + '\n' + uniformStructWGSL();
    const behaviours = Object.values(behaviourFiles).join('\n');

    this.uniformBuf = d.createBuffer({ size: UNIFORM_SLOT_BYTES * MAX_STEPS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particleBuf = d.createBuffer({ size: this.count * PARTICLE_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.particleBuf, 0, initial);

    const uniformEntry = (binding: number, visibility: number): GPUBindGroupLayoutEntry => ({
      binding, visibility, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: UNIFORM_SLOT_BYTES },
    });

    // simulation
    const simLayout = d.createBindGroupLayout({
      entries: [uniformEntry(0, GPUShaderStage.COMPUTE), { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }],
    });
    const simModule = this.module('sim', [prelude, simHead, behaviours, simMain].join('\n'));
    this.simPipe = d.createComputePipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [simLayout] }),
      compute: { module: simModule, entryPoint: 'main' },
    });
    this.simBG = d.createBindGroup({
      layout: simLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf, size: UNIFORM_SLOT_BYTES } },
        { binding: 1, resource: { buffer: this.particleBuf } },
      ],
    });

    // persistence decay: dst *= constant
    const fadeModule = this.module('fade', fadeWGSL);
    this.fadePipe = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: fadeModule, entryPoint: 'vs' },
      fragment: {
        module: fadeModule, entryPoint: 'fs',
        targets: [{
          format: ACCUM_FORMAT,
          blend: {
            color: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' },
            alpha: { srcFactor: 'zero', dstFactor: 'constant', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // streaks, additive
    const partLayout = d.createBindGroupLayout({
      entries: [
        uniformEntry(0, GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT),
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    const partModule = this.module('particles', prelude + particlesWGSL);
    this.partPipe = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [partLayout] }),
      vertex: { module: partModule, entryPoint: 'vs' },
      fragment: {
        module: partModule, entryPoint: 'fs',
        targets: [{
          format: ACCUM_FORMAT,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
    });
    this.partBG = d.createBindGroup({
      layout: partLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf, size: UNIFORM_SLOT_BYTES } },
        { binding: 1, resource: { buffer: this.particleBuf } },
      ],
    });

    // composite
    this.compLayout = d.createBindGroupLayout({
      entries: [
        uniformEntry(0, GPUShaderStage.FRAGMENT),
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const compModule = this.module('composite', prelude + compositeWGSL);
    this.compPipe = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.compLayout] }),
      vertex: { module: compModule, entryPoint: 'vs' },
      fragment: { module: compModule, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

    // matter: splat → resolve → mip chain
    this.splatLayout = d.createBindGroupLayout({
      entries: [
        uniformEntry(0, GPUShaderStage.COMPUTE),
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      ],
    });
    const splatModule = this.module('splat', prelude + splatWGSL);
    const splatPL = d.createPipelineLayout({ bindGroupLayouts: [this.splatLayout] });
    this.splatPipe = d.createComputePipeline({ layout: splatPL, compute: { module: splatModule, entryPoint: 'splat' } });
    this.resolvePipe = d.createComputePipeline({ layout: splatPL, compute: { module: splatModule, entryPoint: 'resolve' } });
    this.mipLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const mipModule = this.module('mipdown', mipWGSL);
    this.mipPipe = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.mipLayout] }),
      vertex: { module: mipModule, entryPoint: 'vs' },
      fragment: { module: mipModule, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
    });

    // bloom chain
    this.bloomLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const bloomModule = this.module('bloom', bloomWGSL);
    const bloomPL = d.createPipelineLayout({ bindGroupLayouts: [this.bloomLayout] });
    this.bloomDown = d.createRenderPipeline({
      layout: bloomPL,
      vertex: { module: bloomModule, entryPoint: 'vs' },
      fragment: { module: bloomModule, entryPoint: 'fs_down', targets: [{ format: ACCUM_FORMAT }] },
    });
    this.bloomUp = d.createRenderPipeline({
      layout: bloomPL,
      vertex: { module: bloomModule, entryPoint: 'vs' },
      fragment: {
        module: bloomModule, entryPoint: 'fs_up',
        targets: [{
          format: ACCUM_FORMAT,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        }],
      },
    });

    this.resize();
  }

  private module(label: string, code: string): GPUShaderModule {
    const m = this.device.createShaderModule({ label, code });
    m.getCompilationInfo().then((info) => {
      for (const msg of info.messages) {
        if (msg.type === 'error') console.error(`[${label}.wgsl] ${msg.lineNum}:${msg.linePos} ${msg.message}`);
      }
    });
    return m;
  }

  /** Returns true when the drawing buffer changed size. */
  resize(): boolean {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (w === this.width && h === this.height && this.accum) return false;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.accum?.destroy();
    this.accum = this.device.createTexture({
      size: [w, h],
      format: ACCUM_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.buildBloom();
    this.buildMatter();
    this.buildCompBG();
    return true;
  }

  private buildBloom() {
    const d = this.device;
    for (const t of this.bloomMips) t.destroy();
    this.bloomMips = [];
    let w = this.width, h = this.height;
    for (let i = 0; i < BLOOM_LEVELS; i++) {
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
      this.bloomMips.push(d.createTexture({
        size: [w, h], format: ACCUM_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      }));
    }
    const pass = (src: GPUTexture, target: GPUTexture, up: boolean, karis: boolean) => {
      const ub = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(ub, 0, new Float32Array([1 / src.width, 1 / src.height, this.bloomRadius, karis ? 1 : 0]));
      return {
        target: target.createView(),
        up,
        ub,
        bg: d.createBindGroup({
          layout: this.bloomLayout,
          entries: [
            { binding: 0, resource: src.createView() },
            { binding: 1, resource: this.sampler },
            { binding: 2, resource: { buffer: ub } },
          ],
        }),
      };
    };
    for (const p of this.bloomPasses) p.ub.destroy();
    this.bloomPasses = [];
    this.bloomMips.forEach((m, i) => this.bloomPasses.push(pass(i === 0 ? this.accum : this.bloomMips[i - 1], m, false, i === 0)));
    for (let i = BLOOM_LEVELS - 2; i >= 0; i--) this.bloomPasses.push(pass(this.bloomMips[i + 1], this.bloomMips[i], true, false));
  }

  setMatterScale(k: number) {
    if (k === this.matterScale || !this.accum) return;
    this.matterScale = k;
    this.buildMatter();
    this.buildCompBG();
  }

  setBloomRadius(r: number) {
    if (r === this.bloomRadius) return;
    this.bloomRadius = r;
    this.buildBloom();
    this.buildCompBG();
  }

  private buildCompBG() {
    this.compBG = this.device.createBindGroup({
      layout: this.compLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf, size: UNIFORM_SLOT_BYTES } },
        { binding: 1, resource: this.accum.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.bloomMips[0].createView() },
        { binding: 4, resource: this.matterTex.createView() },
      ],
    });
  }

  /** Matter field at CSS-pixel resolution (grain texture shouldn't scale with DPR). */
  private buildMatter() {
    const d = this.device;
    this.matterTex?.destroy();
    this.densBuf?.destroy();
    this.matterW = Math.max(8, Math.round((this.width / this.dpr) * this.matterScale));
    this.matterH = Math.max(8, Math.round((this.height / this.dpr) * this.matterScale));
    this.matterTex = d.createTexture({
      size: [this.matterW, this.matterH], format: 'rgba16float', mipLevelCount: MATTER_MIPS,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.densBuf = d.createBuffer({ size: this.matterW * this.matterH * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.splatBG = d.createBindGroup({
      layout: this.splatLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf, size: UNIFORM_SLOT_BYTES } },
        { binding: 1, resource: { buffer: this.particleBuf } },
        { binding: 2, resource: { buffer: this.densBuf } },
        { binding: 3, resource: this.matterTex.createView({ baseMipLevel: 0, mipLevelCount: 1 }) },
      ],
    });
    this.mipPasses = [];
    for (let i = 1; i < MATTER_MIPS; i++) {
      this.mipPasses.push({
        target: this.matterTex.createView({ baseMipLevel: i, mipLevelCount: 1 }),
        bg: d.createBindGroup({
          layout: this.mipLayout,
          entries: [
            { binding: 0, resource: this.matterTex.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }) },
            { binding: 1, resource: this.sampler },
          ],
        }),
      });
    }
  }

  /**
   * One displayed frame: run each fixed simulation step with its own uniform
   * slot, then draw with the last one. `decay` is the persistence multiplier.
   */
  frame(steps: Float32Array[], last: Float32Array, decay: number, draw = true) {
    const d = this.device;
    const n = Math.min(steps.length, MAX_STEPS);
    for (let s = 0; s < n; s++) d.queue.writeBuffer(this.uniformBuf, s * UNIFORM_SLOT_BYTES, steps[s]);
    const drawSlot = n > 0 ? n - 1 : 0;
    if (n === 0) d.queue.writeBuffer(this.uniformBuf, 0, last);
    const drawOffset = drawSlot * UNIFORM_SLOT_BYTES;

    const enc = d.createCommandEncoder();
    if (n > 0) {
      const cp = enc.beginComputePass();
      cp.setPipeline(this.simPipe);
      const groups = Math.ceil(this.count / 256);
      for (let s = 0; s < n; s++) {
        cp.setBindGroup(0, this.simBG, [s * UNIFORM_SLOT_BYTES]);
        cp.dispatchWorkgroups(groups);
      }
      cp.end();
    }

    if (n > 0) {
      enc.clearBuffer(this.densBuf);
      const sp = enc.beginComputePass();
      sp.setPipeline(this.splatPipe);
      sp.setBindGroup(0, this.splatBG, [drawOffset]);
      sp.dispatchWorkgroups(Math.ceil(this.count / 256));
      sp.setPipeline(this.resolvePipe);
      sp.dispatchWorkgroups(Math.ceil(this.matterW / 16), Math.ceil(this.matterH / 16));
      sp.end();
      for (const m of this.mipPasses) {
        const mp = enc.beginRenderPass({ colorAttachments: [{ view: m.target, loadOp: 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
        mp.setPipeline(this.mipPipe);
        mp.setBindGroup(0, m.bg);
        mp.draw(3);
        mp.end();
      }
    }

    if (draw) {
      const acc = enc.beginRenderPass({
        colorAttachments: [{ view: this.accum.createView(), loadOp: 'load', storeOp: 'store' }],
      });
      acc.setPipeline(this.fadePipe);
      acc.setBlendConstant({ r: decay, g: decay, b: decay, a: decay });
      acc.draw(3);
      acc.setPipeline(this.partPipe);
      acc.setBindGroup(0, this.partBG, [drawOffset]);
      acc.draw(4, this.count);
      acc.end();
    }

    for (const b of this.bloomPasses) {
      const bp = enc.beginRenderPass({ colorAttachments: [{ view: b.target, loadOp: b.up ? 'load' : 'clear', clearValue: [0, 0, 0, 0], storeOp: 'store' }] });
      bp.setPipeline(b.up ? this.bloomUp : this.bloomDown);
      bp.setBindGroup(0, b.bg);
      bp.draw(3);
      bp.end();
    }

    const out = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }],
    });
    out.setPipeline(this.compPipe);
    out.setBindGroup(0, this.compBG, [drawOffset]);
    out.draw(3);
    out.end();
    d.queue.submit([enc.finish()]);
  }

}
