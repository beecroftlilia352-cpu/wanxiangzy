"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock, Download, GitBranch, Layers3, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { exportCanvasProjects } from "../utils/canvas-export";
import { CanvasThumbnail } from "./canvas-thumbnail";
import { formatRelativeTime } from "./canvas-project-sidebar";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";

type Props = {
    project: CanvasProject | null;
};

export function CanvasProjectDetailsPanel({ project }: Props) {
    const router = useRouter();
    const toggleStarred = useCanvasStore((state) => state.toggleProjectStarred);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);

    if (!project) {
        return (
            <aside className="hidden w-80 shrink-0 border-l border-stone-200 bg-white lg:block">
                <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <div className="grid size-12 place-items-center rounded-xl bg-stone-100 text-stone-500">
                        <Layers3 className="size-5" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-stone-700">未选中任何画布</p>
                    <p className="mt-1 text-xs text-stone-500">点击左侧文件列表中的画布查看详情。</p>
                </div>
            </aside>
        );
    }

    const handleExport = () => {
        void exportCanvasProjects([project], project.title || "无限画布");
    };

    return (
        <aside className="hidden w-80 shrink-0 flex-col border-l border-stone-200 bg-white lg:flex">
            <div className="border-b border-stone-200 px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">画布详情</p>
                <h2 className="mt-2 truncate text-base font-semibold text-stone-900" title={project.title}>
                    {project.title}
                </h2>
                <div className="mt-3 overflow-hidden rounded-lg">
                    <CanvasThumbnail storageKey={project.coverStorageKey} title={project.title} rounded="rounded-lg" />
                </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
                <div className="grid grid-cols-2 gap-3">
                    <Stat label="节点" value={project.nodes.length} icon={<Layers3 className="size-3.5" />} />
                    <Stat label="连线" value={project.connections.length} icon={<GitBranch className="size-3.5" />} />
                </div>

                <dl className="space-y-2 text-sm">
                    <DetailRow label="创建时间" value={new Date(project.createdAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })} />
                    <DetailRow label="最近编辑" value={`${formatRelativeTime(project.updatedAt)} (${new Date(project.updatedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })})`} icon={<Clock className="size-3.5 text-stone-400" />} />
                    <DetailRow label="画布 ID" value={project.id} mono />
                </dl>

                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">分享</p>
                    <div className="flex items-center gap-2 rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-500">
                        <span className="truncate">分享链接即将开放</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">版本</p>
                    <Button variant="outline" size="sm" className="w-full justify-between text-stone-600" disabled>
                        查看版本历史
                        <ArrowUpRight className="size-3.5" />
                    </Button>
                </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-stone-200 px-5 py-3">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleStarred(project.id)}
                    className={cn("gap-1.5", project.starred && "text-amber-500 hover:text-amber-600")}
                >
                    <Star className={cn("size-3.5", project.starred && "fill-current")} />
                    {project.starred ? "已收藏" : "收藏"}
                </Button>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={handleExport} aria-label="导出" title="导出">
                        <Download className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteIds([project.id])} aria-label="删除" title="删除" className="text-stone-500 hover:text-red-600">
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            </div>

            <div className="border-t border-stone-200 px-5 py-3">
                <Button className="w-full" onClick={() => router.push(`/infinite-canvas/${project.id}`)}>
                  打开画布
                </Button>
            </div>
        </aside>
    );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
    return (
        <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
            <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-stone-500">{icon}{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-stone-900">{value}</p>
        </div>
    );
}

function DetailRow({ label, value, icon, mono }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
    return (
        <div>
            <dt className="text-xs text-stone-500">{label}</dt>
            <dd className={cn("mt-0.5 flex items-center gap-1.5 text-sm text-stone-800", mono && "font-mono text-xs text-stone-600")} title={value}>
                {icon}
                <span className="truncate">{value}</span>
            </dd>
        </div>
    );
}