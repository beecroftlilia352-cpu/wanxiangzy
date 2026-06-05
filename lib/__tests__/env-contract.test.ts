import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getConfiguredProcessorSecrets,
  getConfiguredPublicBaseUrl,
  validateEnv,
} from "@/lib/env";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";

const ORIGINAL_ENV = { ...process.env };

describe("environment contract", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, NODE_ENV: "test" };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
    delete process.env.APP_URL;
    delete process.env.URL;
    delete process.env.LAOZHANG_API_KEY;
    delete process.env.LAOZHANG_SEEDANCE_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reports production-required variables as errors only in production", () => {
    const developmentIssues = validateEnv({ nodeEnv: "development" });
    expect(developmentIssues.some((issue) => issue.severity === "error")).toBe(false);

    const productionIssues = validateEnv({ nodeEnv: "production" });
    expect(productionIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "NEXT_PUBLIC_APP_URL",
          category: "production-required",
          severity: "error",
        }),
      ])
    );
  });

  it("prefers NEXT_PUBLIC_APP_URL for public base URLs", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/path?ignored=1";
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example.com";

    expect(getConfiguredPublicBaseUrl()).toBe("https://app.example.com");
  });

  it("does not use fallback public URL variables in production", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example.com";

    expect(getConfiguredPublicBaseUrl({ nodeEnv: "production" })).toBeUndefined();
  });

  it("requires NEXT_PUBLIC_APP_URL instead of trusting forwarded headers in production", () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    const request = new Request("https://internal.example.com/api", {
      headers: {
        "x-forwarded-host": "attacker.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(() => getPublicBaseUrlFromRequest(request)).toThrow("NEXT_PUBLIC_APP_URL");
  });

  it("uses forwarded headers only as a non-production fallback", () => {
    const request = new Request("http://localhost:3000/api", {
      headers: {
        "x-forwarded-host": "preview.example.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(getPublicBaseUrlFromRequest(request)).toBe("https://preview.example.com");
  });

  it("rejects placeholder and weak processor secrets in production", () => {
    expect(
      getConfiguredProcessorSecrets(
        [{ name: "JOB_PROCESSOR_SECRET", value: "change-me" }],
        "Generation job processor",
        { nodeEnv: "production" }
      )
    ).toMatchObject({ ok: false });

    expect(
      getConfiguredProcessorSecrets(
        [{ name: "JOB_PROCESSOR_SECRET", value: "short-secret" }],
        "Generation job processor",
        { nodeEnv: "production" }
      )
    ).toMatchObject({ ok: false });
  });

  it("accepts a strong fallback processor secret while ignoring weak defaults", () => {
    const strongSecret = "0123456789abcdef0123456789abcdef";

    expect(
      getConfiguredProcessorSecrets(
        [
          { name: "JOB_PROCESSOR_SECRET", value: "change-me" },
          { name: "CRON_SECRET", value: strongSecret },
        ],
        "Generation job processor",
        { nodeEnv: "production" }
      )
    ).toEqual({ ok: true, secrets: [strongSecret] });
  });

  it("allows the shared LaoZhang key as the Seedance video fallback", () => {
    process.env.LAOZHANG_API_KEY = "shared-laozhang-key";

    expect(validateEnv({ nodeEnv: "development" })).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "LAOZHANG_SEEDANCE_API_KEY or LAOZHANG_API_KEY" }),
      ])
    );
  });
});
