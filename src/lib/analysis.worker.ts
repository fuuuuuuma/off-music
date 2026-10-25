import { analyzePCM } from "./analysis.ts";
self.onmessage = (
  event: MessageEvent<{ samples: Float32Array; sampleRate: number }>,
) => {
  try {
    const result = analyzePCM(event.data.samples, event.data.sampleRate, (p) =>
      self.postMessage({ progress: p }),
    );
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "音源を解析できませんでした",
    });
  }
};
