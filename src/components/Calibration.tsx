import { useEffect, useRef, useState } from "react";
import {
  audioContext,
  chime,
  eventTime,
  renderedContextTime,
  unlockAudio,
  outputLatency,
} from "../lib/audio.ts";
function median(a: number[]) {
  const s = [...a].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] || 0;
}
export function Calibration({ onSave }: { onSave: (offset: number) => void }) {
  const [running, setRunning] = useState(false),
    [count, setCount] = useState(0),
    [result, setResult] = useState<{ offset: number; spread: number } | null>(
      null,
    );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pulse = useRef<HTMLDivElement>(null),
    beats = useRef<number[]>([]),
    taps = useRef<number[]>([]),
    last = useRef(-1);
  const oscillators = useRef<OscillatorNode[]>([]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      for (const o of oscillators.current) {
        try {
          o.stop();
          o.disconnect();
        } catch {}
      }
    },
    [],
  );
  async function start() {
    await unlockAudio();
    setResult(null);
    setCount(0);
    taps.current = [];
    last.current = -1;
    const c = audioContext(),
      start = c.currentTime + 0.9;
    beats.current = Array.from({ length: 12 }, (_, i) => start + i * 0.6);
    for (const t of beats.current) {
      const o = c.createOscillator(),
        g = c.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.06);
      oscillators.current.push(o);
    }
    setRunning(true);
    function tick() {
      if (!pulse.current) return;
      const audible = renderedContextTime(),
        near = beats.current.reduce(
          (a, b) => (Math.abs(b - audible) < Math.abs(a - audible) ? b : a),
          beats.current[0],
        );
      pulse.current.style.setProperty(
        "--pulse",
        String(Math.max(0, 1 - Math.abs(audible - near) / 0.18)),
      );
      if (audible < beats.current[11] + 0.5)
        timer.current = setTimeout(tick, 16);
      else {
        setRunning(false);
        const good = taps.current.slice(2);
        if (good.length < 6) {
          setResult({ offset: NaN, spread: 0 });
          return;
        }
        const middle = median(good),
          mad = median(good.map((x) => Math.abs(x - middle))),
          filtered = good.filter(
            (x) => Math.abs(x - middle) <= Math.max(25, mad * 2.5),
          );
        setResult({
          offset: Math.round(Math.max(-250, Math.min(250, median(filtered)))),
          spread: Math.round(mad),
        });
      }
    }
    tick();
  }
  function tap(stamp: number) {
    if (!running) return;
    const t = renderedContextTime(eventTime(stamp));
    let idx = -1,
      d = 0.29;
    beats.current.forEach((b, i) => {
      if (Math.abs(t - b) < d) {
        idx = i;
        d = Math.abs(t - b);
      }
    });
    if (idx < 0 || idx === last.current) return;
    last.current = idx;
    taps.current.push((t - beats.current[idx]) * 1000);
    setCount(taps.current.length);
  }
  return (
    <div className="calibrator">
      <p>
        本体スピーカーで、音が鳴る瞬間に12回タップしてください。最初の2回は慣らしとして除外します。
      </p>
      <div ref={pulse} className="calibration-light" aria-hidden="true" />
      <button
        className="calibration-pad"
        disabled={!running}
        onPointerDown={(e) => {
          e.preventDefault();
          tap(e.timeStamp);
        }}
        onKeyDown={(e) => {
          if (e.code === "Space") {
            e.preventDefault();
            tap(e.timeStamp);
          }
        }}
      >
        {running ? `${count} / 12` : "TAP"}
      </button>
      {!running && (
        <button className="primary wide" onClick={start}>
          音でタイミングを測る
        </button>
      )}
      {result &&
        (Number.isFinite(result.offset) ? (
          <div className="notice">
            <strong>
              補正値 {result.offset > 0 ? "+" : ""}
              {result.offset} ms
            </strong>
            <p>
              ばらつき {result.spread} ms
              {result.spread > 40 ? " · もう一度測ると安定します" : ""}
            </p>
            <button
              className="primary"
              onClick={() => {
                chime([72, 76], 0.07);
                onSave(result.offset);
              }}
            >
              この値を保存
            </button>
          </div>
        ) : (
          <p role="alert">有効なタップが足りません。もう一度測ってください。</p>
        ))}
      <small>
        音声出力の推定遅延 {Math.round(outputLatency() * 1000)}{" "}
        ms。端末・ブラウザによって推定精度は異なります。補正は判定に適用され、音符の位置は変わりません。
      </small>
    </div>
  );
}
