import { useRef, type ChangeEvent } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { AUDIO_FILE_ACCEPT, audioFileError } from "../lib/audio-file.ts";

export function AudioFilePicker({
  file,
  disabled,
  onSelect,
  onError,
}: {
  file: File | null;
  disabled: boolean;
  onSelect: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const audioInput = useRef<HTMLInputElement>(null),
    allFilesInput = useRef<HTMLInputElement>(null);
  const select = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.files?.[0];
    // Allow selecting the same file again after a read/decoding failure.
    event.currentTarget.value = "";
    if (!next) return;
    const error = audioFileError(next);
    if (error) {
      onSelect(null);
      onError(error);
      return;
    }
    onSelect(next);
  };
  return (
    <div className="audio-file-picker">
      <input
        ref={audioInput}
        type="file"
        accept={AUDIO_FILE_ACCEPT}
        className="hidden-input"
        aria-label="音源ファイル"
        disabled={disabled}
        onChange={select}
      />
      <input
        ref={allFilesInput}
        type="file"
        className="hidden-input"
        aria-label="すべてのファイルから音源を選ぶ"
        disabled={disabled}
        onChange={select}
      />
      <button
        type="button"
        className="file-drop"
        disabled={disabled}
        onClick={() => audioInput.current?.click()}
      >
        <Upload size={28} />
        <strong>{file?.name || "音源を選ぶ"}</strong>
        <small>MP3・M4A・WAV・MP4など · 20MB / 10分まで</small>
      </button>
      <button
        type="button"
        className="quiet file-picker-fallback"
        disabled={disabled}
        onClick={() => allFilesInput.current?.click()}
      >
        <FolderOpen size={16} />
        すべてのファイルから選ぶ
      </button>
      <p className="file-picker-help">
        MP3がグレーで選べないときは、こちらをお使いください。
      </p>
    </div>
  );
}
