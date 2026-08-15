/**
 * i18n 键约定助手。
 * 约定（全代码库统一）：
 *  - 页面本地数据数组：相对键（"models.desc"），用本页命名空间 t 渲染
 *  - 数据要传入共享组件（共享组件用全局 t 渲染）：先用 qualifyOptionKeys 转成全路径键
 *  - lib 数据（navigation.ts 等）：直接存全路径键，渲染端用全局 t
 */

const KEY_FIELDS = ["labelKey", "descKey", "badgeKey", "descriptionKey", "hintKey", "countLabelKey", "titleKey"] as const;

/** 把选项数组里的相对 *Key 前缀为 `namespace.xxx`，用于跨入共享组件边界 */
export function qualifyOptionKeys<T extends Record<string, unknown>>(
  items: readonly T[],
  namespace: string,
): T[] {
  return items.map((item) => {
    const next = { ...item } as Record<string, unknown>;
    for (const field of KEY_FIELDS) {
      const value = item[field];
      if (typeof value === "string" && value.length > 0) {
        next[field] = `${namespace}.${value}`;
      }
    }
    return next as T;
  });
}
