import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Cloud,
  Disc3,
  Download,
  FileAudio,
  Headphones,
  Info,
  Library,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Music2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  X,
} from "lucide-react";
import { Sheet } from "./components/Sheet.tsx";
import { Game } from "./components/Game.tsx";
import {
  analyzeAudio,
  decodeAudio,
  playHit,
  unlockAudio,
} from "./lib/audio.ts";
import { createChart } from "./lib/chart.ts";
import { store } from "./lib/storage.ts";
import { api, setApiUser } from "./lib/api.ts";
import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  type Analysis,
  type Arrangement,
  type Difficulty,
  type Result,
  type Settings,
  type Song,
  type User,
} from "./types.ts";
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (
            element: HTMLElement,
            options: Record<string, unknown>,
          ) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}
type Toast = { text: string; action?: () => void; actionLabel?: string };
const formatTime = (time: number) =>
  `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;
const rank = (accuracy: number) =>
  accuracy >= 98
    ? "S+"
    : accuracy >= 93
      ? "S"
      : accuracy >= 83
        ? "A"
        : accuracy >= 68
          ? "B"
          : accuracy >= 45
            ? "C"
            : "D";
function Logo({ large = false }: { large?: boolean }) {
  return (
    <span className={"wordmark " + (large ? "wordmark-large" : "")}>
      <span>OFF</span>
      <span className="logo-symbol">
        <i />
        <b />
      </span>
      <span>MUSIC</span>
    </span>
  );
}
function Sculpture({ small = false }: { small?: boolean }) {
  return (
    <div className={"sculpture " + (small ? "small" : "")} aria-hidden="true">
      <div className="sculpture-shadow" />
      <div className="orbit orbit-back" />
      <div className="glass-disc">
        <div className="disc-inset" />
        <div className="disc-shine" />
      </div>
      <div className="violet-orb" />
      <div className="orbit orbit-front" />
      <div className="glass-pearl" />
      <div className="spark spark-one">✦</div>
      <div className="spark spark-two">✧</div>
    </div>
  );
}
function Waveform({
  waveform,
  light = false,
}: {
  waveform: number[];
  light?: boolean;
}) {
  return (
    <div
      className={"waveform " + (light ? "wave-light" : "")}
      aria-hidden="true"
    >
      {waveform
        .filter((_, i) => i % 2 === 0)
        .map((h, i) => (
          <i key={i} style={{ height: Math.max(8, h * 100) + "%" }} />
        ))}
    </div>
  );
}
function Skeleton() {
  return (
    <div className="skeleton-screen" role="status" aria-label="読み込み中">
      <header>
        <div className="sk sk-logo" />
        <div className="sk sk-circle" />
      </header>
      <main>
        <div className="sk sk-title" />
        <div className="sk sk-hero" />
        <div className="sk sk-search" />
        {[0, 1, 2].map((i) => (
          <div className="sk sk-row" key={i} />
        ))}
      </main>
      <span className="sr-only">ライブラリを読み込んでいます</span>
    </div>
  );
}
function SongRow({
  song,
  best,
  onSelect,
  onDelete,
}: {
  song: Song;
  best?: Result;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [revealed, setRevealed] = useState(false),
    start = useRef<{ x: number; y: number } | null>(null),
    moved = useRef(false);
  return (
    <div className="song-swipe">
      {!song.builtin && (
        <button
          className="swipe-delete"
          aria-hidden={!revealed}
          tabIndex={revealed ? 0 : -1}
          onClick={onDelete}
          aria-label={song.title + "を削除"}
        >
          <Trash2 size={20} />
          <span>削除</span>
        </button>
      )}
      <motion.div
        className="song-row glass"
        animate={{ x: revealed ? -78 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") {
            start.current = { x: e.clientX, y: e.clientY };
            moved.current = false;
          }
        }}
        onPointerMove={(e) => {
          if (
            e.pointerType === "mouse" &&
            start.current &&
            !song.builtin &&
            Math.abs(e.clientX - start.current.x) > 12
          ) {
            moved.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse" || !start.current) return;
          const dx = e.clientX - start.current.x,
            dy = e.clientY - start.current.y;
          if (
            !song.builtin &&
            Math.abs(dx) > 35 &&
            Math.abs(dx) > Math.abs(dy)
          ) {
            moved.current = true;
            setRevealed(dx < 0);
          }
          start.current = null;
        }}
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          moved.current = false;
        }}
        onTouchEnd={(e) => {
          if (!start.current || song.builtin) return;
          const dx = e.changedTouches[0].clientX - start.current.x,
            dy = e.changedTouches[0].clientY - start.current.y;
          if (Math.abs(dx) > 35 && Math.abs(dx) > Math.abs(dy)) {
            moved.current = true;
            setRevealed(dx < 0);
          }
          start.current = null;
        }}
      >
        <button
          className="song-main"
          onClick={() => {
            if (moved.current) {
              moved.current = false;
              return;
            }
            onSelect();
          }}
        >
          <div className={"track-art " + (song.builtin ? "featured-art" : "")}>
            <Disc3 size={29} strokeWidth={1.4} />
          </div>
          <div className="song-meta">
            <strong>{song.title}</strong>
            <span>
              {song.artist} <i>·</i> {formatTime(song.duration)}
            </span>
          </div>
          <span className="song-bpm">
            {song.bpm}
            <small>BPM</small>
          </span>
          {best && <span className="mini-rank">{rank(best.accuracy)}</span>}
          <ChevronRight size={18} />
        </button>
        {!song.builtin && (
          <button
            className="song-more"
            aria-label={song.title + "の操作"}
            onClick={() => setRevealed(!revealed)}
          >
            <MoreHorizontal size={19} />
          </button>
        )}
      </motion.div>
    </div>
  );
}
export default function App() {
  const [songs, setSongs] = useState<Song[]>([]),
    [results, setResults] = useState<Result[]>([]),
    [cloudResults, setCloudResults] = useState<Result[]>([]),
    [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS),
    [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true),
    [intro, setIntro] = useState(true),
    [bootError, setBootError] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState<Toast | null>(null),
    [busy, setBusy] = useState("");
  const [page, setPage] = useState<"library" | "records">("library"),
    [sheet, setSheet] = useState<
      "upload" | "settings" | "account" | "about" | null
    >(null),
    [selected, setSelected] = useState<string | null>(null),
    [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [search, setSearch] = useState(""),
    [searchFocus, setSearchFocus] = useState(false),
    [suggestionIndex, setSuggestionIndex] = useState(-1),
    [filter, setFilter] = useState("all");
  const [file, setFile] = useState<File | null>(null),
    [title, setTitle] = useState(""),
    [artist, setArtist] = useState(""),
    [progress, setProgress] = useState<number | null>(null),
    [aiStyle, setAiStyle] = useState("balanced"),
    [aiBusy, setAiBusy] = useState(false),
    [bpmDraft, setBpmDraft] = useState("");
  const [game, setGame] = useState<{
      song: Song;
      buffer: AudioBuffer;
      difficulty: Difficulty;
    } | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [refreshing, setRefreshing] = useState(false),
    [pull, setPull] = useState(0),
    [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null),
    refreshLock = useRef(false),
    fileRef = useRef<HTMLInputElement>(null),
    googleRef = useRef<HTMLDivElement>(null),
    bufferCache = useRef<{ id: string; buffer: AudioBuffer } | null>(null);
  const userRef = useRef(user);
  userRef.current = user;
  setApiUser(user?.id || null);
  const notify = useCallback(
    (text: string, action?: () => void, actionLabel?: string) =>
      setToast({ text, action, actionLabel }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.action ? 6500 : 3200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 2200);
    return () => clearTimeout(t);
  }, []);
  const visibleResults = useMemo(() => {
    const map = new Map<string, Result>();
    for (const r of results)
      if (!r.ownerId || r.ownerId === user?.id) map.set(r.id, r);
    for (const r of cloudResults) map.set(r.id, r);
    return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
  }, [results, cloudResults, user]);
  const load = useCallback(async () => {
    setBootError("");
    try {
      const [meta, localSongs, localResults, prefs] = await Promise.all([
        fetch("/music/make-something.json").then((r) => {
          if (!r.ok) throw new Error();
          return r.json() as Promise<Analysis>;
        }),
        store.songs(),
        store.results(),
        store.settings(),
      ]);
      const builtin: Song = {
        id: "make-something",
        title: "MAKE SOMETHING.",
        artist: "OFFSKU",
        duration: meta.duration,
        bpm: meta.bpm,
        analysis: meta,
        source: "/music/make-something.mp3",
        builtin: true,
        addedAt: 0,
      };
      setSongs([
        localSongs.find((s) => s.id === builtin.id) || builtin,
        ...localSongs
          .filter((s) => s.id !== builtin.id)
          .sort((a, b) => b.addedAt - a.addedAt),
      ]);
      setResults(localResults);
      if (prefs) setSettings({ ...DEFAULT_SETTINGS, ...prefs });
      const config = await api<{ googleClientId: string | null }>(
        "/config",
      ).catch(() => null);
      setGoogleClientId(config?.googleClientId || null);
      const profile = await api<{ user: User }>("/me/profile").catch(
        () => null,
      );
      setCloudResults([]);
      if (profile) {
        setUser(profile.user);
        const remote = await api<{ results: Result[] }>("/me/results").catch(
          () => null,
        );
        if (remote) setCloudResults(remote.results);
      } else {
        setUser(null);
      }
      return true;
    } catch {
      setBootError(
        "ライブラリを読み込めませんでした。接続を確認して再試行してください",
      );
      return false;
    } finally {
      setBooting(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const changed = () => {
      setUser(null);
      setCloudResults([]);
      notify("ログイン状態が変わりました。もう一度ログインしてください");
    };
    window.addEventListener("off-auth-change", changed);
    return () => window.removeEventListener("off-auth-change", changed);
  }, [notify]);
  const selectedSong = songs.find((s) => s.id === selected);
  useEffect(() => {
    if (selectedSong) setBpmDraft(String(selectedSong.bpm));
    setError("");
  }, [selected]);
  const refresh = async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      const loaded = await load();
      if (!loaded)
        notify("更新できませんでした。前のライブラリを表示しています");
      else if (navigator.onLine) notify("ライブラリを更新しました");
      else notify("オフラインの記録を表示しています");
    } finally {
      setPull(0);
      setRefreshing(false);
      refreshLock.current = false;
    }
  };
  const beginTouch = (e: TouchEvent) => {
    if (
      window.scrollY === 0 &&
      !sheet &&
      !selected &&
      !game &&
      !result &&
      !(e.target as HTMLElement).closest("button,input")
    )
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const moveTouch = (e: TouchEvent) => {
    const s = touchStart.current;
    if (s && window.scrollY === 0) {
      const dy = e.touches[0].clientY - s.y,
        dx = e.touches[0].clientX - s.x;
      if (dy > 0 && dy > Math.abs(dx)) setPull(Math.min(105, dy * 0.45));
    }
  };
  const endTouch = () => {
    touchStart.current = null;
    if (pull >= 72) void refresh();
    else setPull(0);
  };
  const saveSong = async (song: Song) => {
    await store.saveSong(song);
    setSongs((old) => old.map((s) => (s.id === song.id ? song : s)));
  };
  const removeSong = async (song: Song) => {
    if (song.builtin) return;
    try {
      await store.deleteSong(song.id);
      setSongs((old) => old.filter((s) => s.id !== song.id));
      setSelected(null);
      notify(
        "曲を削除しました",
        () => {
          void store.saveSong(song).then(() => {
            setSongs((old) => [...old, song]);
            notify("元に戻しました");
          });
        },
        "元に戻す",
      );
    } catch {
      setError("削除できませんでした");
    }
  };
  const importSong = async () => {
    if (!file || !title.trim() || progress !== null) return;
    setError("");
    setProgress(0);
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error("50MB以下のファイルを選んでください");
      const buffer = await decodeAudio(file);
      if (buffer.duration > 600 || buffer.duration < 3)
        throw new Error("3秒〜10分の音源を選んでください");
      const analysis = await analyzeAudio(buffer, setProgress),
        digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        ),
        id = Array.from(new Uint8Array(digest).slice(0, 16), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
      if (songs.some((s) => s.id === id))
        throw new Error("この曲は追加済みです");
      const song: Song = {
        id,
        title: title.trim().slice(0, 140),
        artist: artist.trim().slice(0, 80) || "マイライブラリ",
        duration: buffer.duration,
        bpm: analysis.bpm,
        analysis,
        blob: file,
        addedAt: Date.now(),
      };
      await store.saveSong(song);
      setSongs((old) => [...old, song]);
      bufferCache.current = { id, buffer };
      setSheet(null);
      setFile(null);
      setTitle("");
      setArtist("");
      setSelected(id);
      notify("曲と譜面を保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込めませんでした");
    } finally {
      setProgress(null);
    }
  };
  const startGame = async (song: Song) => {
    setError("");
    setBusy("音源を読み込んでいます");
    try {
      await unlockAudio();
      let buffer =
        bufferCache.current?.id === song.id
          ? bufferCache.current.buffer
          : undefined;
      if (!buffer) {
        let blob = song.blob;
        if (!blob) {
          const r = await fetch(song.source!, {
            signal: AbortSignal.timeout(30000),
          });
          if (!r.ok) throw new Error("音源を取得できませんでした");
          blob = await r.blob();
        }
        buffer = await decodeAudio(blob);
        bufferCache.current = { id: song.id, buffer };
      }
      if (
        !createChart(song.analysis, difficulty, song.arrangement, song.bpm)
          .length
      )
        throw new Error("譜面を作れませんでした。BPMを調整してください");
      setSelected(null);
      setResult(null);
      setGame({ song, buffer, difficulty });
    } catch (e) {
      setError(e instanceof Error ? e.message : "再生できませんでした");
    } finally {
      setBusy("");
    }
  };
  const finishGame = async (raw: Result) => {
    const r = { ...raw, ownerId: userRef.current?.id };
    setGame(null);
    setResult(r);
    setResults((old) => [r, ...old]);
    try {
      await store.saveResult(r);
      notify("記録を保存しました");
    } catch {
      notify("端末の空き容量が足りず保存できませんでした");
    }
    if (userRef.current) {
      try {
        await api("/me/results", r);
        const saved = { ...r, synced: true };
        await store.saveResult(saved);
        setResults((old) => old.map((x) => (x.id === r.id ? saved : x)));
        notify("記録を同期しました");
      } catch {
        notify("端末に保存しました。同期は成績画面から再試行できます");
      }
    }
  };
  const saveSettings = async (next: Settings) => {
    setSettings(next);
    try {
      await store.saveSettings(next);
    } catch {
      setError("設定を保存できませんでした");
    }
  };
  const syncRecords = async () => {
    if (!user) {
      setSheet("account");
      return;
    }
    setBusy("記録を同期しています");
    try {
      for (const r of results
        .filter((r) => (!r.ownerId || r.ownerId === user.id) && !r.synced)
        .slice(0, 100)) {
        await api("/me/results", r);
        const next = { ...r, ownerId: user.id, synced: true };
        await store.saveResult(next);
      }
      const [remote, local] = await Promise.all([
        api<{ results: Result[] }>("/me/results"),
        store.results(),
      ]);
      setCloudResults(remote.results);
      setResults(local);
      notify("記録を同期しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "同期に失敗しました");
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    if (sheet !== "account" || user || !googleClientId) return;
    let cancelled = false;
    const setup = async () => {
      try {
        const { nonce } = await api<{ nonce: string }>("/auth/nonce");
        if (!window.google)
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector("script[data-google]");
            if (existing) {
              existing.addEventListener("load", () => resolve(), {
                once: true,
              });
              setTimeout(
                () =>
                  window.google
                    ? resolve()
                    : reject(new Error("Googleに接続できませんでした")),
                6000,
              );
              return;
            }
            const s = document.createElement("script");
            s.src = "https://accounts.google.com/gsi/client";
            s.dataset.google = "true";
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => {
              s.remove();
              reject(new Error("Googleに接続できませんでした"));
            };
            document.head.append(s);
          });
        if (cancelled || !googleRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          nonce,
          auto_select: false,
          callback: async ({ credential }: { credential: string }) => {
            try {
              const r = await api<{ user: User }>("/auth/google", {
                credential,
              });
              setUser(r.user);
              const remote = await api<{ results: Result[] }>("/me/results");
              setCloudResults(remote.results);
              setSheet(null);
              notify("ログインしました");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "ログインできませんでした",
              );
            }
          },
        });
        window.google.accounts.id.renderButton(googleRef.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "signin_with",
          locale: "ja",
          width: 280,
        });
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "ログインを準備できませんでした",
          );
      }
    };
    void setup();
    return () => {
      cancelled = true;
    };
  }, [sheet, user, googleClientId, notify]);
  const arrange = async () => {
    if (!selectedSong) return;
    if (!user) {
      setSelected(null);
      setSheet("account");
      return;
    }
    setAiBusy(true);
    setError("");
    try {
      const r = await api<{ arrangement: Arrangement }>("/me/arrange", {
        bpm: selectedSong.bpm,
        duration: selectedSong.duration,
        energy: selectedSong.analysis.energy,
        style: aiStyle,
      });
      await saveSong({ ...selectedSong, arrangement: r.arrangement });
      notify("AIアレンジを保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "AIアレンジに失敗しました");
    } finally {
      setAiBusy(false);
    }
  };
  const filtered = songs.filter(
    (s) =>
      (filter === "all" || !s.builtin) &&
      (s.title + " " + s.artist).toLowerCase().includes(search.toLowerCase()),
  );
  const suggestions = search ? filtered.slice(0, 5) : [];
  const bestFor = (songId: string) =>
    visibleResults
      .filter((r) => r.songId === songId)
      .sort((a, b) => b.score - a.score)[0];
  const featured = songs.find((s) => s.builtin),
    modal = !!sheet || !!selected;
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? "always" : "user"}>
      <div className={"app " + (settings.reducedMotion ? "reduce-motion" : "")}>
        {!game && !result && (
          <>
            <aside className="desktop-rail">
              <button
                className="rail-symbol"
                aria-label="タイトル演出"
                onClick={() => {
                  setIntro(true);
                  setTimeout(() => setIntro(false), 2200);
                }}
              >
                <AudioLines size={25} />
              </button>
              <div className="rail-nav">
                <button
                  className={page === "library" ? "active" : ""}
                  aria-label="ライブラリ"
                  onClick={() => setPage("library")}
                >
                  <Library size={22} />
                </button>
                <button
                  className={page === "records" ? "active" : ""}
                  aria-label="成績"
                  onClick={() => setPage("records")}
                >
                  <Activity size={22} />
                </button>
              </div>
              <button
                className="rail-settings"
                aria-label="設定"
                onClick={() => {
                  setError("");
                  setSheet("settings");
                }}
              >
                <SlidersHorizontal size={21} />
              </button>
            </aside>
            <div
              className="main-shell"
              inert={modal || intro || booting || !!busy}
              onTouchStart={beginTouch}
              onTouchMove={moveTouch}
              onTouchEnd={endTouch}
              onPointerDown={(e) => {
                if (
                  e.pointerType === "mouse" &&
                  window.scrollY === 0 &&
                  !modal &&
                  !game &&
                  !(e.target as HTMLElement).closest("button,input")
                )
                  touchStart.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={(e) => {
                const s = touchStart.current;
                if (e.pointerType === "mouse" && s && window.scrollY === 0) {
                  const dy = e.clientY - s.y,
                    dx = e.clientX - s.x;
                  if (dy > 0 && dy > Math.abs(dx))
                    setPull(Math.min(105, dy * 0.45));
                }
              }}
              onPointerUp={(e) => {
                if (e.pointerType === "mouse") endTouch();
              }}
            >
              <header className="topbar">
                <button
                  className="brand-button"
                  aria-label="OFF MUSIC ライブラリ"
                  onClick={() => setPage("library")}
                >
                  <Logo />
                </button>
                <span className="header-center">
                  {page === "library" ? "ライブラリ" : "成績"}
                </span>
                <div className="top-actions">
                  <span className="silent-badge">
                    <Headphones size={13} /> MUSIC OFF
                  </span>
                  <button
                    className="avatar"
                    onClick={() => {
                      setError("");
                      setSheet("account");
                    }}
                    aria-label={user ? "アカウント" : "Googleでログイン"}
                  >
                    {user ? user.name.slice(0, 1) : <span>G</span>}
                  </button>
                </div>
              </header>
              <div
                className="pull-indicator"
                style={{ height: refreshing ? 65 : pull }}
                aria-live="polite"
              >
                {(pull > 15 || refreshing) && (
                  <>
                    <RefreshCw
                      size={18}
                      className={refreshing ? "spin" : ""}
                      style={{
                        transform: !refreshing
                          ? `rotate(${pull * 3}deg)`
                          : undefined,
                      }}
                    />
                    <span>
                      {refreshing
                        ? "更新中"
                        : pull >= 72
                          ? "離して更新"
                          : "下に引いて更新"}
                    </span>
                  </>
                )}
              </div>
              <main className="content">
                {bootError && (
                  <div className="error-banner" role="alert">
                    {bootError}
                    <button onClick={() => void load()}>再試行</button>
                  </div>
                )}
                {page === "library" ? (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">YOUR SESSION</span>
                        <h1>
                          ライブラリ
                          <span>{String(songs.length).padStart(2, "0")}</span>
                        </h1>
                      </div>
                      <button
                        className="add-button"
                        onClick={() => {
                          setError("");
                          setSheet("upload");
                        }}
                      >
                        <Plus size={18} />
                        <span>曲を追加</span>
                      </button>
                    </div>
                    {featured && (
                      <motion.section
                        className="hero glass"
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.15 }}
                      >
                        <div className="hero-grid" />
                        <div className="hero-copy">
                          <span className="pill">
                            <i className="live-dot" />
                            収録曲 <span>01</span>
                          </span>
                          <h2>
                            MAKE
                            <br />
                            SOMETHING<span>.</span>
                          </h2>
                          <div className="artist-line">
                            <span className="artist-avatar">O</span>
                            <span>OFFSKU</span>
                            <i />{" "}
                            <span className="hero-meta">
                              {formatTime(featured.duration)} <b>·</b>{" "}
                              {featured.bpm} BPM
                            </span>
                          </div>
                          <div className="hero-actions">
                            <button
                              className="primary"
                              onClick={() => setSelected(featured.id)}
                            >
                              <Play size={17} fill="currentColor" />
                              プレイ
                              <ArrowRight size={16} />
                            </button>
                            <button
                              className="round-button"
                              onClick={() => setSelected(featured.id)}
                              aria-label="収録曲の詳細"
                            >
                              <MoreHorizontal size={22} />
                            </button>
                          </div>
                        </div>
                        <Sculpture />
                        <div className="hero-bottom">
                          <span>
                            <AudioLines size={14} /> ORIGINAL TRACK
                          </span>
                          <Waveform waveform={featured.analysis.waveform} />
                          <span>
                            {formatTime(Math.ceil(featured.duration))}
                          </span>
                        </div>
                        <span className="hero-index">OFF / 001</span>
                      </motion.section>
                    )}
                    <div className="library-tools">
                      <div className="filter-tabs">
                        <button
                          className={filter === "all" ? "selected" : ""}
                          onClick={() => setFilter("all")}
                        >
                          すべて <small>{songs.length}</small>
                        </button>
                        <button
                          className={filter === "local" ? "selected" : ""}
                          onClick={() => setFilter("local")}
                        >
                          追加した曲{" "}
                          <small>
                            {songs.filter((s) => !s.builtin).length}
                          </small>
                        </button>
                      </div>
                      <div className="search-wrap">
                        <Search size={17} />
                        <input
                          placeholder="曲名・アーティストを検索"
                          aria-label="曲を検索"
                          role="combobox"
                          aria-autocomplete="list"
                          aria-expanded={searchFocus && suggestions.length > 0}
                          aria-controls="song-suggestions"
                          aria-activedescendant={
                            suggestionIndex >= 0
                              ? `suggestion-${suggestionIndex}`
                              : undefined
                          }
                          value={search}
                          onFocus={() => setSearchFocus(true)}
                          onBlur={() =>
                            setTimeout(() => setSearchFocus(false), 160)
                          }
                          onChange={(e) => {
                            setSearch(e.target.value);
                            setSuggestionIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setSuggestionIndex((i) =>
                                Math.min(suggestions.length - 1, i + 1),
                              );
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setSuggestionIndex((i) => Math.max(0, i - 1));
                            }
                            if (e.key === "Escape") setSearchFocus(false);
                            if (
                              e.key === "Enter" &&
                              suggestionIndex >= 0 &&
                              suggestions[suggestionIndex]
                            ) {
                              setSelected(suggestions[suggestionIndex].id);
                              setSearchFocus(false);
                            }
                          }}
                        />
                        {search && (
                          <button
                            aria-label="検索を消す"
                            onClick={() => setSearch("")}
                          >
                            <X size={14} />
                          </button>
                        )}
                        {searchFocus && suggestions.length > 0 && (
                          <div
                            className="suggestions glass"
                            id="song-suggestions"
                            role="listbox"
                          >
                            {suggestions.map((s, i) => (
                              <button
                                key={s.id}
                                id={`suggestion-${i}`}
                                role="option"
                                aria-selected={i === suggestionIndex}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setSelected(s.id);
                                  setSearchFocus(false);
                                }}
                              >
                                <Music2 size={15} />
                                <span>
                                  {s.title}
                                  <small>{s.artist}</small>
                                </span>
                                <ArrowRight size={14} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        className="icon-button refresh-button"
                        onClick={() => void refresh()}
                        aria-label="ライブラリを更新"
                        disabled={refreshing}
                      >
                        <RefreshCw
                          size={17}
                          className={refreshing ? "spin" : ""}
                        />
                      </button>
                    </div>
                    <div className="track-list">
                      {filtered.map((s) => (
                        <SongRow
                          key={s.id}
                          song={s}
                          best={bestFor(s.id)}
                          onSelect={() => setSelected(s.id)}
                          onDelete={() => void removeSong(s)}
                        />
                      ))}
                      {!filtered.length && (
                        <div className="empty-state">
                          <Music2 size={28} />
                          <p>
                            {search
                              ? "曲が見つかりません"
                              : "追加した曲がありません"}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              if (search) {
                                setSearch("");
                                setFilter("all");
                              } else setSheet("upload");
                            }}
                          >
                            {search ? "検索をリセット" : "曲を追加する"}
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      className="upload-strip"
                      onClick={() => {
                        setError("");
                        setSheet("upload");
                      }}
                    >
                      <span className="upload-icon">
                        <Plus size={24} />
                      </span>
                      <span>
                        <strong>曲を追加</strong>
                        <small>MP3 / M4A / WAV / MP4</small>
                      </span>
                      <ArrowUpIcon />
                    </button>
                    <section className="recent-section">
                      <header>
                        <h2>最近のプレイ</h2>
                        <button
                          className="text-button"
                          onClick={() => setPage("records")}
                        >
                          すべて見る
                          <ChevronRight size={15} />
                        </button>
                      </header>
                      {visibleResults.length ? (
                        <div className="recent-grid">
                          {visibleResults.slice(0, 3).map((r) => (
                            <RecordCard key={r.id} result={r} />
                          ))}
                        </div>
                      ) : (
                        <div className="no-record">
                          <Activity size={20} />
                          <span>まだプレイ記録がありません</span>
                        </div>
                      )}
                    </section>
                  </>
                ) : (
                  <>
                    <div className="page-heading">
                      <div>
                        <span className="eyebrow">YOUR RECORDS</span>
                        <h1>
                          成績
                          <span>
                            {String(visibleResults.length).padStart(2, "0")}
                          </span>
                        </h1>
                      </div>
                      <button
                        className="add-button"
                        onClick={() => void syncRecords()}
                      >
                        <Cloud size={17} />
                        <span>同期</span>
                      </button>
                    </div>
                    <div className="summary-grid">
                      {[
                        ["プレイ回数", visibleResults.length],
                        [
                          "ベスト精度",
                          visibleResults.length
                            ? Math.max(
                                ...visibleResults.map((r) => r.accuracy),
                              ).toFixed(1) + "%"
                            : "—",
                        ],
                        [
                          "最大コンボ",
                          visibleResults.length
                            ? Math.max(...visibleResults.map((r) => r.maxCombo))
                            : "—",
                        ],
                      ].map(([label, value]) => (
                        <div className="summary-card glass" key={label}>
                          <span>{label}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                    {error && (
                      <div className="error-banner" role="alert">
                        {error}
                      </div>
                    )}
                    <div className="record-list">
                      {visibleResults.map((r) => (
                        <RecordCard key={r.id} result={r} />
                      ))}
                      {!visibleResults.length && (
                        <div className="empty-state">
                          <Trophy size={30} />
                          <p>まだプレイ記録がありません</p>
                          <button
                            className="primary"
                            onClick={() => setPage("library")}
                          >
                            ライブラリへ
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
                <footer className="footer">
                  <Logo />
                  <button onClick={() => setSheet("about")}>
                    アプリについて
                    <Info size={13} />
                  </button>
                  <span>© 2026 OFF MUSIC</span>
                </footer>
              </main>
              <nav
                className="mobile-nav glass"
                aria-label="メインナビゲーション"
              >
                <button
                  className={page === "library" ? "active" : ""}
                  onClick={() => setPage("library")}
                >
                  <Library size={21} />
                  <span>ライブラリ</span>
                </button>
                <button
                  className="mobile-add"
                  aria-label="曲を追加"
                  onClick={() => {
                    setError("");
                    setSheet("upload");
                  }}
                >
                  <Plus size={24} />
                </button>
                <button
                  className={page === "records" ? "active" : ""}
                  onClick={() => setPage("records")}
                >
                  <Activity size={21} />
                  <span>成績</span>
                </button>
                <button
                  onClick={() => {
                    setError("");
                    setSheet("settings");
                  }}
                >
                  <SlidersHorizontal size={21} />
                  <span>設定</span>
                </button>
              </nav>
            </div>
          </>
        )}
        {game && (
          <Game
            {...game}
            settings={settings}
            onExit={() => setGame(null)}
            onFinish={(r) => void finishGame(r)}
          />
        )}
        {result && !game && (
          <div className="result-screen">
            <header>
              <button
                className="icon-button"
                aria-label="ライブラリに戻る"
                onClick={() => setResult(null)}
              >
                <ArrowLeft size={21} />
              </button>
              <Logo />
              <button
                className="icon-button"
                aria-label="記録を出力"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([JSON.stringify(result, null, 2)], {
                      type: "application/json",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "off-music-result.json";
                  a.click();
                  URL.revokeObjectURL(url);
                  notify("記録を書き出しました");
                }}
              >
                <Download size={20} />
              </button>
            </header>
            <motion.div
              className="result-content"
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="eyebrow">SESSION COMPLETE</span>
              <div className="result-rank">
                {rank(result.accuracy)}
                <span>✦</span>
              </div>
              <h1>{result.title}</h1>
              <p>
                {DIFFICULTIES.find((d) => d.id === result.difficulty)?.label} ·{" "}
                {result.speed}×
              </p>
              <div className="result-score glass">
                <span>SCORE</span>
                <strong>{result.score.toLocaleString()}</strong>
                <div>
                  <span>
                    精度 <b>{result.accuracy.toFixed(2)}%</b>
                  </span>
                  <i />
                  <span>
                    最大コンボ <b>{result.maxCombo}</b>
                  </span>
                </div>
              </div>
              <div className="judgement-grid">
                {(["perfect", "great", "good", "miss"] as const).map((g) => (
                  <div key={g}>
                    <span>{g.toUpperCase()}</span>
                    <strong>{result[g]}</strong>
                  </div>
                ))}
              </div>
              {result.miss === 0 && (
                <div className="full-combo">
                  <Sparkles size={18} /> FULL COMBO
                </div>
              )}
              <button
                className="primary"
                onClick={() => {
                  const s = songs.find((s) => s.id === result.songId);
                  if (s) void startGame(s);
                  else {
                    setResult(null);
                    notify("音源をもう一度追加してください");
                  }
                }}
              >
                <RefreshCw size={17} />
                もう一度プレイ
              </button>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <button className="secondary" onClick={() => setResult(null)}>
                ライブラリに戻る
                <ArrowRight size={17} />
              </button>
            </motion.div>
          </div>
        )}
        <AnimatePresence>
          {selectedSong && !game && (
            <Sheet
              key="song-detail"
              title="プレイ設定"
              onClose={() => {
                if (!aiBusy && !busy) setSelected(null);
              }}
            >
              <div className="detail-track">
                <div className="track-art featured-art">
                  <Disc3 size={34} />
                </div>
                <div>
                  <h3>{selectedSong.title}</h3>
                  <p>{selectedSong.artist}</p>
                  <span>
                    {formatTime(selectedSong.duration)} <b>·</b>{" "}
                    {selectedSong.bpm} BPM {selectedSong.arrangement && " · AI"}
                  </span>
                </div>
              </div>
              <Waveform waveform={selectedSong.analysis.waveform} />
              <div className="section-label">
                <span>難易度</span>
                <small>
                  {
                    createChart(
                      selectedSong.analysis,
                      difficulty,
                      selectedSong.arrangement,
                      selectedSong.bpm,
                    ).length
                  }{" "}
                  NOTES
                </small>
              </div>
              <div className="difficulty-grid">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.id}
                    className={difficulty === d.id ? "chosen" : ""}
                    onClick={() => setDifficulty(d.id)}
                  >
                    <strong>
                      {d.level}
                      <small> / 10</small>
                    </strong>
                    <span>{d.label}</span>
                    <div className="difficulty-dots">
                      {Array.from({ length: 10 }, (_, i) => (
                        <i className={i < d.level ? "lit" : ""} key={i} />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
              <button
                className="primary play-main"
                disabled={!!busy || aiBusy}
                onClick={() => void startGame(selectedSong)}
              >
                <Play size={19} fill="currentColor" />
                プレイする
                <ArrowRight size={19} />
              </button>
              <details className="arrange-details">
                <summary>
                  <SlidersHorizontal size={16} />
                  譜面を調整
                  <ChevronDown size={15} />
                </summary>
                <div className="bpm-control">
                  <label htmlFor="bpm">BPM</label>
                  <input
                    id="bpm"
                    type="number"
                    min="40"
                    max="240"
                    step="0.1"
                    value={bpmDraft}
                    onChange={(e) => setBpmDraft(e.target.value)}
                  />
                  <button
                    className="small-button"
                    onClick={() => {
                      const bpm = Number(bpmDraft);
                      if (bpm >= 40 && bpm <= 240) {
                        void saveSong({ ...selectedSong, bpm })
                          .then(() => notify("BPMを保存しました"))
                          .catch(() => setError("保存できませんでした"));
                      } else setError("BPMは40〜240にしてください");
                    }}
                  >
                    保存
                  </button>
                </div>
                <p className="hint">
                  自動解析したテンポは曲によってずれる場合があります。
                </p>
                <div className="ai-controls">
                  <label htmlFor="ai-style">
                    <Sparkles size={16} />
                    AIアレンジ
                  </label>
                  <select
                    id="ai-style"
                    value={aiStyle}
                    onChange={(e) => setAiStyle(e.target.value)}
                  >
                    <option value="balanced">バランス</option>
                    <option value="flow">ゆったり</option>
                    <option value="challenge">チャレンジ</option>
                  </select>
                  <button
                    className="small-button"
                    disabled={aiBusy}
                    onClick={() => void arrange()}
                  >
                    {aiBusy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    生成
                  </button>
                </div>
                <p className="hint">
                  Workers
                  AIにBPMと16区間の音の強さを送ります。音源は送信しません。Googleログイン後、1日5回まで。
                </p>
                {selectedSong.arrangement && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void saveSong({
                        ...selectedSong,
                        arrangement: undefined,
                      }).then(() => notify("元の譜面に戻しました"))
                    }
                  >
                    元の譜面に戻す
                  </button>
                )}
              </details>
              <div className="detail-tip">
                <span className="orange">●</span>低音{" "}
                <span className="purple">◆</span>高音{" "}
                <span>PC：F / J・D / K</span>
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {!selectedSong.builtin && (
                <button
                  className="delete-text"
                  onClick={() => void removeSong(selectedSong)}
                >
                  <Trash2 size={14} />
                  この曲を削除
                </button>
              )}
            </Sheet>
          )}
          {sheet === "upload" && (
            <Sheet
              key="upload"
              title="曲を追加"
              onClose={() => {
                if (progress === null) setSheet(null);
              }}
            >
              <div className="file-drop">
                <input
                  type="file"
                  accept="audio/*,video/mp4,video/quicktime,.m4a,.mp3,.wav,.ogg,.mp4,.mov"
                  ref={fileRef}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setFile(f);
                      setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 140));
                      setError("");
                    }
                  }}
                  aria-label="音楽ファイル"
                />
                <button
                  disabled={progress !== null}
                  onClick={() => fileRef.current?.click()}
                >
                  <span>
                    <Upload size={26} />
                  </span>
                  <strong>{file ? file.name : "ファイルを選択"}</strong>
                  <small>
                    {file
                      ? (file.size / 1024 / 1024).toFixed(1) + " MB"
                      : "MP3・M4A・WAV・MP4 / 最大50MB・10分"}
                  </small>
                </button>
              </div>
              <label className="field-label">
                曲名
                <input
                  value={title}
                  maxLength={140}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="曲名を入力"
                  disabled={progress !== null}
                />
              </label>
              <label className="field-label">
                アーティスト <span>任意</span>
                <input
                  value={artist}
                  maxLength={80}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="アーティスト名"
                  disabled={progress !== null}
                />
              </label>
              <div className="privacy-line">
                <ShieldCheck size={16} />
                <p>音源と譜面は、この端末のブラウザに保存されます。</p>
              </div>
              {progress !== null && (
                <div className="analysis-progress" role="status">
                  <div>
                    <AudioLines size={16} className="spin-slow" />
                    <span>
                      {progress === 0 ? "音源を読み込み中" : "譜面を生成中"}
                    </span>
                    <strong>{Math.round(progress * 100)}%</strong>
                  </div>
                  <i style={{ width: progress * 100 + "%" }} />
                </div>
              )}
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <button
                className="primary"
                disabled={!file || !title.trim() || progress !== null}
                onClick={() => void importSong()}
              >
                {progress !== null ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Plus size={19} />
                )}
                取り込む
              </button>
            </Sheet>
          )}
          {sheet === "settings" && (
            <Sheet key="settings" title="設定" onClose={() => setSheet(null)}>
              <div className="settings-section">
                <h3>
                  <Headphones size={17} />
                  サウンド
                </h3>
                {(
                  [
                    ["music", "曲の音量"],
                    ["effects", "打音の音量"],
                  ] as const
                ).map(([key, label]) => (
                  <label className="range-field" key={key}>
                    <span>
                      {label}
                      <strong>{Math.round(settings[key] * 100)}%</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings[key]}
                      onChange={(e) =>
                        void saveSettings({
                          ...settings,
                          [key]: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  className="text-button"
                  onClick={() =>
                    void unlockAudio().then(() =>
                      playHit("pulse", settings.effects),
                    )
                  }
                >
                  <AudioLines size={16} />
                  試し打ち
                </button>
              </div>
              <div className="settings-section">
                <h3>
                  <Settings2 size={17} />
                  演奏
                </h3>
                <label className="range-field">
                  <span>
                    タイミング調整
                    <strong>
                      {settings.offset > 0 ? "+" : ""}
                      {settings.offset} ms
                    </strong>
                  </span>
                  <input
                    type="range"
                    min="-250"
                    max="250"
                    step="5"
                    value={settings.offset}
                    onChange={(e) =>
                      void saveSettings({
                        ...settings,
                        offset: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <p className="hint">
                  プラスにすると遅い入力を補正します。Bluetoothでは調整が必要になることがあります。
                </p>
                <div className="setting-row">
                  <span>再生速度</span>
                  <div className="segmented">
                    {[0.75, 1, 1.25].map((speed) => (
                      <button
                        className={settings.speed === speed ? "selected" : ""}
                        key={speed}
                        onClick={() =>
                          void saveSettings({ ...settings, speed })
                        }
                      >
                        {speed}×
                      </button>
                    ))}
                  </div>
                </div>
                <Toggle
                  label="振動"
                  value={settings.vibration}
                  onChange={(value) =>
                    void saveSettings({ ...settings, vibration: value })
                  }
                />
                <Toggle
                  label="アニメーションを減らす"
                  value={settings.reducedMotion}
                  onChange={(value) =>
                    void saveSettings({ ...settings, reducedMotion: value })
                  }
                />
              </div>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              <button
                className="primary"
                onClick={async () => {
                  try {
                    await store.saveSettings(settings);
                    if (user) await api("/me/settings", settings);
                    notify(
                      user ? "設定を保存・同期しました" : "設定を保存しました",
                    );
                    setSheet(null);
                  } catch {
                    setError(
                      "同期できませんでした。設定はこの端末に保存されています",
                    );
                  }
                }}
              >
                <Check size={18} />
                保存する
              </button>
              {user && (
                <button
                  className="text-button centered"
                  onClick={async () => {
                    try {
                      const r = await api<{ settings: Settings | null }>(
                        "/me/settings",
                      );
                      if (r.settings) {
                        await saveSettings(r.settings);
                        notify("設定を読み込みました");
                      } else notify("同期された設定はありません");
                    } catch {
                      setError("設定を取得できませんでした");
                    }
                  }}
                >
                  <Cloud size={15} />
                  クラウドから設定を読み込む
                </button>
              )}
            </Sheet>
          )}
          {sheet === "account" && (
            <Sheet
              key="account"
              title="アカウント"
              onClose={() => setSheet(null)}
            >
              {user ? (
                <>
                  <div className="profile-card">
                    <span className="profile-avatar">
                      {user.name.slice(0, 1)}
                    </span>
                    <h3>{user.name}</h3>
                    <p>
                      <CheckCircle2 size={14} />
                      Googleでログイン済み
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => void syncRecords()}
                  >
                    <Cloud size={18} />
                    端末の記録を同期
                  </button>
                  <p className="hint centered">
                    音源はこの端末にのみ保存されます。
                  </p>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await api("/auth/logout", {});
                        setUser(null);
                        setCloudResults([]);
                        window.google?.accounts.id.disableAutoSelect();
                        notify("ログアウトしました");
                        setSheet(null);
                      } catch {
                        setError("ログアウトできませんでした");
                      }
                    }}
                  >
                    <LogOut size={17} />
                    ログアウト
                  </button>
                </>
              ) : (
                <>
                  <div className="login-illustration">
                    <Cloud size={42} strokeWidth={1.2} />
                    <div className="tiny-circle">●</div>
                    <div className="tiny-diamond">◆</div>
                  </div>
                  <h3 className="centered">プレイ記録を同期</h3>
                  <p className="login-description">
                    Googleアカウントでログインすると、成績と設定の同期、AIアレンジが使えます。
                  </p>
                  <div className="google-button" ref={googleRef} />
                  {!googleClientId && (
                    <div className="error-banner">
                      Google認証は設定中です。端末への保存とプレイは利用できます。
                    </div>
                  )}
                  <p className="hint centered">
                    ログインせずにプレイできます。
                  </p>
                </>
              )}
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
            </Sheet>
          )}
          {sheet === "about" && (
            <Sheet key="about" title="OFF MUSIC" onClose={() => setSheet(null)}>
              <div className="about-logo">
                <Logo large />
              </div>
              <p className="about-text">
                音源を取り込み、丸は低音、菱形は高音でプレイ。曲と譜面は端末に保存され、Googleログイン時は成績と設定を同期できます。
              </p>
              <div className="about-rules">
                <h3>判定</h3>
                <p>PERFECT ±45ms / GREAT ±100ms / GOOD ±160ms</p>
                <h3>プライバシー</h3>
                <p>
                  音源はアップロードしません。Googleの識別ID・名前とプレイ記録・設定をCloudflareに保存します。AIにはBPM、曲の長さ、16区間の音の強さだけを送ります。セッションは7日間有効です。クラウドの記録は最新300件です。
                </p>
                <h3>音源について</h3>
                <p>
                  初期収録：MAKE SOMETHING. /
                  OFFSKU。提供者の公開許可を確認済み。追加する曲は、利用する権利のある音源を選んでください。
                </p>
                <h3>データ</h3>
                <p>
                  ブラウザのデータ消去で端末の音源は消えます。元の音源ファイルを保管してください。別の端末で遊ぶ場合は音源を追加し直します。
                </p>
                <a
                  href="https://github.com/fuuuuuuma/off-music"
                  target="_blank"
                  rel="noreferrer"
                >
                  ソースコード
                  <ArrowRight size={14} />
                </a>
              </div>
              <p className="hint">
                <a href="/privacy.html" target="_blank" rel="noreferrer">
                  プライバシー
                </a>{" "}
                ·{" "}
                <a href="/terms.html" target="_blank" rel="noreferrer">
                  利用について
                </a>
              </p>
              <small className="version">VERSION 1.0.0</small>
            </Sheet>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast glass"
              role="status"
              aria-live="polite"
              key={toast.text}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
            >
              <CheckCircle2 size={18} />
              <span>{toast.text}</span>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action?.();
                    setToast(null);
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {intro && (
            <motion.div
              className="intro"
              key="intro"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, filter: "blur(12px)" }}
              transition={{ duration: 0.55 }}
            >
              <div className="intro-halo" />
              <div className="intro-ring ring-one" />
              <div className="intro-ring ring-two" />
              <motion.div
                initial={{
                  opacity: 0,
                  y: 28,
                  filter: "blur(18px)",
                  scale: 0.9,
                }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
                transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1] }}
              >
                <Logo large />
              </motion.div>
              <motion.span
                className="intro-caption"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <span /> MUSIC OFF
              </motion.span>
              <button className="intro-skip" onClick={() => setIntro(false)}>
                スキップ
                <ArrowRight size={15} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {booting && !intro && <Skeleton />}
        {busy && (
          <div className="busy-overlay">
            <Skeleton />
            <div className="busy-label" role="status">
              <LoaderCircle size={22} className="spin" />
              {busy}
            </div>
          </div>
        )}
      </div>
    </MotionConfig>
  );
}
function ArrowUpIcon() {
  return <Upload size={18} className="strip-arrow" />;
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <button
        className={"toggle " + (value ? "on" : "")}
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
      >
        <i />
      </button>
    </div>
  );
}
function RecordCard({ result: r }: { result: Result }) {
  return (
    <article className="record-card glass">
      <span className="record-rank">{rank(r.accuracy)}</span>
      <div>
        <h3>{r.title}</h3>
        <p>
          {DIFFICULTIES.find((d) => d.id === r.difficulty)?.label} · {r.speed}×{" "}
          <i>·</i>{" "}
          {new Date(r.createdAt).toLocaleDateString("ja-JP", {
            month: "numeric",
            day: "numeric",
          })}
        </p>
        <div className="record-numbers">
          <strong>{r.score.toLocaleString()}</strong>
          <span>
            {r.accuracy.toFixed(1)}% {r.synced && <Cloud size={12} />}
          </span>
        </div>
      </div>
    </article>
  );
}
