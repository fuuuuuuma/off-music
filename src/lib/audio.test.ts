import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../types.ts";
class FakeAudioContext {
  currentTime = 100;
  state = "running";
  destination = {};
  createGain() {
    return {
      gain: { value: 0 },
      connect() {
        return this;
      },
      disconnect() {},
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      playbackRate: { value: 1 },
      connect() {},
      start() {},
      stop() {},
      disconnect() {},
    };
  }
  getOutputTimestamp() {
    return {
      contextTime: this.currentTime,
      performanceTime: performance.now(),
    };
  }
}
afterEach(() => vi.unstubAllGlobals());
it("打鍵直後に停止・再開しても再開カウント中に曲の時刻が巻き戻らない", async () => {
  vi.resetModules();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  const { audioContext, MusicClock } = await import("./audio.ts");
  const ctx = audioContext() as unknown as FakeAudioContext;
  const clock = new MusicClock({} as AudioBuffer, {
    ...DEFAULT_SETTINGS,
    speed: 1.25,
  });
  clock.start();
  expect(clock.time()).toBeLessThan(0);
  expect(clock.countdown()).toBe(3);
  ctx.currentTime = 110;
  const stopped = clock.pause();
  expect(stopped).toBeCloseTo(8.75, 2);
  ctx.currentTime = 115;
  clock.resume();
  expect(clock.countdown()).toBe(1);
  expect(clock.time()).toBeGreaterThanOrEqual(stopped);
  ctx.currentTime = 115.8;
  expect(clock.time()).toBeCloseTo(stopped, 2);
  ctx.currentTime = 116.4;
  expect(clock.time()).toBeCloseTo(stopped + 0.5, 2);
  clock.dispose();
});
