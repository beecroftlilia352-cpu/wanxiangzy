import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("auth form transport security", () => {
  it.each([
    "features/login/LoginFormView.tsx",
    "features/login/SignUpFormView.tsx",
    "features/login/ForgotPasswordView.tsx",
  ])("never falls back to a GET form before hydration: %s", (path) => {
    const source = read(path);

    expect(source).toContain('<form method="post" onSubmit={onSubmit}');
    expect(source).not.toMatch(/<form(?![^>]*method="post")[^>]*onSubmit=/);
  });

  it("removes sensitive fields from legacy or prematurely submitted login URLs", () => {
    const page = read("app/(home)/login/page.tsx");

    expect(page).toContain('["email", "password", "newPassword"]');
    expect(page).toContain("url.searchParams.delete(key)");
    expect(page).toContain("window.history.replaceState");
  });
});
