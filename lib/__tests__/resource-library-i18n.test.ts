import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RESOURCE_LIBRARY_MODULE_LABELS } from "@/lib/resource-library/types";

const LOCALES = [
  "ar", "bg", "de", "en", "es", "fr", "hi", "id", "it",
  "ja", "ko", "pt", "ru", "th", "tr", "vi", "zh-TW", "zh",
] as const;

const REQUIRED_GROUPS = {
  page: ["title", "description"],
  tabs: ["label", "uploads", "generated", "prompts"],
  actions: [
    "cancel", "close", "confirm", "loadMore", "localUpload", "newPrompt",
    "remove", "removeAsset", "removePrompt", "retry", "save", "add", "added",
  ],
  categories: ["title", "localUploads"],
  filters: ["allMedia", "allModules", "image", "mediaLabel", "moduleLabel", "video"],
  picker: [
    "title", "selectionHint", "selectedCount", "gridLabel", "limitReachedTitle",
    "limitReachedDescription", "limitReachedInline",
  ],
  card: ["select", "removeSelection", "preview", "previewTitle", "previewDescription"],
  empty: [
    "uploadTitle", "uploadDescription", "moduleTitle", "moduleDescription",
    "generatedTitle", "generatedDescription", "promptTitle", "promptDescription",
  ],
  states: [
    "loading", "uploading", "saving", "uploadFailed", "loadFailedTitle",
    "loadFailedDescription", "deleteFailed", "createFailed", "operationFailed",
  ],
  toast: ["uploadSuccess", "assetRemoved", "promptCreated", "promptRemoved"],
  upload: ["supportedFormats"],
  prompts: [
    "allTypes", "typeLabel", "searchLabel", "searchPlaceholder", "createTitle",
    "createDescription", "titleLabel", "titlePlaceholder", "contentLabel", "contentPlaceholder",
  ],
  confirm: ["removeAssetTitle", "removeAssetDescription", "removePromptTitle", "removePromptDescription"],
  promptTypes: ["text-to-image", "image-to-image", "model-background", "pose", "video", "other"],
  modules: Object.keys(RESOURCE_LIBRARY_MODULE_LABELS),
} as const;

type Messages = {
  OutfitFusion?: { uploadLibrary?: unknown };
  ResourceLibrary?: Record<string, unknown>;
};

function readMessages(locale: typeof LOCALES[number]): Messages {
  return JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")) as Messages;
}

function getValue(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, source);
}

function placeholders(value: string) {
  return [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
}

const REQUIRED_KEYS = Object.entries(REQUIRED_GROUPS).flatMap(([group, keys]) =>
  keys.map((key) => `${group}.${key}`),
);

describe("resource library messages", () => {
  const english = readMessages("en").ResourceLibrary as Record<string, unknown>;

  it.each(LOCALES)("%s has the complete namespace and matching placeholders", (locale) => {
    const messages = readMessages(locale);
    const library = messages.ResourceLibrary;

    expect(library).toBeTruthy();
    for (const key of REQUIRED_KEYS) {
      const value = getValue(library!, key);
      const englishValue = getValue(english, key);
      expect(value, `${locale}: ResourceLibrary.${key}`).toEqual(expect.any(String));
      expect((value as string).trim(), `${locale}: ResourceLibrary.${key}`).not.toBe("");
      expect(placeholders(value as string), `${locale}: ResourceLibrary.${key} placeholders`).toEqual(
        placeholders(englishValue as string),
      );
    }

    expect(messages.OutfitFusion?.uploadLibrary, `${locale}: OutfitFusion.uploadLibrary`).toEqual(expect.any(String));
    expect((messages.OutfitFusion?.uploadLibrary as string).trim()).not.toBe("");
  });

  it("keeps the primary locale terminology intentional", () => {
    expect(readMessages("en").ResourceLibrary).toMatchObject({
      page: { title: "Asset library" },
      tabs: { generated: "My creations", prompts: "My prompts" },
      actions: { add: "Add to asset library", added: "Added to asset library" },
    });
    expect(readMessages("zh").ResourceLibrary).toMatchObject({
      page: { title: "资源仓库" },
      tabs: { generated: "我的生成", prompts: "我的提示词" },
      actions: { add: "加入资源库", added: "已加入资源库" },
    });
    expect(readMessages("zh-TW").ResourceLibrary).toMatchObject({
      page: { title: "資源庫" },
      tabs: { generated: "我的生成", prompts: "我的提示詞" },
      actions: { add: "加入資源庫", added: "已加入資源庫" },
    });
  });
});
