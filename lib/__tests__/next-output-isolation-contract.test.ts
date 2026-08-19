import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Next.js output isolation", () => {
  it("keeps development artifacts outside the production build directory", () => {
    const config = read("next.config.ts");
    expect(config).toContain(
      'distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next"',
    );
    expect(read(".gitignore")).toContain(".next-dev/");
    expect(read("eslint.config.mjs")).toContain('".next-dev/**"');
  });
});
