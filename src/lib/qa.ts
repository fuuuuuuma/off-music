// Explicit, opt-in developer QA session. No game/upload/progression writes are made.
export const QA_MODE = new URLSearchParams(location.search).get("qa") === "1";
