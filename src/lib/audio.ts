import type { Analysis, HitKind, Settings } from "../types.ts";
let context: AudioContext | undefined;
export function audioContext() {
  context ??= new AudioContext({ latencyHint: "interactive" });
  return context;
}
export async function unlockAudio() {
  const c = audioContext();
  if (c.state !== "running") await c.resume();
  return c;
}
export function eventTime(stamp?: number) {
  const now = performance.now();
  if (!stamp) return now;
  const t = stamp > 1e12 ? stamp - performance.timeOrigin : stamp;
  return Math.abs(t - now) < 2000 ? t : now;
}
export function outputLatency() {
  const c = audioContext();
  return Math.min(0.5, (c.baseLatency || 0) + (c.outputLatency || 0));
}
export function renderedContextTime(at = performance.now()) {
  const c = audioContext(),
    ts = c.getOutputTimestamp?.();
  if (
    ts &&
    ts.contextTime !== undefined &&
    ts.performanceTime !== undefined &&
    ts.contextTime > 0 &&
    Math.abs(performance.now() - ts.performanceTime) < 1000
  )
    return ts.contextTime + (at - ts.performanceTime) / 1000;
  return c.currentTime - outputLatency() + (at - performance.now()) / 1000;
}
export async function decodeAudio(blob: Blob) {
  try {
    return await audioContext().decodeAudioData(await blob.arrayBuffer());
  } catch {
    throw new Error(
      "この形式の音声を読み込めません。MP3・M4A・WAVをお試しください",
    );
  }
}
export async function analyzeAudio(
  buffer: AudioBuffer,
  onProgress: (p: number) => void,
): Promise<Analysis> {
  const rate = 22050,
    length = Math.ceil(buffer.duration * rate);
  const offline = new OfflineAudioContext(1, length, rate),
    source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  const mono = await offline.startRendering(),
    samples = mono.getChannelData(0).slice();
  const worker = new Worker(new URL("./analysis.worker.ts", import.meta.url), {
    type: "module",
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("解析が長引いています。短い音源でお試しください"));
    }, 90000);
    const end = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    worker.onerror = () => {
      end();
      reject(new Error("解析できませんでした"));
    };
    worker.onmessage = (e) => {
      if (e.data.result) {
        end();
        resolve(e.data.result);
      } else if (e.data.error) {
        end();
        reject(new Error(e.data.error));
      } else onProgress(e.data.progress);
    };
    worker.postMessage({ samples, sampleRate: rate }, [samples.buffer]);
  });
}
let noise: AudioBuffer | undefined;
function noiseBuffer() {
  const c = audioContext();
  if (!noise) {
    noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.18), c.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 7361;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
  }
  return noise;
}
export function playHit(
  kind: HitKind,
  volume: number,
  tonic = 0,
  when?: number,
) {
  if (volume <= 0) return;
  const c = audioContext();
  if (c.state !== "running") return;
  const t = when ?? c.currentTime,
    root = 65.4064 * 2 ** (tonic / 12),
    gain = c.createGain();
  gain.connect(c.destination);
  if (kind === "pulse") {
    const o = c.createOscillator();
    o.frequency.setValueAtTime(root * 2.1, t);
    o.frequency.exponentialRampToValueAtTime(root, t + 0.045);
    gain.gain.setValueAtTime(volume * 0.62, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(gain);
    o.onended = () => {
      o.disconnect();
      gain.disconnect();
    };
    o.start(t);
    o.stop(t + 0.15);
  } else {
    const s = c.createBufferSource(),
      filter = c.createBiquadFilter();
    s.buffer = noiseBuffer();
    filter.type = kind === "snap" ? "bandpass" : "highpass";
    filter.frequency.value =
      kind === "snap" ? root * 13 : Math.min(9500, root * 65);
    filter.Q.value = kind === "snap" ? 0.7 : 0.4;
    gain.gain.setValueAtTime(volume * (kind === "snap" ? 0.34 : 0.25), t);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t + (kind === "snap" ? 0.085 : 0.045),
    );
    s.connect(filter).connect(gain);
    s.onended = () => {
      s.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    s.start(t);
    s.stop(t + 0.11);
  }
}
export function chime(notes: number[], volume = 0.12, spacing = 0.1) {
  const c = audioContext();
  if (c.state !== "running") return;
  notes.forEach((note, i) => {
    const o = c.createOscillator(),
      g = c.createGain(),
      t = c.currentTime + i * spacing;
    o.type = "sine";
    o.frequency.value = 440 * 2 ** ((note - 69) / 12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(c.destination);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    o.start(t);
    o.stop(t + 0.6);
  });
}
export class MusicClock {
  private source?: AudioBufferSourceNode;
  private startAt = 0;
  private offset = 0;
  private gain: GainNode;
  private active = false;
  constructor(
    private buffer: AudioBuffer,
    private settings: Settings,
  ) {
    this.gain = audioContext().createGain();
    this.gain.gain.value = settings.music;
    this.gain.connect(audioContext().destination);
  }
  start(offset = 0, countdown = 3) {
    const c = audioContext();
    this.offset = offset;
    this.startAt = c.currentTime + countdown;
    this.source = c.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.settings.speed;
    this.source.connect(this.gain);
    this.source.start(this.startAt, offset);
    this.active = true;
  }
  time() {
    return this.timeAt(performance.now());
  }
  timeAt(at: number) {
    if (!this.active) return this.offset;
    const time =
      (renderedContextTime(at) - this.startAt) * this.settings.speed +
      this.offset;
    return this.offset > 0 ? Math.max(this.offset, time) : time;
  }
  countdown() {
    return this.active
      ? Math.max(0, this.startAt - audioContext().currentTime)
      : 0;
  }
  pause() {
    this.offset = Math.max(0, this.time());
    this.active = false;
    this.source?.stop();
    this.source?.disconnect();
    this.source = undefined;
    return this.offset;
  }
  resume() {
    this.start(this.offset, 1);
  }
  dispose() {
    if (this.active) this.pause();
    this.gain.disconnect();
  }
}
let ambientSource: AudioBufferSourceNode | undefined,
  ambientGain: GainNode | undefined,
  ambientBuffer: AudioBuffer | undefined,
  ambientLoading: Promise<AudioBuffer | undefined> | undefined,
  ambientVolume = 0;
export async function setAmbience(
  volume: number,
  mode: "lobby" | "game" = "lobby",
) {
  const c = audioContext();
  ambientVolume = volume * (mode === "game" ? 0.04 : 1);
  if (c.state !== "running") return;
  if (!ambientBuffer) {
    ambientLoading ??= fetch("/music/lobby-loop.mp3")
      .then(async (r) =>
        r.ok ? c.decodeAudioData(await r.arrayBuffer()) : undefined,
      )
      .catch(() => undefined);
    ambientBuffer = await ambientLoading;
    if (!ambientBuffer) {
      ambientLoading = undefined;
      return;
    }
  }
  if (!ambientSource) {
    ambientGain = c.createGain();
    ambientGain.gain.value = 0;
    ambientGain.connect(c.destination);
    ambientSource = c.createBufferSource();
    ambientSource.buffer = ambientBuffer;
    ambientSource.loop = true;
    ambientSource.connect(ambientGain);
    ambientSource.start();
  }
  ambientGain!.gain.setTargetAtTime(ambientVolume, c.currentTime, 0.25);
}
export function stopAmbience() {
  ambientVolume = 0;
  if (ambientGain)
    ambientGain.gain.setTargetAtTime(0, audioContext().currentTime, 0.15);
}
