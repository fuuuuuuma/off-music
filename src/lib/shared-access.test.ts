import { describe, it, expect } from "vitest";
import { SharedAccess } from "./shared-access.ts";
import { COMMUNITY_ID } from "./community.ts";
const song = { id: "shared-vocal", groupId: COMMUNITY_ID };
describe("公開曲の撤回と画面に残った参照", () => {
  it("別ユーザーは公開直後に利用でき、非公開・再公開・削除へ追従する", () => {
    const access = new SharedAccess();
    access.updatePublic([song]);
    expect(access.permits(song)).toBe(true);
    access.updatePublic([]);
    expect(access.permits(song)).toBe(false);
    access.updatePublic([song]);
    expect(access.permits(song)).toBe(true);
    access.updatePublic([]);
    expect(access.permits(song)).toBe(false);
  });
  it("解析やデコードを待つ間に公開終了した古い曲を再表示しない", async () => {
    const access = new SharedAccess();
    access.updatePublic([song]);
    const pending = Promise.resolve({ ...song, analysisLoaded: true });
    access.updatePublic([]);
    expect(access.permits(await pending)).toBe(false);
  });
  it("本人の非公開曲は利用できるが、削除・ログアウト後は古い所有フラグで許可しない", () => {
    const access = new SharedAccess();
    access.updatePublic([]);
    access.updateOwned([{ ...song, visibility: "private" }]);
    expect(access.permits(song)).toBe(true);
    access.updateOwned([{ ...song, visibility: "deleted" }]);
    expect(access.permits(song)).toBe(false);
    access.updateOwned([{ ...song, visibility: "private" }]);
    expect(access.permits(song)).toBe(true);
    access.updateOwned([]);
    const cached = { ...song, owned: true };
    expect(access.permits(cached)).toBe(false);
  });
  it("アップロード完了が公開一覧の更新より先でも本人はすぐ利用できる", () => {
    const access = new SharedAccess();
    access.updatePublic([]);
    access.updateOwned([{ ...song, visibility: "public" }]);
    expect(access.permits(song)).toBe(true);
  });
  it("端末内の曲・収録曲・既存の限定共有は全体公開の撤回で消さない", () => {
    const access = new SharedAccess();
    access.updatePublic([]);
    for (const reference of [
      null,
      { id: "local" },
      { id: "play-pay" },
      { id: "legacy", groupId: "legacy-group" },
    ])
      expect(access.permits(reference)).toBe(true);
  });
});
