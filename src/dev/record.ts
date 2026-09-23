/** Record one loop (canvas + audio) to WebM (§12.6). */
import type { App } from '../main';

export function startRecording(canvas: HTMLCanvasElement, audio: MediaStream | null, fire: () => void, app: App) {
  const stream = canvas.captureStream(60);
  audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16e6 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    a.download = `loop-${Date.now()}.webm`;
    a.click();
  };
  rec.start();
  setTimeout(fire, 800);
  let seen = false;
  const hook = () => {
    if (app.field.reaction) seen = true;
    if (seen && !app.field.reaction) {
      app.frameHooks.delete(hook);
      setTimeout(() => rec.stop(), 1000);
    }
  };
  app.frameHooks.add(hook);
}
