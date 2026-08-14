import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  consumeAuthorizationCode,
  getOidcDiscoveryDocument,
  issueAccessToken,
  issueAuthorizationCode,
  issueIdToken,
  verifyAccessToken,
  verifyPkce,
} from "@/lib/oidc/provider";

describe("OIDC provider", () => {
  beforeAll(() => {
    process.env.OIDC_JWT_SECRET = "test-secret";
    process.env.OIDC_CLIENT_ID = "librechat-client";
    process.env.OIDC_CLIENT_SECRET = "test-client-secret";
  });

  it("issues and consumes authorization codes with user claims", () => {
    const claims = { sub: "user-123", email: "a@b.com", name: "Alice" };
    const code = issueAuthorizationCode(claims);
    const consumed = consumeAuthorizationCode(code);
    expect(consumed).toMatchObject({ sub: "user-123", email: "a@b.com", name: "Alice" });
  });

  it("rejects replay of the same authorization code", () => {
    const code = issueAuthorizationCode({ sub: "u1", email: "u1@b.com" });
    expect(consumeAuthorizationCode(code)).not.toBeNull();
    expect(consumeAuthorizationCode(code)).toBeNull();
  });

  it("rejects tampered codes", () => {
    const code = issueAuthorizationCode({ sub: "u1", email: "u1@b.com" });
    const [payload, signature] = code.split(".");
    const tampered = `${payload}.${"a".repeat(signature.length)}`;
    expect(consumeAuthorizationCode(tampered)).toBeNull();
  });

  it("binds PKCE challenge into the code and verifies S256", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const code = issueAuthorizationCode({ sub: "u1", email: "u1@b.com" }, { codeChallenge: challenge, codeChallengeMethod: "S256" });
    const bundle = consumeAuthorizationCode(code);
    expect(bundle?.codeChallenge).toBe(challenge);
    expect(verifyPkce(verifier, bundle?.codeChallenge, bundle?.codeChallengeMethod)).toBe(true);
    expect(verifyPkce("wrong-verifier", bundle?.codeChallenge, bundle?.codeChallengeMethod)).toBe(false);
  });

  it("signs id_token with HS256 and audience", () => {
    const token = issueIdToken({ sub: "u1", email: "u1@b.com" }, "librechat-client");
    const [header, payload] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "HS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims).toMatchObject({ sub: "u1", aud: "librechat-client", email: "u1@b.com" });
  });

  it("issues and verifies access tokens for userinfo", () => {
    const token = issueAccessToken({ sub: "u1", email: "u1@b.com" }, "aud");
    expect(verifyAccessToken(token)).toMatchObject({ sub: "u1", email: "u1@b.com" });
    expect(verifyAccessToken("bogus.token.value")).toBeNull();
  });

  it("exposes a discovery document with required endpoints", () => {
    const doc = getOidcDiscoveryDocument();
    expect(doc.authorization_endpoint).toContain("/api/oidc/authorize");
    expect(doc.token_endpoint).toContain("/api/oidc/token");
    expect(doc.userinfo_endpoint).toContain("/api/oidc/userinfo");
    expect(doc.id_token_signing_alg_values_supported).toContain("HS256");
  });
});
