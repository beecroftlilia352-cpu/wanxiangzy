const STRIPE_CREDIT_GRANT_FLAG = "STRIPE_ENABLE_CREDIT_GRANTS";

export function stripeCreditGrantsEnabled(env: Record<string, string | undefined> = process.env) {
  return env[STRIPE_CREDIT_GRANT_FLAG] === "true";
}

export function stripeOrderCredits(catalogCredits: number, env: Record<string, string | undefined> = process.env) {
  if (!stripeCreditGrantsEnabled(env)) return 0;
  return Math.max(0, Math.floor(Number(catalogCredits) || 0));
}
