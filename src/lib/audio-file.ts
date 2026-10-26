// Explicit extensions avoid iOS treating the audio/* picker as a movie picker.
export const AUDIO_FILE_ACCEPT =
  ".mp3,.m4a,.m4b,.wav,.aac,.flac,.ogg,.oga,.opus,.aif,.aiff,.mp4,.mov,.webm";
export const MAX_AUDIO_FILE_BYTES = 20 * 1024 * 1024;

export function audioFileError(file: Pick<File, "size">): string | null {
  if (file.size === 0) return "空のファイルです。音源を選び直してください";
  if (file.size > MAX_AUDIO_FILE_BYTES) return "音源は20MB以下にしてください";
  // File.type can be empty or generic for iCloud/Files. Decode the bytes later.
  return null;
}
