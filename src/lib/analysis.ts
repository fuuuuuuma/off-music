import MusicTempo from "music-tempo";
import type { Analysis, HitKind, Peak } from "../types.ts";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const maximum = (a: Float32Array) => {
  let m = 0;
  for (const v of a) if (v > m) m = v;
  return m;
};
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let l = 2; l <= n; l <<= 1) {
    const wr = Math.cos((-2 * Math.PI) / l),
      wi = Math.sin((-2 * Math.PI) / l);
    for (let s = 0; s < n; s += l) {
      let ur = 1,
        ui = 0;
      for (let j = 0; j < l / 2; j++) {
        const x = s + j,
          y = x + l / 2,
          tr = re[y] * ur - im[y] * ui,
          ti = re[y] * ui + im[y] * ur;
        re[y] = re[x] - tr;
        im[y] = im[x] - ti;
        re[x] += tr;
        im[x] += ti;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = next;
      }
    }
  }
}
/** Three causal frequency bands and a ~3ms energy envelope. Candidate times are
 * backtracked to their local attack; no BPM-grid snapping or fixed window delay. */
export function analyzePCM(
  samples: Float32Array,
  sampleRate: number,
  progress?: (p: number) => void,
): Analysis {
  const duration = samples.length / sampleRate;
  if (duration < 3 || duration > 600)
    throw new Error("3秒〜10分の音源を選んでください");
  const hop = Math.max(16, Math.round(sampleRate * 0.003)),
    dt = hop / sampleRate,
    frames = Math.ceil(samples.length / hop);
  const bands = [
      new Float32Array(frames),
      new Float32Array(frames),
      new Float32Array(frames),
    ],
    rms = new Float32Array(frames);
  const aLow = 1 - Math.exp((-2 * Math.PI * 250) / sampleRate),
    aHigh = 1 - Math.exp((-2 * Math.PI * 2500) / sampleRate);
  let low = 0,
    upper = 0,
    maxAmplitude = 0;
  for (let f = 0; f < frames; f++) {
    let lo = 0,
      mid = 0,
      hi = 0,
      all = 0;
    const end = Math.min(samples.length, (f + 1) * hop);
    for (let i = f * hop; i < end; i++) {
      const x = samples[i];
      maxAmplitude = Math.max(maxAmplitude, Math.abs(x));
      low += aLow * (x - low);
      upper += aHigh * (x - upper);
      lo += low * low;
      mid += (upper - low) ** 2;
      hi += (x - upper) ** 2;
      all += x * x;
    }
    const n = Math.max(1, end - f * hop);
    bands[0][f] = Math.sqrt(lo / n);
    bands[1][f] = Math.sqrt(mid / n);
    bands[2][f] = Math.sqrt(hi / n);
    rms[f] = Math.sqrt(all / n);
    if (f % 5000 === 0) progress?.((f / frames) * 0.35);
  }
  if (maxAmplitude < 0.0003) throw new Error("音が見つかりませんでした");
  const candidates: {
    time: number;
    strength: number;
    band: number;
    confidence: number;
  }[] = [];
  for (let b = 0; b < 3; b++) {
    const env = bands[b],
      flux = new Float32Array(frames);
    let maxFlux = 0;
    for (let i = 6; i < frames; i++) {
      const current = (env[i] + env[i - 1]) / 2,
        previous = (env[i - 3] + env[i - 4] + env[i - 5] + env[i - 6]) / 4;
      const value = Math.max(
        0,
        Math.log1p(current * 120) - Math.log1p(previous * 120),
      );
      flux[i] = value;
      maxFlux = Math.max(maxFlux, value);
    }
    let last = -1;
    const noiseWindow = Math.max(10, Math.round(0.12 / dt));
    let sum = 0,
      square = 0;
    for (let i = 2; i < frames - 2; i++) {
      const old = i - noiseWindow;
      if (old >= 0) {
        sum -= flux[old];
        square -= flux[old] ** 2;
      }
      const count = Math.min(i, noiseWindow),
        mean = sum / Math.max(1, count),
        sd = Math.sqrt(Math.max(0, square / Math.max(1, count) - mean * mean));
      const value = flux[i],
        threshold = Math.max(maxFlux * 0.11, mean + sd * 0.75);
      if (
        value > threshold &&
        value >= flux[i - 1] &&
        value > flux[i + 1] &&
        value >= flux[i - 2] &&
        value > flux[i + 2]
      ) {
        const earliest = Math.max(0, i - Math.round(0.04 / dt));
        let floor = Infinity;
        for (let k = earliest; k <= Math.max(earliest, i - 3); k++)
          floor = Math.min(floor, env[k]);
        let peak = 0;
        for (let k = Math.max(0, i - 1); k <= Math.min(frames - 1, i + 2); k++)
          peak = Math.max(peak, env[k]);
        const attackThreshold = floor + (peak - floor) * 0.18;
        let onset = i;
        while (onset > earliest && env[onset - 1] > attackThreshold) onset--;
        const time = Math.max(0, onset * dt),
          strength = value / (maxFlux || 1),
          confidence = clamp((value - mean) / (sd + 0.05) / 4, 0.1, 1);
        if (time - last > 0.065) {
          candidates.push({ time, strength, band: b, confidence });
          last = time;
        }
      }
      sum += value;
      square += value * value;
    }
    progress?.(0.35 + (b + 1) * 0.13);
  }
  candidates.sort((a, b) => a.time - b.time);
  const peaks: Peak[] = [];
  const names: HitKind[] = ["pulse", "snap", "edge"];
  for (let i = 0; i < candidates.length;) {
    let j = i + 1;
    while (
      j < candidates.length &&
      candidates[j].time - candidates[i].time < 0.032
    )
      j++;
    const cluster = candidates.slice(i, j);
    const best = cluster.reduce((a, b) =>
      a.strength * a.confidence >= b.strength * b.confidence ? a : b,
    );
    const f = Math.min(frames - 1, Math.round(best.time / dt) + 2),
      values = bands.map((x) => x[f]),
      total = values.reduce((a, b) => a + b, 0) || 1;
    if (best.strength > 0.1 && rms[f] > maxAmplitude * 0.003)
      peaks.push({
        time: Math.round(best.time * 10000) / 10000,
        strength: Math.min(1, best.strength),
        bass: values[0] / total,
        mid: values[1] / total,
        high: values[2] / total,
        kind:
          values[0] / total > 0.42
            ? "pulse"
            : values[2] / total > 0.38
              ? "edge"
              : "snap",
        confidence: best.confidence,
      });
    i = j;
  }
  // Tempo is metadata only; the actual attacks above remain unchanged.
  const onset = new Float32Array(Math.ceil(duration / 0.01));
  for (const p of peaks) {
    const f = Math.round(p.time / 0.01);
    if (f < onset.length)
      onset[f] += p.strength * (p.kind === "edge" ? 0.55 : 1);
  }
  const ac = (lag: number) => {
    let score = 0,
      norm = 0;
    for (let i = Math.ceil(lag); i < onset.length; i++) {
      const pos = i - lag,
        k = Math.floor(pos),
        fraction = pos - k;
      score +=
        onset[i] * (onset[k] * (1 - fraction) + (onset[k + 1] || 0) * fraction);
      norm += onset[i] ** 2;
    }
    return score / (norm || 1);
  };
  const tempoCandidates: { bpm: number; score: number }[] = [];
  for (let t = 65; t <= 195; t += 0.25) {
    const lag = 6000 / t;
    tempoCandidates.push({
      bpm: t,
      score:
        (ac(lag) + 0.45 * ac(lag * 2) + 0.2 * ac(lag * 3)) *
        (0.9 + 0.1 * Math.exp(-Math.pow((t - 125) / 45, 2))),
    });
  }
  const local = tempoCandidates.filter(
      (v, i) =>
        i > 0 &&
        i < tempoCandidates.length - 1 &&
        v.score >= tempoCandidates[i - 1].score &&
        v.score > tempoCandidates[i + 1].score,
    ),
    best = Math.max(...tempoCandidates.map((v) => v.score));
  // Resolve near-equal half/double/triplet tempo candidates with a moderate dance-tempo prior.
  // This affects density and decorative motion only, never the detected attack timestamps.
  const plausible = local
    .filter((v) => v.score >= best * 0.9)
    .sort(
      (a, b) =>
        Math.abs(Math.log2(a.bpm / 125)) - Math.abs(Math.log2(b.bpm / 125)),
    );
  let bpm = plausible[0]?.bpm || 120;
  let tracked = false;
  // A separate spectral-flux/BeatRoot tracker follows rhythmic hypotheses over time.
  // Keep the fast attack detector for exact note timestamps and for sparse click tracks.
  if (peaks.length / duration > 2.5) {
    try {
      const start = Math.max(0, Math.min(duration - 45, duration * 0.15)),
        clip = samples.slice(
          Math.floor(start * sampleRate),
          Math.min(samples.length, Math.floor((start + 45) * sampleRate)),
        );
      const tracker = new MusicTempo(clip, {
        bufferSize: 1024,
        hopSize: Math.round(sampleRate * 0.01),
        timeStep: Math.round(sampleRate * 0.01) / sampleRate,
        minBeatInterval: 0.3,
        maxBeatInterval: 1.3,
        maxTempos: 10,
      });
      const estimate = Number(tracker.tempo);
      if (Number.isFinite(estimate) && estimate >= 46 && estimate <= 200) {
        bpm = estimate;
        tracked = true;
      }
    } catch {}
  }
  const period = 60 / bpm,
    intervals: number[] = [];
  for (let i = 0; i < peaks.length; i++)
    for (let j = i + 1; j < Math.min(peaks.length, i + 50); j++) {
      const delta = peaks[j].time - peaks[i].time,
        n = Math.round(delta / period);
      if (n >= 4 && n <= 12 && Math.abs(delta / n - period) < period * 0.035)
        intervals.push(delta / n);
    }
  if (!tracked && intervals.length > 8) {
    intervals.sort((a, b) => a - b);
    bpm = 60 / intervals[Math.floor(intervals.length / 2)];
  }
  const beat = 60 / bpm;
  let offset = 0,
    phaseScore = -1;
  for (let k = 0; k < 100; k++) {
    let s = 0;
    const phase = (k * beat) / 100;
    for (const p of peaks) {
      const d = (p.time - phase) / beat - Math.round((p.time - phase) / beat);
      s += p.strength * Math.exp(-d * d * 100);
    }
    if (s > phaseScore) {
      phaseScore = s;
      offset = phase;
    }
  }
  const waveform = Array.from({ length: 100 }, (_, i) => {
    let e = 0;
    const a = Math.floor((i * frames) / 100),
      z = Math.floor(((i + 1) * frames) / 100);
    for (let f = a; f < z; f++) e += rms[f];
    return e / Math.max(1, z - a);
  });
  const wm = Math.max(...waveform) || 1,
    rm = maximum(rms) || 1;
  const energy = Array.from({ length: 16 }, (_, i) => {
    let e = 0;
    const a = Math.floor((i * frames) / 16),
      z = Math.floor(((i + 1) * frames) / 16);
    for (let f = a; f < z; f++) e += rms[f];
    return clamp(e / Math.max(1, z - a) / rm, 0, 1);
  });
  // A light chroma estimate tunes the synthesized pad resonance to the song.
  const chroma = new Float64Array(12),
    n = 2048,
    re = new Float64Array(n),
    im = new Float64Array(n);
  for (let f = 0; f < Math.min(32, Math.floor(duration)); f++) {
    const start = Math.floor(
      ((f + 0.5) / Math.min(32, duration)) * samples.length,
    );
    if (start + n >= samples.length) continue;
    for (let i = 0; i < n; i++) {
      re[i] =
        samples[start + i] *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 5; k < n / 2; k++) {
      const freq = (k * sampleRate) / n;
      if (freq < 65 || freq > 1600) continue;
      const midi = 69 + 12 * Math.log2(freq / 440),
        nearest = Math.round(midi),
        weight = Math.exp(-(((midi - nearest) / 0.25) ** 2));
      chroma[((nearest % 12) + 12) % 12] +=
        (Math.hypot(re[k], im[k]) * weight) / Math.sqrt(freq);
    }
  }
  let tonic = 0;
  for (let i = 1; i < 12; i++) if (chroma[i] > chroma[tonic]) tonic = i;
  progress?.(1);
  return {
    version: 2,
    bpm: Math.round(bpm * 10) / 10,
    offset,
    duration,
    peaks,
    waveform: waveform.map((v) => Math.round((v / wm) * 1000) / 1000),
    energy,
    beats: Array.from(
      { length: Math.floor((duration - offset) / beat) },
      (_, i) => Math.round((offset + i * beat) * 1000) / 1000,
    ),
    confidence: clamp(best * 2, 0, 1),
    tonic,
    method: tracked
      ? "three-band-attacks-3ms+spectral-beatroot"
      : "three-band-energy-flux-backtracked-3ms",
    tempoAlternatives: [bpm / 2, bpm, bpm * 2]
      .filter((v) => v >= 40 && v <= 240)
      .map((v) => Math.round(v * 10) / 10),
  };
}
