import { describe, expect, it } from "vitest";
import { parseFaceSwapRefs } from "@/lib/agent/brain/semantic-router";

describe("semantic router face swap refs", () => {
  it("parses explicit source and face roles", () => {
    expect(parseFaceSwapRefs("图1作为原始模特图，图2作为目标脸图，生成换脸结果")).toEqual({
      sourceRef: "图1",
      faceRef: "图2",
    });
  });

  it("parses face-to-source wording", () => {
    expect(parseFaceSwapRefs("用图2的脸给图1换脸，保持衣服和场景不变")).toEqual({
      sourceRef: "图1",
      faceRef: "图2",
    });
  });
});
