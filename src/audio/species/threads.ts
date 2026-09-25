/** Threads's voice (placeholder: to be built). One continuous voice over all its shots (VoiceKit). */
import type { VoiceKit } from '../clips.ts';

export function threads(k: VoiceKit): number[] {
  k.pulse().connect(k.out);
  if (k.strike) k.blow();
  return [k.tune(k.f0)];
}
