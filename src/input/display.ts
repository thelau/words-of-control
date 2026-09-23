/**
 * The centred line: typed text + hard-blinking rectangular cursor (§3).
 */

export class Display {
  private text = document.getElementById('text')!;
  private cursor = document.getElementById('cursor')!;
  private line = document.getElementById('line')!;
  private blinkTimer = 0;
  private blinking = true;
  private on = true;

  constructor() {
    this.startBlink();
  }

  set(value: string) {
    this.text.textContent = value;
    this.wake();
  }

  /** Keypresses keep the cursor solid; blinking resumes after one period. */
  wake() {
    this.on = true;
    this.paint();
    if (this.blinking) this.startBlink();
  }

  private startBlink() {
    clearInterval(this.blinkTimer);
    this.blinkTimer = window.setInterval(() => {
      this.on = !this.on;
      this.paint();
    }, 530);
  }

  private paint() {
    this.cursor.style.visibility = this.on ? 'visible' : 'hidden';
  }

  /** Solid, not blinking (ANALYZING). */
  hold() {
    this.blinking = false;
    clearInterval(this.blinkTimer);
    this.on = true;
    this.paint();
  }

  showCursor() {
    this.cursor.style.display = '';
    this.blinking = true;
    this.wake();
  }

  hideCursor() {
    clearInterval(this.blinkTimer);
    this.cursor.style.display = 'none';
  }

  /** 300 ms fade (reaction, fallback). */
  fadeText(): Promise<void> {
    this.line.classList.add('fading');
    return new Promise((res) => setTimeout(() => {
      this.text.textContent = '';
      this.line.classList.remove('fading');
      res();
    }, 300));
  }

  /** 0 ms cut (barred). A refusal must read as a refusal. */
  cutText() {
    this.text.textContent = '';
  }

  hideAll(hidden: boolean) {
    this.line.style.visibility = hidden ? 'hidden' : '';
  }
}
