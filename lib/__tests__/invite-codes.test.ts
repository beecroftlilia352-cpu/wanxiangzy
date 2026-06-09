import { describe, expect, it } from "vitest";
import { generateInviteCode, mapInviteCodeError, normalizeInviteCode } from "@/lib/invite-codes";

describe("invite codes", () => {
  it("normalizes user-entered invite codes", () => {
    expect(normalizeInviteCode(" vw-abc 123 ")).toBe("VWABC123");
    expect(normalizeInviteCode(null)).toBe("");
  });

  it("generates uppercase readable codes with a prefix", () => {
    const code = generateInviteCode({ prefix: "qa", randomLength: 8 });
    expect(code).toMatch(/^QA[A-Z0-9]{8}$/);
  });

  it("maps database invite errors to user-facing copy", () => {
    expect(mapInviteCodeError("exhausted_invite_code")).toBe("邀请码已被使用");
    expect(mapInviteCodeError("not_started_invite_code")).toBe("邀请码尚未生效");
    expect(mapInviteCodeError("expired_invite_code")).toBe("邀请码已过期");
  });
});
