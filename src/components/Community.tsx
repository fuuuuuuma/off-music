import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { api } from "../lib/api.ts";
import {
  DIFFICULTIES,
  type Difficulty,
  type RankingRow,
  type Song,
} from "../types.ts";

export function Community({
  songs,
  revision,
  status,
  onLogin,
  myMemberId,
}: {
  songs: Song[];
  revision: number;
  status: string;
  onLogin?: () => void;
  myMemberId?: string;
}) {
  const [scope, setScope] = useState("overall"),
    [difficulty, setDifficulty] = useState<Difficulty>("normal"),
    [rows, setRows] = useState<RankingRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setRows([]);
    api<{ rows: RankingRow[] }>(
      "/catalog/rankings" +
        (scope === "overall"
          ? ""
          : `?song=${encodeURIComponent(scope)}&difficulty=${difficulty}`),
    )
      .then((r) => {
        if (active) {
          setRows(r.rows);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, difficulty, revision, retry]);
  useEffect(() => {
    if (scope !== "overall" && !songs.some((s) => s.id === scope))
      setScope("overall");
  }, [songs, scope]);
  return (
    <section className="community-section">
      <div className="section-top">
        <h1>ランキング</h1>
        <span
          className={"live-state " + (status === "live" ? "connected" : "")}
        >
          <i />
          {status === "live"
            ? "LIVE"
            : status === "connecting"
              ? "接続中"
              : "再接続中"}
        </span>
      </div>
      {onLogin && (
        <div className="community-banner">
          公開曲はログインなしでも遊べます。記録を順位・レベルに残すには
          <button className="quiet" onClick={onLogin}>
            Googleでログイン
          </button>
        </div>
      )}
      <div className="ranking-toolbar">
        <div className="segmented">
          <button
            className={scope === "overall" ? "active" : ""}
            onClick={() => setScope("overall")}
          >
            ユーザー総合
          </button>
          <button
            className={scope !== "overall" ? "active" : ""}
            onClick={() => setScope(songs[0]?.id || "play-pay")}
          >
            曲別
          </button>
        </div>
      </div>
      {scope !== "overall" && (
        <div className="ranking-filters">
          <select
            aria-label="ランキングの曲"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <select
            aria-label="ランキングの難易度"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="ranking-rule">
        {scope === "overall"
          ? "各公開曲・各難易度の自己ベストを難易度の重み付きで合計。"
          : "通常速度・標準譜面の自己ベスト。"}{" "}
        プレイ完了時に自動更新。
      </p>
      {error ? (
        <div className="notice" role="alert">
          {error}
          <button className="quiet" onClick={() => setRetry((v) => v + 1)}>
            再読み込み
          </button>
        </div>
      ) : loading ? (
        <div className="mini-skeleton" aria-label="ランキングを読み込み中" />
      ) : rows.length ? (
        <ol className="ranking-list">
          {rows.map((row) => (
            <li
              key={row.memberId}
              className={
                "glass " + (row.memberId === myMemberId ? "is-me" : "")
              }
            >
              <span className="rank-number">
                {row.rank <= 3 ? <Trophy size={21} /> : row.rank}
              </span>
              <div className="rank-person">
                <strong>
                  {row.name}
                  {row.memberId === myMemberId && <small> YOU</small>}
                </strong>
                <span>
                  Lv.{row.level} · {row.maxCombo} COMBO
                </span>
              </div>
              <strong className="rank-score">
                {row.score.toLocaleString()}
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty glass">
          <Trophy />
          <p>まだ記録がありません。</p>
        </div>
      )}
    </section>
  );
}
