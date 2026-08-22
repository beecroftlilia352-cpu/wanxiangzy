import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const taskRailSource = readFileSync(
  resolve(process.cwd(), "components/studio/StudioTaskRail.tsx"),
  "utf8",
);
const studioStyles = readFileSync(
  resolve(process.cwd(), "app/styles/studio.css"),
  "utf8",
);

describe("studio task rail visual contract", () => {
  it("renders compact task thumbnails edge to edge", () => {
    expect(taskRailSource).toContain(
      'expanded ? "space-y-2 px-3 py-3" : "space-y-1.5 px-1.5 py-1.5"',
    );
    expect(taskRailSource).toContain(
      "studio-task-card studio-task-card--compact group relative flex aspect-square w-full items-center justify-center p-1 text-left",
    );
    expect(taskRailSource).toContain(
      'className="relative z-[1] h-full w-full object-cover"',
    );
    expect(studioStyles).toMatch(/\.studio-task-card--compact\s*\{[\s\S]*?border:\s*0;/);
    expect(studioStyles).toMatch(/\.studio-task-thumb--compact\s*\{[\s\S]*?border:\s*0;/);
  });
});
