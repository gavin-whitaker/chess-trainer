import { settings } from '../settings';

// Sounds are synthesized with WebAudio so the app ships no audio files and works offline.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!settings().sound) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// iOS only allows audio after a user gesture; warm the context on the first touch.
export function unlockAudio(): void {
  const unlock = () => {
    const a = audio();
    if (a) {
      const b = a.createBuffer(1, 1, 22050);
      const s = a.createBufferSource();
      s.buffer = b;
      s.connect(a.destination);
      s.start(0);
    }
    window.removeEventListener('touchend', unlock);
    window.removeEventListener('click', unlock);
  };
  window.addEventListener('touchend', unlock);
  window.addEventListener('click', unlock);
}

function knock(a: AudioContext, t: number, freq: number, gain: number, decay: number): void {
  const len = Math.floor(a.sampleRate * decay);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 1.4;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(a.destination);
  src.start(t);
}

function tone(a: AudioContext, t: number, freq: number, dur: number, gain = 0.18, type: OscillatorType = 'sine'): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export type SoundKind = 'move' | 'capture' | 'check' | 'castle' | 'promote' | 'correct' | 'wrong' | 'solved' | 'start' | 'tick';

export function play(kind: SoundKind): void {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.005;
  switch (kind) {
    case 'move':
      knock(a, t, 1800, 2.2, 0.06);
      knock(a, t, 600, 1.2, 0.08);
      break;
    case 'capture':
      knock(a, t, 2400, 2.8, 0.05);
      knock(a, t + 0.035, 900, 2.4, 0.09);
      break;
    case 'castle':
      knock(a, t, 1800, 2, 0.06);
      knock(a, t + 0.09, 1600, 2, 0.06);
      break;
    case 'check':
      knock(a, t, 1800, 2, 0.06);
      tone(a, t + 0.02, 880, 0.18, 0.08, 'triangle');
      break;
    case 'promote':
      knock(a, t, 1800, 2, 0.06);
      tone(a, t + 0.02, 1046, 0.2, 0.08, 'triangle');
      break;
    case 'correct':
      tone(a, t, 784, 0.12, 0.12);
      tone(a, t + 0.08, 1175, 0.2, 0.12);
      break;
    case 'wrong':
      tone(a, t, 220, 0.25, 0.14, 'square');
      tone(a, t + 0.1, 185, 0.3, 0.12, 'square');
      break;
    case 'solved':
      tone(a, t, 659, 0.15, 0.13);
      tone(a, t + 0.1, 880, 0.15, 0.13);
      tone(a, t + 0.2, 1319, 0.35, 0.13);
      break;
    case 'start':
      tone(a, t, 523, 0.12, 0.1);
      tone(a, t + 0.12, 784, 0.25, 0.1);
      break;
    case 'tick':
      knock(a, t, 3000, 0.8, 0.02);
      break;
  }
}

// iOS Safari has no Vibration API, but toggling a native <input switch> fires the system haptic (iOS 18+).
let hapticLabel: HTMLLabelElement | null = null;

export function haptic(kind: 'light' | 'heavy' = 'light'): void {
  if (!settings().haptics) return;
  if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
    try {
      if (navigator.vibrate(kind === 'heavy' ? [20, 40, 20] : 12)) return;
    } catch {
      /* not supported */
    }
  }
  if (!hapticLabel) {
    hapticLabel = document.createElement('label');
    hapticLabel.style.cssText = 'position:fixed;left:-100px;top:-100px;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    hapticLabel.append(input);
    document.body.append(hapticLabel);
  }
  hapticLabel.click();
  if (kind === 'heavy') setTimeout(() => hapticLabel?.click(), 90);
}
