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
