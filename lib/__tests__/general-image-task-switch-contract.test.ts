import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/general-image/GeneralImageExperience.tsx"),
  "utf8",
);

describe("general image running-task switch contract", () => {
  it("keeps the previous frame until split grouping has been restored", () => {
    const handler = source.slice(
      source.indexOf("async function handleRunningTask"),
      source.indexOf("async function handleCompletedTask"),
    );
    const fetchIndex = handler.indexOf("await fetchHistoryApplyDetail");

    expect(fetchIndex).toBeGreaterThan(-1);
    expect(handler.indexOf("setActiveQueueTask(item)")).toBeGreaterThan(fetchIndex);
    expect(handler.indexOf("setResultGroupReferences([])")).toBeGreaterThan(fetchIndex);
    expect(handler).toContain("return true;");
  });

  it("never shows the empty guide while a task snapshot is active", () => {
    expect(source).toContain(
      "!isGenerating && resultUrls.length === 0 && !error && !activeQueueTask",
    );
  });
});
