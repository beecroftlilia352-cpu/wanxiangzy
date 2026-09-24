import {
  PRODUCT_TITLE_DEFAULT_MODEL,
  PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH,
  PRODUCT_TITLE_ERROR_CODES,
  PRODUCT_TITLE_FALLBACK_MODELS,
  PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH,
  PRODUCT_TITLE_IMAGE_URL_MAX_LENGTH,
  PRODUCT_TITLE_IMAGES_TOTAL_MAX_LENGTH,
  PRODUCT_TITLE_MAX_IMAGES,
  type ProductTitleInput,
} from "@/lib/product-title/types";

/**
 * 校验「商品标题」接口的入参：{ images?: string[], description?: string, model?: string }
 *
 * 规则（全部在服务端复算，前端校验只是体验优化）：
 *  · images：0~5 张；每项必须是非空字符串；data URL 必须以 data:image/ 开头且长度 ≤2MB；
 *    也接受站内相对路径（/api/media-assets/<id>）或 http(s) 绝对地址（沿用上版的资产读取路径），
 *    此时长度 ≤2048；全部图片长度总和 ≤8MB；协议相对地址（//host）直接拒绝。
 *  · description：字符串，trim 后 ≤2000 字。
 *  · model：必须在允许列表里（调用方传入当前能力表的 id 列表），缺省用 deepseek-flash。
 *  · images 与 description 至少给一个。
 *
 * 注意：这个模块刻意放在 lib/ 而不是路由文件里 —— Next.js 会校验 app/api 下 route.ts 的
 * 导出字段，只允许 HTTP 方法等，额外导出会让 next build 失败。
 */

export type ProductTitleInputError = {
  code: string;
  error: string;
  status: number;
};

export type ReadProductTitleInputResult =
  | { ok: true; value: ProductTitleInput }
  | { ok: false; error: ProductTitleInputError };

const DATA_URL_PATTERN = /^data:image\/[a-z0-9.+_-]+;base64,/i;

export function readProductTitleInput(
  body: unknown,
  options: { allowedModelIds?: readonly string[] } = {},
): ReadProductTitleInputResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail(
      PRODUCT_TITLE_ERROR_CODES.invalidInput,
      "请求内容格式不正确，请重新选择图片或填写描述后再试。",
      400,
    );
  }

  const record = body as { images?: unknown; description?: unknown; model?: unknown };

  const imagesResult = readImages(record.images);
  if (!imagesResult.ok) return imagesResult;

  const descriptionResult = readDescription(record.description);
  if (!descriptionResult.ok) return descriptionResult;

  const modelResult = readModel(record.model, options.allowedModelIds);
  if (!modelResult.ok) return modelResult;

  if (!imagesResult.value.length && !descriptionResult.value) {
    return fail(
      PRODUCT_TITLE_ERROR_CODES.inputRequired,
      `请至少上传 1 张图片或填写商品描述（最多 ${PRODUCT_TITLE_MAX_IMAGES} 张图片）后再生成。`,
      400,
    );
  }

  return {
    ok: true,
    value: { images: imagesResult.value, description: descriptionResult.value, model: modelResult.value },
  };
}

function readImages(raw: unknown): { ok: true; value: string[] } | { ok: false; error: ProductTitleInputError } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return fail(PRODUCT_TITLE_ERROR_CODES.invalidInput, "图片参数格式不正确（images 必须是数组）。", 400);
  }
  if (raw.length > PRODUCT_TITLE_MAX_IMAGES) {
    return fail(
      PRODUCT_TITLE_ERROR_CODES.tooManyImages,
      `最多只能上传 ${PRODUCT_TITLE_MAX_IMAGES} 张图片（当前 ${raw.length} 张），请删掉多余的再试。`,
      400,
    );
  }

  const images: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return fail(PRODUCT_TITLE_ERROR_CODES.invalidInput, "图片参数里包含非字符串内容，请重新选择图片。", 400);
    }
    const value = item.trim();
    if (!value) {
      return fail(PRODUCT_TITLE_ERROR_CODES.invalidInput, "图片参数里包含空内容，请重新选择图片。", 400);
    }
    if (value.startsWith("data:")) {
      if (!DATA_URL_PATTERN.test(value)) {
        return fail(PRODUCT_TITLE_ERROR_CODES.imageInvalid, "图片数据格式不正确（需要 base64 的 image data URL）。", 400);
      }
      if (value.length > PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH) {
        return fail(
          PRODUCT_TITLE_ERROR_CODES.imageTooLarge,
          "单张图片超过 2MB 上限，请压缩或换一张更小的图片。",
          413,
        );
      }
    } else {
      if (value.startsWith("//")) {
        return fail(PRODUCT_TITLE_ERROR_CODES.imageUrlInvalid, "图片地址无法识别，请重新选择图片。", 400);
      }
      const isReference = value.startsWith("/") || /^https?:\/\//i.test(value);
      if (!isReference) {
        return fail(PRODUCT_TITLE_ERROR_CODES.imageUrlInvalid, "图片地址无法识别，请重新选择图片。", 400);
      }
      if (value.length > PRODUCT_TITLE_IMAGE_URL_MAX_LENGTH) {
        return fail(PRODUCT_TITLE_ERROR_CODES.imageUrlInvalid, "图片地址过长，请重新选择图片。", 400);
      }
    }
    images.push(value);
  }

  const totalLength = images.reduce((sum, value) => sum + value.length, 0);
  if (totalLength > PRODUCT_TITLE_IMAGES_TOTAL_MAX_LENGTH) {
    return fail(
      PRODUCT_TITLE_ERROR_CODES.imageTooLarge,
      "图片总大小超过 8MB 上限，请减少图片数量或换更小的图片。",
      413,
    );
  }

  return { ok: true, value: images };
}

function readDescription(raw: unknown): { ok: true; value: string } | { ok: false; error: ProductTitleInputError } {
  if (raw === undefined || raw === null) return { ok: true, value: "" };
  if (typeof raw !== "string") {
    return fail(PRODUCT_TITLE_ERROR_CODES.invalidInput, "文字描述格式不正确（description 必须是字符串）。", 400);
  }
  const description = raw.trim();
  if (description.length > PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH) {
    return fail(
      PRODUCT_TITLE_ERROR_CODES.descriptionTooLong,
      `文字描述不能超过 ${PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH} 字（当前 ${description.length} 字）。`,
      400,
    );
  }
  return { ok: true, value: description };
}

function readModel(
  raw: unknown,
  allowedModelIds?: readonly string[],
): { ok: true; value: string } | { ok: false; error: ProductTitleInputError } {
  const allowed = allowedModelIds?.length
    ? allowedModelIds
    : PRODUCT_TITLE_FALLBACK_MODELS.map((model) => model.id);

  if (raw === undefined || raw === null) return { ok: true, value: PRODUCT_TITLE_DEFAULT_MODEL };
  if (typeof raw !== "string") {
    return fail(PRODUCT_TITLE_ERROR_CODES.invalidInput, "模型版本参数不正确，请重新选择模型。", 400);
  }
  const model = raw.trim();
  if (!model) return { ok: true, value: PRODUCT_TITLE_DEFAULT_MODEL };
  if (!allowed.includes(model)) {
    return fail(
      PRODUCT_TITLE_ERROR_CODES.modelNotSupported,
      `不支持所选的模型版本（${model}），请刷新模型列表后重试。`,
      400,
    );
  }
  return { ok: true, value: model };
}

function fail(code: string, error: string, status: number): { ok: false; error: ProductTitleInputError } {
  return { ok: false, error: { code, error, status } };
}
