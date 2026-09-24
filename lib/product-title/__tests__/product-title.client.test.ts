import { describe, expect, it } from "vitest";
import {
  isSupportedProductTitleImageFile,
  readProductTitleClipboardPaste,
  toProductTitlePastedImageFile,
  type ProductTitleClipboardData,
} from "@/lib/product-title/client";

/**
 * 「商品标题」浏览器端图片预处理单测 —— 重点覆盖第三版新增的
 * 「解析 Ctrl+V 剪贴板」逻辑（截图 / 从文件夹复制的图片文件 / 非图片内容）。
 *
 * jsdom 里没有 DataTransfer，也没有剪贴板，所以这里直接构造结构化的普通对象，
 * 与真实浏览器传进来的 DataTransfer 形状一致（items / files / types / getData）。
 */

function png(name: string, type = "image/png"): File {
  return new File(["binary"], name, { type });
}

/**
 * 还原真实浏览器（Chromium/Edge）粘贴一张图时剪贴板的真实形状：
 * clipboardData.files 与 clipboardData.items[i].getAsFile() 给的是**两个内容/元数据
 * 完全相同、但不是同一个对象**的 File —— 「粘一次加两张」就是这么来的。
 * 现有 mock 在两个来源放的是同一个对象，所以拓不到这一层，这里如实造两个实例。
 */
function browserTwin(
  name = "screenshot.png",
  type = "image/png",
  content = "binary",
  lastModified = 1_700_000_000_000,
): [File, File] {
  return [
    new File([content], name, { type, lastModified }),
    new File([content], name, { type, lastModified }),
  ];
}

/** 造一个「像 DataTransfer」的剪贴板对象。 */
function clipboard(input: {
  files?: File[];
  items?: Array<{ kind?: string; type?: string; getAsFile?: () => File | null }> | null;
  text?: string;
  html?: string;
  omitGetData?: boolean;
  omitTypes?: boolean;
} = {}): ProductTitleClipboardData {
  const files = input.files ?? [];
  const items = input.items ?? files.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file }));
  const data: ProductTitleClipboardData = {
    files,
    items,
    types: input.omitTypes
      ? null
      : [
        ...(files.length ? ["Files"] : []),
        ...(input.text ? ["text/plain"] : []),
        ...(input.html ? ["text/html"] : []),
      ],
  };
  if (!input.omitGetData) {
    data.getData = (format: string) => {
      if (format === "text/plain") return input.text ?? "";
      if (format === "text/html") return input.html ?? "";
      return "";
    };
  }
  return data;
}

describe("readProductTitleClipboardPaste", () => {
  it("截图（items 里 kind=file 的 image/png）→ 原样收下，且判定为「没有文本」", () => {
    const shot = png("screenshot.png");
    const result = readProductTitleClipboardPaste(clipboard({ files: [shot] }));

    expect(result.imageFiles).toEqual([shot]);
    expect(result.hasText).toBe(false);
  });

  it("items 与 files 指向同一个 File 时只收一次（不重复加入）", () => {
    const shot = png("screenshot.png");
    const result = readProductTitleClipboardPaste(
      clipboard({ files: [shot], items: [{ kind: "file", type: "image/png", getAsFile: () => shot }] }),
    );

    expect(result.imageFiles).toHaveLength(1);
    expect(result.imageFiles[0]).toBe(shot);
  });

  it("真实浏览器：同一张图在 items 与 files 里是两个不同 File 实例 → 只收一张（files 那份）", () => {
    const [viaFiles, viaItems] = browserTwin();
    // 前提：两个实例内容相同但不是同一个对象（这正是按 File 引用去重失效的原因）
    expect(viaFiles).not.toBe(viaItems);
    expect(viaItems.size).toBe(viaFiles.size);
    expect(viaItems.name).toBe(viaFiles.name);
    expect(viaItems.type).toBe(viaFiles.type);

    const result = readProductTitleClipboardPaste(
      clipboard({ files: [viaFiles], items: [{ kind: "file", type: "image/png", getAsFile: () => viaItems }] }),
    );

    // 一次粘贴只加一张：绝不能因为两个来源各给了一份就加两张
    expect(result.imageFiles).toHaveLength(1);
    expect(result.imageFiles[0]).toBe(viaFiles);
    expect(result.hasText).toBe(false);
  });

  it("files 非空时完全以 files 为准，items 里多出来的图不会被叠加进来", () => {
    const viaFiles = png("from-files.png");
    const onlyInItems = png("from-items.png");

    const result = readProductTitleClipboardPaste(
      clipboard({
        files: [viaFiles],
        items: [
          { kind: "file", type: "image/png", getAsFile: () => viaFiles },
          { kind: "file", type: "image/png", getAsFile: () => onlyInItems },
        ],
      }),
    );

    expect(result.imageFiles).toEqual([viaFiles]);
  });

  it("files 为空时回退到 items（kind=file 的项才算，string 项忽略）", () => {
    const first = png("item-1.png");
    const second = new File(["x"], "item-2.jpg", { type: "image/jpeg" });

    const result = readProductTitleClipboardPaste(
      clipboard({
        files: [],
        items: [
          { kind: "file", type: "image/png", getAsFile: () => first },
          { kind: "string", type: "text/plain", getAsFile: () => png("not-a-file.png") },
          { kind: "file", type: "image/jpeg", getAsFile: () => second },
        ],
      }),
    );

    expect(result.imageFiles).toEqual([first, second]);
  });

  it("同一次粘贴内内容级去重：指纹相同的两张（两个实例）只留一张", () => {
    const [first, second] = browserTwin("dup.png");
    expect(first).not.toBe(second);

    const result = readProductTitleClipboardPaste(clipboard({ files: [first, second], items: [] }));

    expect(result.imageFiles).toHaveLength(1);
    expect(result.imageFiles[0]).toBe(first);
  });

  it("同一次粘贴内的多张不同图片全部保留，顺序不乱（内容级去重不错杀）", () => {
    const [first] = browserTwin("shot.png", "image/png", "one", 1_700_000_000_000);
    const [second] = browserTwin("shot.png", "image/png", "two-two", 1_700_000_000_001);
    const [third] = browserTwin("other.jpg", "image/jpeg", "three", 1_700_000_000_000);

    const result = readProductTitleClipboardPaste(clipboard({ files: [first, second, third], items: [] }));

    expect(result.imageFiles).toEqual([first, second, third]);
  });

  it("MIME 为空的截图在 items/files 各给一份时也只收一次（补回 image/* 后不重复）", () => {
    const [viaFiles, viaItems] = browserTwin("Screenshot 2026-09-24.png", "");

    const result = readProductTitleClipboardPaste(
      clipboard({ files: [viaFiles], items: [{ kind: "file", type: "", getAsFile: () => viaItems }] }),
    );

    expect(result.imageFiles).toHaveLength(1);
    expect(result.imageFiles[0].type).toBe("image/png");
    expect(result.imageFiles[0].name).toBe("Screenshot 2026-09-24.png");
  });

  it("只有 files（items 为空）的浏览器也能收下多张，并保持剪贴板里的顺序", () => {
    const first = png("copy-1.png");
    const second = new File(["x"], "copy-2.jpg", { type: "image/jpeg" });
    const result = readProductTitleClipboardPaste(clipboard({ files: [first, second], items: [] }));

    expect(result.imageFiles).toEqual([first, second]);
  });

  it("非图片内容（PDF / txt / 无扩展名的二进制）→ 一律不收，也不判定为有文本", () => {
    const pdf = new File(["x"], "spec.pdf", { type: "application/pdf" });
    const txt = new File(["x"], "note.txt", { type: "text/plain" });
    const binary = new File(["x"], "blob", { type: "" });

    for (const file of [pdf, txt, binary]) {
      const result = readProductTitleClipboardPaste(clipboard({ files: [file] }));
      expect(result.imageFiles).toEqual([]);
      expect(result.hasText).toBe(false);
    }
  });

  it("混合内容：图片 + 非图片 → 只收下图片，顺序不乱", () => {
    const pdf = new File(["x"], "spec.pdf", { type: "application/pdf" });
    const shot = png("screenshot.png");
    const result = readProductTitleClipboardPaste(clipboard({ files: [pdf, shot] }));

    expect(result.imageFiles).toEqual([shot]);
  });

  it("MIME 缺失/通用二进制时按扩展名补回 image/*（否则截图会被后续校验误判成非图片）", () => {
    const blankPng = new File(["x"], "Screenshot 2026-09-24.png", { type: "" });
    const octetJpg = new File(["x"], "photo.JPG", { type: "application/octet-stream" });

    const result = readProductTitleClipboardPaste(clipboard({ files: [blankPng, octetJpg] }));

    expect(result.imageFiles.map((file) => file.type)).toEqual(["image/png", "image/jpeg"]);
    // 补回 MIME 之后，现有管道里的类型校验会放行（名字保持不变，缩略图 alt 照旧）
    for (const file of result.imageFiles) {
      expect(isSupportedProductTitleImageFile(file)).toBe(true);
    }
    expect(result.imageFiles.map((file) => file.name)).toEqual([blankPng.name, octetJpg.name]);
  });

  it("toProductTitlePastedImageFile：本来就是图片的原样返回，非图片返回 null", () => {
    const shot = png("screenshot.png");
    expect(toProductTitlePastedImageFile(shot)).toBe(shot);
    expect(toProductTitlePastedImageFile(new File(["x"], "spec.pdf", { type: "application/pdf" }))).toBeNull();
    expect(toProductTitlePastedImageFile(new File(["x"], "no-extension", { type: "" }))).toBeNull();
    expect(toProductTitlePastedImageFile(null)).toBeNull();
    expect(toProductTitlePastedImageFile(undefined)).toBeNull();
  });

  it("文本判定看实际内容：text/plain 或 text/html 非空才算有文本", () => {
    expect(readProductTitleClipboardPaste(clipboard({ text: "折叠晾衣架" })).hasText).toBe(true);
    expect(readProductTitleClipboardPaste(clipboard({ html: "<p>折叠晾衣架</p>" })).hasText).toBe(true);
    // 空白串不算（有些环境会在 types 里挂一个空的 text/plain）
    expect(readProductTitleClipboardPaste(clipboard({ text: "   " })).hasText).toBe(false);
    expect(readProductTitleClipboardPaste(clipboard()).hasText).toBe(false);
  });

  it("文本 + 图片同时存在时两边都如实返回（由调用方按焦点决定谁优先）", () => {
    const shot = png("screenshot.png");
    const result = readProductTitleClipboardPaste(clipboard({ files: [shot], text: "折叠晾衣架" }));

    expect(result.hasText).toBe(true);
    expect(result.imageFiles).toEqual([shot]);
  });

  it("没有 getData 的环境退回看 types（真实浏览器不存在这种情况，纯兜底）", () => {
    const withTextType = readProductTitleClipboardPaste({
      files: [],
      items: [],
      types: ["text/plain"],
    });
    expect(withTextType.hasText).toBe(true);
    // 有 getData 时以内容为准：types 里挂着 text/plain 但内容为空 → 不算文本
    expect(readProductTitleClipboardPaste(clipboard({ text: "", omitTypes: false })).hasText).toBe(false);
  });

  it("空剪贴板 / 缺字段不抛错（截图时拿不到内容也当成没有）", () => {
    expect(readProductTitleClipboardPaste(null)).toEqual({ imageFiles: [], hasText: false });
    expect(readProductTitleClipboardPaste(undefined)).toEqual({ imageFiles: [], hasText: false });
    expect(readProductTitleClipboardPaste({})).toEqual({ imageFiles: [], hasText: false });
    expect(readProductTitleClipboardPaste({ files: null, items: null, types: null, getData: () => "" })).toEqual({
      imageFiles: [],
      hasText: false,
    });
    // getData 抛错也不该影响图片收下
    const shot = png("screenshot.png");
    const result = readProductTitleClipboardPaste({
      files: [shot],
      items: [],
      getData: () => {
        throw new Error("denied");
      },
    });
    expect(result.imageFiles).toEqual([shot]);
    expect(result.hasText).toBe(false);
  });
});
