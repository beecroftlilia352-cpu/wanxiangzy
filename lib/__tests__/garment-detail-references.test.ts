import { describe, expect, it } from "vitest";
import {
  MAX_GARMENT_DETAIL_IMAGES,
  buildGarmentDetailReferencePrompt,
  buildPoseRoleBasedPrompt,
  flattenGarmentDetailGroups,
  normalizeGarmentDetailGroups,
  normalizeGarmentDetailUrls,
} from "@/lib/garment-detail-references";

describe("garment detail references", () => {
  it("normalizes garment detail urls with dedupe and a five-image cap", () => {
    const urls = normalizeGarmentDetailUrls([
      " fabric.png ",
      "",
      "pocket.png",
      "fabric.png",
      "back.png",
      "side.png",
      "collar.png",
      "extra.png",
      42,
    ]);

    expect(urls).toEqual(["fabric.png", "pocket.png", "back.png", "side.png", "collar.png"]);
    expect(urls).toHaveLength(MAX_GARMENT_DETAIL_IMAGES);
  });

  it("describes detail references as appended non-numbering inputs", () => {
    const prompt = buildGarmentDetailReferencePrompt(2);

    expect(prompt).toContain("附加的 2 张图");
    expect(prompt).toContain("冲突时以主图为准");
  });

  it("normalizes grouped garment detail references with dedupe and owner indexes", () => {
    const groups = normalizeGarmentDetailGroups([
      { clothingIndex: 1, urls: [" lower-fabric.png ", "zipper.png"] },
      { clothing_index: 0, detail_urls: ["collar.png", "zipper.png"] },
      { clothingIndex: 4, urls: ["ignored.png"] },
    ], 2);

    expect(groups).toEqual([
      { clothingIndex: 0, urls: ["collar.png"] },
      { clothingIndex: 1, urls: ["lower-fabric.png", "zipper.png"] },
    ]);
    expect(flattenGarmentDetailGroups(groups)).toEqual(["collar.png", "lower-fabric.png", "zipper.png"]);
  });

  it("describes grouped detail references as belonging only to their source garment", () => {
    const prompt = buildGarmentDetailReferencePrompt({
      groups: [
        {
          clothingIndex: 0,
          clothingImageNumber: 1,
          clothingLabel: "上装",
          urls: ["collar.png", "fabric.png"],
          detailImageNumbers: [5, 6],
        },
        {
          clothingIndex: 1,
          clothingImageNumber: 2,
          clothingLabel: "下装",
          urls: ["hem.png"],
          detailImageNumbers: [7],
        },
      ],
    });

    expect(prompt).toContain("服装细节归属规则");
    expect(prompt).toContain("image 5、image 6 只补充 image 1（上装）");
    expect(prompt).toContain("image 7 只补充 image 2（下装）");
    expect(prompt).toContain("不得用于其他主服装图");
    expect(prompt).toContain("不跨件迁移");
  });

  it("describes pose supplemental garment inputs as angle references", () => {
    const prompt = buildPoseRoleBasedPrompt({
      outputMode: "separate",
      detailCount: 2,
      poseCount: 4,
    });

    expect(prompt).toContain("服装的多角度参考");
    expect(prompt).toContain("正面、背面、侧面");
    expect(prompt).toContain("转身可见面");
    expect(prompt).toContain("不得作为新服装、材质增强、人物、姿势、脸、背景或光线参考");
    expect(prompt).toContain("不要无故改成通用棚拍背景");
    expect(prompt).toContain("本次调用只输出 1 张独立");
    expect(prompt).toContain("不要在本张里合成多图");
    expect(prompt).not.toContain("最终输出4张");
    expect(prompt).not.toContain("指定的 N 个新姿势");
    expect(prompt).not.toContain("局部细节补充");
  });
});
