export type TutorialDecision = "completed" | "skipped";
export const TUTORIAL_PROGRESS_KEY = "off-music:tutorial:v1";
type ProgressStorage = Pick<Storage, "getItem" | "setItem">;

/** Stable across app releases and separate from score/song resets. */
export function readTutorialProgress(
  storage?: ProgressStorage,
): TutorialDecision | null {
  try {
    const value = JSON.parse(storage?.getItem(TUTORIAL_PROGRESS_KEY) || "null");
    return value?.version === 1 &&
      (value.status === "completed" || value.status === "skipped")
      ? value.status
      : null;
  } catch {
    return null;
  }
}
export function rememberTutorialProgress(
  storage: ProgressStorage | undefined,
  decision: TutorialDecision,
  previous: TutorialDecision | null = null,
): TutorialDecision {
  // Closing a later practice session must not downgrade completion to a skip.
  const status =
    previous === "completed" || readTutorialProgress(storage) === "completed"
      ? "completed"
      : decision;
  try {
    storage?.setItem(
      TUTORIAL_PROGRESS_KEY,
      JSON.stringify({ version: 1, status }),
    );
  } catch {
    /* Still usable for this page visit when browser storage is unavailable. */
  }
  return status;
}
