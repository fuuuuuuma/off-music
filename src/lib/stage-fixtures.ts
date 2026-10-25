// Test fixture only: deterministic physical input samples; never imported by the app.
import { laneAt } from "./stage-chart.ts";
import type { StageInput, StageNote } from "../types.ts";
export function perfectInputs(notes: StageNote[]): StageInput[] {
  const events: StageInput[] = [];
  for (const n of notes) {
    const id = n.id + 1,
      center = (t: number) => Math.round((laneAt(n, t) + n.width / 2) * 100);
    const add = (time: number, action: 0 | 1 | 2 | 3, y = 850) =>
      events.push([Math.round(time * 1000), id, action, center(time), y]);
    if (n.type === "flick") {
      add(n.time - 0.025, 0);
      add(n.time, 1, 690);
      add(n.time + 0.015, 2, 690);
    } else if (n.type === "hold" && n.endTime) {
      add(n.time, 0);
      for (let t = n.time + 0.025; t < n.endTime - 0.008; t += 0.025) add(t, 1);
      if (n.endFlick) add(n.endTime, 1, 690);
      add(n.endTime, 2, n.endFlick ? 690 : 850);
    } else {
      add(n.time, 0);
      add(n.time + 0.02, 2);
    }
  }
  return events.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
}
