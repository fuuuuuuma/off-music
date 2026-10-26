import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { Pause, Play, Smartphone, LogOut, Heart, BookOpen } from "lucide-react";
import { GameRules } from "./GameRules.tsx";
import { Sheet } from "./Sheet.tsx";
import { Mascots } from "./Mascots.tsx";
import {
  MusicClock,
  audioContext,
  chime,
  eventTime,
  playHit,
  setAmbience,
} from "../lib/audio.ts";
import { CHART_VERSION, KEYS } from "../lib/stage-chart.ts";
import { StageSession, type StageFeedback } from "../lib/stage-session.ts";
import { touchLane } from "../lib/stage-geometry.ts";
import { renderStage, type InputEcho } from "../lib/stage-renderer.ts";
import { STAGE_TOUCH_TOP } from "../lib/stage-rules.ts";
import { effectiveBpm } from "../lib/motion.ts";
import type {
  Difficulty,
  Result,
  Settings,
  Song,
  StageInput,
  StageNote,
} from "../types.ts";
const LABEL = {
  perfect: "PERFECT",
  great: "GREAT",
  good: "GOOD",
  bad: "BAD",
  miss: "MISS",
};
const CODE = ["KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "KeyL"];
export function Game({
  song,
  buffer,
  notes,
  difficulty,
  settings,
  onFinish,
  onExit,
  onPractice,
  tutorialOpen,
}: {
  song: Song;
  buffer: AudioBuffer;
  notes: StageNote[];
  difficulty: Difficulty;
  settings: Settings;
  onFinish: (r: Result) => void;
  onExit: () => void;
  onPractice: () => void;
  tutorialOpen: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    clock = useRef<MusicClock | null>(null);
  const [session] = useState(() => ({
    current: new StageSession(notes, settings.speed),
  }));
  const replay = useRef<StageInput[]>([]),
    ended = useRef(false),
    pausedRef = useRef(false);
  const recentInput = useRef<StageFeedback | null>(null);
  const effects = useRef<StageFeedback[]>([]),
    lastFeedback = useRef<StageFeedback | null>(null);
  const echoes = useRef<InputEcho[]>([]);
  const moveCache = useRef(new Map<number, StageInput>()),
    physicallyDown = useRef(new Set<number>());
  const [paused, setPaused] = useState(false),
    [showRules, setShowRules] = useState(false),
    [milestone, setMilestone] = useState(0);
  const [landscape, setLandscape] = useState(
    matchMedia("(orientation: landscape)").matches,
  );
  const [hud, setHud] = useState({
    score: 0,
    combo: 0,
    accuracy: 100,
    time: 0,
    countdown: 2,
    grade: "" as string,
    delta: 0,
    life: 1000,
    failed: false,
    miss: 0,
    good: 0,
    great: 0,
    bad: 0,
    beat: 0,
    flickError: false,
  });
  function input(
    id: number,
    action: 0 | 1 | 2 | 3,
    x: number,
    y: number,
    stamp: number,
  ) {
    const c = clock.current;
    if (
      !c ||
      pausedRef.current ||
      ended.current ||
      !landscape ||
      c.countdown() > 0.015
    )
      return;
    const at =
      c.timeAt(eventTime(stamp)) - (settings.offset / 1000) * settings.speed;
    const ms = Math.max(
      replay.current.at(-1)?.[0] ?? -250,
      Math.round(Math.max(-0.25, Math.min(song.duration, at)) * 1000),
    );
    const event: StageInput = [
      ms,
      id,
      action,
      Math.round(Math.max(0, Math.min(12, x)) * 100),
      Math.round(Math.max(-0.5, Math.min(1.5, y)) * 1000),
    ];
    const previous = moveCache.current.get(id);
    if (
      action === 1 &&
      previous &&
      ms - previous[0] < 80 &&
      Math.abs(event[3] - previous[3]) < 8 &&
      Math.abs(event[4] - previous[4]) < 18
    )
      return;
    if (replay.current.length >= 30000) return;
    replay.current.push(event);
    if (action < 2) moveCache.current.set(id, event);
    else moveCache.current.delete(id);
    const feedback = session.current.input(event);
    if (action === 0) {
      echoes.current = [...echoes.current.slice(-15), { x, y, time: c.time() }];
      if (!feedback)
        playHit("pulse", settings.effects * 0.16, song.analysis.tonic);
    }
    if (feedback) {
      recentInput.current = feedback;
      effects.current.push(feedback);
      lastFeedback.current = feedback;
      const n = notes[feedback.note];
      if (feedback.grade !== "miss") {
        playHit(n.kind, settings.effects * 0.65, song.analysis.tonic);
        if (n.accent) chime([84], settings.effects * 0.12, 0.01);
        if (settings.vibration && navigator.vibrate) navigator.vibrate(7);
      }
      const combo = session.current.stats.combo;
      if ([25, 50, 100, 200, 300, 500, 1000].includes(combo)) {
        setMilestone(combo);
        chime([72, 76, 79], settings.effects * 0.1, 0.045);
        setTimeout(() => setMilestone(0), 850);
      }
    }
  }
  const inputRef = useRef(input);
  inputRef.current = input;
  function releaseAll() {
    for (const id of session.current.pointers.keys())
      inputRef.current(id, 3, 0, 0, performance.now());
    physicallyDown.current.clear();
    moveCache.current.clear();
  }
  function pause() {
    if (!clock.current || ended.current || pausedRef.current) return;
    releaseAll();
    clock.current.pause();
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
  useEffect(() => {
    document.body.classList.add("playing");
    const query = matchMedia("(orientation: landscape)");
    const change = () => {
      setLandscape(query.matches);
      if (!query.matches) pause();
    };
    const hidden = () => {
      if (document.hidden) pause();
    };
    const interrupted = () => {
      if (audioContext().state !== "running") pause();
    };
    query.addEventListener("change", change);
    document.addEventListener("visibilitychange", hidden);
    audioContext().addEventListener("statechange", interrupted);
    return () => {
      document.body.classList.remove("playing");
      query.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", hidden);
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
    if (landscape && !clock.current) {
      const c = new MusicClock(buffer, settings);
      clock.current = c;
      c.start(0, 2);
      setAmbience(settings.ambient ?? 0.055, "game");
      chime([60, 67, 72], settings.effects * 0.1, 0.13);
    }
  }, [landscape]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        pause();
        return;
      }
      const i = CODE.indexOf(e.code);
      if (i < 0 || e.repeat) return;
      e.preventDefault();
      const id = 100 + i;
      physicallyDown.current.add(id);
      inputRef.current(id, 0, 1 + i * 2, 0.85, e.timeStamp);
      if (e.shiftKey) inputRef.current(id, 1, 1 + i * 2, 0.7, e.timeStamp);
    };
    const up = (e: KeyboardEvent) => {
      const i = CODE.indexOf(e.code);
      if (i < 0) return;
      e.preventDefault();
      physicallyDown.current.delete(100 + i);
      inputRef.current(100 + i, 2, 1 + i * 2, 0.85, e.timeStamp);
    };
    addEventListener("keydown", down);
    addEventListener("keyup", up);
    return () => {
      removeEventListener("keydown", down);
      removeEventListener("keyup", up);
    };
  }, []);
  function pointer(e: PointerEvent<HTMLDivElement>, action: 0 | 1 | 2 | 3) {
    if (e.pointerType === "mouse" && e.button !== 0 && action === 0) return;
    const box = e.currentTarget.getBoundingClientRect(),
      y = (e.clientY - box.top) / box.height;
    if (action === 0) {
      if (y < STAGE_TOUCH_TOP) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      physicallyDown.current.add(e.pointerId);
    } else if (!physicallyDown.current.has(e.pointerId)) return;
    inputRef.current(
      e.pointerId,
      action,
      touchLane(e.clientX - box.left, box.width),
      y,
      e.timeStamp,
    );
    if (action >= 2) {
      physicallyDown.current.delete(e.pointerId);
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }
  useEffect(() => {
    let frame = 0,
      lastHud = 0;
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const draw = (stamp: number) => {
      if (ended.current) return;
      const c = clock.current,
        time = c?.time() ?? -2,
        current = session.current;
      const rect = el.getBoundingClientRect(),
        dpr = Math.min(2, devicePixelRatio);
      if (
        el.width !== Math.round(rect.width * dpr) ||
        el.height !== Math.round(rect.height * dpr)
      ) {
        el.width = Math.round(rect.width * dpr);
        el.height = Math.round(rect.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (c && !pausedRef.current && c.countdown() <= 0) {
        current.advance(
          time - (settings.offset / 1000 + 0.05) * settings.speed,
        );
        if (time >= song.duration) {
          ended.current = true;
          const final = current.finish();
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
            bad: final.bad,
            miss: final.miss,
            total: final.total,
            life: final.life,
            cleared: final.cleared,
            flickErrors: final.flickErrors,
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
      if (current.feedback && current.feedback !== lastFeedback.current) {
        effects.current.push(current.feedback);
        lastFeedback.current = current.feedback;
      }
      effects.current = effects.current.filter(
        (f) => time - f.time < 0.48 * settings.speed && time >= f.time,
      );
      renderStage(
        ctx,
        rect.width,
        rect.height,
        notes,
        current,
        time,
        song.bpm,
        settings,
        effects.current,
        echoes.current,
      );
      if (stamp - lastHud > 48) {
        lastHud = stamp;
        const s = current.stats,
          count = s.perfect + s.great + s.good + s.bad + s.miss;
        const f =
          recentInput.current &&
          time - recentInput.current.time < 0.16 * settings.speed
            ? recentInput.current
            : current.feedback;
        setHud({
          score: current.score,
          combo: s.combo,
          accuracy: count
            ? ((s.perfect + s.great * 0.7 + s.good * 0.35 + s.bad * 0.1) /
                count) *
              100
            : 100,
          time: Math.max(0, time),
          countdown: c ? Math.ceil(c.countdown()) : 2,
          grade: f?.grade || "",
          delta: f?.delta || 0,
          life: s.life,
          failed: s.failed,
          good: s.good,
          great: s.great,
          bad: s.bad,
          miss: s.miss,
          beat: Math.floor((Math.max(0, time) * song.bpm) / 60),
          flickError: !!f?.flickError,
        });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [notes]);
  const heat = Math.min(
    1,
    (hud.combo / 75) * 0.55 + (hud.score / 1000000) * 0.45,
  );
  const ap = !hud.great && !hud.good && !hud.bad && !hud.miss,
    fc = !hud.good && !hud.bad && !hud.miss;
  const total = session.current.points.length;
  return (
    <section
      inert={tutorialOpen}
      className={
        "game-v2 stage-v4 theme-" +
        (settings.theme || "pearl") +
        (heat > 0.55 ? " is-fever" : "")
      }
      style={{ "--heat": heat } as CSSProperties}
      aria-label="リズムゲーム"
    >
      <div className="game-aura" />
      <div className="stage-backdrop" />
      <header className="stage-hud">
        <div className="stage-score">
          <small>
            SCORE{" "}
            <span>
              {hud.score >= 930000
                ? "S"
                : hud.score >= 830000
                  ? "A"
                  : hud.score >= 680000
                    ? "B"
                    : "C"}
            </span>
          </small>
          <strong data-testid="game-score">
            {hud.score.toLocaleString().padStart(7, "0")}
          </strong>
          <i>
            <b style={{ width: hud.score / 10000 + "%" }} />
          </i>
        </div>
        <div className="stage-song">
          <strong>{song.title}</strong>
          <small>
            {difficulty.toUpperCase()} ·{" "}
            {effectiveBpm(song.bpm, settings.speed)} BPM · {settings.speed}×
            {hud.failed ? " · RECOVERY" : ""}
          </small>
        </div>
        <div className="stage-life" data-low={hud.life < 250}>
          <small>
            <Heart size={10} /> LIFE <b>{hud.life}</b>
          </small>
          <i>
            <b style={{ width: hud.life / 10 + "%" }} />
          </i>
        </div>
        <button className="icon-button" onClick={pause} aria-label="一時停止">
          <Pause size={19} />
        </button>
      </header>
      <div
        className="stage-field"
        onPointerDown={(e) => pointer(e, 0)}
        onPointerMove={(e) => pointer(e, 1)}
        onPointerUp={(e) => pointer(e, 2)}
        onPointerCancel={(e) => pointer(e, 3)}
        onLostPointerCapture={(e) => {
          if (physicallyDown.current.has(e.pointerId)) pointer(e, 3);
        }}
      >
        <div className="stage-cast">
          <Mascots
            bpm={song.bpm * settings.speed}
            mood={
              hud.grade === "miss"
                ? "stumble"
                : heat > 0.55
                  ? "fever"
                  : "groove"
            }
            beat={hud.beat}
          />
        </div>
        <canvas
          ref={canvas}
          aria-label="12分割のレーン。横長をタップ、緑の帯を押したまま追い、矢印をフリック"
        />
        <div
          className={
            "stage-combo " + (ap ? "all-perfect" : fc ? "full-combo" : "")
          }
        >
          <small>COMBO</small>
          <strong data-testid="game-combo">{hud.combo}</strong>
          <span>{ap ? "ALL PERFECT" : fc ? "FULL COMBO" : ""}</span>
        </div>
        <div className="stage-judgement" data-grade={hud.grade} role="status">
          <strong>
            {hud.grade ? LABEL[hud.grade as keyof typeof LABEL] : "READY"}
          </strong>
          <span>
            {hud.flickError
              ? "! FLICK"
              : !hud.grade
                ? "紫の帯を目安にタッチ"
                : hud.grade === "miss"
                  ? "次のリズムへ"
                  : (Math.abs(hud.delta) < 0.018
                      ? "JUST"
                      : hud.delta < 0
                        ? "FAST"
                        : "LATE") +
                    ` · ${hud.delta > 0 ? "+" : ""}${Math.round(hud.delta * 1000)} ms`}
          </span>
        </div>
        {milestone > 0 && !settings.reducedMotion && (
          <div className="stage-milestone" key={milestone}>
            ✦ {milestone} COMBO ✦
          </div>
        )}
        <div className="stage-touch-keys" aria-label="レーン操作">
          {KEYS.map((key, i) => (
            <button
              key={key}
              tabIndex={0}
              aria-label={`レーン${i + 1} · ${key}`}
              onKeyDown={(e) => {
                if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
                  e.preventDefault();
                  input(200 + i, 0, i * 2 + 1, 0.85, e.timeStamp);
                }
              }}
              onKeyUp={(e) => {
                if (e.code === "Space" || e.code === "Enter") {
                  e.preventDefault();
                  input(200 + i, 2, i * 2 + 1, 0.85, e.timeStamp);
                }
              }}
            >
              <span>{key}</span>
            </button>
          ))}
        </div>
        {hud.countdown > 0 && !paused && (
          <div className="stage-countdown" key={hud.countdown}>
            {hud.countdown}
            <small>LIVE START</small>
          </div>
        )}
      </div>
      <footer className="stage-footer">
        <span>
          OFF MUSIC <b>{total} COMBO</b>
        </span>
        <i>
          <b
            style={{
              width: Math.min(100, (hud.time / song.duration) * 100) + "%",
            }}
          />
        </i>
        <time>
          {Math.floor(hud.time / 60)}:
          {String(Math.floor(hud.time % 60)).padStart(2, "0")} /{" "}
          {Math.floor(song.duration / 60)}:
          {String(Math.floor(song.duration % 60)).padStart(2, "0")}
        </time>
        <small>紫の帯でタッチ · 長押し → 離す · 矢印はフリック</small>
      </footer>
      {(!landscape || paused) && (
        <div className="game-overlay">
          <div className="glass pause-card">
            {!landscape ? (
              <>
                <Smartphone className="rotate-phone" size={40} />
                <h2>スマホを横向きに</h2>
                <p>判定線に来るノーツを直接タッチします。</p>
              </>
            ) : (
              <>
                <span className="eyebrow">PAUSE</span>
                <h2>ひと休み</h2>
                <button className="primary wide" onClick={resume}>
                  <Play size={18} />
                  再開
                </button>
                <p>スライドは指を置き直して続けられます。</p>
                <button
                  className="quiet wide"
                  onClick={() => setShowRules(true)}
                >
                  <BookOpen size={16} />
                  ルール・得点
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
      {showRules && (
        <Sheet title="ルール・得点" onClose={() => setShowRules(false)}>
          <GameRules notes={notes} onPractice={onPractice} />
        </Sheet>
      )}
    </section>
  );
}
