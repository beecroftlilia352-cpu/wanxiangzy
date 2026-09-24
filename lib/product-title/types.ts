/**
 * 「商品标题」功能的共享类型与常量（客户端可安全导入：不含任何服务端依赖与密钥）。
 *
 * 功能边界：看图 → 生成英文（附中文对照）跨境电商商品标题，供运营复制上架。
 * 与既有功能完全隔离：只新增文件，不改动任何既有模块的导出或行为。
 */

/** 控制面里承载本功能的供应商 id（刻意不参与 deployment 路由，直接读 provider）。 */
export const PRODUCT_TITLE_PROVIDER_ID = "deepseek";

/** 默认模型；可用环境变量 PRODUCT_TITLE_MODEL 覆盖。 */
export const PRODUCT_TITLE_DEFAULT_MODEL = "deepseek-flash";
export const PRODUCT_TITLE_MODEL_ENV = "PRODUCT_TITLE_MODEL";

/** 期望的候选标题条数（提示词要求 3 条；解析阶段按 1~3 条容错）。 */
export const PRODUCT_TITLE_MAX_CANDIDATES = 3;

/** 前端传入 imageUrl 的长度上限（绝对内网地址或相对路径都算）。 */
export const PRODUCT_TITLE_IMAGE_URL_MAX_LENGTH = 2048;

/**
 * 送进模型的图片字节上限（原始与压缩后都按此校验）。
 * 实测长边 1024 / jpeg q80 的压缩结果约 140KB，4MB 只是兜底，避免异常大图把请求撑爆。
 */
export const PRODUCT_TITLE_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** 压缩目标：长边 ≤1024、jpeg quality 80（控制 base64 请求体积）。 */
export const PRODUCT_TITLE_IMAGE_MAX_LONG_EDGE = 1024;
export const PRODUCT_TITLE_IMAGE_JPEG_QUALITY = 80;

/** 上游 chat/completions 超时：min(provider.timeoutMs, 60s)。 */
export const PRODUCT_TITLE_TIMEOUT_MS = 60_000;

/**
 * 输出 token 上限。deepseek-flash 是推理模型：max_tokens 给小了（实测 200）会被
 * reasoning 全部占用、HTTP 200 但 content 为空，所以固定给足 2000。
 */
export const PRODUCT_TITLE_MAX_TOKENS = 2000;

/**
 * 本功能自己的限流策略（按 lib/api/rate-limit.ts 的既有格式定义在功能模块内，
 * 刻意不改动该文件里既有桶的定义）。调用时使用其导出的 checkRateLimit/rateLimitResponse。
 */
export const PRODUCT_TITLE_RATE_LIMIT = {
  bucket: "product-title",
  limit: 12,
  windowMs: 60_000,
  label: "商品标题",
} as const;

export type ProductTitleCandidate = {
  /** 英文标题（可直接上架） */
  en: string;
  /** 中文对照 */
  zh: string;
  /** 这条标题的卖点角度（中文简述） */
  angle: string;
};

export type ProductTitleSuccessPayload = {
  ok: true;
  model: string;
  titles: ProductTitleCandidate[];
};

export type ProductTitleErrorPayload = {
  ok: false;
  error: string;
  code: string;
};

export type ProductTitleResponse = ProductTitleSuccessPayload | ProductTitleErrorPayload;

/* -------------------------------------------------------------------------- *
 * 第二版：入参从「自动读取结果图」改为「用户自选条件（图片 + 文字描述 + 模型版本）」
 * -------------------------------------------------------------------------- */

/** 单次请求最多上传的图片张数（0~5）。 */
export const PRODUCT_TITLE_MAX_IMAGES = 5;

/** 文字描述长度上限（字符）。 */
export const PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH = 2000;

/** 单个图片 data URL 的字符串长度上限（≈2MB；前端 canvas 压缩后按此校验）。 */
export const PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH = 2 * 1024 * 1024;

/** 全部图片 data URL 的字符串长度总和上限（≈8MB）。 */
export const PRODUCT_TITLE_IMAGES_TOTAL_MAX_LENGTH = 8 * 1024 * 1024;

/** 模型清单 GET /api/product-title/models 的内存缓存 TTL（5 分钟）。 */
export const PRODUCT_TITLE_MODELS_CACHE_TTL_MS = 5 * 60_000;

/** 上游模型清单路径（OpenAI 兼容 GET /models）。 */
export const PRODUCT_TITLE_MODELS_PATH = "/models";

/** 上游 /models 请求超时（模型清单很小，不需要 60s）。 */
export const PRODUCT_TITLE_MODELS_TIMEOUT_MS = 15_000;

/** 本功能所有面向用户的错误 code（前后端/测试共用，避免各处散落字符串）。 */
export const PRODUCT_TITLE_ERROR_CODES = {
  invalidInput: "PRODUCT_TITLE_INVALID_INPUT",
  inputRequired: "PRODUCT_TITLE_INPUT_REQUIRED",
  tooManyImages: "PRODUCT_TITLE_TOO_MANY_IMAGES",
  imageTooLarge: "PRODUCT_TITLE_IMAGE_TOO_LARGE",
  imageEmpty: "PRODUCT_TITLE_IMAGE_EMPTY",
  imageInvalid: "PRODUCT_TITLE_IMAGE_INVALID",
  imageUrlInvalid: "PRODUCT_TITLE_IMAGE_URL_INVALID",
  descriptionTooLong: "PRODUCT_TITLE_DESCRIPTION_TOO_LONG",
  modelNotSupported: "PRODUCT_TITLE_MODEL_NOT_SUPPORTED",
  modelRequiresText: "PRODUCT_TITLE_MODEL_REQUIRES_TEXT",
} as const;

export type ProductTitleModelInfo = {
  /** 上游模型 id（请求体 model 字段用它）。 */
  id: string;
  /** 展示名（如 DeepSeek-V4.1-Flash）。 */
  name: string;
  /** 是否支持图片输入（上游 input_modalities 含 "image"）。 */
  vision: boolean;
  contextWindow: number;
  maxOutputTokens: number;
  /** 支持的推理强度档位（上游 effort.supported_levels）；没有则为空数组。 */
  effortLevels: string[];
};

/**
 * 上游 /models 不可用时的内置清单（实测 https://api.deepseek.com/models 只有这两个模型）。
 * 同时作为「允许的模型版本」白名单兜底与前端拉取失败时的下拉选项。
 */
export const PRODUCT_TITLE_FALLBACK_MODELS: readonly ProductTitleModelInfo[] = [
  {
    id: PRODUCT_TITLE_DEFAULT_MODEL,
    name: "DeepSeek-V4.1-Flash",
    vision: true,
    contextWindow: 1_048_576,
    maxOutputTokens: 393_216,
    effortLevels: ["low", "high", "max"],
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek-V4-Pro",
    vision: false,
    contextWindow: 1_048_576,
    maxOutputTokens: 393_216,
    effortLevels: ["low", "high", "max"],
  },
];

export type ProductTitleModelsSuccessPayload = {
  ok: true;
  models: ProductTitleModelInfo[];
  /** 上游不可用、返回内置清单时为 true。 */
  fallback: boolean;
};

export type ProductTitleModelsResponse = ProductTitleModelsSuccessPayload | ProductTitleErrorPayload;

/** 校验通过后的生成条件（服务端与前端共用的入参形状）。 */
export type ProductTitleInput = {
  /** 图片：data:image/* 的 data URL，或站内相对路径 / http(s) 地址（上版资产读取路径保留）。 */
  images: string[];
  description: string;
  model: string;
};
