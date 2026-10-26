import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AudioFilePicker } from "../components/AudioFilePicker.tsx";
import { audioFileError, MAX_AUDIO_FILE_BYTES } from "./audio-file.ts";

describe("スマホからの音源ファイル選択", () => {
  it("実際のinputはMP3を明示し、代替inputにはaccept自体を設定しない", () => {
    const html = renderToStaticMarkup(
      createElement(AudioFilePicker, {
        file: null,
        disabled: false,
        onSelect: () => {},
        onError: () => {},
      }),
    );
    const inputs = html.match(/<input\b[^>]*>/g)!;
    const primary = inputs.find((tag) =>
      tag.includes('aria-label="音源ファイル"'),
    )!;
    const fallback = inputs.find((tag) =>
      tag.includes('aria-label="すべてのファイルから音源を選ぶ"'),
    )!;
    expect(primary).toContain('accept=".mp3,');
    expect(primary).not.toContain("*");
    expect(fallback).not.toMatch(/\saccept=/);
  });
  it.each(["", "application/octet-stream", "audio/mpeg"])(
    "MIMEが%sでもMP3の選択を拒否せず、内容のデコードで確認",
    (type) => {
      const file = { name: "歌詞付き.MP3", type, size: 6600000 };
      expect(audioFileError(file)).toBeNull();
    },
  );
  it("20MiBの境界を許可し、超えたファイルは解析前に止める", () => {
    expect(audioFileError({ size: MAX_AUDIO_FILE_BYTES })).toBeNull();
    expect(audioFileError({ size: MAX_AUDIO_FILE_BYTES + 1 })).toContain(
      "20MB",
    );
  });
  it("空のファイルを解析せず選び直しを案内", () => {
    expect(audioFileError({ size: 0 })).toContain("空のファイル");
  });
});
