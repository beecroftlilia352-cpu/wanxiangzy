import { StudioModuleSkeleton } from "@/components/studio/StudioModuleSkeleton";

/**
 * 根级兜底骨架屏 — 只对没有自己的 loading.tsx 的路由生效
 * （如 /auth 回调、/admin-forbidden）。统一用 studio 工作台骨架，
 * 避免旧的 admin-hero 风格骨架漏出。
 */
export default function Loading() {
  return <StudioModuleSkeleton variant="default" />;
}
