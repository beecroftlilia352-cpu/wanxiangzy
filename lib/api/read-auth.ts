type SupabaseReadAuthClient = {
  auth: {
    getClaims: () => Promise<{
      data: { claims: { sub?: string; email?: string | null } | null } | null;
      error: { message?: string } | null;
    }>;
    getUser: () => Promise<{
      data: { user: { id?: string; email?: string | null } | null };
      error?: { message?: string } | null;
    }>;
  };
};

export type ReadAuthenticatedUser = {
  id: string;
  email: string | null;
  source: "claims" | "user";
};

type GetReadAuthenticatedUserOptions = {
  claimsTimeoutMs?: number;
  userFallbackTimeoutMs?: number;
  fallbackToUser?: boolean;
  onWarning?: (label: string, message: string) => void;
};

const DEFAULT_CLAIMS_TIMEOUT_MS = 1_500;
const DEFAULT_USER_FALLBACK_TIMEOUT_MS = 3_000;

export async function getReadAuthenticatedUser(
  supabase: SupabaseReadAuthClient,
  options: GetReadAuthenticatedUserOptions = {}
): Promise<ReadAuthenticatedUser | null> {
  const {
    claimsTimeoutMs = DEFAULT_CLAIMS_TIMEOUT_MS,
    userFallbackTimeoutMs = DEFAULT_USER_FALLBACK_TIMEOUT_MS,
    fallbackToUser = true,
    onWarning,
  } = options;

  const claimsResult = await withTimeout(
    supabase.auth.getClaims(),
    claimsTimeoutMs,
    "auth getClaims timeout"
  ).catch((error) => {
    onWarning?.("auth getClaims unavailable", toLogMessage(error));
    return null;
  });

  const claims = claimsResult?.data?.claims;
  if (claims?.sub) {
    return {
      id: claims.sub,
      email: claims.email ?? null,
      source: "claims",
    };
  }

  if (claimsResult?.error) {
    onWarning?.("auth getClaims rejected", claimsResult.error.message || "unknown auth claims error");
  }

  if (!fallbackToUser) return null;

  const userResult = await withTimeout(
    supabase.auth.getUser(),
    userFallbackTimeoutMs,
    "auth getUser fallback timeout"
  ).catch((error) => {
    onWarning?.("auth getUser fallback unavailable", toLogMessage(error));
    return null;
  });

  const user = userResult?.data?.user;
  if (!user?.id) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    source: "user",
  };
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

function toLogMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
