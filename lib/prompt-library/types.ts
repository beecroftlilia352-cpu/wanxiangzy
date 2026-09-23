/**
 * 共享提示词词库的客户端契约与共享常量。
 *
 * 这个文件同时被服务端（lib/prompt-library/server.ts）与客户端组件
 * （features/general-image/prompt-library-dialog.tsx）引用，因此必须保持纯类型 +
 * 纯常量，不得引入任何 Node/服务端依赖。
 */

export const PROMPT_LIBRARY_TITLE_MAX_LENGTH = 20;
export const PROMPT_LIBRARY_CONTENT_MAX_LENGTH = 2000;
/** 前台保存默认使用的创作类型（表约束要求 ^[A-Za-z][A-Za-z0-9_-]{0,63}$）。 */
export const PROMPT_LIBRARY_DEFAULT_CREATION_TYPE = "general-image";
/** 图生图 / 素材生成页面保存时写入的模块标识。 */
export const PROMPT_LIBRARY_DEFAULT_MODULE_KEY = "generalImage";

export const PROMPT_LIBRARY_SCOPES = ["all", "mine"] as const;
export type PromptLibraryScope = typeof PROMPT_LIBRARY_SCOPES[number];

export type PromptLibraryItem = {
  id: string;
  title: string;
  content: string;
  creationType: string;
  moduleKey: string | null;
  metadata: Record<string, unknown>;
  /** 创建者用户 ID；用户被删除后为 null（条目仍保留在共享词库中）。 */
  createdBy: string | null;
  /** 创建者邮箱，用于前台/后台列表展示。 */
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PromptLibraryListResponse = {
  items: PromptLibraryItem[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type PromptLibraryAdminListResponse = {
  items: PromptLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};
