"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Star, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { useFilteredProjects } from "../hooks/use-filtered-projects";
import { CanvasThumbnail } from "./canvas-thumbnail";

type Props = {
    projects: CanvasProject[];
};

export function CanvasProjectSidebar({ projects }: Props) {
    const router = useRouter();
    const sidebarCollapsed = useCanvasUiStore((state) => state.sidebarCollapsed);
    const toggleSidebar = useCanvasUiStore((state) => state.toggleSidebarCollapsed);
    const searchQuery = useCanvasUiStore((state) => state.searchQuery);
    const setSearchQuery = useCanvasUiStore((state) => state.setSearchQuery);
    const starredOnly = useCanvasUiStore((state) => state.starredOnly);
    const setStarredOnly = useCanvasUiStore((state) => state.setStarredOnly);
    const selectedProjectId = useCanvasUiStore((state) => state.selectedProjectId);
    const setSelectedProjectId = useCanvasUiStore((state) => state.setSelectedProjectId);
    const toggleStarred = useCanvasStore((state) => state.toggleProjectStarred);

    const filtered = useFilteredProjects(projects, { searchQuery, starredOnly });

    const open = (id: string) => router.push(`/infinite-canvas/${id}`);

    if (sidebarCollapsed) {
        return (
            <aside className="hidden w-14 shrink-0 border-r border-stone-200 bg-white md:flex md:flex-col md:items-center md:gap-3 md:py-4">
                <button
                    type="button"
                    onClick={toggleSidebar}
                    className="grid size-9 place-items-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                    aria-label="展开侧栏"
                    title="展开侧栏"
                >
                    <Search className="size-4" aria-hidden="true" />
                </button>
                <div className="h-px w-8 bg-stone-200" />
                {projects.slice(0, 8).map((project) => (
                    <Link
                        key={project.id}
                        href={`/infinite-canvas/${project.id}`}
                        onClick={() => setSelectedProjectId(project.id)}
                        className={cn(
                            "size-9 overflow-hidden rounded-md border border-stone-200 bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900",
                            selectedProjectId === project.id && "ring-2 ring-stone-900",
                        )}
                        title={project.title}
                        aria-label={`打开 ${project.title}`}
                    >
                        <CanvasThumbnail storageKey={project.coverStorageKey} title={project.title} rounded="rounded-md" />
                    </Link>
                ))}
            </aside>
        );
    }

    return (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-white md:flex">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">画布库</p>
                <button
                    type="button"
                    onClick={toggleSidebar}
                    className="text-xs font-medium text-stone-500 transition-colors hover:text-stone-900 focus-visible:outline-none focus-visible:underline"
                    aria-label="收起侧栏"
                >
                    收起
                </button>
            </div>
            <div className="space-y-3 px-3 py-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                    <Input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="搜索画布…"
                        aria-label="搜索画布"
                        name="canvas-search"
                        autoComplete="off"
                        className="h-9 pl-8 text-sm"
                    />
                </div>
                <div className="flex items-center gap-1.5">
                    <FilterChip active={!starredOnly} onClick={() => setStarredOnly(false)}>
                        全部
                    </FilterChip>
                    <FilterChip active={starredOnly} onClick={() => setStarredOnly(true)} icon={<Star className={cn("size-3", starredOnly && "fill-current")} aria-hidden="true" />}>
                        收藏
                    </FilterChip>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
                {!filtered.length ? (
                    <p className="px-3 py-6 text-center text-xs text-stone-400">
                        {searchQuery.trim() || starredOnly ? "没有匹配的画布" : "还没有画布"}
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {filtered.map((project) => {
                            const selected = project.id === selectedProjectId;
                            return (
                                <li key={project.id}>
                                    <div
                                        className={cn(
                                            "group relative flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
                                            selected ? "bg-stone-100" : "hover:bg-stone-50",
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setSelectedProjectId(project.id)}
                                            onDoubleClick={() => open(project.id)}
                                            aria-pressed={selected}
                                            aria-label={`选择 ${project.title}`}
                                            className="flex min-w-0 flex-1 items-center gap-2.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                                        >
                                            <div className="size-10 shrink-0 overflow-hidden rounded-md">
                                                <CanvasThumbnail storageKey={project.coverStorageKey} title={project.title} rounded="rounded-md" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-stone-900">{project.title}</p>
                                                <p className="truncate text-[11px] text-stone-500">更新于 {formatRelativeTime(project.updatedAt)}</p>
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                toggleStarred(project.id);
                                            }}
                                            className={cn(
                                                "grid size-7 shrink-0 place-items-center rounded text-stone-400 transition-colors hover:bg-white hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400",
                                                project.starred && "text-amber-500 hover:text-amber-600",
                                            )}
                                            aria-label={project.starred ? "取消收藏" : "收藏"}
                                            aria-pressed={project.starred}
                                            title={project.starred ? "取消收藏" : "收藏"}
                                        >
                                            <Star className={cn("size-3.5", project.starred && "fill-current")} aria-hidden="true" />
                                        </button>
                                        <Link
                                            href={`/infinite-canvas/${project.id}`}
                                            onClick={() => setSelectedProjectId(project.id)}
                                            aria-label={`打开 ${project.title}`}
                                            title="打开画布"
                                            className="grid size-7 shrink-0 place-items-center rounded text-stone-400 transition-colors hover:bg-white hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                                        >
                                            <ChevronRight className="size-3.5" aria-hidden="true" />
                                        </Link>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </aside>
    );
}

function FilterChip({ active, children, onClick, icon }: { active: boolean; children: React.ReactNode; onClick: () => void; icon?: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400",
                active ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
            )}
        >
            {icon}
            {children}
        </button>
    );
}

// Returns a relative time string like "5 分钟前" or the absolute date for
// older timestamps. Uses suppressHydrationWarning semantics: returns the
// formatted absolute date during SSR / first paint, then upgrades to the
// relative time after mount so server and client agree on the initial
// markup and React doesn't log a hydration mismatch.
export function formatRelativeTime(iso: string) {
    const date = new Date(iso);
    return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

// Client-side relative time. Re-evaluates every minute so the label
// stays fresh ("刚刚" → "1 分钟前" → ...).
export function useRelativeTime(iso: string): string {
    const [label, setLabel] = useState(formatRelativeTime(iso));
    useEffect(() => {
        const compute = () => {
            const date = new Date(iso);
            const diff = Date.now() - date.getTime();
            const minute = 60_000;
            const hour = 60 * minute;
            const day = 24 * hour;
            if (diff < minute) return "刚刚";
            if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
            if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
            if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
            return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
        };
        setLabel(compute());
        const interval = window.setInterval(() => setLabel(compute()), 60_000);
        return () => window.clearInterval(interval);
    }, [iso]);
    return label;
}