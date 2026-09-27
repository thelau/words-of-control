/**
 * The per-frame uniform block the grid reads. All fields are f32, so the WGSL struct and the Float32Array are
 * generated from this one list.
 */
const FIELDS = [
  'resX', 'resY', 'dpr', 'time',
  // the grid's top-left corner and cell size (px, show/grid.ts layout())
  'gridX', 'gridY', 'cs',
  // 0 a performance (lt: seconds into it), 1 the room, 2 waiting for the machine, 3 black
  'mode', 'lt',
  // the step on screen (show/grid.ts): which drawing (VIZ index), whether it fills the frame, how far through the
  // beat (0..1)
  'viz', 'full', 'beatU',
  // a white frame (a negative word's strobe, main.ts)
  'flash',
  // the room: how far it has come back from black, how much the typing has charged it, the last keystroke
  'fade', 'charge', 'kick',
] as const;
type Field = (typeof FIELDS)[number];

const INDEX = new Map<string, number>(FIELDS.map((k, i) => [k, i]));
export const FRAME_BYTES = Math.ceil((FIELDS.length * 4) / 16) * 16;

export const frameStructWGSL = () => `struct FrameU {\n${FIELDS.map((k) => `  ${k}: f32,`).join('\n')}\n};\n`;

export class Frame {
  readonly f32 = new Float32Array(FRAME_BYTES / 4);

  set(k: Field, v: number) {
    this.f32[INDEX.get(k)!] = v;
  }
}
