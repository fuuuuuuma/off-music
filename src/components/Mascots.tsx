import { useId, type CSSProperties } from "react";
const boxes = [
  "0 0 640 700",
  "640 0 640 700",
  "0 700 640 580",
  "640 700 640 580",
];
export function Mascot({
  index = 0,
  className = "",
}: {
  index?: number;
  className?: string;
}) {
  const clip = useId(),
    [x, y, w, h] = boxes[index].split(" ");
  return (
    <svg
      className={"mascot " + className}
      viewBox={boxes[index]}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <rect x={x} y={y} width={w} height={h} />
        </clipPath>
      </defs>
      <image
        clipPath={"url(#" + clip + ")"}
        href="/art/offscreen-sprites.png"
        width="1280"
        height="1280"
      />
    </svg>
  );
}
export function Mascots({
  bpm = 120,
  mood = "",
  beat = 0,
}: {
  bpm?: number;
  mood?: string;
  beat?: number;
}) {
  return (
    <div
      className={"mascots " + mood}
      style={{ "--beat": 60 / bpm + "s" } as CSSProperties}
      data-beat={beat % 2}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          className="mascot-dancer"
          key={i}
          style={{ animationDelay: -i * 0.13 + "s" }}
        >
          <Mascot index={i} />
          <i className="mascot-shadow" />
        </div>
      ))}
    </div>
  );
}
