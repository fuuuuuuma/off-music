import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  Cloud,
  Disc3,
  Download,
  Headphones,
  LoaderCircle,
  LogOut,
  Music2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Sheet } from "./components/Sheet.tsx";
import { Game } from "./components/Game.tsx";
import { Mascot, Mascots } from "./components/Mascots.tsx";
import { Calibration } from "./components/Calibration.tsx";
import { GoogleButton } from "./components/GoogleButton.tsx";
import { Community } from "./components/Community.tsx";
import {
  analyzeAudio,
  decodeAudio,
  chime,
  setAmbience,
  stopAmbience,
  unlockAudio,
} from "./lib/audio.ts";
import { CHART_VERSION, createChart } from "./lib/chart.ts";
import { api, setApiUser } from "./lib/api.ts";
import { store } from "./lib/storage.ts";
import { THEMES, progression, playXp } from "./lib/progression.ts";
import {
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  HIT_KINDS,
  HIT_STYLE,
  type Analysis,
  type Difficulty,
  type Group,
  type Note,
  type Progress,
  type RankingRow,
  type Result,
  type Settings,
  type Song,
  type User,
} from "./types.ts";
const time = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const rank = (a: number) =>
  a >= 98
    ? "S+"
    : a >= 93
      ? "S"
      : a >= 83
        ? "A"
        : a >= 68
          ? "B"
          : a >= 45
            ? "C"
            : "D";
type Panel =
  | "settings"
  | "calibrate"
  | "account"
  | "upload"
  | "song"
  | "login"
  | "privacy"
  | null;
type GameData = {
  settings: Settings;
  difficulty: Difficulty;
  song: Song;
  buffer: AudioBuffer;
  notes: Note[];
  ticket?: string;
  ranked: boolean;
  groupId?: string;
};
type ToastData = { text: string; undo?: () => void };
function Logo() {
  return (
    <span className="logo">
      OFF<span className="logo-orbit">◌</span>MUSIC
    </span>
  );
}
function Wave({ analysis }: { analysis: Analysis }) {
  return (
    <div className="wave" aria-hidden="true">
      {analysis.waveform
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
        <i />
        <b />
      </header>
      <main>
        <div className="sk-hero" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sk-row" />
        ))}
      </main>
      <span>OFF MUSIC</span>
    </div>
  );
}
function Intro({
  onStart,
  reduced,
}: {
  onStart: () => void;
  reduced: boolean;
}) {
  return (
    <motion.div
      className={"intro-v2 " + (reduced ? "still" : "")}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(15px)" }}
      transition={{ duration: 0.7 }}
    >
      <div className="intro-rays" />
      <div className="intro-orbit orbit-one" />
      <div className="intro-orbit orbit-two" />
      <div className="intro-orbit orbit-three" />
      {Array.from({ length: 18 }, (_, i) => (
        <i className="intro-star" key={i} style={{ "--i": i } as CSSProperties}>
          ✦
        </i>
      ))}
      <div className="intro-mark">
        <span className="intro-kicker">OFFSCREEN PRESENTS</span>
        <h1>
          <span>OFF</span>
          <span>MUSIC</span>
        </h1>
        <div className="intro-mascot">
          <Mascot index={1} />
        </div>
        <span className="intro-line" />
      </div>
      <button className="intro-start glass" onClick={onStart}>
        タップしてスタート <ArrowRight size={18} />
      </button>
      <small className="intro-sound">
        <Volume2 size={13} />
        タップ後にサウンドが流れます
      </small>
    </motion.div>
  );
}
export default function App() {
  const [loading, setLoading] = useState(true),
    [initialError, setInitialError] = useState(""),
    [entered, setEntered] = useState(false),
    [songs, setSongs] = useState<Song[]>([]),
    [groupSongs, setGroupSongs] = useState<Song[]>([]),
    [results, setResults] = useState<Result[]>([]),
    [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS),
    [user, setUser] = useState<User | null>(null),
    [clientId, setClientId] = useState(""),
    [progress, setProgress] = useState<Progress>(progression()),
    [groups, setGroups] = useState<Group[]>([]),
    [groupId, setGroupId] = useState(localStorage.getItem("off-group") || ""),
    [tab, setTab] = useState<"library" | "ranking" | "profile">("library"),
    [panel, setPanel] = useState<Panel>(null),
    [selected, setSelected] = useState<Song | null>(null),
    [difficulty, setDifficulty] = useState<Difficulty>("normal"),
    [game, setGame] = useState<GameData | null>(null),
    [finished, setFinished] = useState<Result | null>(null),
    [toast, setToast] = useState<ToastData | null>(null),
    [busy, setBusy] = useState(false),
    [busyText, setBusyText] = useState(""),
    [query, setQuery] = useState(""),
    [searchFocus, setSearchFocus] = useState(false),
    [suggestionIndex, setSuggestionIndex] = useState(0),
    [revision, setRevision] = useState(0),
    [songRevision, setSongRevision] = useState(0),
    [live, setLive] = useState("connecting"),
    [pull, setPull] = useState(0),
    [refreshing, setRefreshing] = useState(false),
    [uploadProgress, setUploadProgress] = useState(0),
    [uploadTitle, setUploadTitle] = useState(""),
    [uploadArtist, setUploadArtist] = useState(""),
    [uploadFile, setUploadFile] = useState<File | null>(null),
    [shareGroup, setShareGroup] = useState(""),
    [rights, setRights] = useState(false),
    [syncing, setSyncing] = useState(false),
    [aiStyle, setAiStyle] = useState<"balanced" | "flow" | "challenge">(
      "balanced",
    );
  const fileInput = useRef<HTMLInputElement>(null),
    pullStart = useRef<number | null>(null),
    gateSong = useRef<Song | null>(null),
    userRef = useRef(user),
    gameRef = useRef(game),
    profileRef = useRef(progress);
  userRef.current = user;
  gameRef.current = game;
  profileRef.current = progress;
  const invite = useMemo(
    () => new URLSearchParams(location.search).get("invite") || "reset-none",
    [],
  );
  const notify = useCallback(
    (text: string, undo?: () => void) => setToast({ text, undo }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 7000 : 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const allSongs = useMemo(
    () => [
      ...songs,
      ...groupSongs.filter((g) => !songs.some((s) => s.id === g.id)),
    ],
    [songs, groupSongs],
  );
  const chart = useMemo(
    () =>
      selected
        ? createChart(selected.analysis, difficulty, selected.arrangement)
        : [],
    [selected, difficulty],
  );
  const visibleSongs = allSongs.filter((s) =>
    `${s.title} ${s.artist}`.toLowerCase().includes(query.toLowerCase()),
  );
  async function loadGroups() {
    if (!userRef.current) return;
    const r = await api<{ groups: Group[] }>("/me/groups");
    setGroups(r.groups);
    setGroupId((previous) =>
      r.groups.some((g) => g.id === previous)
        ? previous
        : r.groups[0]?.id || "",
    );
  }
  async function loadProfile() {
    if (!userRef.current) return;
    const id = userRef.current.id;
    const data = await Promise.allSettled([
      api<{ results: Result[] }>("/me/results"),
      api<{ progress: Progress }>("/me/progress"),
      api<{ settings: Settings | null }>("/me/settings"),
    ]);
    if (userRef.current?.id !== id) return;
    if (data[0].status === "fulfilled") {
      const remote = data[0].value.results;
      setResults((prev) => [
        ...remote.map((r) => ({ ...r, ownerId: id })),
        ...prev.filter(
          (r) => r.ownerId === id && !remote.some((x) => x.id === r.id),
        ),
      ]);
    }
    if (data[1].status === "fulfilled") setProgress(data[1].value.progress);
    if (data[2].status === "fulfilled" && data[2].value.settings) {
      setSettings({ ...DEFAULT_SETTINGS, ...data[2].value.settings });
    }
    await loadGroups();
  }
  async function initialize() {
    setLoading(true);
    setInitialError("");
    try {
      const [config, catalog, saved, localResults, localSettings] =
        await Promise.all([
          api<{ googleClientId: string }>("/config"),
          fetch("/music/catalog.json").then((r) => r.json()) as Promise<
            {
              id: string;
              title: string;
              artist: string;
              source: string;
              analysis: string;
            }[]
          >,
          store.songs(),
          store.results(),
          store.settings(),
        ]);
      const builtin = await Promise.all(
        catalog.map(async (s) => ({
          ...s,
          analysis: (await fetch(s.analysis).then((r) => r.json())) as Analysis,
        })),
      );
      setSongs([
        ...builtin.map((s) => ({
          ...s,
          duration: s.analysis.duration,
          bpm: s.analysis.bpm,
          builtin: true,
          canonical: true,
          addedAt: 0,
        })),
        ...saved.filter((s) => !s.builtin),
      ]);
      setClientId(config.googleClientId);
      setResults(
        localResults.map((r) =>
          r.songId === "make-something"
            ? { ...r, songId: "play-pay", title: "Play & Pay" }
            : r,
        ),
      );
      if (localSettings) setSettings({ ...DEFAULT_SETTINGS, ...localSettings });
      const guest = await store.guestProgress();
      setProgress(guest || progression());
      try {
        const { user: u } = await api<{ user: User }>("/me/profile");
        setApiUser(u.id);
        setUser(u);
        userRef.current = u;
      } catch {}
      setLoading(false);
    } catch (e) {
      setInitialError((e as Error).message);
      setLoading(false);
    }
  }
  useEffect(() => {
    initialize();
    const changed = () => {
      setApiUser(null);
      setUser(null);
      userRef.current = null;
      setGroups([]);
      setGroupSongs([]);
      store.guestProgress().then((p) => setProgress(p || progression()));
      notify("ログイン状態が変わりました。もう一度ログインしてください");
    };
    addEventListener("off-auth-change", changed);
    return () => removeEventListener("off-auth-change", changed);
  }, []);
  useEffect(() => {
    if (user) loadProfile().catch((e) => notify(e.message));
  }, [user?.id]);
  useEffect(() => {
    if (entered && !game) setAmbience(settings.ambient ?? 0.055);
  }, [entered, settings.ambient, game]);
  useEffect(() => {
    localStorage.setItem("off-group", groupId);
    if (!user || !groupId) {
      setGroupSongs([]);
      return;
    }
    let active = true;
    api<{ songs: Song[] }>(`/me/groups/${groupId}/songs`)
      .then((r) => {
        if (active) setGroupSongs(r.songs);
      })
      .catch((e) => notify(e.message));
    return () => {
      active = false;
    };
  }, [user?.id, groupId, songRevision]);
  useEffect(() => {
    if (!user || !groupId) return;
    let stopped = false,
      socket: WebSocket | undefined,
      timer: ReturnType<typeof setTimeout>,
      heartbeat: ReturnType<typeof setInterval>,
      attempt = 0;
    function connect() {
      setLive("connecting");
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/me/groups/${groupId}/live`,
      );
      socket.onopen = () => {
        attempt = 0;
        setLive("live");
        setRevision((r) => r + 1);
        setSongRevision((r) => r + 1);
        heartbeat = setInterval(() => {
          if (socket?.readyState === 1) socket.send("ping");
        }, 25000);
      };
      socket.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type?.endsWith(".changed")) {
            setRevision((r) => r + 1);
            if (event.type === "songs.changed") setSongRevision((r) => r + 1);
            if (event.type === "members.changed") loadGroups().catch(() => {});
          }
        } catch {}
      };
      socket.onclose = () => {
        clearInterval(heartbeat);
        if (!stopped) {
          setLive("reconnecting");
          timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++));
        }
      };
      socket.onerror = () => socket?.close();
    }
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(heartbeat);
      socket?.close();
    };
  }, [user?.id, groupId]);
  async function enter() {
    await unlockAudio();
    setEntered(true);
    chime([48, 60, 67, 72, 76, 79, 84], settings.effects * 0.22, 0.09);
    setAmbience(settings.ambient ?? 0.055);
    if (invite !== "reset-none") {
      setTab("ranking");
      if (!user) setPanel("login");
    }
  }
  async function saveSettings(next: Settings) {
    setSettings(next);
    await store.saveSettings(next);
    if (user)
      try {
        await api("/me/settings", next);
      } catch (e) {
        notify((e as Error).message);
        return;
      }
    notify("設定を保存しました");
  }
  function chooseSong(song: Song) {
    setSelected(song);
    setFinished(null);
    setPanel("song");
  }
  async function play(song = selected) {
    if (!song || busy) return;
    if (!user && !sessionStorage.getItem("off-guest")) {
      gateSong.current = song;
      setPanel("login");
      return;
    }
    setBusy(true);
    setBusyText("音源を準備中");
    if (
      matchMedia("(pointer: coarse)").matches &&
      document.documentElement.requestFullscreen
    ) {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (o: string) => Promise<void>;
          };
          return orientation.lock?.("landscape");
        })
        .catch(() => {});
    }
    try {
      await unlockAudio();
      let current = song;
      const blob =
        song.blob ||
        (await fetch(song.source!, { credentials: "same-origin" }).then((r) => {
          if (!r.ok)
            throw new Error(
              "音源を読み込めません。ログイン状態をご確認ください",
            );
          return r.blob();
        }));
      const buffer = await decodeAudio(blob!);
      if (song.analysis.version !== 2) {
        setBusyText("発音位置を再解析中");
        const analysis = await analyzeAudio(buffer, (p) =>
          setUploadProgress(p),
        );
        current = {
          ...song,
          analysis,
          bpm: analysis.bpm,
          duration: analysis.duration,
          canonical: false,
        };
        if (!song.builtin) {
          await store.saveSong(current);
          setSongs((prev) => prev.map((s) => (s.id === song.id ? current : s)));
        }
      }
      const notes = createChart(
        current.analysis,
        difficulty,
        current.arrangement,
      );
      if (!notes.length) throw new Error("この音源から音符を作れませんでした");
      let ticket: string | undefined,
        ranked = false;
      if (user) {
        setBusyText("プレイを登録中");
        const r = await api<{ ticket: string; ranked: boolean }>("/me/plays", {
          songId: current.id,
          title: current.title,
          duration: current.duration,
          difficulty,
          speed: settings.speed,
          groupId: groupId || null,
          practice:
            !!current.arrangement || !current.canonical || settings.speed !== 1,
          notes,
        });
        ticket = r.ticket;
        ranked = r.ranked;
      }
      setPanel(null);
      setFinished(null);
      setGame({
        settings: { ...settings },
        difficulty,
        song: current,
        buffer,
        notes,
        ticket,
        ranked,
        groupId: groupId || undefined,
      });
      setBusy(false);
      // Fullscreen/orientation are best effort. Safari uses the physical orientation.
    } catch (e) {
      notify((e as Error).message);
      setBusy(false);
    }
  }
  async function onFinish(result: Result) {
    const played = gameRef.current!;
    setGame(null);
    const id = userRef.current?.id;
    let final: Result = {
      ...result,
      id: played.ticket || result.id,
      ownerId: id,
      groupId: played.groupId,
      ranked: played.ranked,
      ticket: played.ticket,
    };
    setFinished(final);
    setPanel(null);
    chime(
      result.miss === 0
        ? [60, 64, 67, 72, 76, 79, 84]
        : result.accuracy >= 65
          ? [60, 64, 67, 72, 79]
          : [60, 64, 67],
      settings.effects * 0.24,
      0.105,
    );
    setAmbience(settings.ambient ?? 0.055);
    await store.saveResult(final);
    setResults((prev) => [final, ...prev.filter((r) => r.id !== final.id)]);
    if (id && played.ticket) {
      setSyncing(true);
      try {
        const r = await api<{ result: Result; progress: Progress }>(
          `/me/plays/${played.ticket}/finish`,
          { hits: result.replay || [] },
        );
        if (userRef.current?.id === id) {
          final = { ...r.result, ownerId: id };
          setFinished(final);
          setProgress(r.progress);
          await store.saveResult(final);
          setResults((prev) => [
            final,
            ...prev.filter((x) => x.id !== final.id),
          ]);
          setRevision((v) => v + 1);
        }
      } catch (e) {
        notify((e as Error).message + " · 再送信できます");
      } finally {
        setSyncing(false);
      }
    } else {
      const p = profileRef.current,
        xp = playXp(result.score, result.miss),
        next = progression(
          p.xp + xp,
          p.plays + 1,
          p.uploads,
          Math.max(p.maxCombo, result.maxCombo),
        );
      final = {
        ...final,
        xpEarned: xp,
        previousLevel: p.level,
        level: next.level,
      };
      setFinished(final);
      setProgress(next);
      await store.saveResult(final);
      await store.saveGuestProgress(next);
    }
  }
  async function retrySync() {
    if (!finished?.ticket || !finished.replay || !user) return;
    setSyncing(true);
    try {
      const r = await api<{ result: Result; progress: Progress }>(
        `/me/plays/${finished.ticket}/finish`,
        { hits: finished.replay },
      );
      setFinished({ ...r.result, ownerId: user.id });
      setProgress(r.progress);
      await store.saveResult({ ...r.result, ownerId: user.id });
      notify("クラウドに保存しました");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (user) await loadProfile();
      setRevision((r) => r + 1);
      setSongRevision((r) => r + 1);
      notify("更新しました");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }
  async function login(u: User) {
    setApiUser(u.id);
    setUser(u);
    userRef.current = u;
    setPanel(gateSong.current ? "song" : null);
    sessionStorage.removeItem("off-guest");
    notify("Googleでログインしました");
    gateSong.current = null;
  }
  async function logout() {
    try {
      await api("/auth/logout", {});
      setApiUser(null);
      userRef.current = null;
      setUser(null);
      setGroups([]);
      setGroupSongs([]);
      setResults(await store.results());
      setProgress((await store.guestProgress()) || progression());
      setPanel(null);
      window.google?.accounts.id.disableAutoSelect();
      notify("ログアウトしました");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function upload() {
    if (!uploadFile || busy) return;
    setBusy(true);
    setUploadProgress(0);
    setBusyText("音源を分析中");
    try {
      if (uploadFile.size > 20 * 1024 * 1024)
        throw new Error("音源は20MB以下にしてください");
      const buffer = await decodeAudio(uploadFile);
      if (buffer.duration < 3 || buffer.duration > 600)
        throw new Error("3秒〜10分の音源を選んでください");
      const analysis = await analyzeAudio(buffer, setUploadProgress),
        bytes = await uploadFile.arrayBuffer(),
        hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
      const duplicate = songs.find((s) => s.hash === hash);
      if (duplicate) {
        setSelected(duplicate);
        setPanel("song");
        notify("この曲は追加済みです");
        return;
      }
      const song: Song = {
        id: crypto.randomUUID(),
        title: uploadTitle.trim() || uploadFile.name.replace(/\.[^.]+$/, ""),
        artist: uploadArtist.trim(),
        analysis,
        duration: analysis.duration,
        bpm: analysis.bpm,
        blob: uploadFile,
        addedAt: Date.now(),
        hash,
      };
      await store.saveSong(song);
      setSongs((prev) => [...prev, song]);
      setSelected(song);
      setPanel("song");
      setUploadFile(null);
      if (user) {
        const r = await api<{ progress: Progress }>("/me/progress/uploads", {
          hash,
        });
        setProgress(r.progress);
      } else {
        const hashes = await store.guestUploads();
        if (!hashes.includes(hash)) {
          const p = profileRef.current,
            next = progression(p.xp + 30, p.plays, p.uploads + 1, p.maxCombo);
          setProgress(next);
          await store.saveGuestProgress(next);
          await store.saveGuestUploads([...hashes, hash]);
        }
      }
      notify("音源を解析して追加しました");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function shareSong() {
    if (!selected || !shareGroup || !rights || !user || busy) return;
    setBusy(true);
    setBusyText("グループに音源を共有中");
    try {
      const blob =
          selected.blob ||
          (await fetch(selected.source!).then((r) => r.blob())),
        bytes = await blob!.arrayBuffer(),
        hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (v) => v.toString(16).padStart(2, "0"),
        ).join("");
      const analysis = JSON.parse(
        JSON.stringify(selected.analysis, (_k, v) =>
          typeof v === "number" ? Math.round(v * 10000) / 10000 : v,
        ),
      );
      const r = await api<{ id: string; status: string }>(
        `/me/groups/${shareGroup}/songs`,
        {
          title: selected.title,
          artist: selected.artist,
          hash,
          size: blob!.size,
          analysis,
          rightsConfirmed: true,
        },
      );
      if (r.status !== "ready") {
        const response = await fetch(
          `/api/me/groups/${shareGroup}/songs/${r.id}/audio`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Off-Music": "1",
              "X-Off-User": user.id,
            },
            body: blob,
          },
        );
        if (!response.ok)
          throw new Error(
            (await response.json()).error || "共有できませんでした",
          );
      }
      setGroupId(shareGroup);
      setSongRevision((v) => v + 1);
      setRevision((v) => v + 1);
      notify("グループに音源を共有しました");
      setRights(false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function arrange() {
    if (!selected || busy) return;
    if (!user) {
      setPanel("login");
      return;
    }
    setBusy(true);
    setBusyText("Workers AIでアレンジ中");
    try {
      const { arrangement } = await api<{ arrangement: Song["arrangement"] }>(
        "/me/arrange",
        {
          bpm: selected.bpm,
          duration: selected.duration,
          energy: selected.analysis.energy,
          style: aiStyle,
        },
      );
      setSelected({ ...selected, arrangement });
      notify("AIアレンジを適用しました · 練習モード");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeSong(song: Song) {
    await store.deleteSong(song.id);
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
    notify("曲を削除しました", async () => {
      await store.saveSong(song);
      setSongs((prev) => [...prev, song]);
      notify("曲を戻しました");
    });
  }
  const localRecords = results.filter((r) =>
      user ? r.ownerId === user.id : !r.ownerId,
    ),
    best = (id: string) =>
      Math.max(
        0,
        ...localRecords.filter((r) => r.songId === id).map((r) => r.score),
      );
  if (loading) return <Skeleton />;
  if (initialError)
    return (
      <div className="fatal">
        <Logo />
        <p>{initialError}</p>
        <button className="primary" onClick={initialize}>
          再読み込み
        </button>
      </div>
    );
  return (
    <MotionConfig reducedMotion={settings.reducedMotion ? "always" : "user"}>
      <div
        className={
          "app-v2 theme-" +
          (settings.theme || "pearl") +
          (settings.reducedMotion ? " reduce-motion" : "")
        }
      >
        <AnimatePresence>
          {!entered && (
            <Intro onStart={enter} reduced={settings.reducedMotion} />
          )}
        </AnimatePresence>
        {game ? (
          <Game
            key={game.song.id + game.ticket}
            {...game}
            onFinish={onFinish}
            onExit={() => {
              setGame(null);
              setAmbience(settings.ambient ?? 0.055);
            }}
          />
        ) : (
          <div className="lobby-content" inert={!entered}>
            <header className="app-header">
              <button
                className="logo-button"
                onClick={() => {
                  setTab("library");
                  setFinished(null);
                }}
                aria-label="曲一覧"
              >
                <Logo />
              </button>
              <div className="header-controls">
                <button
                  className="icon-button audio-toggle"
                  aria-label={
                    (settings.ambient ?? 0) > 0 ? "BGMをミュート" : "BGMをオン"
                  }
                  onClick={() =>
                    saveSettings({
                      ...settings,
                      ambient: (settings.ambient ?? 0) > 0 ? 0 : 0.055,
                    })
                  }
                >
                  {(settings.ambient ?? 0) > 0 ? (
                    <Volume2 size={18} />
                  ) : (
                    <VolumeX size={18} />
                  )}
                </button>
                <button
                  className="level-chip glass"
                  onClick={() => {
                    setTab("profile");
                    setFinished(null);
                  }}
                >
                  <span>Lv.{progress.level}</span>
                  <i
                    style={{
                      width:
                        Math.max(
                          8,
                          ((progress.xp - progress.levelStartXp) /
                            (progress.nextLevelXp - progress.levelStartXp)) *
                            100,
                        ) + "%",
                    }}
                  />
                </button>
                <button
                  className="icon-button glass"
                  aria-label="設定"
                  onClick={() => setPanel("settings")}
                >
                  <Settings2 size={19} />
                </button>
                <button
                  className="avatar-button glass"
                  aria-label="アカウント"
                  onClick={() => setPanel("account")}
                >
                  {user?.picture ? (
                    <img
                      src={user.picture}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <Users size={18} />
                  )}
                </button>
              </div>
            </header>
            <main
              className="app-main"
              onTouchStart={(e) => {
                if (scrollY <= 0 && !panel)
                  pullStart.current = e.touches[0].clientY;
              }}
              onTouchMove={(e) => {
                if (pullStart.current !== null)
                  setPull(
                    Math.min(
                      90,
                      Math.max(
                        0,
                        (e.touches[0].clientY - pullStart.current) * 0.5,
                      ),
                    ),
                  );
              }}
              onTouchEnd={() => {
                if (pull > 65) refresh();
                else setPull(0);
                pullStart.current = null;
              }}
            >
              {(pull > 0 || refreshing) && (
                <div
                  className="pull-refresh"
                  style={{ height: Math.max(pull, refreshing ? 42 : 0) }}
                >
                  <RefreshCw size={18} className={refreshing ? "spin" : ""} />
                  {refreshing
                    ? "更新中"
                    : pull > 65
                      ? "離して更新"
                      : "下に引いて更新"}
                </div>
              )}
              {finished ? (
                <section
                  className={
                    "result-v2 " +
                    (finished.miss === 0
                      ? "full-combo"
                      : finished.accuracy >= 65
                        ? "cleared"
                        : "completed")
                  }
                >
                  <button
                    className="back-button"
                    onClick={() => setFinished(null)}
                  >
                    <ArrowLeft size={17} />
                    曲一覧
                  </button>
                  <div className="result-fireworks" aria-hidden="true">
                    {Array.from({ length: 32 }, (_, i) => (
                      <i key={i} style={{ "--i": i } as CSSProperties} />
                    ))}
                  </div>
                  <div className="result-heading">
                    <span className="eyebrow">{finished.title}</span>
                    <h1>
                      {finished.miss === 0
                        ? "FULL COMBO"
                        : finished.accuracy >= 65
                          ? "STAGE CLEAR"
                          : "SESSION FINISH"}
                    </h1>
                    <span className="result-rank">
                      {rank(finished.accuracy)}
                    </span>
                  </div>
                  <Mascots
                    bpm={120}
                    mood={finished.accuracy >= 65 ? "celebrate" : ""}
                  />
                  <div className="result-card glass">
                    <small>SCORE</small>
                    <strong className="result-score">
                      {finished.score.toLocaleString()}
                    </strong>
                    <div className="result-metrics">
                      <div>
                        <strong>{finished.accuracy.toFixed(2)}%</strong>
                        <small>ACCURACY</small>
                      </div>
                      <div>
                        <strong>{finished.maxCombo}</strong>
                        <small>MAX COMBO</small>
                      </div>
                      <div>
                        <strong>+{finished.xpEarned ?? 0}</strong>
                        <small>{syncing ? "保存中…" : "XP"}</small>
                      </div>
                    </div>
                    <div className="judgement-summary">
                      {(["perfect", "great", "good", "miss"] as const).map(
                        (g) => (
                          <div key={g}>
                            <small>{g.toUpperCase()}</small>
                            <strong>{finished[g]}</strong>
                          </div>
                        ),
                      )}
                    </div>
                    <p className="timing-summary">
                      EARLY {finished.early ?? 0} · LATE {finished.late ?? 0} ·
                      平均 {(finished.meanOffset ?? 0) > 0 ? "+" : ""}
                      {(finished.meanOffset ?? 0).toFixed(1)} ms
                    </p>
                    {(finished.level ?? 0) > (finished.previousLevel ?? 0) && (
                      <div className="level-up">
                        ✦ LEVEL UP · Lv.{finished.level}
                      </div>
                    )}
                    <div className="save-state">
                      {syncing ? (
                        <>
                          <LoaderCircle size={15} className="spin" />
                          クラウドに保存中
                        </>
                      ) : finished.synced ? (
                        <>
                          <Cloud size={15} />
                          {finished.ranked
                            ? "ランキング更新済み"
                            : "クラウドに保存済み · 個人記録"}
                        </>
                      ) : finished.ticket ? (
                        <button className="quiet" onClick={retrySync}>
                          クラウドへ再送信
                        </button>
                      ) : (
                        <>この端末に保存済み · ゲスト</>
                      )}
                    </div>
                  </div>
                  <div className="result-actions">
                    <button
                      className="primary"
                      onClick={() =>
                        play(
                          allSongs.find((s) => s.id === finished.songId) ||
                            selected,
                        )
                      }
                    >
                      <Play size={18} />
                      もう一度
                    </button>
                    {finished.groupId && (
                      <button
                        className="quiet"
                        onClick={() => {
                          setFinished(null);
                          setTab("ranking");
                        }}
                      >
                        ランキングを見る
                      </button>
                    )}
                  </div>
                </section>
              ) : tab === "library" ? (
                <>
                  <section className="hero-v2 glass">
                    <div className="hero-halo" />
                    <div className="hero-copy">
                      <span className="eyebrow">OFFSCREEN</span>
                      <h1>
                        OFF
                        <br />
                        <em>MUSIC.</em>
                      </h1>
                      <div className="hero-meta">
                        <span>3 PADS</span>
                        <i />
                        LANDSCAPE
                      </div>
                      <button
                        className="primary"
                        onClick={() => chooseSong(songs[0])}
                      >
                        <Play size={17} fill="currentColor" />
                        Play & Pay <ArrowRight size={17} />
                      </button>
                    </div>
                    <div className="hero-characters">
                      <Mascots bpm={112} />
                    </div>
                    <div className="hero-bottom">
                      <span>01 — PLAY & PAY</span>
                      <AudioLines size={24} />
                      <span>OFFSCREEN</span>
                    </div>
                  </section>
                  {!user && (
                    <button
                      className="guest-benefit glass"
                      onClick={() => setPanel("login")}
                    >
                      <Cloud size={20} />
                      <span>
                        <strong>ゲストでプレイ中</strong>
                        <small>ログインでレベル保存・グループランキング</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  )}
                  <section className="library-section">
                    <div className="section-top">
                      <h2>
                        ライブラリ{" "}
                        <span>
                          {allSongs.length.toString().padStart(2, "0")}
                        </span>
                      </h2>
                      <button
                        className="quiet"
                        onClick={() => {
                          setUploadTitle("");
                          setUploadArtist("");
                          setPanel("upload");
                        }}
                      >
                        <Plus size={17} />
                        曲を追加
                      </button>
                    </div>
                    <div className="search-wrap">
                      <Search size={18} />
                      <input
                        placeholder="曲名・アーティストで検索"
                        aria-label="曲を検索"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setSuggestionIndex(0);
                        }}
                        onKeyDown={(e) => {
                          const options = visibleSongs.slice(0, 5);
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setSearchFocus(true);
                            setSuggestionIndex((i) =>
                              Math.min(options.length - 1, i + 1),
                            );
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setSuggestionIndex((i) => Math.max(0, i - 1));
                          }
                          if (e.key === "Escape") setSearchFocus(false);
                          if (e.key === "Enter" && options.length) {
                            e.preventDefault();
                            setSearchFocus(false);
                            chooseSong(options[suggestionIndex] || options[0]);
                          }
                        }}
                        onFocus={() => setSearchFocus(true)}
                        onBlur={() =>
                          setTimeout(() => setSearchFocus(false), 150)
                        }
                        role="combobox"
                        aria-autocomplete="list"
                        aria-controls="song-suggestions"
                        aria-activedescendant={
                          searchFocus && query
                            ? "song-suggestion-" + suggestionIndex
                            : undefined
                        }
                        aria-expanded={searchFocus && !!query}
                      />
                      {query && (
                        <button
                          aria-label="検索をクリア"
                          onClick={() => setQuery("")}
                        >
                          <X size={16} />
                        </button>
                      )}
                      {searchFocus && query && visibleSongs.length > 0 && (
                        <ul
                          id="song-suggestions"
                          className="autocomplete glass"
                          role="listbox"
                        >
                          {visibleSongs.slice(0, 5).map((s, i) => (
                            <li
                              key={s.id}
                              id={"song-suggestion-" + i}
                              role="option"
                              aria-selected={i === suggestionIndex}
                            >
                              <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  setQuery(s.title);
                                  setSearchFocus(false);
                                }}
                              >
                                {s.title}
                                <small>{s.artist}</small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="song-list">
                      {visibleSongs.map((s, i) => (
                        <div className="swipe-row" key={s.id}>
                          {!s.builtin && !s.groupId && (
                            <button
                              className="delete-song"
                              aria-label={s.title + "を削除"}
                              onClick={() => removeSong(s)}
                            >
                              <Trash2 size={18} />
                              削除
                            </button>
                          )}
                          <motion.div
                            drag={!s.builtin && !s.groupId ? "x" : false}
                            dragConstraints={{ left: -88, right: 0 }}
                            dragElastic={0.06}
                            className="song-row glass"
                          >
                            <button
                              className="song-main"
                              onClick={() => chooseSong(s)}
                            >
                              <div className={"song-art art-" + i}>
                                {s.id === "play-pay" ? (
                                  <img src="/art/play-pay.png" alt="" />
                                ) : s.id === "glass-circuit" ? (
                                  <Disc3 size={29} />
                                ) : (
                                  <Music2 size={25} />
                                )}
                              </div>
                              <div className="song-description">
                                <strong>{s.title}</strong>
                                <span>
                                  {s.artist || "MY AUDIO"}
                                  {s.groupId && " · グループ共有"}
                                </span>
                                <div className="song-details">
                                  <small>{time(s.duration)}</small>
                                  <i />
                                  <small>{s.bpm} BPM</small>
                                  {s.analysis.version === 2 && (
                                    <small className="analysis-chip">
                                      発音解析 v2
                                    </small>
                                  )}
                                </div>
                              </div>
                              <div className="song-best">
                                {best(s.id) > 0 ? (
                                  <>
                                    <small>BEST</small>
                                    <strong>
                                      {best(s.id).toLocaleString()}
                                    </strong>
                                  </>
                                ) : (
                                  <span>
                                    PLAY
                                    <ArrowRight size={14} />
                                  </span>
                                )}
                              </div>
                            </button>
                          </motion.div>
                        </div>
                      ))}
                    </div>
                    {!visibleSongs.length && (
                      <div className="empty">
                        <Search />
                        <p>曲が見つかりません</p>
                      </div>
                    )}
                  </section>
                </>
              ) : tab === "ranking" ? (
                <Community
                  groups={groups}
                  selected={groupId}
                  onSelect={setGroupId}
                  onReload={loadGroups}
                  notify={notify}
                  songs={allSongs.filter(
                    (s) => s.builtin || s.groupId === groupId,
                  )}
                  revision={revision}
                  status={live}
                  initialCode={invite === "reset-none" ? "" : invite}
                  onLogin={!user ? () => setPanel("login") : undefined}
                />
              ) : (
                <section className="profile-section">
                  <div className="section-top">
                    <h1>マイステージ</h1>
                    <span className="eyebrow">
                      {user ? "CLOUD SYNC" : "LOCAL GUEST"}
                    </span>
                  </div>
                  <div className="progress-card glass">
                    <Mascot index={1} />
                    <div>
                      <span className="eyebrow">{progress.title}</span>
                      <h2>
                        Lv.<strong>{progress.level}</strong>
                      </h2>
                      <div className="xp-meter">
                        <i
                          style={{
                            width:
                              ((progress.xp - progress.levelStartXp) /
                                (progress.nextLevelXp -
                                  progress.levelStartXp)) *
                                100 +
                              "%",
                          }}
                        />
                      </div>
                      <small>
                        {progress.xp} / {progress.nextLevelXp} XP
                      </small>
                    </div>
                  </div>
                  <div className="profile-numbers">
                    <div className="glass">
                      <strong>{progress.plays}</strong>
                      <span>PLAYS</span>
                    </div>
                    <div className="glass">
                      <strong>{progress.uploads}</strong>
                      <span>ADDED</span>
                    </div>
                    <div className="glass">
                      <strong>{progress.maxCombo}</strong>
                      <span>MAX COMBO</span>
                    </div>
                  </div>
                  <h2>称号・バッジ</h2>
                  <div className="badges">
                    {progress.badges.length ? (
                      progress.badges.map((b) => (
                        <span className="badge glass" key={b}>
                          <Trophy size={15} />
                          {b}
                        </span>
                      ))
                    ) : (
                      <p className="muted">最初のプレイでバッジを獲得。</p>
                    )}
                  </div>
                  <h2>ステージテーマ</h2>
                  <div className="theme-options">
                    {THEMES.map((t) => (
                      <button
                        className={
                          "theme-choice glass " +
                          t.id +
                          (settings.theme === t.id ? " selected" : "")
                        }
                        key={t.id}
                        disabled={!progress.themes.includes(t.id)}
                        onClick={() =>
                          saveSettings({ ...settings, theme: t.id })
                        }
                      >
                        <i />
                        <strong>{t.label}</strong>
                        <small>
                          {progress.themes.includes(t.id)
                            ? settings.theme === t.id
                              ? "使用中"
                              : "解放済み"
                            : `Lv.${t.level}で解放`}
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="notice">
                    <strong>プレイで20〜80 XP · 曲の追加で30 XP</strong>
                    <p>
                      レベルが上がると称号とテーマが解放されます。スコア判定は全員共通です。曲追加XPは同一音源1回、ログイン時は1日5曲まで。
                    </p>
                  </div>
                  <h2>最近の記録</h2>
                  {localRecords.slice(0, 8).map((r) => (
                    <div className="history-row glass" key={r.id}>
                      <div>
                        <strong>{r.title}</strong>
                        <small>
                          {
                            DIFFICULTIES.find((d) => d.id === r.difficulty)
                              ?.label
                          }{" "}
                          · {r.maxCombo} COMBO
                        </small>
                      </div>
                      <span>{rank(r.accuracy)}</span>
                      <strong>{r.score.toLocaleString()}</strong>
                    </div>
                  ))}
                </section>
              )}
              <footer className="app-footer">
                <img src="/art/offscreen-logo.png" alt="OFFSCREEN" />
                <button onClick={() => setPanel("privacy")}>
                  プライバシー・音源について
                </button>
                <small>OFF MUSIC 2.0</small>
              </footer>
            </main>
            <nav className="bottom-nav glass" aria-label="メインメニュー">
              {(
                [
                  { id: "library", label: "曲", Icon: Music2 },
                  { id: "ranking", label: "ランキング", Icon: Trophy },
                  { id: "profile", label: "マイステージ", Icon: Sparkles },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  className={tab === item.id && !finished ? "active" : ""}
                  onClick={() => {
                    setTab(item.id);
                    setFinished(null);
                    scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <item.Icon size={20} />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}
        <AnimatePresence>
          {panel && (
            <Sheet
              title={
                {
                  settings: "サウンド・プレイ設定",
                  calibrate: "タイミング補正",
                  account: "アカウント",
                  upload: "曲を追加",
                  song: selected?.title || "曲",
                  login: "プレイ方法を選択",
                  privacy: "プライバシー・音源",
                }[panel]
              }
              onClose={() => {
                setPanel(null);
                gateSong.current = null;
              }}
            >
              {panel === "settings" && (
                <div className="settings-content">
                  <label className="range-label">
                    楽曲音量{" "}
                    <strong>{Math.round(settings.music * 100)}%</strong>
                    <input
                      aria-label="楽曲音量"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.music}
                      onChange={(e) =>
                        setSettings({ ...settings, music: +e.target.value })
                      }
                      onPointerUp={() => saveSettings(settings)}
                    />
                  </label>
                  <label className="range-label">
                    タップ音・演出音{" "}
                    <strong>{Math.round(settings.effects * 100)}%</strong>
                    <input
                      aria-label="タップ音量"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.effects}
                      onChange={(e) =>
                        setSettings({ ...settings, effects: +e.target.value })
                      }
                      onPointerUp={() => saveSettings(settings)}
                    />
                  </label>
                  <label className="range-label">
                    ロビーBGM{" "}
                    <strong>
                      {Math.round((settings.ambient ?? 0) * 100)}%
                    </strong>
                    <input
                      aria-label="BGM音量"
                      type="range"
                      min="0"
                      max="0.2"
                      step="0.005"
                      value={settings.ambient ?? 0}
                      onChange={(e) =>
                        setSettings({ ...settings, ambient: +e.target.value })
                      }
                      onPointerUp={() => saveSettings(settings)}
                    />
                  </label>
                  <button
                    className="setting-link"
                    onClick={() => setPanel("calibrate")}
                  >
                    <Headphones size={19} />
                    <span>
                      <strong>音でタイミングを測る</strong>
                      <small>
                        本体スピーカー向け · 現在 {settings.offset} ms
                      </small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                  <label className="range-label">
                    判定補正{" "}
                    <strong>
                      {settings.offset > 0 ? "+" : ""}
                      {settings.offset} ms
                    </strong>
                    <input
                      aria-label="判定補正"
                      type="range"
                      min="-250"
                      max="250"
                      step="1"
                      value={settings.offset}
                      onChange={(e) =>
                        setSettings({ ...settings, offset: +e.target.value })
                      }
                      onPointerUp={() => saveSettings(settings)}
                    />
                  </label>
                  <small className="muted">
                    LATEが続く場合は＋、EARLYが続く場合は−へ。音符は音声の出力時計に同期します。
                  </small>
                  <label>
                    練習速度
                    <select
                      value={settings.speed}
                      onChange={(e) =>
                        saveSettings({ ...settings, speed: +e.target.value })
                      }
                    >
                      <option value="0.75">0.75×</option>
                      <option value="1">1.00× · ランキング対象</option>
                      <option value="1.25">1.25×</option>
                    </select>
                  </label>
                  <label className="switch-label">
                    振動
                    <input
                      type="checkbox"
                      checked={settings.vibration}
                      onChange={(e) =>
                        saveSettings({
                          ...settings,
                          vibration: e.target.checked,
                        })
                      }
                    />
                  </label>
                  <label className="switch-label">
                    アニメーションを控えめに
                    <input
                      type="checkbox"
                      checked={settings.reducedMotion}
                      onChange={(e) =>
                        saveSettings({
                          ...settings,
                          reducedMotion: e.target.checked,
                        })
                      }
                    />
                  </label>
                  <button
                    className="primary wide"
                    onClick={() => saveSettings(settings)}
                  >
                    設定を保存
                  </button>
                </div>
              )}
              {panel === "calibrate" && (
                <Calibration
                  onSave={(offset) => {
                    saveSettings({
                      ...settings,
                      offset,
                      calibratedAt: Date.now(),
                    });
                    setPanel("settings");
                  }}
                />
              )}
              {(panel === "account" || panel === "login") && (
                <div className="account-content">
                  {user ? (
                    <>
                      <div className="account-detail">
                        <span className="avatar-large">
                          {user.picture ? (
                            <img
                              src={user.picture}
                              alt=""
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Users />
                          )}
                        </span>
                        <h3>{user.name}</h3>
                        <p>
                          Lv.{progress.level} · {progress.title}
                        </p>
                      </div>
                      <div className="notice">
                        <Cloud size={20} />
                        <strong>プレイ・称号・設定をクラウドに保存</strong>
                        <p>グループでは専用の表示名を使います。</p>
                      </div>
                      <button className="quiet wide" onClick={logout}>
                        <LogOut size={16} />
                        ログアウト
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="login-mascot">
                        <Mascot index={2} />
                      </div>
                      <h3>記録をつないで、みんなで遊ぶ</h3>
                      <ul className="login-benefits">
                        <li>
                          <Check size={16} />
                          レベル・称号・自己ベストを保存
                        </li>
                        <li>
                          <Check size={16} />
                          招待グループのリアルタイムランキング
                        </li>
                        <li>
                          <Check size={16} />
                          グループへの曲共有とWorkers AIアレンジ
                        </li>
                      </ul>
                      {clientId ? (
                        <GoogleButton
                          clientId={clientId}
                          onLogin={login}
                          onError={notify}
                        />
                      ) : (
                        <p>
                          Google認証を読み込めませんでした。再読み込みをお試しください。
                        </p>
                      )}
                      <button
                        className="quiet wide"
                        onClick={() => {
                          sessionStorage.setItem("off-guest", "1");
                          setPanel(gateSong.current ? "song" : null);
                          gateSong.current = null;
                          notify("ゲストで遊べます · 記録はこの端末に保存");
                        }}
                      >
                        ログインせずに遊ぶ <ArrowRight size={16} />
                      </button>
                      <small>
                        ゲストでも収録曲のプレイ・曲追加・レベルアップが可能です。記録はこのブラウザだけに保存されます。
                      </small>
                    </>
                  )}
                </div>
              )}
              {panel === "upload" && (
                <div className="upload-content">
                  <p>
                    音の立ち上がりを約3ms刻みで検出し、音域に合わせて3種類の音符を作ります。
                  </p>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="audio/*,video/mp4,video/quicktime"
                    className="hidden-input"
                    aria-label="音源ファイル"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setUploadFile(f);
                        setUploadTitle(f.name.replace(/\.[^.]+$/, ""));
                      }
                    }}
                  />
                  <button
                    className="file-drop"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload size={28} />
                    <strong>{uploadFile?.name || "音源を選ぶ"}</strong>
                    <small>MP3・M4A・WAV・MP4 · 20MB / 10分まで</small>
                  </button>
                  <label>
                    曲名
                    <input
                      maxLength={140}
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    アーティスト
                    <input
                      maxLength={80}
                      value={uploadArtist}
                      onChange={(e) => setUploadArtist(e.target.value)}
                    />
                  </label>
                  <div className="notice">
                    <strong>音源はこの端末に保存されます</strong>
                    <p>
                      グループ共有を選ぶまで音源ファイルはアップロードされません。
                    </p>
                  </div>
                  <button
                    className="primary wide"
                    disabled={!uploadFile || busy}
                    onClick={upload}
                  >
                    <AudioLines size={18} />
                    解析して追加
                  </button>
                </div>
              )}
              {panel === "song" && selected && (
                <div className="song-sheet">
                  <div className="song-sheet-hero">
                    <div className="song-disc">
                      <Disc3 size={56} />
                    </div>
                    <div>
                      <span className="eyebrow">
                        {selected.groupId
                          ? "GROUP TRACK"
                          : selected.builtin
                            ? "OFF MUSIC ORIGINAL"
                            : "MY AUDIO"}
                      </span>
                      <h3>{selected.title}</h3>
                      <p>{selected.artist}</p>
                      <small>
                        {time(selected.duration)} · {selected.bpm} BPM ·{" "}
                        {selected.analysis.peaks.length} 発音候補
                      </small>
                    </div>
                  </div>
                  <Wave analysis={selected.analysis} />
                  <div className="difficulty-options">
                    {DIFFICULTIES.map((d) => (
                      <button
                        className={difficulty === d.id ? "active" : ""}
                        key={d.id}
                        onClick={() => setDifficulty(d.id)}
                      >
                        <small>{d.label}</small>
                        <strong>{d.level}</strong>
                        <span>
                          {selected
                            ? createChart(
                                selected.analysis,
                                d.id,
                                selected.arrangement,
                              ).length
                            : 0}
                          音符
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="pad-legend">
                    {HIT_KINDS.map((k) => (
                      <span key={k} style={{ color: HIT_STYLE[k].color }}>
                        {HIT_STYLE[k].symbol} {HIT_STYLE[k].label}
                      </span>
                    ))}
                  </div>
                  <div className="play-summary">
                    <span>
                      {chart.length} NOTES · {settings.speed}×
                    </span>
                    <span>
                      {selected.arrangement || settings.speed !== 1
                        ? "練習モード"
                        : groupId &&
                            (selected.builtin || selected.groupId === groupId)
                          ? "グループ順位に反映"
                          : "個人記録"}
                    </span>
                  </div>
                  <button
                    className="primary play-button wide"
                    disabled={busy}
                    onClick={() => play()}
                  >
                    <Play size={20} fill="currentColor" />
                    プレイ <ArrowRight size={18} />
                  </button>
                  <p className="landscape-hint">
                    スマホを横にしてプレイ · 低音 F/J · 中音 G/H · 高音 D/K
                  </p>
                  {user && groups.length > 0 && (
                    <label>
                      記録するグループ
                      <select
                        value={groupId}
                        onChange={(e) => setGroupId(e.target.value)}
                      >
                        <option value="">個人のみ</option>
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <details className="advanced">
                    <summary>
                      <Sparkles size={16} />
                      AIアレンジ・共有
                    </summary>
                    <p>
                      Workers
                      AIが音符の密度を調整します。発音時刻は動かしません。アレンジは練習として記録されます。
                    </p>
                    <div className="form-row">
                      <select
                        aria-label="AIスタイル"
                        value={aiStyle}
                        onChange={(e) =>
                          setAiStyle(e.target.value as typeof aiStyle)
                        }
                      >
                        <option value="balanced">バランス</option>
                        <option value="flow">ゆったり</option>
                        <option value="challenge">チャレンジ</option>
                      </select>
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={arrange}
                      >
                        <Sparkles size={16} />
                        AIでアレンジ
                      </button>
                    </div>
                    {selected.arrangement && (
                      <button
                        className="quiet"
                        onClick={() =>
                          setSelected({ ...selected, arrangement: undefined })
                        }
                      >
                        標準譜面に戻す
                      </button>
                    )}
                    {!selected.builtin &&
                      !selected.groupId &&
                      user &&
                      groups.length > 0 && (
                        <div className="share-song">
                          <h4>グループに音源を共有</h4>
                          <select
                            aria-label="音源の共有先"
                            value={shareGroup}
                            onChange={(e) => setShareGroup(e.target.value)}
                          >
                            <option value="">共有先を選択</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={rights}
                              onChange={(e) => setRights(e.target.checked)}
                            />
                            この音源をグループ内で配信・再配布できる権利があります
                          </label>
                          <button
                            className="quiet wide"
                            disabled={busy || !shareGroup || !rights}
                            onClick={shareSong}
                          >
                            <Share2 size={16} />
                            音源と譜面を共有
                          </button>
                          <small>
                            音源はCloudflareに保存され、参加者だけが再生できます。
                          </small>
                        </div>
                      )}
                  </details>
                </div>
              )}
              {panel === "privacy" && (
                <div className="privacy-content">
                  <h3>データの保存先</h3>
                  <p>
                    ゲストの曲・スコア・設定は端末のIndexedDBに保存されます。Googleログイン後は基本プロフィール、設定、プレイ結果、成長記録をCloudflare
                    D1へ保存します。
                  </p>
                  <p>
                    グループへの曲共有を選んだ音源はCloudflare
                    R2に保存され、Googleログイン済みの参加者だけが再生できます。グループ内では表示名・レベル・スコアを共有します。招待リンクは信頼できる人だけに渡してください。
                  </p>
                  <p>
                    ランキングは標準譜面・1倍速の打鍵記録をサーバーで再判定します。
                  </p>
                  <h3>音源・キャラクター</h3>
                  <p>
                    「Play &
                    Pay」とOFFSCREEN画像は権利者の許可のもとに使用しています。「Glass
                    Circuit」はこのゲーム用にSunoの既存Proプランで生成したインスト曲です。画像・音源はソースコードのMITライセンスに含まれません。
                  </p>
                  <p>
                    タップ音・演出音は独自の合成音です。他社のロゴ、音源、キャラクターやゲーム画面は使用していません。
                  </p>
                  <h3>技術・問い合わせ</h3>
                  <p>
                    <a
                      href="https://github.com/fuuuuuuma/off-music"
                      target="_blank"
                      rel="noreferrer"
                    >
                      ソースコードと技術選定・調査記録
                    </a>
                  </p>
                </div>
              )}
            </Sheet>
          )}
        </AnimatePresence>
        {busy && (
          <div className="busy-overlay" role="status">
            <div className="glass">
              <LoaderCircle size={30} className="spin" />
              <strong>{busyText}</strong>
              {uploadProgress > 0 && (
                <progress value={uploadProgress} max="1" />
              )}
            </div>
          </div>
        )}
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast glass"
              role="status"
              key={toast.text}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
            >
              <Check size={17} />
              <span>{toast.text}</span>
              {toast.undo && (
                <button
                  onClick={() => {
                    toast.undo?.();
                    setToast(null);
                  }}
                >
                  元に戻す
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
