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
