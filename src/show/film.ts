/**
 * The film's score: Ryoji Ikeda, data.matrix ("illusor", N01SE), measured frame by frame from the artist's
 * reference (references/craft/set3/ikeda.mp4, 30 fps). The film turns on a strict 3.0 s cycle; each row is one
 * cycle, one character per frame (90 frames):
 *   .  black      #  the matter (the relief, in the film)      W  a white slab of data      +  dim data (digits, bars)
 * The verdict replays these cycles exactly — their figures, their order — and the word fills them: its matter, its
 * readings, and which cycles it reaches (director.ts).
 */

export const FRAME = 1 / 30;
export const CYCLE = 3.0;

export type FilmSection = 'A' | 'break' | 'B' | 'R';

export const FILM: { at: number; section: FilmSection; frames: string }[] = [
  { at: 12, section: 'A', frames: '.##.##.####.##.##.#.##.##.#.##############################################################' },
  { at: 15, section: 'A', frames: '..####......##.##.####.##.##.#.##.##.#.##.##.####.#+++.++.++.+.++.++......................' },
  { at: 18, section: 'A', frames: '.+++#...#.##.##.##.##.#.##.##.##.#########################################################' },
  { at: 21, section: 'A', frames: '..+.++.+.........##.##.###.##.##.##..##.##.##..##.########################################' },
  { at: 24, section: 'A', frames: '######################.##.################################################################' },
  { at: 27, section: 'A', frames: '..####......#.##.##.####.##.##.#.##.##.#.##.##.###########################################' },
  { at: 30, section: 'A', frames: '.....##.##.####.##.##.#.##.##.############################################################' },
  { at: 33, section: 'break', frames: '++++++....................................................................................' },
  { at: 36, section: 'B', frames: '.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.WWWWWWWWWWWWWWWWW' },
  { at: 39, section: 'B', frames: '###########.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W.W+#+#+#+#+#+#+#+#++++++++++++++...++++++' },
  { at: 42, section: 'B', frames: '########.#.#.#.#.#.#.#.#.#.#.#.#.########################################################.' },
  { at: 45, section: 'B', frames: '..+.+........+.+..#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.#.###.##.##.#.##.##.......................' },
  { at: 48, section: 'R', frames: '###.##.#.#################################################################################' },
  { at: 51, section: 'R', frames: '..##+##.....#.##.##.#.##.##.#.##.##.#.######..##.#########################################' },
  { at: 54, section: 'R', frames: '++++++###.##.#.##.##.#.##.##.#.##.###########################################.............' },
];

/** A cycle's frames as runs: each a symbol, its first frame and its length (frames). */
export function runs(frames: string): { sym: string; at: number; len: number }[] {
  const out: { sym: string; at: number; len: number }[] = [];
  for (let i = 0; i < frames.length;) {
    let j = i;
    while (j < frames.length && frames[j] === frames[i]) j++;
    out.push({ sym: frames[i], at: i, len: j - i });
    i = j;
  }
  return out;
}
