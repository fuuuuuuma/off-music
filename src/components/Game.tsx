import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { MusicClock, playHit, unlockAudio } from "../lib/audio.ts";
import { calculateScore, createChart, judge, WINDOWS } from "../lib/chart.ts";
import type {
  Difficulty,
  Grade,
  HitKind,
  Result,
  Settings,
  Song,
} from "../types.ts";
import { DIFFICULTIES } from "../types.ts";
interface Props {
  song: Song;
  buffer: AudioBuffer;
  difficulty: Difficulty;
  settings: Settings;
  onExit: () => void;
  onFinish: (result: Result) => void;
}
export function Game({
  song,
  buffer,
  difficulty,
  settings,
  onExit,
  onFinish,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    clock = useRef<MusicClock | undefined>(undefined),
    pausedRef = useRef(false),
    ended = useRef(false);
  const notes = useMemo(
    () => createChart(song.analysis, difficulty, song.arrangement, song.bpm),
    [song, difficulty],
  );
  const state = useRef({
    statuses: new Uint8Array(notes.length),
    combo: 0,
    maxCombo: 0,
    perfect: 0,
    great: 0,
    good: 0,
    miss: 0,
    cursor: 0,
    feedback: "",
    feedbackAt: -10,
    ripples: [] as { kind: HitKind; at: number; x: number }[],
  });
  const [paused, setPaused] = useState(false),
    [hud, setHud] = useState({ score: 0, combo: 0, time: -3, accuracy: 100 }),
    [active, setActive] = useState<HitKind | null>(null),
    [muted, setMuted] = useState(false);
  const mutedRef = useRef(false),
    finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    clock.current?.dispose();
    const s = state.current;
    for (let i = 0; i < notes.length; i++)
      if (!s.statuses[i]) {
        s.miss++;
        s.statuses[i] = 4;
      }
    const score = calculateScore(s.perfect, s.great, s.good, notes.length);
    finishRef.current({
      id: crypto.randomUUID(),
      songId: song.id,
      title: song.title,
      difficulty,
      score,
      accuracy: score / 10000,
      maxCombo: s.maxCombo,
      perfect: s.perfect,
      great: s.great,
      good: s.good,
      miss: s.miss,
      total: notes.length,
      createdAt: Date.now(),
      speed: settings.speed,
    });
  }, [notes, song, difficulty, settings.speed]);
  const hit = useCallback(
    (kind: HitKind) => {
      if (ended.current || pausedRef.current) return;
      playHit(kind, mutedRef.current ? 0 : settings.effects);
      setActive(kind);
      setTimeout(
        () => setActive((current) => (current === kind ? null : current)),
        100,
      );
      if (settings.vibration && navigator.vibrate) navigator.vibrate(8);
      const t =
          (clock.current?.time() ?? -5) -
          (settings.offset / 1000) * settings.speed,
        s = state.current;
      if (t < 0 || (clock.current?.countdown() ?? 1) > 0) return;
      let closest = -1,
        distance = Infinity;
      for (let i = Math.max(0, s.cursor - 3); i < notes.length; i++) {
        const n = notes[i];
        if (n.time > t + WINDOWS.good * settings.speed) break;
        const d = Math.abs(n.time - t);
        if (
          !s.statuses[i] &&
          n.kind === kind &&
          d <= WINDOWS.good * settings.speed &&
          d < distance
        ) {
          distance = d;
          closest = i;
        }
      }
      if (closest < 0) return;
      const grade = judge(
        (t - notes[closest].time) / settings.speed,
      ) as Exclude<Grade, "miss">;
      s.statuses[closest] = grade === "perfect" ? 1 : grade === "great" ? 2 : 3;
      s[grade]++;
      s.combo++;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.feedback = grade.toUpperCase();
      s.feedbackAt = t;
      s.ripples.push({ kind, at: t, x: 0 });
    },
    [notes, settings],
  );
  const togglePause = useCallback(async () => {
    if (ended.current) return;
    if (pausedRef.current) {
      await unlockAudio();
      clock.current?.resume();
      pausedRef.current = false;
      setPaused(false);
    } else {
      clock.current?.pause();
      pausedRef.current = true;
      setPaused(true);
    }
  }, []);
  useEffect(() => {
    const instance = new MusicClock(buffer, settings);
    clock.current = instance;
    instance.start();
    let raf = 0,
      lastHud = 0;
    const resize = () => {
      if (!canvas.current) return;
      const rect = canvas.current.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.current.width = rect.width * dpr;
      canvas.current.height = rect.height * dpr;
    };
    const observer = new ResizeObserver(resize);
    if (canvas.current) observer.observe(canvas.current);
    resize();
    const render = () => {
      if (ended.current) return;
      const t = instance.time() - (settings.offset / 1000) * settings.speed,
        s = state.current;
      if (!pausedRef.current) {
        while (
          s.cursor < notes.length &&
          notes[s.cursor].time < t - WINDOWS.good * settings.speed
        ) {
          if (!s.statuses[s.cursor]) {
            s.statuses[s.cursor] = 4;
            s.miss++;
            s.combo = 0;
            s.feedback = "MISS";
            s.feedbackAt = t;
          }
          s.cursor++;
        }
      }
      if (canvas.current) {
        const c = canvas.current,
          ctx = c.getContext("2d");
        if (ctx) {
          const dpr = Math.min(devicePixelRatio || 1, 2),
            w = c.width / dpr,
            h = c.height / dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          const target = w < 500 ? 64 : 110,
            cy = h * 0.52,
            lead = w < 500 ? 2.2 : 3,
            speed = (w - target - 20) / lead;
          ctx.strokeStyle = "#e4e3eb";
          ctx.lineWidth = 1;
          for (const y of [cy - 45, cy, cy + 45]) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }
          ctx.fillStyle = "#f0eef5";
          ctx.fillRect(0, cy - 45, w, 90);
          ctx.strokeStyle = "#dedbe6";
          ctx.setLineDash([3, 7]);
          ctx.beginPath();
          ctx.moveTo(target, cy - 58);
          ctx.lineTo(target, cy + 58);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = "#c5c1d1";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(target, cy, 25, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(target, cy, 31, 0, Math.PI * 2);
          ctx.stroke();
          for (let i = Math.max(0, s.cursor - 2); i < notes.length; i++) {
            const n = notes[i];
            if (n.time > t + lead + 0.25) break;
            if (s.statuses[i] || n.time < t - 0.3) continue;
            const x = target + (n.time - t) * speed,
              r = n.accent ? 23 : 19;
            ctx.save();
            ctx.translate(x, cy);
            ctx.shadowBlur = 14;
            ctx.shadowColor = n.kind === "pulse" ? "#f5784544" : "#7660d944";
            const grad = ctx.createLinearGradient(-r, -r, r, r);
            grad.addColorStop(0, n.kind === "pulse" ? "#ffa67d" : "#b1a3f4");
            grad.addColorStop(1, n.kind === "pulse" ? "#ed6b37" : "#7056d0");
            ctx.fillStyle = grad;
            ctx.beginPath();
            if (n.kind === "pulse") ctx.arc(0, 0, r, 0, Math.PI * 2);
            else {
              ctx.moveTo(0, -r - 2);
              ctx.lineTo(r + 2, 0);
              ctx.lineTo(0, r + 2);
              ctx.lineTo(-r - 2, 0);
              ctx.closePath();
            }
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = "#ffffffba";
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 14px system-ui";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(n.kind === "pulse" ? "●" : "◆", 0, 0);
            ctx.restore();
          }
          s.ripples = s.ripples.filter((r) => t - r.at < 0.45);
          if (!settings.reducedMotion)
            for (const r of s.ripples) {
              const age = Math.max(0, Math.min(1, (t - r.at) / 0.45));
              ctx.globalAlpha = 1 - age;
              ctx.strokeStyle = r.kind === "pulse" ? "#f47747" : "#7462d9";
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(target, cy, 25 + age * 60, 0, Math.PI * 2);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          if (instance.countdown() > 0) {
            ctx.fillStyle = "#22212b";
            ctx.font = "800 52px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(
              String(Math.ceil(instance.countdown())),
              w * 0.55,
              cy - 66,
            );
          }
          if (s.feedback && t - s.feedbackAt < 0.7) {
            ctx.globalAlpha = Math.max(0, 1 - (t - s.feedbackAt) / 0.7);
            ctx.fillStyle = s.feedback === "MISS" ? "#9690a4" : "#f17749";
            ctx.font = "800 20px system-ui";
            ctx.textAlign = "center";
            ctx.fillText(s.feedback, target, cy - 64);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = "#9f9aa9";
          ctx.font = "10px system-ui";
          ctx.textAlign = "center";
          ctx.fillText("HIT", target, cy + 72);
        }
      }
      if (performance.now() - lastHud > 80) {
        const total = s.perfect + s.great + s.good + s.miss;
        setHud({
          score: calculateScore(s.perfect, s.great, s.good, notes.length),
          combo: s.combo,
          time: t,
          accuracy: total
            ? calculateScore(s.perfect, s.great, s.good, total) / 10000
            : 100,
        });
        lastHud = performance.now();
      }
      if (t > buffer.duration + 0.3) {
        finish();
        return;
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["d", "f", "j", "k", " ", "escape"].includes(k)) e.preventDefault();
      if (e.repeat || keys.has(k)) return;
      keys.add(k);
      if (k === "d" || k === "k") hit("edge");
      if (k === "f" || k === "j") hit("pulse");
      if (k === " " || k === "escape") void togglePause();
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const hidden = () => {
      if (document.hidden && !pausedRef.current && !ended.current) {
        instance.pause();
        pausedRef.current = true;
        setPaused(true);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("visibilitychange", hidden);
    let wake: WakeLockSentinel | undefined;
    navigator.wakeLock
      ?.request("screen")
      .then((w) => {
        wake = w;
      })
      .catch(() => {});
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      instance.dispose();
      void wake?.release();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [buffer, settings, notes, finish, hit, togglePause]);
  const remaining = Math.max(
    0,
    Math.ceil(buffer.duration - Math.max(0, hud.time)),
  );
  return (
    <div className="game-screen">
      <header className="game-top">
        <button
          className="icon-button"
          aria-label="一時停止"
          onClick={() => void togglePause()}
        >
          <Pause size={20} />
        </button>
        <div>
          <strong>{song.title}</strong>
          <span>
            {DIFFICULTIES.find((d) => d.id === difficulty)?.label} ·{" "}
            {settings.speed}×
          </span>
        </div>
        <button
          className="icon-button"
          aria-label={muted ? "打音をオン" : "打音をミュート"}
          onClick={() => {
            mutedRef.current = !muted;
            setMuted(!muted);
          }}
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </header>
      <div className="song-progress">
        <i
          style={{
            width: (Math.max(0, hud.time) / buffer.duration) * 100 + "%",
          }}
        />
      </div>
      <section className="game-hud">
        <div>
          <span>SCORE</span>
          <strong>{hud.score.toLocaleString("en-US").padStart(7, "0")}</strong>
        </div>
        <div className="combo">
          <strong>{hud.combo.toString().padStart(2, "0")}</strong>
          <span>COMBO</span>
        </div>
        <div className="game-accuracy">
          <strong>
            {hud.accuracy.toFixed(1)}
            <small>%</small>
          </strong>
          <span>
            {Math.floor(remaining / 60)}:
            {String(remaining % 60).padStart(2, "0")}
          </span>
        </div>
      </section>
      <div className="highway glass">
        <canvas
          ref={canvas}
          aria-label="右から流れる丸と菱形をHITラインでたたく"
        />
        <div className="highway-label">
          <span className="live-dot" /> LIVE SESSION <span>{song.bpm} BPM</span>
        </div>
      </div>
      <div className="pad-area">
        <button
          className={
            "hit-pad pulse-pad " + (active === "pulse" ? "pressed" : "")
          }
          aria-label="低音 丸 F J"
          onPointerDown={(e) => {
            e.preventDefault();
            hit("pulse");
          }}
        >
          <div className="pad-inner">
            <span className="pad-symbol">●</span>
          </div>
          <span className="pad-name">
            低音 <small>F / J</small>
          </span>
        </button>
        <button
          className={"hit-pad edge-pad " + (active === "edge" ? "pressed" : "")}
          aria-label="高音 菱形 D K"
          onPointerDown={(e) => {
            e.preventDefault();
            hit("edge");
          }}
        >
          <div className="pad-inner">
            <span className="pad-symbol">◆</span>
          </div>
          <span className="pad-name">
            高音 <small>D / K</small>
          </span>
        </button>
      </div>
      <p className="game-help">
        <span className="orange">●</span> 丸は低音{" "}
        <span className="purple">◆</span> 菱形は高音
      </p>
      {paused && (
        <div className="pause-overlay">
          <div className="pause-card glass">
            <span className="eyebrow">SESSION PAUSED</span>
            <h2>一時停止</h2>
            <button className="primary" onClick={() => void togglePause()}>
              <Play size={18} fill="currentColor" />
              再開する
            </button>
            <button
              className="secondary"
              onClick={() => {
                clock.current?.dispose();
                onExit();
              }}
            >
              <ArrowLeft size={18} />
              選曲に戻る
            </button>
            <p>
              <RotateCcw size={13} /> 再開まで1秒のカウント
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
