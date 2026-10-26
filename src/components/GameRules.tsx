import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  MoveUp,
  Pointer,
  Hand,
} from "lucide-react";
import { stagePoints } from "../lib/stage-chart.ts";
import {
  STAGE_GRADES,
  STAGE_MAX_SCORE,
  STAGE_WINDOWS,
} from "../lib/stage-rules.ts";
import type { StageNote } from "../types.ts";

const operations = [
  {
    id: "tap",
    label: "タップ",
    Icon: Pointer,
    text: "青い音符と同じ横位置を、紫の帯に来たら押す。",
  },
  {
    id: "hold",
    label: "長押し・スライド",
    Icon: Hand,
    text: "緑の帯を押したまま追い、終わりで離す。",
  },
  {
    id: "flick",
    label: "フリック",
    Icon: MoveUp,
    text: "ピンクの矢印に合わせて、指を素早く動かす。",
  },
  {
    id: "accent",
    label: "同時押し・金色",
    Icon: ArrowUpRight,
    text: "横に並んだ音符は2本指。金色は同じ操作で得点2倍。",
  },
];
export function GameRules({
  compact = false,
  notes,
  onMore,
  onBack,
}: {
  compact?: boolean;
  notes?: StageNote[];
  onMore?: () => void;
  onBack?: () => void;
}) {
  const points = notes ? stagePoints(notes) : [];
  const weight = notes
    ? points.reduce((sum, p) => sum + (notes[p.note].accent ? 2 : 1), 0)
    : 0;
  const perfect = weight ? STAGE_MAX_SCORE / weight : 0;
  return (
    <section
      className={"game-rules" + (compact ? " compact" : "")}
      aria-label="遊び方と得点ルール"
    >
      {onBack && (
        <button className="quiet rules-back" onClick={onBack}>
          <ArrowLeft size={16} />
          曲の設定に戻る
        </button>
      )}
      <div className="rules-heading">
        <BookOpen size={18} />
        <h3>いつ押す？ どう得点する？</h3>
      </div>
      <p className="rules-lead">
        紫の帯を目安に、音符と同じ横位置をタッチ。線ぴったりでなくても反応します。
      </p>
      <div className="rules-operations">
        {operations.map(({ id, label, Icon, text }) => (
          <div className={"rule-operation rule-" + id} key={id}>
            <span className="rule-note" aria-hidden="true">
              <Icon size={17} />
            </span>
            <div>
              <strong>{label}</strong>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="rules-quick-score">
        <strong>タイミングが合うほど高得点</strong>
        <span>
          {(["perfect", "great", "good", "bad"] as const)
            .map(
              (grade) =>
                `${grade.toUpperCase()} ${STAGE_GRADES[grade].ratio * 100}%`,
            )
            .join(" · ")}
        </span>
      </p>
      {compact ? (
        <>
          <p className="rules-tolerance">
            早押し・遅押しとも最大±{Math.round(STAGE_WINDOWS.bad * 1000)}
            msまで得点。PERFECT / GREATでコンボ継続。
          </p>
          <button className="quiet wide" onClick={onMore}>
            <BookOpen size={16} />
            ルール・得点を詳しく見る
          </button>
        </>
      ) : (
        <>
          <div className="rules-timing">
            <span>早い FAST</span>
            <strong>±{STAGE_WINDOWS.bad.toFixed(2)}秒</strong>
            <span>遅い LATE</span>
            <p>
              音符の時刻の前後が得点対象。押す横位置にも余裕があります。帯の少し上や下でも操作できます。
            </p>
          </div>
          <h3>判定と得点</h3>
          <table className="rules-table">
            <thead>
              <tr>
                <th>判定</th>
                <th>ズレの目安</th>
                <th>得点率</th>
                <th>コンボ</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(STAGE_GRADES) as (keyof typeof STAGE_GRADES)[]).map(
                (grade) => (
                  <tr key={grade}>
                    <th>{grade.toUpperCase()}</th>
                    <td>
                      {grade === "miss"
                        ? "範囲外・未操作"
                        : `±${Math.round(STAGE_WINDOWS[grade] * 1000)}ms以内`}
                    </td>
                    <td>{STAGE_GRADES[grade].ratio * 100}%</td>
                    <td>{STAGE_GRADES[grade].combo ? "+1" : "途切れる"}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <p className="rules-caption">
            近い判定から順に適用。100msのズレならGREAT、200msならGOODです。FAST
            / LATEには実際のズレを表示します。
          </p>
          <div className="rules-score-example">
            <strong>1曲の満点は100万点</strong>
            <p>
              1回の基準点は「100万 ÷
              曲全体の判定の重み」。その点数に判定の得点率を掛けて加算します。金色は重み2、ほかは1です。
            </p>
            {weight > 0 && (
              <p className="rules-example">
                選択中の譜面：通常のPERFECT 約
                {Math.round(perfect).toLocaleString()}点 / GREAT 約
                {Math.round(
                  perfect * STAGE_GRADES.great.ratio,
                ).toLocaleString()}
                点 / 金色PERFECT 約{Math.round(perfect * 2).toLocaleString()}点
              </p>
            )}
            <p>
              長押しは、押し始め・途中の保持・終わりの操作でそれぞれ加点。途中は帯と指の横位置が合えばPERFECTです。終わりが矢印なら、離す代わりに上へフリックしてください。
            </p>
          </div>
          <h3>得点にならないとき</h3>
          <p>
            音符から大きく離れた横位置や、時刻の範囲外では加点されません。フリックは押すだけでは得点になりません。矢印と逆方向に動かすと、PERFECT相当でもGREATになります。空振りでも光と小さな操作音で反応します。
          </p>
          <h3>コンボ・ライフ・経験値</h3>
          <p>
            PERFECT / GREATの連続でコンボが増え、GOOD / BAD /
            MISSで途切れます。ライフは前2つで回復、後3つで減少。0になるとRECOVERYで最後まで練習できますが、クリアにはなりません。
          </p>
          <p>
            スコアとは別に、最後までプレイすると20〜80XP。得点とフルコンボのボーナスで増えます。レベルに応じてテーマや称号、Lv.5でEXPERT、Lv.8でMASTERを解放。ログインで経験値を保存し、公開曲の通常プレイをランキングに反映できます。
          </p>
          <h3>PCの操作</h3>
          <p>
            A / S / D / J / K /
            Lで左から6つの位置を操作。長押しはキーを保持し、終わりで離します。フリックはShift＋対応キー。曲線のスライドはマウスやタッチでも追えます。
          </p>
        </>
      )}
    </section>
  );
}
