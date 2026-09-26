/**
 * SCULPTURE (prototype, dev only: /sculpture.html?word=love, or ?random). The proof of one idea before the piece is
 * rebuilt around it: Jev's reading of a word as one mass of a million particles, legible — each answer a stream, as
 * large as Jev's answer is strong — moving through four states in a loop: the word, the column of its readings, the
 * flow, the core. Answers come from the recorded fixtures (no call); ?random invents a reading.
 */
import shader from './sculpture.wgsl?raw';
import fixtures from '../jev/fixtures.json';

type Answer = { type: string; choice?: string; confidence?: number; score?: number; noul?: number; probabilities?: Record<string, number> };
type StreamDef = { id: string; text: string; v: number; cat: number };

const N = 1 << 20;
const LOOP = 22;
/** The sculpture stands right of centre; the reading's labels take the left margin. */
const OFFSET = 0.22;
const query = new URLSearchParams(location.search);
const word = query.get('word') ?? 'love';
const random = query.has('random');

// ---- the reading → streams
const FEELING = new Set(['emotion', 'kind', 'act', 'valence', 'arousal', 'dominance', 'irony', 'nostalgia', 'loneliness', 'closeness', 'loss', 'sacred']);
const SAFETY = new Set(['violence', 'hate', 'insult', 'sexual', 'real_person', 'distress', 'shareable', 'absurd']);
const MATTER = new Set(['material', 'texture', 'shape', 'motion', 'rhythm', 'colour', 'sense', 'time', 'daytime', 'domain', 'who']);
function streamsOf(answers: Record<string, Answer>): StreamDef[] {
  return Object.entries(answers).map(([id, a]) => {
    let v = 0, text = '';
    if (a.type === 'choice') { const top = Math.max(...Object.values(a.probabilities ?? { x: 0 })); v = top * (0.5 + 0.5 * (a.confidence ?? 1)); text = a.choice ?? ''; }
    else if (a.type === 'score') { v = (a.score ?? 0) / 4; text = v.toFixed(2); }
    else { v = a.noul ?? 0; text = v.toFixed(2); }
    const cat = FEELING.has(id) ? 0 : MATTER.has(id) ? 2 : SAFETY.has(id) ? 3 : 1;
    return { id, text, v: Math.min(1, Math.max(0, v)), cat };
  });
}
const answers = (fixtures as Record<string, Record<string, Answer>>)[word] ?? (fixtures as Record<string, Record<string, Answer>>).love;
let streams = streamsOf(answers);
if (random) streams = streams.map((s) => ({ ...s, v: Math.pow(Math.random(), 1.6), text: '' }));

// palettes by kind of question: feeling warm (amber → rose), the physical cold (ice → white), matter violet → blue,
// safety a red that only shows when it is strong
const PAL: [number, number, number][][] = [
  [[0.55, 0.12, 0.08], [1.0, 0.72, 0.52]],
  [[0.12, 0.2, 0.32], [0.86, 0.9, 0.95]],
  [[0.16, 0.12, 0.36], [0.62, 0.66, 0.95]],
  [[0.5, 0.05, 0.03], [1.0, 0.25, 0.15]],
];
const share = streams.map((s) => 0.12 + Math.pow(s.v, 1.5));
const total = share.reduce((a, b) => a + b, 0);
// the column: strata stacked top to bottom in Jev's order, each as thick as its share
const H = 3.1;
let yTop = H / 2;
const layers = streams.map((s, k) => {
  const th = (share[k] / total) * H;
  const y = yTop - th / 2;
  yTop -= th;
  const [c0, c1] = PAL[s.cat];
  const col = c0.map((x, j) => x + (c1[j] - x) * s.v);
  const bright = s.cat === 3 ? 0.1 + 2.0 * s.v * s.v : 0.15 + 1.2 * s.v * s.v;
  return { y, th, col, bright };
});

// ---- the typed word, as points
function wordPoints(text: string): Float32Array {
  const cw = 1024, ch = 256;
  const c = new OffscreenCanvas(cw, ch);
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.font = '600 150px "IBM Plex Mono", ui-monospace, monospace';
  const size = Math.min(200, (150 * (cw - 40)) / Math.max(1, g.measureText(text).width));
  g.font = `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
  const tw = Math.max(1, g.measureText(text).width);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cw / 2, ch / 2);
  const d = g.getImageData(0, 0, cw, ch).data;
  const pts: number[] = [];
  // (the word stands where the column will, as wide as the column)
  for (let y = 0; y < ch; y += 2) for (let x = 0; x < cw; x += 2) if (d[(y * cw + x) * 4 + 3] > 128) pts.push(((x - cw / 2) / tw) * 1.3, -((y - ch / 2) / tw) * 1.3, 0, 0);
  return new Float32Array(pts.length ? pts : [0, 0, 0, 0]);
}

// ---- WebGPU
const canvas = document.getElementById('gl') as HTMLCanvasElement;
const labels = document.getElementById('labels') as HTMLCanvasElement;
const lg = labels.getContext('2d')!;
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
const dev = await adapter!.requestDevice();
const ctx = canvas.getContext('webgpu')!;
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device: dev, format, alphaMode: 'opaque' });
const mod = dev.createShaderModule({ code: shader });
mod.getCompilationInfo().then((i) => i.messages.forEach((m) => m.type === 'error' && console.error(`[sculpture.wgsl] ${m.lineNum}:${m.linePos} ${m.message}`)));

const UB = 160;
const ubuf = dev.createBuffer({ size: UB, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const pbuf = dev.createBuffer({ size: N * 32, usage: GPUBufferUsage.STORAGE });
const sdata = new Float32Array(streams.length * 8);
layers.forEach((l, k) => sdata.set([l.y, l.th, streams[k].v, streams[k].cat, ...l.col, l.bright], k * 8));
const sbuf = dev.createBuffer({ size: sdata.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
dev.queue.writeBuffer(sbuf, 0, sdata);
const table = new Uint32Array(1024);
for (let i = 0, k = 0, acc = share[0] / total; i < 1024; i++) { while ((i + 0.5) / 1024 > acc && k < streams.length - 1) acc += share[++k] / total; table[i] = k; }
const tbuf = dev.createBuffer({ size: table.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
dev.queue.writeBuffer(tbuf, 0, table);
await document.fonts.load('600 150px "IBM Plex Mono"').catch(() => {});
const wpts = wordPoints(random ? '' : word);
const wbuf = dev.createBuffer({ size: wpts.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
dev.queue.writeBuffer(wbuf, 0, wpts);

const HDR: GPUTextureFormat = 'rgba16float';
const add: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const sim = dev.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: 'simulate' } });
const points = dev.createRenderPipeline({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs' }, fragment: { module: mod, entryPoint: 'fs', targets: [{ format: HDR, blend: add }] }, primitive: { topology: 'point-list' } });
const fade = dev.createRenderPipeline({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs_full' }, fragment: { module: mod, entryPoint: 'fs_fade', targets: [{ format: HDR }] } });
const present = dev.createRenderPipeline({ layout: 'auto', vertex: { module: mod, entryPoint: 'vs_full' }, fragment: { module: mod, entryPoint: 'fs_present', targets: [{ format }] } });
const simBG = dev.createBindGroup({ layout: sim.getBindGroupLayout(0), entries: [0, 1, 2, 3, 4].map((b) => ({ binding: b, resource: { buffer: [ubuf, pbuf, sbuf, tbuf, wbuf][b] } })) });
const ptsBG = dev.createBindGroup({ layout: points.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 6, resource: { buffer: pbuf } }, { binding: 2, resource: { buffer: sbuf } }] });

let acc: GPUTexture[] = [], fadeBG: GPUBindGroup[] = [], presBG: GPUBindGroup[] = [];
let W = 0, Hh = 0, colX = 0, colW = 0;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  W = Math.round(innerWidth * dpr); Hh = Math.round(innerHeight * dpr);
  canvas.width = W; canvas.height = Hh; labels.width = W; labels.height = Hh;
  // the column: 9:16, the full height
  colW = Math.min(W, Math.round((Hh * 9) / 16)); colX = Math.round((W - colW) / 2);
  acc.forEach((t) => t.destroy());
  acc = [0, 1].map(() => dev.createTexture({ size: [colW, Hh], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }));
  fadeBG = [0, 1].map((k) => dev.createBindGroup({ layout: fade.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 5, resource: acc[1 - k].createView() }] }));
  presBG = [0, 1].map((k) => dev.createBindGroup({ layout: present.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 5, resource: acc[k].createView() }] }));
}
resize();
addEventListener('resize', resize);

// ---- camera
function perspective(fov: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fov / 2);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far / (near - far), -1, 0, 0, (near * far) / (near - far), 0];
}
function lookAt(e: number[], c: number[]) {
  const sub = (a: number[], b: number[]) => a.map((x, i) => x - b[i]);
  const norm = (a: number[]) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(e, c)), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1];
}
function mul(a: number[], b: number[]) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function project(vp: number[], p: number[]): [number, number] {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12], y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  return [colX + (x / w * 0.5 + 0.5) * colW, (1 - (y / w * 0.5 + 0.5)) * Hh];
}

// ---- the loop: the word → the column → the flow → the core
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const u = new ArrayBuffer(UB);
const uf = new Float32Array(u), uu = new Uint32Array(u);
let t0 = performance.now(), last = t0, frame = 0, reset = true;
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const T = ((now - t0) / 1000) % LOOP;
  if (T < dt * 1.5) reset = true;
  const kWord = ss(0, 0.6, T) * (1 - ss(3.2, 4.5, T));
  const kStrata = ss(3.2, 4.5, T) * (1 - ss(9.5, 11, T));
  const kFlow = ss(9.5, 11, T) * (1 - ss(16, 17.5, T));
  const kCurl = 0.1 * kStrata + kFlow * 0.8 + 0.05 * kWord;
  const kCollapse = ss(16, 17.5, T) * (1 - ss(20, 21, T));
  const exposure = ss(0, 0.8, T) * (1 - ss(20.2, 21.8, T));
  const yaw = 0.35 + T * 0.035, dist = 4.2 - 0.6 * kCollapse;
  const eye = [Math.sin(yaw) * dist, 0.15 + 0.4 * Math.sin(T * 0.11), Math.cos(yaw) * dist];
  const vp = mul(perspective((45 * Math.PI) / 180, colW / Hh, 0.1, 40), lookAt(eye, [OFFSET * 0.4, 0, 0]));
  uf.set(vp, 0);
  uf[16] = T; uf[17] = dt; uu[18] = N; uu[19] = streams.length;
  uf[20] = kWord; uf[21] = Math.max(kStrata, kFlow * 0.18); uf[22] = kCurl; uf[23] = kCollapse;
  uu[24] = wpts.length / 4; uf[25] = reset ? 1 : 0; uf[26] = exposure * 0.02; uf[27] = mix(0.8, 0.45, kWord);
  uf[28] = colW; uf[29] = Hh; uf[30] = colX; uf[31] = 0;
  dev.queue.writeBuffer(ubuf, 0, u);
  reset = false;

  const enc = dev.createCommandEncoder();
  const cp = enc.beginComputePass(); cp.setPipeline(sim); cp.setBindGroup(0, simBG); cp.dispatchWorkgroups(Math.ceil(N / 256)); cp.end();
  const k = frame++ % 2;
  const view = acc[k].createView();
  const fp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
  fp.setPipeline(fade); fp.setBindGroup(0, fadeBG[k]); fp.draw(3); fp.end();
  const pp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'load', storeOp: 'store' }] });
  pp.setPipeline(points); pp.setBindGroup(0, ptsBG); pp.draw(N); pp.end();
  const out = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }] });
  out.setViewport(colX, 0, colW, Hh, 0, 1);
  out.setPipeline(present); out.setBindGroup(0, presBG[k]); out.draw(3); out.end();
  dev.queue.submit([enc.finish()]);

  // the reading, legible: each stratum's name and value beside it while the column stands
  lg.clearRect(0, 0, W, Hh);
  const la = kStrata * (1 - kCurl * 0.6);
  if (la > 0.02 && !random) {
    lg.font = `${Math.round(9 * (Hh / 1100) * 1.4)}px "IBM Plex Mono", ui-monospace, monospace`;
    lg.textBaseline = 'middle';
    lg.textAlign = 'right';
    lg.strokeStyle = '#e8e4dc';
    lg.lineWidth = 1;
    // the labels stand in the column's left margin, a hairline to their stratum
    const edge = colX + colW * 0.36;
    layers.forEach((l, i) => {
      if (l.th < 0.04) return;
      const [x, y] = project(vp, [OFFSET - 0.28 * (0.55 + 1.3 * streams[i].v), l.y, 0]);
      lg.globalAlpha = la * (0.3 + 0.6 * streams[i].v);
      lg.fillStyle = '#e8e4dc';
      lg.fillText(`${streams[i].id.toUpperCase()}  ${streams[i].text}`, edge - 6, y);
      lg.beginPath(); lg.moveTo(edge, y); lg.lineTo(Math.max(edge, x - 4), y); lg.stroke();
    });
    lg.globalAlpha = 1;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
(window as unknown as { __sculpture: { loop: number } }).__sculpture = { loop: LOOP };
