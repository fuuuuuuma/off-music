import { useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Music2,
  Play,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import type { Song } from "../types.ts";
export type SongAction = "public" | "private" | "delete" | "restore";
const label = (s: Song) =>
  !s.groupId
    ? "この端末だけ"
    : s.visibility === "deleted"
      ? "削除済み"
      : s.visibility === "private"
        ? "非公開 · 自分だけ"
        : s.visibility === "group"
          ? "以前の限定共有"
          : "公開 · 全員が利用可能";
export function OwnedSongs({
  songs,
  onManage,
}: {
  songs: Song[];
  onManage: (s: Song) => void;
}) {
  const active = songs.filter((s) => s.visibility !== "deleted"),
    deleted = songs.filter((s) => s.visibility === "deleted");
  const row = (s: Song) => (
    <button className="owned-song glass" key={s.id} onClick={() => onManage(s)}>
      <Music2 size={22} />
      <span>
        <strong>{s.title}</strong>
        <small>{label(s)}</small>
      </span>
      <Settings2 size={17} />
    </button>
  );
  return (
    <div className="owned-songs">
      <p>自分が追加した曲の公開範囲と削除を管理できます。</p>
      {active.length ? (
        active.map(row)
      ) : (
        <div className="empty glass">
          <Music2 />
          <p>追加した曲はありません。</p>
        </div>
      )}
      {deleted.length > 0 && (
        <details className="deleted-songs">
          <summary>最近削除した曲 · {deleted.length}</summary>
          {deleted.map(row)}
        </details>
      )}
    </div>
  );
}
export function SongManager({
  song,
  busy,
  loggedIn,
  onAction,
  onPlay,
  onBack,
  onLogin,
}: {
  song: Song;
  busy: boolean;
  loggedIn: boolean;
  onAction: (s: Song, a: SongAction, rights?: boolean) => void;
  onPlay: (s: Song) => void;
  onBack: () => void;
  onLogin: () => void;
}) {
  const [rights, setRights] = useState(false);
  return (
    <div className="song-manager">
      <button className="quiet" onClick={onBack}>
        <ArrowLeft size={16} />
        自分の曲に戻る
      </button>
      <div className="managed-title">
        <Music2 size={30} />
        <div>
          <h3>{song.title}</h3>
          <small>{label(song)}</small>
        </div>
      </div>
      {song.visibility === "deleted" ? (
        <>
          <p>
            削除した曲は一覧と再生から外れています。復元すると、まず非公開に戻ります。
          </p>
          <button
            className="primary wide"
            disabled={busy}
            onClick={() => onAction(song, "restore")}
          >
            <RotateCcw size={17} />
            非公開として復元
          </button>
        </>
      ) : (
        <>
          <button
            className="primary wide"
            disabled={busy}
            onClick={() => onPlay(song)}
          >
            <Play size={17} />
            この曲で遊ぶ
          </button>
          {song.groupId && song.visibility !== "private" && (
            <button
              className="quiet wide"
              disabled={busy}
              onClick={() => onAction(song, "private")}
            >
              <EyeOff size={17} />
              非公開にする
            </button>
          )}
          {(!song.groupId || song.visibility !== "public") && (
            <div className="notice publish-controls">
              <strong>サイト利用者全員へ公開</strong>
              <p>
                グループへの参加やログインなしで、この曲を遊べるようになります。
              </p>
              {loggedIn ? (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={rights}
                      onChange={(e) => setRights(e.target.checked)}
                    />
                    この音源をサイト利用者全員に配信・再配布できる権利があります
                  </label>
                  <button
                    className="quiet wide"
                    disabled={busy || !rights}
                    onClick={() => onAction(song, "public", rights)}
                  >
                    <Eye size={17} />
                    全員に公開する
                  </button>
                  {!song.groupId && (
                    <button
                      className="quiet wide"
                      disabled={busy}
                      onClick={() => onAction(song, "private")}
                    >
                      <EyeOff size={17} />
                      非公開でクラウドに保存
                    </button>
                  )}
                </>
              ) : (
                <button className="quiet wide" onClick={onLogin}>
                  Googleログインして公開・保存
                </button>
              )}
            </div>
          )}
          {song.visibility === "private" && (
            <p className="notice">
              非公開の曲は、ログインした本人だけが再生できます。公開ランキングには反映しません。
            </p>
          )}
          <div className="delete-controls">
            <p>
              削除すると一覧と再生から外れます。クラウドの曲は「最近削除した曲」から非公開で復元できます。
            </p>
            <button
              className="quiet wide danger"
              disabled={busy}
              onClick={() => onAction(song, "delete")}
            >
              <Trash2 size={17} />
              曲を削除
            </button>
          </div>
        </>
      )}
    </div>
  );
}
