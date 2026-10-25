import type { Analysis, Peak } from "../types.ts";

// Radix-2 FFT. Runs in a dedicated Worker; there is no network/audio upload.
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len,
      wr = Math.cos(a),
      wi = Math.sin(a);
    for (let start = 0; start < n; start += len) {
      let ur = 1,
        ui = 0;
      for (let j = 0; j < len / 2; j++) {
        const x = start + j,
          y = x + len / 2,
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
export function analyzePCM(
  samples: Float32Array,
  sampleRate: number,
  progress?: (p: number) => void,
): Analysis {
  const n = 1024,
    hop = 256,
    frames = Math.max(1, Math.floor((samples.length - n) / hop)),
    duration = samples.length / sampleRate;
  if (duration < 3 || duration > 600)
    throw new Error("3秒〜10分の音源を選んでください");
  const flux = new Float64Array(frames),
    levels = new Float64Array(frames),
    bassRatio = new Float64Array(frames);
  const re = new Float64Array(n),
    im = new Float64Array(n),
    prev = new Float64Array(n / 2),
    window = Float64Array.from(
      { length: n },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)),
    );
  for (let f = 0; f < frames; f++) {
    let rms = 0;
    for (let i = 0; i < n; i++) {
      const s = samples[f * hop + i] || 0;
      re[i] = s * window[i];
      im[i] = 0;
      rms += s * s;
    }
    levels[f] = Math.sqrt(rms / n);
    fft(re, im);
    let low = 0,
      total = 0;
    for (let k = 2; k < n / 2; k++) {
      const mag = Math.log1p(Math.hypot(re[k], im[k]) * 10),
        diff = Math.max(0, mag - prev[k]);
      flux[f] += diff;
      prev[k] = mag;
      total += mag;
      if ((k * sampleRate) / n < 300) low += mag;
    }
    bassRatio[f] = total ? low / total : 0;
    if (f % 100 === 0) progress?.(f / frames);
  }
  const maxLevel = Math.max(...Array.from(levels));
  if (maxLevel < 0.0003) throw new Error("音が見つかりませんでした");
  const whitened = Float64Array.from(flux, (v, i) => {
    const from = Math.max(0, i - 22),
      to = Math.min(frames, i + 23);
    let sum = 0;
    for (let j = from; j < to; j++) sum += flux[j];
    return Math.max(0, v - (sum / (to - from)) * 0.85);
  });
  const frameRate = sampleRate / hop;
  let bestBpm = 120,
    bestScore = -1;
  for (let bpm = 70; bpm <= 190; bpm += 0.25) {
    const lag = (60 * frameRate) / bpm;
    let sum = 0,
      norm = 0;
    for (let i = Math.ceil(lag); i < frames; i++) {
      const p = i - lag,
        j = Math.floor(p),
        v = whitened[j] * (1 - (p - j)) + (whitened[j + 1] || 0) * (p - j);
      sum += whitened[i] * v;
      norm += whitened[i] * whitened[i];
    }
    const score =
      (sum / (norm || 1)) *
      (1 + 0.06 * Math.exp(-Math.pow((bpm - 120) / 50, 2)));
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }
  const peaks: Peak[] = [];
  const maxFlux = Math.max(...Array.from(whitened));
  for (let i = 2; i < frames - 2; i++) {
    if (whitened[i] < maxFlux * 0.055 || levels[i] < maxLevel * 0.025) continue;
    if (
      whitened[i] >= whitened[i - 1] &&
      whitened[i] > whitened[i + 1] &&
      whitened[i] >= whitened[i - 2] &&
      whitened[i] > whitened[i + 2]
    ) {
      const denominator = whitened[i - 1] - 2 * whitened[i] + whitened[i + 1],
        fraction = denominator
          ? Math.max(
              -0.5,
              Math.min(
                0.5,
                (0.5 * (whitened[i - 1] - whitened[i + 1])) / denominator,
              ),
            )
          : 0;
      const peak = {
        time: Math.max(0, ((i + fraction) * hop + n / 2) / sampleRate - 0.018),
        strength: whitened[i] / maxFlux,
        bass: bassRatio[i],
      };
      if (peaks.length && peak.time - peaks[peaks.length - 1].time < 0.085) {
        if (peak.strength > peaks[peaks.length - 1].strength)
          peaks[peaks.length - 1] = peak;
      } else peaks.push(peak);
    }
  }
  // Refine the coarse frame-lag estimate using longer onset intervals. Otherwise
  // a 23ms analysis hop can bias a perfect 120 BPM pulse train toward 117.5 BPM.
  const period = 60 / bestBpm,
    estimates: number[] = [];
  for (let i = 0; i < peaks.length; i++)
    for (let j = i + 1; j < Math.min(peaks.length, i + 65); j++) {
      const delta = peaks[j].time - peaks[i].time,
        count = Math.round(delta / period);
      if (
        count >= 4 &&
        count <= 12 &&
        Math.abs(delta / count - period) < period * 0.035
      )
        estimates.push(delta / count);
    }
  if (estimates.length > 8) {
    estimates.sort((a, b) => a - b);
    bestBpm = 60 / estimates[Math.floor(estimates.length / 2)];
  }
  const beat = 60 / bestBpm;
  let phase = 0,
    phaseScore = -1;
  for (let step = 0; step < 80; step++) {
    const offset = (step * beat) / 80;
    let score = 0;
    for (const p of peaks) {
      const d = Math.abs(
        (p.time - offset) / beat - Math.round((p.time - offset) / beat),
      );
      score += p.strength * Math.exp(-d * d * 90);
    }
    if (score > phaseScore) {
      phaseScore = score;
      phase = offset;
    }
  }
  const waveform = Array.from({ length: 100 }, (_, i) => {
    const start = Math.floor((i * samples.length) / 100),
      end = Math.floor(((i + 1) * samples.length) / 100);
    let v = 0;
    for (let j = start; j < end; j += 8) v += samples[j] * samples[j];
    return Math.sqrt(v / Math.max(1, (end - start) / 8));
  });
  const wmax = Math.max(...waveform) || 1;
  const energy = Array.from({ length: 16 }, (_, i) => {
    const from = Math.floor((i * frames) / 16),
      to = Math.floor(((i + 1) * frames) / 16);
    let sum = 0;
    for (let j = from; j < to; j++) sum += levels[j];
    return sum / Math.max(1, to - from) / maxLevel;
  });
  progress?.(1);
  return {
    bpm: Math.round(bestBpm * 10) / 10,
    offset: phase,
    duration,
    peaks,
    waveform: waveform.map((v) => Math.round((v / wmax) * 1000) / 1000),
    energy,
  };
}
