/* เพลงประกอบสร้างจาก WebAudio ล้วน ไม่ต้องโหลดไฟล์เสียงเข้ามา
   เป็นลูปสั้น ๆ วนไปเรื่อย ๆ เสียงเบา ๆ ไม่บังเสียงเอฟเฟกต์ในเกม */

let ctx = null, master = null, timer = null, playing = false;
let step = 0, nextTime = 0;

/* แต่ละด่านมีเพลงของตัวเอง ต่างกันทั้งคีย์ จังหวะ และเสียงเครื่องดนตรี */
const TUNES = {
  // ล็อบบี้: Am-F-C-G สบาย ๆ เหมือนเดิม
  lobby: {
    bpm: 104, lead: 'square', pad: 'sine', bassType: 'triangle', hatVol: 1,
    chords: [[220.00, 261.63, 329.63], [174.61, 220.00, 261.63], [261.63, 329.63, 392.00], [196.00, 246.94, 293.66]],
    bass: [110.00, 87.31, 130.81, 98.00],
    melody: [0, 2, 1, 2, 0, 1, 2, 1],
  },
  // โรงเรียน: C-G-Am-F สดใส เร็วกว่านิด เหมือนเพลงพักกลางวัน
  school: {
    bpm: 118, lead: 'square', pad: 'triangle', bassType: 'triangle', hatVol: 1.1,
    chords: [[261.63, 329.63, 392.00], [196.00, 246.94, 293.66], [220.00, 261.63, 329.63], [174.61, 220.00, 261.63]],
    bass: [130.81, 98.00, 110.00, 87.31],
    melody: [0, 1, 2, 1, 2, 0, 1, 2],
  },
  // บ้าน: Dm-Bb-F-C ช้า อบอุ่น ใช้เสียงนุ่ม
  house: {
    bpm: 88, lead: 'triangle', pad: 'sine', bassType: 'sine', hatVol: 0.5,
    chords: [[293.66, 349.23, 440.00], [233.08, 293.66, 349.23], [174.61, 220.00, 261.63], [196.00, 246.94, 293.66]],
    bass: [146.83, 116.54, 87.31, 98.00],
    melody: [0, 2, 2, 1, 0, 1, 2, 0],
  },
  // สวนสัตว์: G-Em-C-D กลางแจ้ง ร่าเริง จังหวะเด้ง
  zoo: {
    bpm: 126, lead: 'sawtooth', pad: 'triangle', bassType: 'triangle', hatVol: 1.4,
    chords: [[196.00, 246.94, 293.66], [164.81, 196.00, 246.94], [261.63, 329.63, 392.00], [293.66, 369.99, 440.00]],
    bass: [98.00, 82.41, 130.81, 146.83],
    melody: [2, 0, 1, 2, 1, 0, 2, 1],
  },
};

let tune = TUNES.lobby;
let SPB = 60 / tune.bpm / 2;

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
    const chord = tune.chords[bar];

    if (beat === 0 || beat === 4) tone(tune.bass[bar], nextTime, SPB * 1.6, tune.bassType || 'triangle', 0.09);
    if (beat % 2 === 0) {
      const n = chord[tune.melody[beat] % chord.length];
      tone(n * 2, nextTime, SPB * 0.85, tune.lead, 0.022);
    }
    if (beat === 2 || beat === 6) {
      chord.forEach((f, i) => tone(f, nextTime, SPB * 1.2, tune.pad, 0.03 - i * 0.006));
    }
    hat(nextTime, (beat % 2 ? 0.012 : 0.022) * (tune.hatVol || 1));

    nextTime += SPB;
    step++;
  }
}

/* เปลี่ยนเพลงตามด่าน เรียกได้ตลอด ถ้ากำลังเล่นอยู่จะสลับให้ทันทีแบบไม่สะดุด */
export function setTune(key) {
  const t = TUNES[key] || TUNES.lobby;
  if (t === tune) return;
  tune = t;
  SPB = 60 / tune.bpm / 2;
  step = 0;
  if (playing && ctx) nextTime = Math.max(nextTime, ctx.currentTime + 0.05);
}

export function currentTune() {
  return Object.keys(TUNES).find((k) => TUNES[k] === tune) || 'lobby';
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
