/* เพลงประกอบสร้างจาก WebAudio ล้วน ไม่ต้องโหลดไฟล์เสียงเข้ามา
   เป็นลูปสั้น ๆ วนไปเรื่อย ๆ เสียงเบา ๆ ไม่บังเสียงเอฟเฟกต์ในเกม */

let ctx = null, master = null, timer = null, playing = false;
let step = 0, nextTime = 0;

const BPM = 104;
const SPB = 60 / BPM / 2;            // ครึ่งจังหวะ
const CHORDS = [                     // Am - F - C - G วนสี่ห้อง
  [220.00, 261.63, 329.63],
  [174.61, 220.00, 261.63],
  [261.63, 329.63, 392.00],
  [196.00, 246.94, 293.66],
];
const BASS = [110.00, 87.31, 130.81, 98.00];
const MELODY = [0, 2, 1, 2, 0, 1, 2, 1];

function tone(freq, at, dur, type, vol, glide) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g); g.connect(master);
  o.start(at); o.stop(at + dur + 0.02);
}

function hat(at, vol) {
  const n = ctx.createBufferSource();
  const len = (ctx.sampleRate * 0.05) | 0;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  n.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  const g = ctx.createGain();
  g.gain.value = vol;
  n.connect(hp); hp.connect(g); g.connect(master);
  n.start(at);
}

function schedule() {
  if (!playing) return;
  while (nextTime < ctx.currentTime + 0.35) {
    const bar = Math.floor(step / 8) % 4;
    const beat = step % 8;
    const chord = CHORDS[bar];

    if (beat === 0 || beat === 4) tone(BASS[bar], nextTime, SPB * 1.6, 'triangle', 0.09);
    if (beat % 2 === 0) {
      const n = chord[MELODY[beat] % chord.length];
      tone(n * 2, nextTime, SPB * 0.85, 'square', 0.022);
    }
    if (beat === 2 || beat === 6) {
      chord.forEach((f, i) => tone(f, nextTime, SPB * 1.2, 'sine', 0.03 - i * 0.006));
    }
    hat(nextTime, beat % 2 ? 0.012 : 0.022);

    nextTime += SPB;
    step++;
  }
}

export function isPlaying() { return playing; }

export function start() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (playing) return true;
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.1;
    schedule();
    timer = setInterval(schedule, 120);
    return true;
  } catch (e) {
    playing = false;
    return false;
  }
}

export function stop() {
  playing = false;
  if (timer) { clearInterval(timer); timer = null; }
}

export function toggle() {
  if (playing) { stop(); return false; }
  return start();
}

export function setVolume(v) {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}
