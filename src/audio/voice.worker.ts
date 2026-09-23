/** Renders the robot voices off the main thread (see voice.ts). */
import { renderVoices, type VoiceSpec } from './voice.ts';

self.onmessage = (e: MessageEvent<{ id: number; spec: VoiceSpec }>) => {
  const pcm = renderVoices(e.data.spec);
  (self as unknown as Worker).postMessage({ id: e.data.id, pcm }, [pcm.buffer]);
};
