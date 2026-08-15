import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * 本地化导航封装。客户端组件请从这里导入 Link/useRouter/usePathname，
 * 而不是 next/navigation，以保证 locale 透传（模板入口）。
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
