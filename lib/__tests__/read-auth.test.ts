import { describe, expect, it } from "vitest";

import { getReadAuthenticatedUser } from "../api/read-auth";

function createAuthClient({
  claims,
  user,
}: {
  claims?: { sub?: string; email?: string | null } | null;
  user?: { id: string; email?: string | null } | null;
}) {
  return {
    auth: {
      getClaims: async () => ({
        data: claims === undefined ? null : { claims },
        error: null,
      }),
      getUser: async () => ({
        data: { user: user ? { ...user } : null },
        error: null,
      }),
    },
  };
}

describe("read auth", () => {
  it("uses verified JWT claims for read endpoints before contacting getUser", async () => {
    let getUserCalls = 0;
    const client = {
      auth: {
        getClaims: async () => ({
          data: { claims: { sub: "user_1", email: "user@example.com" } },
          error: null,
        }),
        getUser: async () => {
          getUserCalls += 1;
          return { data: { user: { id: "fallback" } }, error: null };
        },
      },
    };

    const user = await getReadAuthenticatedUser(client);

    expect(user).toEqual({ id: "user_1", email: "user@example.com", source: "claims" });
    expect(getUserCalls).toBe(0);
  });

  it("falls back to getUser when claims are unavailable", async () => {
    const user = await getReadAuthenticatedUser(
      createAuthClient({
        claims: null,
        user: { id: "user_2", email: "fallback@example.com" },
      })
    );

    expect(user).toEqual({ id: "user_2", email: "fallback@example.com", source: "user" });
  });

  it("can disable getUser fallback for high-frequency reads", async () => {
    const user = await getReadAuthenticatedUser(
      createAuthClient({
        claims: null,
        user: { id: "user_3" },
      }),
      { fallbackToUser: false }
    );

    expect(user).toBeNull();
  });
});
