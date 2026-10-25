import { travelSeconds, noteX, effectiveBpm } from "../lib/motion.ts";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, RotateCcw, Smartphone, LogOut } from "lucide-react";
import { Mascots } from "./Mascots.tsx";
import {
  MusicClock,
  audioContext,
  chime,
  eventTime,
  playHit,
  setAmbience,
} from "../lib/audio.ts";
import {
  CHART_VERSION,
  JudgementSession,
  calculateScore,
} from "../lib/chart.ts";
import {
  HIT_KINDS,
  HIT_STYLE,
  type Difficulty,
  type Grade,
  type HitKind,
  type Note,
  type ReplayHit,
  type Result,
  type Settings,
  type Song,
} from "../types.ts";
const LABEL = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  miss: "MISS",
};
export function Game({
  song,
  buffer,
  notes,
  difficulty,
  settings,
  onFinish,
  onExit,
}: {
  song: Song;
  buffer: AudioBuffer;
  notes: Note[];
  difficulty: Difficulty;
  settings: Settings;
  onFinish: (r: Result) => void;
  onExit: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    clock = useRef<MusicClock | null>(null),
    session = useRef(new JudgementSession(notes, settings.speed)),
    replay = useRef<ReplayHit[]>([]),
    ended = useRef(false),
    pausedRef = useRef(false),
    hitFx = useRef<{ time: number; kind: HitKind; grade: Grade }[]>([]),
    feedback = useRef({ grade: "" as Grade | "", delta: 0, at: -10 }),
    pressed = useRef(new Set<HitKind>()),
    [paused, setPaused] = useState(false),
    [ready, setReady] = useState(false),
    [hud, setHud] = useState({
      score: 0,
      combo: 0,
      accuracy: 100,
      time: 0,
      countdown: 3,
      grade: "" as Grade | "",
      delta: 0,
      miss: 0,
      beat: 0,
    }),
    [landscape, setLandscape] = useState(
      matchMedia("(orientation: landscape)").matches,
    );
  const [milestone, setMilestone] = useState(0);
  function pause() {
    if (!clock.current || ended.current || pausedRef.current) return;
    clock.current?.pause();
    pausedRef.current = true;
    setPaused(true);
  }
  async function resume() {
    if (!landscape) return;
    await audioContext().resume();
    clock.current?.resume();
    pausedRef.current = false;
    setPaused(false);
  }
  function start() {
    if (clock.current || !landscape) return;
    const c = new MusicClock(buffer, settings);
    clock.current = c;
    c.start(0, 2);
    setReady(true);
    setAmbience(settings.ambient ?? 0.055, "game");
    chime([60, 67, 72], settings.effects * 0.1, 0.13);
  }
  useEffect(() => {
    document.body.classList.add("playing");
    const query = matchMedia("(orientation: landscape)"),
      change = () => {
        setLandscape(query.matches);
        if (!query.matches) pause();
      };
    query.addEventListener("change", change);
    const hide = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", hide);
    const interrupted = () => {
      if (audioContext().state !== "running") pause();
    };
    audioContext().addEventListener("statechange", interrupted);
    return () => {
      document.body.classList.remove("playing");
      query.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", hide);
      audioContext().removeEventListener("statechange", interrupted);
      clock.current?.dispose();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      try {
        screen.orientation?.unlock?.();
      } catch {}
      setAmbience(settings.ambient ?? 0.055);
    };
  }, []);
  useEffect(() => {
    if (landscape && !clock.current) start();
  }, [landscape]);
  function hit(kind: HitKind, stamp: number) {
    if (
      !clock.current ||
      pausedRef.current ||
      ended.current ||
      !landscape ||
      clock.current.countdown() > 0.015
    )
      return;
    playHit(kind, settings.effects, song.analysis.tonic);
    const now = clock.current.time(),
      at =
        clock.current.timeAt(eventTime(stamp)) -
        (settings.offset / 1000) * settings.speed;
    const hitMs = Math.max(
      replay.current.at(-1)?.[0] ?? -250,
      Math.round(Math.max(-0.25, Math.min(song.duration, at)) * 1000),
    );
    if (replay.current.length < 10000)
      replay.current.push([hitMs, HIT_KINDS.indexOf(kind)]);
    const judged = session.current.hit(kind, hitMs / 1000);
    const grade = judged?.grade || "miss";
    if (judged) feedback.current = { grade, delta: judged.delta, at: now };
    hitFx.current.push({ time: now, kind, grade });
    pressed.current.add(kind);
    setTimeout(() => pressed.current.delete(kind), 100);
    if (settings.vibration && judged && navigator.vibrate) navigator.vibrate(8);
    const combo = session.current.stats.combo;
    if (judged && [10, 25, 50, 100, 200, 300, 500].includes(combo)) {
      setMilestone(combo);
      chime([72, 76, 79], settings.effects * 0.11, 0.055);
      setTimeout(() => setMilestone(0), 1000);
    }
  }
  const hitRef = useRef(hit);
  hitRef.current = hit;
  useEffect(() => {
    const map: Record<string, HitKind> = {
      KeyF: "pulse",
      KeyJ: "pulse",
      KeyG: "snap",
      KeyH: "snap",
      KeyD: "edge",
      KeyK: "edge",
    };
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (map[e.code]) {
        e.preventDefault();
        hitRef.current(map[e.code], e.timeStamp);
      }
      if (e.code === "Escape") {
        e.preventDefault();
        pause();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    let frame = 0,
      lastHud = 0;
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    function shape(kind: HitKind, x: number, y: number, r: number) {
      ctx.beginPath();
      if (kind === "pulse") ctx.arc(x, y, r, 0, Math.PI * 2);
      else if (kind === "snap") {
        ctx.moveTo(x, y - r * 1.15);
        ctx.lineTo(x + r, y + r * 0.75);
        ctx.lineTo(x - r, y + r * 0.75);
        ctx.closePath();
      } else {
        ctx.moveTo(x, y - r * 1.1);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r * 1.1);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      }
    }
    function draw(stamp: number) {
      if (ended.current) return;
      const c = clock.current,
        time = c?.time() ?? -2,
        s = session.current.stats;
      const rect = el!.getBoundingClientRect(),
        dpr = Math.min(2, devicePixelRatio);
      if (
        el!.width !== Math.round(rect.width * dpr) ||
        el!.height !== Math.round(rect.height * dpr)
      ) {
        el!.width = Math.round(rect.width * dpr);
        el!.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width,
        h = rect.height,
        line = w * 0.16,
        lane = h / 3;
      ctx.clearRect(0, 0, w, h);
      if (c && !pausedRef.current && c.countdown() <= 0) {
        const missed = session.current.advance(
          time - (settings.offset / 1000) * settings.speed,
        );
        if (missed) {
          feedback.current = { grade: "miss", delta: 0, at: time };
        }
        if (time >= song.duration) {
          ended.current = true;
          const final = session.current.finish();
          c.dispose();
          onFinish({
            id: crypto.randomUUID(),
            songId: song.id,
            title: song.title,
            difficulty,
            score: final.score,
            accuracy: final.accuracy,
            maxCombo: final.maxCombo,
            perfect: final.perfect,
            great: final.great,
            good: final.good,
            miss: final.miss,
            total: notes.length,
            createdAt: Date.now(),
            speed: settings.speed,
            early: final.early,
            late: final.late,
            meanOffset: final.meanOffset,
            chartVersion: CHART_VERSION,
            replay: replay.current,
          });
          return;
        }
      }
      HIT_KINDS.forEach((kind, i) => {
        const y = lane * (i + 0.5);
        ctx.fillStyle =
          i % 2 ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.25)";
        ctx.fillRect(0, i * lane, w, lane - 1);
        ctx.strokeStyle = HIT_STYLE[kind].color + "35";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        shape(kind, line, y, Math.min(17, lane * 0.34));
        ctx.strokeStyle = HIT_STYLE[kind].color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
      ctx.fillStyle = "rgba(42,40,50,.2)";
      ctx.fillRect(line - 1, 0, 2, h);
      const visualTime =
          time + ((settings.visualOffset ?? 0) / 1000) * settings.speed,
        lead = travelSeconds(song.bpm, settings.scrollSpeed);
      for (let i = session.current.cursor; i < notes.length; i++) {
        const n = notes[i];
        if (n.time > visualTime + lead * 1.15) break;
        if (session.current.status[i]) continue;
        const x = noteX(n.time, visualTime, w, song.bpm, settings.scrollSpeed),
          y = lane * (HIT_KINDS.indexOf(n.kind) + 0.5),
          r = Math.min(16, lane * 0.33) * (n.accent ? 1.12 : 1);
        if (x < -25) continue;
        ctx.shadowBlur = settings.reducedMotion ? 0 : 12;
        ctx.shadowColor = HIT_STYLE[n.kind].color + "60";
        shape(n.kind, x, y, r);
        ctx.fillStyle = HIT_STYLE[n.kind].color;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,.85)";
        shape(n.kind, x - r * 0.2, y - r * 0.22, r * 0.2);
        ctx.fill();
      }
      hitFx.current = hitFx.current.filter(
        (f) => time - f.time < 0.45 && time - f.time >= 0,
      );
      for (const f of hitFx.current) {
        const age = Math.max(0, Math.min(1, (time - f.time) / 0.45)),
          y = lane * (HIT_KINDS.indexOf(f.kind) + 0.5);
        ctx.globalAlpha = 1 - age;
        shape(f.kind, line, y, Math.min(19, lane * 0.4) + age * 33);
        ctx.strokeStyle =
          f.grade === "miss" ? "#a6a3af" : HIT_STYLE[f.kind].color;
        ctx.lineWidth = 3 * (1 - age);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (const kind of pressed.current) {
        const y = lane * (HIT_KINDS.indexOf(kind) + 0.5);
        ctx.fillStyle = HIT_STYLE[kind].color + "25";
        ctx.fillRect(0, y - lane / 2, line + 30, lane);
      }
      if (stamp - lastHud > 48) {
        lastHud = stamp;
        const judged = s.perfect + s.great + s.good + s.miss,
          accuracy = judged
            ? calculateScore(s.perfect, s.great, s.good, judged) / 10000
            : 100;
        setHud({
          score: calculateScore(s.perfect, s.great, s.good, notes.length),
          combo: s.combo,
          accuracy,
          time: Math.max(0, time),
          countdown: c ? Math.ceil(c.countdown()) : 2,
          grade: feedback.current.grade,
          delta: feedback.current.delta,
          miss: s.miss,
          beat: Math.floor((Math.max(0, time) * song.bpm) / 60),
        });
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [notes]);
  const heat = Math.min(
      1,
      (hud.combo / 50) * 0.55 + (hud.score / 1000000) * 0.45,
    ),
    mood = hud.grade === "miss" ? "stumble" : heat > 0.55 ? "fever" : "groove";
  return (
    <section
      className={
        "game-v2 theme-" +
        (settings.theme || "pearl") +
        (heat > 0.55 ? " is-fever" : "")
      }
      style={{ "--heat": heat } as CSSProperties}
      aria-label="リズムゲーム"
    >
      <div className="game-aura" />
      <header className="game-hud">
        <div className="game-song">
          <span>OFF MUSIC</span>
          <strong>{song.title}</strong>
          <small>
            {effectiveBpm(song.bpm, settings.speed)} BPM · {settings.speed}× ·{" "}
            {notes.length} NOTES
          </small>
        </div>
        <div className="score-hud">
          <small>SCORE</small>
          <strong data-testid="game-score">
            {hud.score.toLocaleString().padStart(7, "0")}
          </strong>
        </div>
        <div className="accuracy-hud">
          <small>ACCURACY</small>
          <strong>
            {hud.accuracy.toFixed(1)}
            <sup>%</sup>
          </strong>
        </div>
        <button className="icon-button" onClick={pause} aria-label="一時停止">
          <Pause size={20} />
        </button>
      </header>
      <div className="game-stage">
        <Mascots bpm={song.bpm * settings.speed} mood={mood} beat={hud.beat} />
        <div className="judge-live" data-grade={hud.grade} role="status">
          <strong>{hud.grade ? LABEL[hud.grade] : "READY"}</strong>
          <span>
            {hud.grade === "miss"
              ? "次の音へ"
              : hud.grade
                ? (Math.abs(hud.delta) > 0.018
                    ? hud.delta < 0
                      ? "EARLY"
                      : "LATE"
                    : "JUST") +
                  ` · ${hud.delta > 0 ? "+" : ""}${Math.round(hud.delta * 1000)} ms`
                : "音に合わせてタップ"}
          </span>
        </div>
        <div className="combo-hud">
          <strong data-testid="game-combo">{hud.combo}</strong>
          <small>COMBO</small>
        </div>
        {milestone > 0 && !settings.reducedMotion && (
          <div className="combo-milestone" key={milestone}>
            {milestone} COMBO <span>✦</span>
          </div>
        )}
        <div className="heat-meter" aria-label="盛り上がり">
          <i style={{ width: heat * 100 + "%" }} />
          <span>{heat > 0.55 ? "FEVER" : "GROOVE"}</span>
        </div>
      </div>
      <div className="highway">
        <canvas
          ref={canvas}
          aria-label="低音は丸、中音は三角、高音はひし形。右から左の判定線へ流れます"
        />
        {ready && hud.countdown > 0 && !paused && (
          <div className="countdown" key={hud.countdown}>
            {hud.countdown}
          </div>
        )}
      </div>
      <div className="game-pads">
        {HIT_KINDS.map((kind) => (
          <button
            key={kind}
            className={"rhythm-pad " + kind}
            style={{ "--pad": HIT_STYLE[kind].color } as CSSProperties}
            aria-label={HIT_STYLE[kind].label + "を叩く"}
            onPointerDown={(e) => {
              e.preventDefault();
              hit(kind, e.timeStamp);
            }}
            onKeyDown={(e) => {
              if (e.code === "Space" || e.code === "Enter") {
                e.preventDefault();
                if (!e.repeat) hit(kind, e.timeStamp);
              }
            }}
          >
            <span className="pad-symbol">{HIT_STYLE[kind].symbol}</span>
            <strong>{HIT_STYLE[kind].label}</strong>
            <small>{HIT_STYLE[kind].key}</small>
          </button>
        ))}
      </div>
      <footer className="game-progress">
        <i
          style={{
            width: Math.min(100, (hud.time / song.duration) * 100) + "%",
          }}
        />
        <span>
          {Math.floor(hud.time / 60)}:
          {String(Math.floor(hud.time % 60)).padStart(2, "0")} /{" "}
          {Math.floor(song.duration / 60)}:
          {String(Math.floor(song.duration % 60)).padStart(2, "0")}
        </span>
      </footer>
      {(!landscape || paused) && (
        <div className="game-overlay">
          <div className="glass pause-card">
            {!landscape ? (
              <>
                <Smartphone className="rotate-phone" size={42} />
                <h2>スマホを横向きに</h2>
                <p>3つのボタンと音符がすべて入る横画面で遊べます。</p>
              </>
            ) : (
              <>
                <span className="eyebrow">PAUSE</span>
                <h2>ひと休み</h2>
                <button className="primary wide" onClick={resume}>
                  <Play size={18} />
                  再開
                </button>
              </>
            )}
            <button className="quiet wide" onClick={onExit}>
              <LogOut size={16} />
              曲一覧に戻る
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
