import { describe, expect, it } from "vitest";
import { buildGarment3dPrompt, GARMENT_3D_QUALITY } from "@/lib/garment-3d-prompt";

describe("garment 3d prompt", () => {
  it("builds a strict no-human 3D garment prompt", () => {
    const prompt = buildGarment3dPrompt({
      garmentType: "连体衣",
      outputMode: "prompt",
      hasReference: false,
      userPrompt: "",
    });

    expect(prompt).toContain("图1是用户上传的服装图");
    expect(prompt).toContain("无真人、无头、无脸、无手、无腿、无皮肤");
    expect(prompt).toContain("像被隐形支撑撑起");
    expect(prompt).toContain("不能显示真人、人台、衣架");
    expect(prompt).toContain("前片、后片、侧缝");
    expect(prompt).toContain("衣身空腔、袖管体积、下摆开口");
    expect(prompt).toContain("正背侧结构必须连续");
    expect(prompt).toContain(GARMENT_3D_QUALITY);
  });

  it("uses reference images only for 3D display, not garment design", () => {
    const prompt = buildGarment3dPrompt({
      garmentType: "上装",
      outputMode: "reference",
      hasReference: true,
      userPrompt: "袖口要清晰",
    });

    expect(prompt).toContain("图2是3D立体服装参考图");
    expect(prompt).toContain("参考图2只用于学习立体展示方式");
    expect(prompt).toContain("图1控制最终服装的款式、品类、颜色、材质、图案、logo/文字和所有细节");
    expect(prompt).toContain("若图1与图2冲突，以图1为准");
    expect(prompt).toContain("用户补充要求：袖口要清晰");
  });
});
