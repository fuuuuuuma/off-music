import { travelSeconds } from "./motion.ts";
import { laneAt } from "./stage-chart.ts";
import { projectLane, stageGeometry, stageProgress } from "./stage-geometry.ts";
import { type StageSession, type StageFeedback } from "./stage-session.ts";
import type { Settings, StageNote } from "../types.ts";
import { STAGE_WINDOWS } from "./stage-rules.ts";
export interface InputEcho {
  x: number;
  y: number;
  time: number;
}
const COLORS = {
  tap: ["#b4f6ff", "#46c5e4", "#147da3"],
  hold: ["#c6fff0", "#38d7b4", "#099c86"],
  flick: ["#ffd2ef", "#f27ac3", "#bd3b8b"],
  accent: ["#fff5c0", "#f6cd54", "#be8e24"],
};
export function renderStage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  notes: StageNote[],
  session: StageSession,
  time: number,
  bpm: number,
  settings: Settings,
  effects: StageFeedback[],
  echoes: InputEcho[] = [],
) {
  const g = stageGeometry(width, height),
    visual = time + ((settings.visualOffset || 0) / 1000) * settings.speed;
  const point = (lane: number, at: number) =>
    projectLane(
      lane,
      stageProgress(at, visual, bpm, settings.scrollSpeed, settings.speed),
      width,
      height,
    );
  const p = (lane: number, progress: number) =>
    projectLane(lane, progress, width, height);
  ctx.clearRect(0, 0, width, height);
  const outline = [p(0, 0), p(12, 0), p(12, 1.16), p(0, 1.16)];
  ctx.beginPath();
  outline.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
  ctx.closePath();
  const surface = ctx.createLinearGradient(0, g.top, 0, height);
  surface.addColorStop(0, "rgba(227,231,255,.06)");
  surface.addColorStop(0.7, "rgba(225,236,247,.58)");
  surface.addColorStop(1, "rgba(201,218,238,.76)");
  ctx.fillStyle = surface;
  ctx.fill();
  ctx.strokeStyle = "#ffffffd0";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  for (let i = 0; i <= 12; i++) {
    const a = p(i, 0),
      b = p(i, 1.16);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = i % 2 === 0 ? "#737cab30" : "#7987b014";
    ctx.lineWidth = i % 2 ? 1 : 1.5;
    ctx.stroke();
  }
  const band = ctx.createLinearGradient(0, height * 0.65, 0, height * 0.95);
  band.addColorStop(0, "#a58aea00");
  band.addColorStop(0.45, "#a58aea24");
  band.addColorStop(1, "#a58aea08");
  ctx.fillStyle = band;
  ctx.fillRect(0, height * 0.65, width, height * 0.3);
  const beat = 60 / bpm;
  for (let b = Math.floor(visual / beat); b < visual / beat + 6; b++) {
    const a = point(0, b * beat),
      z = point(12, b * beat);
    if (a.y < g.top || a.y > g.line + 10) continue;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(z.x, z.y);
    ctx.strokeStyle = b % 4 ? "#c4bded38" : "#9f96d05a";
    ctx.lineWidth = b % 4 ? 0.6 : 1.2;
    ctx.stroke();
  }
  for (const pointer of session.pointers.values()) {
    const a = p(pointer.x - 0.8, 1),
      b = p(pointer.x + 0.8, 1);
    const fill = ctx.createLinearGradient(0, g.line - height * 0.5, 0, g.line);
    fill.addColorStop(0, "#8dbce800");
    fill.addColorStop(1, "#75bad650");
    ctx.fillStyle = fill;
    ctx.fillRect(a.x, g.line - height * 0.5, b.x - a.x, height * 0.5);
  }
  for (const n of notes) {
    if (
      n.type !== "hold" ||
      !n.endTime ||
      n.time > visual + 6 ||
      n.endTime < visual - STAGE_WINDOWS.bad * settings.speed
    )
      continue;
    const points: { x: number; y: number }[][] = [[], []];
    const begin = Math.max(n.time, visual - 0.04),
      end = Math.min(
        n.endTime,
        visual + travelSeconds(bpm, settings.scrollSpeed),
      ),
      steps = 26;
    if (end <= begin) continue;
    for (let j = 0; j <= steps; j++) {
      const t = begin + ((end - begin) * j) / steps,
        lane = laneAt(n, t);
      points[0].push(point(lane + 0.1, t));
      points[1].push(point(lane + n.width - 0.1, t));
    }
    ctx.beginPath();
    [...points[0], ...points[1].reverse()].forEach((a, i) =>
      i ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y),
    );
    ctx.closePath();
    ctx.fillStyle = n.accent ? "#f3d8776b" : "#3bd8b363";
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = n.accent ? "#fff3a8d0" : "#b8fff4e8";
    ctx.stroke();
    ctx.beginPath();
    for (let j = 0; j <= steps; j++) {
      const t = begin + ((end - begin) * j) / steps,
        a = point(laneAt(n, t) + n.width / 2, t);
      j ? ctx.lineTo(a.x, a.y) : ctx.moveTo(a.x, a.y);
    }
    ctx.strokeStyle = "#ffffffa0";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  function bar(n: StageNote, at: number, tail = false) {
    const progress = stageProgress(
      at,
      visual,
      bpm,
      settings.scrollSpeed,
      settings.speed,
    );
    if (progress < 0 || visual - at > STAGE_WINDOWS.bad * settings.speed)
      return;
    const left = laneAt(n, at),
      a = point(left, at),
      b = point(left + n.width, at);
    if (a.y < g.top - 12 || a.y > height + 25) return;
    const color = n.accent
      ? COLORS.accent
      : COLORS[tail && !n.endFlick ? "hold" : tail ? "flick" : n.type];
    const h = Math.max(3, 11 * a.scale),
      y = a.y - h / 2,
      w = Math.max(3, b.x - a.x - 2);
    const gradient = ctx.createLinearGradient(0, y, 0, y + h);
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(0.24, color[0]);
    gradient.addColorStop(0.55, color[1]);
    gradient.addColorStop(1, color[2]);
    ctx.shadowBlur = settings.reducedMotion ? 0 : 11 * Math.max(0.2, a.scale);
    ctx.shadowColor = color[1];
    ctx.beginPath();
    ctx.roundRect(a.x + 1, y, w, h, Math.min(4, h * 0.3));
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color[2] + "80";
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = "#ffffffcd";
    ctx.fillRect(a.x + w * 0.1, y + h * 0.15, w * 0.8, Math.max(1, h * 0.14));
    if ((n.type === "flick" && !tail) || (tail && n.endFlick)) {
      const middle = (a.x + b.x) / 2,
        arrow = Math.max(4, Math.min(18 * a.scale, w * 0.35));
      ctx.save();
      ctx.translate(middle, y);
      ctx.rotate(((n.direction || 0) * Math.PI) / 4);
      ctx.strokeStyle = color[2];
      ctx.lineWidth = Math.max(2, arrow * 0.25);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(-arrow, -2);
      ctx.lineTo(0, -arrow);
      ctx.lineTo(arrow, -2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-arrow, -arrow * 0.55 - 2);
      ctx.lineTo(0, -arrow * 1.55);
      ctx.lineTo(arrow, -arrow * 0.55 - 2);
      ctx.stroke();
      ctx.restore();
    }
    if (n.accent && w > 20) {
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.max(7, h)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("✦", (a.x + b.x) / 2, y + h * 0.86);
    }
  }
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.endTime && n.endTime >= visual - STAGE_WINDOWS.bad * settings.speed)
      bar(n, n.endTime, true);
    if (!session.status[session.noteHeads[i]]) bar(n, n.time);
  }
  ctx.restore();
  const a = p(0, 1),
    b = p(12, 1);
  ctx.shadowBlur = 12;
  ctx.shadowColor = "#a58aea";
  ctx.strokeStyle = "#a28ad6";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - 2);
  ctx.lineTo(b.x, b.y - 2);
  ctx.stroke();
  for (let i = 0; i <= 12; i++) {
    const a = p(i, 1);
    ctx.fillStyle = i % 2 ? "#bcb0d180" : "#947dc0a0";
    ctx.fillRect(a.x - 0.5, g.line + 5, 1, i % 2 ? 7 : 15);
  }
  for (const fx of effects) {
    const age = (time - fx.time) / settings.speed,
      n = notes[fx.note];
    if (age < 0 || age > 0.48 || !n) continue;
    const center = p(laneAt(n, fx.time) + n.width / 2, 1),
      progress = age / 0.48;
    const good = fx.grade === "perfect" || fx.grade === "great";
    const color = n.accent
      ? "#ebbf51"
      : n.type === "flick"
        ? "#df5fb2"
        : "#25bba9";
    ctx.globalAlpha = (1 - progress) * (good ? 1 : 0.55);
    const bloom = ctx.createRadialGradient(
      center.x,
      g.line,
      1,
      center.x,
      g.line,
      55 + progress * 35,
    );
    bloom.addColorStop(0, "#fff");
    bloom.addColorStop(0.25, good ? color + "aa" : "#c6b9cc66");
    bloom.addColorStop(1, color + "00");
    ctx.fillStyle = bloom;
    ctx.fillRect(center.x - 90, g.line - 80, 180, 160);
    if (!settings.reducedMotion && good) {
      for (let j = 0; j < 9; j++) {
        const angle = j * 2.399,
          distance = 8 + progress * (35 + j * 3);
        ctx.fillStyle = j % 2 ? color : "#fff";
        const x = center.x + Math.cos(angle) * distance,
          y = g.line - Math.abs(Math.sin(angle)) * distance * 1.4;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + progress);
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
  // Input acknowledgement is independent of scoring; empty taps never award points.
  for (const echo of echoes) {
    const age = (time - echo.time) / settings.speed;
    if (age < 0 || age > 0.25) continue;
    const x = p(echo.x, 1).x,
      y = echo.y * height;
    ctx.globalAlpha = (1 - age / 0.25) * 0.65;
    ctx.strokeStyle = "#a58aea";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, settings.reducedMotion ? 14 : 9 + age * 75, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
