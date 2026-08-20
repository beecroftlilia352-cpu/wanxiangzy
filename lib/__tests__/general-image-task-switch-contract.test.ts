import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/general-image/GeneralImageExperience.tsx"),
  "utf8",
);
const previewSource = readFileSync(
  resolve(process.cwd(), "components/studio/StudioImagePreviewWorkspace.tsx"),
  "utf8",
);

describe("general image running-task switch contract", () => {
  it("hides the previous frame until running-task grouping has been restored", () => {
    const handler = source.slice(
      source.indexOf("async function handleRunningTask"),
      source.indexOf("async function handleCompletedTask"),
    );
    const fetchIndex = handler.indexOf("await fetchHistoryApplyDetail");
    const applyIndex = handler.indexOf("applyGeneralImageHistoryPayload");

    expect(fetchIndex).toBeGreaterThan(-1);
    expect(handler.indexOf("selectDisplayedTask(item.id)")).toBeLessThan(fetchIndex);
    expect(handler.indexOf("setRestoringTaskId(item.id)")).toBeLessThan(fetchIndex);
    expect(handler.slice(0, fetchIndex)).not.toContain("setActiveQueueTask(item)");
    expect(handler.slice(0, fetchIndex)).not.toContain("setResultUrls(");
    expect(applyIndex).toBeGreaterThan(fetchIndex);
    expect(handler.indexOf("setRestoringTaskId((current)", applyIndex)).toBeGreaterThan(applyIndex);
    expect(handler).toContain("return true;");
  });

  it("uses the same atomic restore gate for completed tasks", () => {
    const handler = source.slice(
      source.indexOf("async function handleCompletedTask"),
      source.indexOf("return (", source.indexOf("async function handleCompletedTask")),
    );
    const fetchIndex = handler.indexOf("await fetchHistoryApplyDetail");

    expect(fetchIndex).toBeGreaterThan(-1);
    expect(handler.indexOf("selectDisplayedTask(item.id)")).toBeLessThan(fetchIndex);
    expect(handler.indexOf("setRestoringTaskId(item.id)")).toBeLessThan(fetchIndex);
    expect(handler.slice(0, fetchIndex)).not.toContain("setActiveQueueTask(item)");
    expect(handler.slice(0, fetchIndex)).not.toContain("setResultUrls(");
  });

  it("renders only a stable restore stage while task details are loading", () => {
    expect(source).toContain('className="h-4 w-4 animate-spin motion-reduce:animate-none"');
    expect(source).not.toContain("<TaskRestoreStage");
    expect(source).toContain(
      "!restoringTaskId && !isGenerating && resultUrls.length === 0 && !error && !activeQueueTask",
    );
    expect(source).toContain(
      "!restoringTaskId && ((isGenerating && resultUrls.length > 0) || resultUrls.length > 0 || Boolean(activeQueueTask))",
    );
    expect(source).not.toContain("flex flex-col animate-fade-in");
  });

  it("preserves multi-reference result groups with one task-level download action", () => {
    const resultStage = source.slice(
      source.indexOf("<div className=\"studio-result-stage"),
      source.indexOf("<ImagePromptDialog"),
    );

    expect(resultStage).toContain("general-image-group-");
    expect(resultStage).toContain("resultGroupReferences.map((reference, groupIndex)");
    expect(resultStage).toContain("showDownloadAction={groupIndex === 0}");
    expect(resultStage).toContain("downloadUrls={groupIndex === 0 ? resultUrls : undefined}");
    expect(resultStage).toContain("downloadExpectedCount={activeResultExpectedCount}");
    expect(resultStage).toContain("expectedCount={activeResultExpectedCount}");
  });

  it("keeps batch download out of the preview workspace", () => {
    const previewActions = source.slice(
      source.indexOf("const GENERAL_IMAGE_PREVIEW_ACTIONS"),
      source.indexOf("export function GeneralImageExperience"),
    );

    expect(previewActions).not.toContain('kind: "download"');
    expect(previewSource).not.toContain("StudioBatchDownloadButton");
    expect(previewSource).not.toContain("studio-image-preview-batch-download");
    expect(previewSource).not.toContain("studio-image-preview-focus-batch-download");
  });
});
