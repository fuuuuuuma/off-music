import type { Analysis, HitKind, Settings } from "../types.ts";
let context: AudioContext | undefined;
export function audioContext() {
  context ??= new AudioContext({ latencyHint: "interactive" });
  return context;
}
export async function unlockAudio() {
  const ctx = audioContext();
  if (ctx.state !== "running") await ctx.resume();
  return ctx;
}
export async function decodeAudio(blob: Blob) {
  const ctx = audioContext();
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
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
  const rate = 11025,
    length = Math.floor(buffer.duration * rate),
    samples = new Float32Array(length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < length; i++)
      samples[i] +=
        (channel[
          Math.min(
            channel.length - 1,
            Math.floor((i * buffer.sampleRate) / rate),
          )
        ] || 0) / buffer.numberOfChannels;
  }
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
      reject(new Error("音源の解析に失敗しました"));
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
export function playHit(kind: HitKind, volume: number) {
  if (volume <= 0) return;
  const ctx = audioContext();
  if (ctx.state !== "running") return;
  const t = ctx.currentTime,
    osc = ctx.createOscillator(),
    gain = ctx.createGain();
  osc.type = kind === "pulse" ? "sine" : "triangle";
  osc.frequency.setValueAtTime(kind === "pulse" ? 170 : 1050, t);
  osc.frequency.exponentialRampToValueAtTime(
    kind === "pulse" ? 48 : 490,
    t + 0.09,
  );
  gain.gain.setValueAtTime(volume * (kind === "pulse" ? 0.75 : 0.25), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.15);
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
    const ctx = audioContext();
    this.offset = offset;
    this.startAt = ctx.currentTime + countdown;
    this.source = ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this.settings.speed;
    this.source.connect(this.gain);
    this.source.start(this.startAt, offset);
    this.active = true;
  }
  time() {
    if (!this.active) return this.offset;
    const ctx = audioContext(),
      ts = ctx.getOutputTimestamp?.();
    const rendered =
      ts?.contextTime !== undefined &&
      ts.performanceTime !== undefined &&
      ts.contextTime > 0
        ? ts.contextTime + (performance.now() - ts.performanceTime) / 1000
        : ctx.currentTime -
          Math.min(0.3, ctx.outputLatency || ctx.baseLatency || 0);
    const time = (rendered - this.startAt) * this.settings.speed + this.offset;
    // Resume countdown holds the previous position; it must not rewind active
    // hit effects or expose already judged notes again.
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
