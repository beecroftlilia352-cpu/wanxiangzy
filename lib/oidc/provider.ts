import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// 轻量 OIDC Provider：为 LibreChat 提供基于 Supabase 会话的单点登录。
// 设计要点：
// - 无状态授权码：HMAC 签名的短期 payload，无需共享存储（多实例安全）
// - id_token 使用 HS256（与 LibreChat 的 client_secret 对称验证）
// - 一次性使用：内存集合防重放（单实例内有效，配合 60s 过期足够）

const ISSUER = process.env.NEXT_PUBLIC_APP_URL || "https://pixel-diffusion.com";
const CODE_TTL_SECONDS = 60;
const TOKEN_TTL_SECONDS = 3600;

const usedCodes = new Set<string>();

function secret() {
  const value = process.env.OIDC_JWT_SECRET;
  if (!value) throw new Error("OIDC_JWT_SECRET is not configured");
  return value;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString();
}

function signHmac(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type OidcUserClaims = {
  sub: string;
  email: string;
  name?: string;
};

export type OidcCodePayload = OidcUserClaims & {
  exp: number;
  codeChallenge?: string;
  codeChallengeMethod?: string;
};

export type OidcCodeBundle = OidcUserClaims & {
  codeChallenge?: string;
  codeChallengeMethod?: string;
};

/** 生成授权码：payload + HMAC 签名，60 秒有效；PKCE challenge 绑定在签名内 */
export function issueAuthorizationCode(claims: OidcUserClaims, options: { codeChallenge?: string; codeChallengeMethod?: string } = {}) {
  const payload = base64UrlEncode(JSON.stringify({
    ...claims,
    exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS,
    ...(options.codeChallenge ? {
      codeChallenge: options.codeChallenge,
      codeChallengeMethod: options.codeChallengeMethod || "S256",
    } : {}),
  } satisfies OidcCodePayload));
  return `${payload}.${signHmac(payload)}`;
}

/** 校验并消费授权码，返回用户声明 + PKCE challenge；无效/过期/已用返回 null */
export function consumeAuthorizationCode(code: string): OidcCodeBundle | null {
  if (usedCodes.has(code)) return null;
  const [payload, signature] = code.split(".");
  if (!payload || !signature || !safeEqual(signature, signHmac(payload))) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as OidcCodePayload;
    if (!parsed.sub || !parsed.email || typeof parsed.exp !== "number") return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    usedCodes.add(code);
    // 控制内存：集合超过 1000 条时清理（无需精确）
    if (usedCodes.size > 1000) usedCodes.clear();
    return {
      sub: parsed.sub,
      email: parsed.email,
      name: parsed.name,
      codeChallenge: parsed.codeChallenge,
      codeChallengeMethod: parsed.codeChallengeMethod,
    };
  } catch {
    return null;
  }
}

/** 签发 HS256 id_token（aud = client_id） */
export function issueIdToken(claims: OidcUserClaims, audience: string) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    iss: ISSUER,
    sub: claims.sub,
    aud: audience,
    email: claims.email,
    ...(claims.name ? { name: claims.name } : {}),
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }));
  return `${header}.${payload}.${signHmac(`${header}.${payload}`)}`;
}

/** 签发 access token（供 userinfo 端点使用） */
export function issueAccessToken(claims: OidcUserClaims, audience: string) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    iss: ISSUER,
    sub: claims.sub,
    aud: audience,
    email: claims.email,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  }));
  return `${header}.${payload}.${signHmac(`${header}.${payload}`)}`;
}

export function verifyAccessToken(token: string): OidcUserClaims | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature || !safeEqual(signature, signHmac(`${header}.${payload}`))) return null;
  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { sub?: string; email?: string; name?: string; exp?: number };
    if (!parsed.sub || !parsed.email) return null;
    if (typeof parsed.exp === "number" && parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: parsed.sub, email: parsed.email, name: parsed.name };
  } catch {
    return null;
  }
}

export function getOidcClientId() {
  const value = process.env.OIDC_CLIENT_ID;
  if (!value) throw new Error("OIDC_CLIENT_ID is not configured");
  return value;
}

export function verifyClientCredentials(clientId: unknown, clientSecret: unknown) {
  return (
    typeof clientId === "string" && typeof clientSecret === "string"
    && clientId === process.env.OIDC_CLIENT_ID
    && clientSecret === process.env.OIDC_CLIENT_SECRET
  );
}

export function getOidcDiscoveryDocument() {
  const base = ISSUER.replace(/\/$/, "");
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oidc/authorize`,
    token_endpoint: `${base}/api/oidc/token`,
    userinfo_endpoint: `${base}/api/oidc/userinfo`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    scopes_supported: ["openid", "profile", "email"],
    claims_supported: ["sub", "email", "name"],
    code_challenge_methods_supported: ["S256", "plain"],
  };
}

/** PKCE 校验：LibreChat 使用 S256 */
export function verifyPkce(codeVerifier: unknown, codeChallenge: unknown, codeChallengeMethod: unknown) {
  if (!codeChallenge) return true;
  if (typeof codeVerifier !== "string" || typeof codeChallenge !== "string") return false;
  if (codeChallengeMethod === "S256") {
    const expected = createHash("sha256").update(codeVerifier).digest("base64url");
    return safeEqual(expected, codeChallenge);
  }
  if (codeChallengeMethod === "plain") return codeVerifier === codeChallenge;
  return false;
}

export function randomState() {
  return randomUUID();
}
