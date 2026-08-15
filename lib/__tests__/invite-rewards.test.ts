import { describe, expect, it } from "vitest";
import {
  INVITE_REWARD_DEFAULTS,
  INVITE_REWARD_MAX,
  isInviteRewardEnabled,
  normalizeInviteRewardConfig,
} from "@/lib/invite-rewards";

describe("invite rewards config", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(normalizeInviteRewardConfig(null)).toEqual({ ...INVITE_REWARD_DEFAULTS });
    expect(normalizeInviteRewardConfig({ inviterCredits: "not-a-number" })).toEqual({
      inviterCredits: INVITE_REWARD_DEFAULTS.inviterCredits,
      inviteeCredits: INVITE_REWARD_DEFAULTS.inviteeCredits,
    });
  });

  it("parses valid published config values", () => {
    expect(normalizeInviteRewardConfig({ inviterCredits: 200, inviteeCredits: 0 })).toEqual({
      inviterCredits: 200,
      inviteeCredits: 0,
    });
  });

  it("clamps out-of-range values", () => {
    expect(normalizeInviteRewardConfig({ inviterCredits: -5, inviteeCredits: 999999 })).toEqual({
      inviterCredits: 0,
      inviteeCredits: INVITE_REWARD_MAX,
    });
  });

  it("reports whether any side of the reward is enabled", () => {
    expect(isInviteRewardEnabled({ inviterCredits: 0, inviteeCredits: 0 })).toBe(false);
    expect(isInviteRewardEnabled({ inviterCredits: 0, inviteeCredits: 50 })).toBe(true);
    expect(isInviteRewardEnabled({ inviterCredits: 100, inviteeCredits: 0 })).toBe(true);
  });
});
