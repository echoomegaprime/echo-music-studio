import type { SongSpec } from "./types";

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Uint8Array(buffer);
}

function envAt(t: number, a: number, d: number, s: number, r: number, len: number): number {
  if (t < a) return t / a;
  if (t < a + d) return 1 - ((t - a) / d) * (1 - s);
  if (t < len - r) return s;
  if (t < len) return s * (1 - (t - (len - r)) / r);
  return 0;
}

export function renderSketch(spec: SongSpec, variant: "A" | "B"): { wav: Uint8Array; duration: number } {
  const sampleRate = 22050;
  const duration = 24;
  const n = sampleRate * duration;
  const samples = new Float32Array(n);
  const seed = hash32(`${spec.title}|${spec.concept}|${variant}`);
  const rnd = mulberry32(seed);
  const bpm = spec.production.tempo === "slow" ? 72 : spec.production.tempo === "fast" ? 126 : 94 + Math.floor(rnd() * 10);
  const beat = 60 / bpm;
  const dark = spec.production.mood.some((m) => /omin|dark|grim|defiant|dust/i.test(m));
  const root = dark ? 55 : 65.41;
  const scale = [0, 3, 5, 7, 10, 12, 15];
  const leadScale = variant === "B" ? [0, 3, 7, 10, 12, 14, 15] : scale;

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const beatPos = t / beat;
    const bar = Math.floor(beatPos / 4);
    const inBeat = beatPos % 1;
    let s = 0;

    // kick
    const kickHit = inBeat < 0.18 && (Math.floor(beatPos) % 2 === 0 || (variant === "B" && Math.floor(beatPos) % 4 === 3));
    if (kickHit) {
      const kt = inBeat * beat;
      s += Math.sin(2 * Math.PI * (120 - kt * 380) * kt) * Math.exp(-kt * 14) * 0.72;
    }
    // snare
    if (Math.floor(beatPos) % 2 === 1 && inBeat < 0.2) {
      const nt = inBeat * beat;
      s += (rnd() * 2 - 1) * Math.exp(-nt * 18) * 0.28;
    }
    // hat
    if (inBeat < 0.06) {
      s += (rnd() * 2 - 1) * Math.exp(-inBeat * 90) * 0.09;
    }

    const bassDeg = scale[bar % scale.length] ?? 0;
    const bassFreq = root * Math.pow(2, bassDeg / 12);
    const bassEnv = 0.55 * (1 - (inBeat % 1) * 0.45);
    s += Math.sin(2 * Math.PI * bassFreq * t) * bassEnv * 0.28;
    s += Math.sign(Math.sin(2 * Math.PI * bassFreq * t)) * bassEnv * 0.04;

    const padFreq = root * 2 * Math.pow(2, (scale[(bar + 2) % scale.length] ?? 0) / 12);
    s += Math.sin(2 * Math.PI * padFreq * t + 0.2) * 0.07;
    s += Math.sin(2 * Math.PI * padFreq * 1.005 * t) * 0.05;

    const note = leadScale[Math.floor(beatPos / 0.5) % leadScale.length] ?? 0;
    const leadFreq = root * 4 * Math.pow(2, note / 12);
    const leadT = (t % (beat * 0.5)) / (beat * 0.5);
    const leadEnv = envAt(leadT * beat * 0.5, 0.01, 0.06, 0.35, 0.12, beat * 0.5);
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t);
    s += Math.sin(2 * Math.PI * leadFreq * vib * t) * leadEnv * (variant === "B" ? 0.16 : 0.13);

    const fadeIn = Math.min(1, t / 0.4);
    const fadeOut = t > duration - 1.2 ? Math.max(0, (duration - t) / 1.2) : 1;
    samples[i] = Math.max(-1, Math.min(1, s * fadeIn * fadeOut * 0.95));
  }

  return { wav: encodeWav(samples, sampleRate), duration };
}

export function coverSvg(title: string, style: string, variant: string): string {
  const h = hash32(title + style + variant);
  const ink = ["#e8e0d4", "#c4a574", "#9c9488"][h % 3];
  const bars = 5 + (h % 4);
  const barXml = Array.from({ length: bars }, (_, i) => {
    const x = 22 + i * (56 / bars);
    const ht = 18 + ((h >> (i + 2)) % 36);
    return `<rect x="${x.toFixed(1)}" y="${(70 - ht).toFixed(1)}" width="6" height="${ht}" fill="${ink}" opacity="${0.45 + (i % 3) * 0.15}"/>`;
  }).join("");
  const safe = title.replace(/[<>&]/g, "").slice(0, 22);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#0c0b09"/>
  <rect x="8" y="8" width="84" height="84" fill="none" stroke="#2c2822" stroke-width="1"/>
  ${barXml}
  <text x="50" y="88" text-anchor="middle" fill="#e8e0d4" font-family="Georgia, serif" font-size="7">${safe}</text>
  <text x="14" y="16" fill="#6f6a62" font-family="sans-serif" font-size="5">${variant}</text>
</svg>`;
}
