/** Record one performance (canvas + sound) to WebM, from a moment before it to the end of its tail. */
import type { App } from '../main.ts';

export function startRecording(app: App, perform: () => void) {
  const stream = app.canvas.captureStream(60);
  app.audio()?.record.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 20e6 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    a.download = `words-of-control-${Date.now()}.webm`;
    a.click();
  };
  rec.start();
  setTimeout(perform, 600);
  let seen = false;
  const hook = () => {
    if (app.show()) seen = true;
    if (seen && !app.show()) {
      app.frameHooks.delete(hook);
      setTimeout(() => rec.stop(), 800);
    }
  };
  app.frameHooks.add(hook);
}
