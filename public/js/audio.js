/*
 * 音效与背景音乐：全部用 WebAudio 实时合成，不依赖任何音频文件。
 * 点击 = 短促木琴音；背景乐 = 缓慢暖色和弦 + 轻琶音。
 */

let ctx = null;
let master = null;
let musicTimer = null;
let enabled = true;
let step = 0;

const CHORDS = [
  [220.00, 261.63, 329.63],   // Am
  [174.61, 220.00, 261.63],   // F
  [196.00, 246.94, 329.63],   // G
  [164.81, 207.65, 246.94]    // Em
];

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function isEnabled() { return enabled; }

export function setEnabled(v) {
  enabled = !!v;
  if (!enabled) stopMusic();
  else { ensure(); startMusic(); }
  return enabled;
}

export function toggle() { return setEnabled(!enabled); }

/** 提示音：tap 普通点击 / buy 购买 / gold 黄金 / err 出错 */
export function click(kind = 'tap') {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'triangle';
  const freq = kind === 'buy' ? 784 : kind === 'gold' ? 1174 : kind === 'err' ? 320 : 587;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.1);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(kind === 'err' ? 0.12 : 0.16, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.18);
}

function pluck(freq, t, dur, vol) {
  const c = ctx;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** 背景音乐：每 1.6 秒一个轻琶音和弦，音量很轻 */
export function startMusic() {
  if (!enabled || musicTimer) return;
  const c = ensure();
  if (!c) return;
  const tick = () => {
    if (!ctx) return;
    const t = ctx.currentTime + 0.02;
    const chord = CHORDS[Math.floor(step / 4) % CHORDS.length];
    const note = chord[step % chord.length];
    pluck(note * 2, t, 1.1, 0.035);
    if (step % 4 === 0) pluck(chord[0], t, 1.8, 0.022);
    step++;
  };
  tick();
  musicTimer = setInterval(tick, 1600);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
