import { describe, expect, it } from "vitest";
import { getReferenceAnalysisDetailText } from "@/features/tryon/create/analysis-utils";
import type { TryOnReferenceAnalysis } from "@/lib/tryon-reference-analysis";
import zh from "@/messages/zh.json";

const baseReferenceAnalysis: TryOnReferenceAnalysis = {
  index: 1,
  bodyCrop: "full_body",
  personVisible: true,
  faceVisible: true,
  headVisible: true,
  upperBodyVisible: true,
  lowerBodyVisible: true,
  handsVisible: true,
  feetVisible: true,
  detailFocus: [],
  promptNotes: "",
  confidence: 0.9,
};

function resolve(key: string): string {
  const parts = key.split(".");
  let node: unknown = zh.Create;
  for (const part of parts) {
    if (node && typeof node === "object") node = (node as Record<string, unknown>)[part];
    else return key;
  }
  return typeof node === "string" ? node : key;
}

const t = (key: string, values?: Record<string, string | number>) => {
  const template = resolve(key);
  if (!values) return template;
  return Object.entries(values).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), template);
};

describe("try-on reference analysis display", () => {
  it("localizes English focus details before showing them in the UI", () => {
    const detail = getReferenceAnalysisDetailText({
      ...baseReferenceAnalysis,
      detailFocus: [
        "light blue textured tweed short-sleeve midi dress, white lace tights, light blue and black pointed-toe shoes",
        "even, soft, studio-like lighting with minimal harsh shadows",
        "full body shot",
      ],
    }, t);

    expect(detail).toBe("重点：浅蓝粗花呢短袖中长连衣裙、白色蕾丝连裤袜、浅蓝黑色尖头鞋、柔和均匀棚拍光少阴影");
    expect(detail).not.toMatch(/[A-Za-z]{4,}/);
  });
});
