import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  ArrowRight,
  Check,
  Hand,
  MoveUp,
  Play,
  Pointer,
  RotateCcw,
  Smartphone,
  X,
} from "lucide-react";
import { TutorialSession, TUTORIAL_STEPS } from "../lib/tutorial.ts";
import { renderStage } from "../lib/stage-renderer.ts";
import { touchLane } from "../lib/stage-geometry.ts";
import { STAGE_TOUCH_TOP, STAGE_WINDOWS } from "../lib/stage-rules.ts";
import { chime, playHit, unlockAudio } from "../lib/audio.ts";
import type { Settings } from "../types.ts";

const CODES = ["KeyA", "KeyS", "KeyD", "KeyJ", "KeyK", "KeyL"];
const ICONS = [Pointer, Hand, MoveUp];
export function Tutorial({
  settings,
  onClose,
}: {
  settings: Settings;
  onClose: () => void;
}) {
  const [model] = useState(() => new TutorialSession());
  const [revision, update] = useState(0);
  const [landscape, setLandscape] = useState(
    matchMedia("(orientation: landscape)").matches,
  );
  const root = useRef<HTMLElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const down = useRef(new Set<number>());
  const active = useRef(landscape && !document.hidden);
  const close = useRef(onClose);
  close.current = onClose;
  const drawSettings = useRef({
    ...settings,
    speed: 1,
    scrollSpeed: 1,
    offset: 0,
    visualOffset: 0,
  });
  const refresh = () => update((v) => v + 1);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const accept = (id: number, action: 0 | 1 | 2 | 3, x: number, y: number) => {
    if (!active.current) return;
    const previous = model.phase;
    const result = model.input(id, action, x, y, performance.now() / 1000);
    if (result) playHit(model.lesson.note.kind, settings.effects * 0.6);
    else if (action === 0 && previous !== "ready" && previous !== "success")
      playHit("pulse", settings.effects * 0.12);
    if (model.phase === "success" && previous !== "success")
      chime([72, 76, 79], settings.effects * 0.25, 0.08);
    refreshRef.current();
  };
  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add("tutorial-active");
    root.current?.focus();
    const query = matchMedia("(orientation: landscape)");
    const visibility = () => {
      active.current = query.matches && !document.hidden;
      setLandscape(query.matches);
      if (!active.current && model.phase !== "success")
        model.reset("画面を横にして、練習を再開できます。");
      down.current.clear();
      refreshRef.current();
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      const i = CODES.indexOf(e.code);
      if (i < 0 || e.repeat) return;
      e.preventDefault();
      acceptRef.current(100 + i, 0, 1 + 2 * i, 0.85);
      if (e.shiftKey) acceptRef.current(100 + i, 1, 1 + 2 * i, 0.65);
    };
    const keyup = (e: KeyboardEvent) => {
      const i = CODES.indexOf(e.code);
      if (i < 0) return;
      e.preventDefault();
      acceptRef.current(100 + i, 2, 1 + 2 * i, 0.85);
    };
    query.addEventListener("change", visibility);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("keydown", keydown);
    document.addEventListener("keyup", keyup);
    return () => {
      document.body.classList.remove("tutorial-active");
      query.removeEventListener("change", visibility);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("keyup", keyup);
      if (previous?.isConnected) previous.focus();
    };
  }, [model]);
  useEffect(() => {
    let frame = 0,
      last = performance.now(),
      lastUi = 0,
      lastCue = "";
    const draw = (stamp: number) => {
      const elapsed = Math.min(0.05, Math.max(0, (stamp - last) / 1000));
      last = stamp;
      if (active.current) model.advance(elapsed);
      const note = model.lesson.note;
      const cue = `${model.step}:${model.phase}:${Math.ceil(Math.max(0, note.time - model.time))}`;
      if (cue !== lastCue && active.current) {
        if (model.phase === "approach")
          chime([67], settings.effects * 0.15, 0.01);
        if (model.phase === "waiting" || model.phase === "release")
          chime([79], settings.effects * 0.25, 0.01);
        lastCue = cue;
      }
      const el = canvas.current,
        ctx = el?.getContext("2d");
      if (el && ctx) {
        const box = el.getBoundingClientRect(),
          ratio = Math.min(2, devicePixelRatio);
        const width = Math.round(box.width * ratio),
          height = Math.round(box.height * ratio);
        if (el.width !== width || el.height !== height) {
          el.width = width;
          el.height = height;
        }
        if (width && height) {
          ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
          renderStage(
            ctx,
            box.width,
            box.height,
            [note],
            model.engine,
            model.time,
            120,
            drawSettings.current,
            [],
          );
        }
      }
      if (stamp - lastUi > 40) {
        lastUi = stamp;
        refreshRef.current();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [model, settings.effects]);
  const pointer = (e: PointerEvent<HTMLDivElement>, action: 0 | 1 | 2 | 3) => {
    const box = e.currentTarget.getBoundingClientRect(),
      y = (e.clientY - box.top) / box.height;
    if (action === 0) {
      if (
        y < STAGE_TOUCH_TOP ||
        !active.current ||
        model.phase === "ready" ||
        model.phase === "success"
      )
        return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      down.current.add(e.pointerId);
    } else if (!down.current.has(e.pointerId)) return;
    acceptRef.current(
      e.pointerId,
      action,
      touchLane(e.clientX - box.left, box.width),
      y,
    );
    if (action >= 2) {
      down.current.delete(e.pointerId);
      if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };
  const start = async () => {
    try {
      await unlockAudio();
    } catch {
      /* The visual guide also works without audio. */
    }
    if (!root.current?.isConnected || !active.current) return;
    down.current.clear();
    model.start();
    refresh();
  };
  const { phase, lesson, hint, time } = model;
  const Icon = ICONS[model.step];
  const near = time >= lesson.note.time - STAGE_WINDOWS.bad;
  const callout =
    phase === "success"
      ? "できました！"
      : phase === "ready"
        ? "光る場所を見てみましょう"
        : phase === "release"
          ? "いま、指を離す！"
          : phase === "holding"
            ? `そのまま長押し · あと${Math.max(0, lesson.note.endTime! - time).toFixed(1)}秒`
            : near
              ? model.step === 2
                ? "いま、上へフリック！"
                : model.step === 1
                  ? "いま、押したまま！"
                  : "いま、タップ！"
              : `あと${Math.ceil(lesson.note.time - time)}秒`;
  return (
    <section
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="操作チュートリアル"
      className={
        "tutorial theme-" +
        (settings.theme || "pearl") +
        (settings.reducedMotion ? " reduce-motion" : "")
      }
      data-phase={phase}
      data-step={model.step}
      data-revision={revision}
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const buttons = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) || [],
        ).filter((button) => !button.closest("[inert]"));
        const first = buttons[0],
          last = buttons.at(-1);
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === root.current)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
    >
      <header className="tutorial-header">
        <div>
          <small>OFF MUSIC / TUTORIAL</small>
          <h2>操作を試す</h2>
        </div>
        <ol aria-label="練習の進み具合">
          {TUTORIAL_STEPS.map((s, i) => (
            <li
              key={s.title}
              aria-current={model.step === i ? "step" : undefined}
              data-done={model.completed.has(i)}
            >
              <b>{model.completed.has(i) ? <Check size={13} /> : i + 1}</b>
              <span>{s.title}</span>
            </li>
          ))}
        </ol>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="チュートリアルを閉じる"
        >
          <X size={21} />
        </button>
      </header>
      <div className="tutorial-lesson">
        <span>
          <Icon size={21} />
          {String(model.step + 1).padStart(2, "0")} — {lesson.title}
        </span>
        <p>{lesson.instruction}</p>
      </div>
      <div
        className="tutorial-field"
        inert={!landscape}
        onPointerDown={(e) => pointer(e, 0)}
        onPointerMove={(e) => pointer(e, 1)}
        onPointerUp={(e) => pointer(e, 2)}
        onPointerCancel={(e) => pointer(e, 3)}
        onLostPointerCapture={(e) => {
          if (down.current.has(e.pointerId)) pointer(e, 3);
        }}
      >
        <canvas
          ref={canvas}
          aria-label="光る横位置でタップ・長押し・フリックを練習するレーン"
        />
        <button
          className="tutorial-target"
          disabled={phase === "ready" || phase === "success"}
          data-lit={near}
          data-kind={lesson.note.type}
          aria-label={`光る場所：${lesson.title}`}
          style={
            {
              left: `${6 + (lesson.note.lane / 12) * 88}%`,
              width: `${(lesson.note.width / 12) * 88}%`,
            } as CSSProperties
          }
          onKeyDown={(e) => {
            if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
              e.preventDefault();
              accept(300, 0, lesson.note.lane + lesson.note.width / 2, 0.85);
            }
          }}
          onKeyUp={(e) => {
            if (e.code === "Space" || e.code === "Enter") {
              e.preventDefault();
              accept(300, 2, lesson.note.lane + lesson.note.width / 2, 0.85);
            }
          }}
        >
          <i
            className="tutorial-fill"
            style={{ transform: `scaleX(${model.holdProgress})` }}
          />
          <span className="tutorial-finger" aria-hidden="true">
            <Pointer size={30} />
            {model.step === 2 && <MoveUp size={25} />}
          </span>
          <span className="tutorial-key">{lesson.key}</span>
        </button>
        <div
          className="tutorial-callout"
          data-success={phase === "success"}
          role="status"
        >
          <strong>{callout}</strong>
          <span>
            {hint ||
              (phase === "ready"
                ? "練習中は音符が紫の帯で待ちます。"
                : phase === "success"
                  ? `${lesson.title}成功 · 本番でもこの操作で得点できます。`
                  : phase === "waiting"
                    ? "光っている場所で、ゆっくり試せます。"
                    : phase === "release"
                      ? "指を画面から離しましょう。"
                      : "音符と同じ横位置が光ります。")}
          </span>
        </div>
      </div>
      <footer className="tutorial-controls" inert={!landscape}>
        <p>
          <strong>
            {phase === "success" && model.allComplete
              ? "3つの練習をクリア"
              : `PC: ${lesson.key}${model.step === 1 ? "を長押し → 離す" : ""}`}
          </strong>
          <small>練習 · スコア・XPは保存しません</small>
        </p>
        <div>
          {phase === "success" ? (
            <>
              <button
                className="quiet"
                onClick={() => {
                  model.reset();
                  refresh();
                }}
              >
                <RotateCcw size={15} />
                もう一度
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (model.allComplete) onClose();
                  else {
                    model.next();
                    refresh();
                  }
                }}
              >
                {model.allComplete ? "練習を終える" : "次の操作へ"}
                <ArrowRight size={16} />
              </button>
            </>
          ) : phase === "ready" ? (
            <button className="primary" onClick={start}>
              <Play size={16} />
              {hint ? "もう一度試す" : "練習を始める"}
            </button>
          ) : (
            <button
              className="quiet"
              onClick={() => {
                model.reset();
                refresh();
              }}
            >
              <RotateCcw size={15} />
              やり直す
            </button>
          )}
        </div>
      </footer>
      {!landscape && (
        <div className="tutorial-rotate">
          <Smartphone size={42} />
          <h3>スマホを横向きに</h3>
          <p>光る場所と音符を一緒に見ながら練習できます。</p>
          <button className="quiet" onClick={onClose}>
            いまは戻る
          </button>
        </div>
      )}
    </section>
  );
}
