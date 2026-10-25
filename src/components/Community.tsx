import { COMMUNITY_ID } from "../lib/community.ts";
import { useEffect, useState } from "react";
import { Check, Copy, Plus, Trophy, Users } from "lucide-react";
import { api } from "../lib/api.ts";
import {
  DIFFICULTIES,
  type Difficulty,
  type Group,
  type RankingRow,
  type Song,
} from "../types.ts";
export function Community({
  groups,
  selected,
  onSelect,
  onReload,
  notify,
  songs,
  revision,
  status,
  initialCode,
  onLogin,
}: {
  groups: Group[];
  selected: string;
  onSelect: (s: string) => void;
  onReload: () => Promise<void>;
  notify: (s: string) => void;
  songs: Song[];
  revision: number;
  status: string;
  initialCode: string;
  onLogin?: () => void;
}) {
  const [scope, setScope] = useState("overall"),
    [difficulty, setDifficulty] = useState<Difficulty>("normal"),
    [rows, setRows] = useState<RankingRow[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [manage, setManage] = useState(!groups.length),
    [name, setName] = useState("OFFSCREEN"),
    [alias, setAlias] = useState("Player"),
    [code, setCode] = useState(initialCode),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState("");
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoading(true);
    api<{ rows: RankingRow[] }>(
      `/me/groups/${selected}/rankings` +
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
  }, [selected, scope, difficulty, revision]);
  async function act(join = false) {
    setBusy(true);
    try {
      const r = await api<{ group?: Group; id?: string }>(
        join ? "/me/groups/join" : "/me/groups",
        join
          ? {
              code: code.includes("invite=")
                ? new URL(code).searchParams.get("invite")
                : code,
              displayName: alias,
            }
          : { name, displayName: alias },
      );
      await onReload();
      onSelect(r.group?.id || r.id || "");
      setManage(false);
      notify(join ? "グループに参加しました" : "グループを作成しました");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      const { code } = await api<{ code: string }>(
          `/me/groups/${selected}/invite`,
        ),
        url = location.origin + "/?invite=" + code;
      setInvite(url);
      await navigator.clipboard.writeText(url);
      notify("招待リンクをコピーしました");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <section className="community-section">
      <div className="section-top">
        <h1>ランキング</h1>
        {selected && (
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
        )}
      </div>
      {onLogin ? (
        <div className="empty glass">
          <Users />
          <h2>みんなの曲で遊ぶ</h2>
          <p>
            Googleでログインすると全員の公開曲を遊べて、曲別・総合順位がリアルタイムに更新されます。
          </p>
          <button className="primary" onClick={onLogin}>
            Googleでログイン
          </button>
        </div>
      ) : (
        <>
          <div className="group-selector">
            <label>
              グループ
              <select
                aria-label="ランキングのグループ"
                value={selected}
                onChange={(e) => onSelect(e.target.value)}
              >
                <option value="">選択してください</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.members}人
                  </option>
                ))}
              </select>
            </label>
            <button className="quiet" onClick={() => setManage(!manage)}>
              <Plus size={16} />
              参加・作成
            </button>
          </div>
          {manage && (
            <div className="group-manage glass">
              <h2>グループに参加・作成</h2>
              <label>
                グループ内の表示名
                <input
                  maxLength={30}
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                />
              </label>
              <div className="form-row">
                <label>
                  招待リンク / コード
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="招待コードを貼り付け"
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || !code || !alias}
                  onClick={() => act(true)}
                >
                  参加
                </button>
              </div>
              <div className="form-divider">新しく作る</div>
              <div className="form-row">
                <label>
                  グループ名
                  <input
                    maxLength={40}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button
                  className="quiet"
                  disabled={busy || !name || !alias}
                  onClick={() => act()}
                >
                  作成
                </button>
              </div>
              <small>
                表示名・スコア・レベルを参加者に公開します。Googleのメールアドレスは共有されません。
              </small>
            </div>
          )}
          {selected === COMMUNITY_ID && (
            <p className="community-banner">
              Googleログインした全ユーザーの公開曲・ランキング
            </p>
          )}
          {selected && (
            <>
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
                {selected !== COMMUNITY_ID && (
                  <button className="quiet" onClick={copy}>
                    <Copy size={15} />
                    招待
                  </button>
                )}
              </div>
              {invite && (
                <label className="invite-field">
                  招待リンク
                  <input
                    readOnly
                    value={invite}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
              )}
              {scope !== "overall" && (
                <div className="ranking-filters">
                  <select
                    aria-label="ランキングの曲"
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                  >
                    {songs.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="ランキングの難易度"
                    value={difficulty}
                    onChange={(e) =>
                      setDifficulty(e.target.value as Difficulty)
                    }
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
                  ? "各曲・各難易度の自己ベストを難易度の重み付きで合計。"
                  : "通常速度・標準譜面の自己ベスト。"}{" "}
                プレイ完了時に自動更新。
              </p>
              {error ? (
                <div className="notice" role="alert">
                  {error}
                  <button onClick={() => onReload()}>再読み込み</button>
                </div>
              ) : loading && !rows.length ? (
                <div
                  className="mini-skeleton"
                  aria-label="ランキングを読み込み中"
                />
              ) : rows.length ? (
                <ol className="ranking-list">
                  {rows.map((row) => (
                    <li
                      key={row.memberId}
                      className={"glass " + (row.me ? "is-me" : "")}
                    >
                      <span className="rank-number">
                        {row.rank <= 3 ? <Trophy size={21} /> : row.rank}
                      </span>
                      <div className="rank-person">
                        <strong>
                          {row.name}
                          {row.me && <small> YOU</small>}
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
                  <p>この曲の記録はまだありません。最初のスコアを刻もう。</p>
                </div>
              )}
            </>
          )}
          {!selected && !manage && (
            <button className="primary" onClick={() => setManage(true)}>
              参加・作成
            </button>
          )}
        </>
      )}
    </section>
  );
}
