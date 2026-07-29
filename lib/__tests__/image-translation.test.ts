import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_TRANSLATION_IMAGES,
  MAX_IMAGE_TRANSLATION_LANGUAGES,
  buildImageTranslationPerCallPrompt,
  buildImageTranslationPrompt,
  enforceImageTranslationPromptRequirements,
  flattenImageTranslationLanguages,
  normalizeImageTranslationLanguageCodes,
  normalizeImageTranslationSourceUrls,
  pickCommonImageTranslationLanguages,
  type ImageTranslationLanguageConfig,
} from "@/lib/image-translation";

const SAMPLE_CONFIG: ImageTranslationLanguageConfig = [
  {
    label: "欧美",
    enLabel: "",
    isCommon: false,
    sort: 1,
    children: [
      [
        { label: "英语", enLabel: "English", isCommon: true, sort: 1 },
        { label: "英语（美国）", enLabel: "English (US)", isCommon: false, sort: 2 },
        { label: "西班牙语", enLabel: "Español", isCommon: true, sort: 1 },
      ],
      [
        { label: "法语", enLabel: "Français", isCommon: true, sort: 1 },
      ],
    ],
  },
  {
    label: "亚洲",
    enLabel: "",
    isCommon: false,
    sort: 2,
    children: [
      [
        { label: "中文（简体）", enLabel: "中文（简体）", isCommon: true, sort: 2 },
        { label: "日语", enLabel: "日本語", isCommon: true, sort: 1 },
        { label: "阿拉伯语", enLabel: "العربية", isCommon: true, sort: 1 },
      ],
    ],
  },
];

describe("image translation helpers", () => {
  it("flattens the regional config into deduplicated language codes", () => {
    const all = flattenImageTranslationLanguages(SAMPLE_CONFIG);
    const codes = all.map((lang) => lang.code);
    expect(codes).toEqual([
      "English",
      "English (US)",
      "Español",
      "Français",
      "中文（简体）",
      "日本語",
      "العربية",
    ]);
    expect(all.find((lang) => lang.code === "English")?.isCommon).toBe(true);
    expect(all.find((lang) => lang.code === "العربية")?.label).toBe("阿拉伯语");
  });

  it("picks only common languages", () => {
    const common = pickCommonImageTranslationLanguages(SAMPLE_CONFIG);
    const codes = common.map((lang) => lang.code);
    expect(codes).toContain("English");
    expect(codes).toContain("العربية");
    expect(codes).not.toContain("English (US)");
  });

  it("normalizes input language codes against known references and caps at max", () => {
    const all = flattenImageTranslationLanguages(SAMPLE_CONFIG);
    const normalized = normalizeImageTranslationLanguageCodes(
      ["English", "English (US)", "English", "中文（简体）", "  Français  ", "unknown-language", ...Array.from({ length: 25 }, (_, i) => `unknown-${i}`)],
      all
    );
    expect(normalized.length).toBeGreaterThan(0);
    expect(normalized.length).toBeLessThanOrEqual(MAX_IMAGE_TRANSLATION_LANGUAGES);
    expect(normalized[0]).toBe("English");
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("clamps source urls and dedupes fallback", () => {
    expect(normalizeImageTranslationSourceUrls(undefined, "https://a")).toEqual(["https://a"]);
    expect(
      normalizeImageTranslationSourceUrls(
        ["https://a", "https://b", "https://a"],
        "https://a"
      )
    ).toEqual(["https://a", "https://b"]);
    expect(normalizeImageTranslationSourceUrls(undefined, "")).toEqual([]);
    expect(
      normalizeImageTranslationSourceUrls(
        Array.from({ length: MAX_IMAGE_TRANSLATION_IMAGES + 3 }, (_, i) => `https://x/${i}`),
        undefined
      ).length
    ).toBe(MAX_IMAGE_TRANSLATION_IMAGES);
  });

  it("builds a production-grade prompt covering text preservation, localization, layout and negatives", () => {
    const prompt = buildImageTranslationPrompt({
      sourceCount: 2,
      languages: ["English", "中文（简体）", "العربية"],
      languageLabels: ["英语", "中文（简体）", "阿拉伯语"],
      userPrompt: "英语用美式拼写，阿拉伯使用 RTL",
      aiModel: "nano-banana-2",
      imageSize: "1K",
    });
    expect(prompt).toContain("图片翻译硬规则");
    expect(prompt).toContain("不得修改任何品牌");
    expect(prompt).toContain("不得改变图1的人物");
    expect(prompt).toContain("地区本地化规则");
    expect(prompt).toContain("美式拼写");
    expect(prompt).toContain("RTL");
    expect(prompt).toContain("2 张原图");
    expect(prompt).toContain("英语 / 中文（简体） / 阿拉伯语");
    expect(prompt).toContain("负面约束");
    expect(prompt).toContain("图像质量：photorealistic commercial product localization");
    expect(prompt).toContain("英语用美式拼写，阿拉伯使用 RTL");
  });

  it("keeps single-image prompt concise and uses original aspect ratio guidance", () => {
    const prompt = buildImageTranslationPrompt({
      sourceCount: 1,
      languages: ["English"],
      languageLabels: ["英语"],
    });
    expect(prompt).toContain("单张原图");
    expect(prompt).toContain("本次翻译目标语言：英语");
  });

  it("enforces required signal fallbacks when caller passes a partial prompt", () => {
    const partial = "把图片里的中文翻成英文。";
    const enforced = enforceImageTranslationPromptRequirements(partial, {
      sourceCount: 1,
      languages: ["English"],
      languageLabels: ["英语"],
    });
    expect(enforced).toContain("图片翻译硬规则");
    expect(enforced).toContain("地区本地化规则");
    expect(enforced).toContain("图像质量");
    expect(enforced).toContain("负面约束");
  });

  it("regenerates the prompt when caller passes empty content", () => {
    const enforced = enforceImageTranslationPromptRequirements("", {
      sourceCount: 1,
      languages: ["English"],
      languageLabels: ["英语"],
    });
    expect(enforced).toContain("图片翻译硬规则");
    expect(enforced).toContain("英语");
  });

  it("limits supported prompt inputs without losing signal essentials", () => {
    const many = Array.from({ length: MAX_IMAGE_TRANSLATION_LANGUAGES + 5 }, (_, i) => `unknown-${i}`);
    const prompt = buildImageTranslationPrompt({
      sourceCount: 1,
      languages: many,
      languageLabels: many,
    });
    expect(prompt).toContain("图片翻译硬规则");
    expect(prompt).toContain("负面约束");
    expect(prompt).toContain("地区本地化规则");
  });

  it("builds a per-call prompt that names the specific source and language only", () => {
    const prompt = buildImageTranslationPerCallPrompt({
      sourceIndex: 1,
      sourceCount: 3,
      language: "中文（简体）",
      languageLabel: "中文（简体）",
      userPrompt: "标题用四字短语",
      aiModel: "nano-banana-2",
      imageSize: "1K",
    });
    expect(prompt).toContain("核心任务：翻译图1 中的可读文字");
    expect(prompt).toContain("第 2/3 张原图");
    expect(prompt).toContain("目标语言锁定");
    expect(prompt).toContain("中文（简体）（English name: 中文（简体））");
    expect(prompt).toContain("MUST translate every readable text");
    expect(prompt).toContain("DO NOT mix any other language");
    expect(prompt).toContain("本次调用只翻译这一张原图");
    expect(prompt).toContain("图片翻译硬规则");
    expect(prompt).toContain("地区本地化规则");
    expect(prompt).toContain("负面约束");
    expect(prompt).toContain("标题用四字短语");
    expect(prompt).not.toContain("图1~图");
    expect(prompt).not.toContain("× " + MAX_IMAGE_TRANSLATION_LANGUAGES);
    expect(prompt).not.toContain("多种目标语言");
  });

  it("enforces required signals on a sparse per-call prompt", () => {
    const partial = buildImageTranslationPerCallPrompt({
      sourceIndex: 0,
      sourceCount: 2,
      language: "English",
      languageLabel: "英语",
    });
    // 即使 base 包含了硬规则，再次走 enforce 也必须保留关键信号
    const enforced = enforceImageTranslationPromptRequirements(partial, {
      sourceCount: 1,
      languages: ["English"],
      languageLabels: ["英语"],
    });
    expect(enforced).toContain("图片翻译硬规则");
    expect(enforced).toContain("地区本地化规则");
    expect(enforced).toContain("图像质量");
    expect(enforced).toContain("负面约束");
  });
});
