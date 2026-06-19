"use client";

import { Check, Download, MoreHorizontal, Pencil, Star, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Dropdown, Input } from "antd";

import { cn } from "@/lib/utils";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { useCanvasUiStore } from "../stores/use-canvas-ui-store";
import { exportCanvasProjects } from "../utils/canvas-export";
import { CanvasThumbnail } from "./canvas-thumbnail";
import { formatRelativeTime } from "./canvas-project-sidebar";

export function CanvasProjectCard({ project }: { project: CanvasProject }) {
    const router = useRouter();
    const renameProject = useCanvasStore((state) => state.renameProject);
    const toggleStarred = useCanvasStore((state) => state.toggleProjectStarred);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const editingId = useCanvasUiStore((state) => state.editingProjectId);
    const editingTitle = useCanvasUiStore((state) => state.editingProjectTitle);
    const startEditing = useCanvasUiStore((state) => state.startEditingProject);
    const setEditingTitle = useCanvasUiStore((state) => state.setEditingProjectTitle);
    const stopEditing = useCanvasUiStore((state) => state.stopEditingProject);
    const toggleSelected = useCanvasUiStore((state) => state.toggleSelectedProjectId);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const setSelectedProjectId = useCanvasUiStore((state) => state.setSelectedProjectId);

    const editing = editingId === project.id;
    const selected = selectedIds.includes(project.id);
    const open = () => router.push(`/infinite-canvas/${project.id}`);
    const saveTitle = () => {
        renameProject(project.id, editingTitle.trim() || project.title);
        stopEditing();
    };

    return (
        <article
            className={cn(
                "group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md",
                selected && "ring-2 ring-stone-900",
            )}
            onClick={() => {
                if (editing) return;
                setSelectedProjectId(project.id);
                open();
            }}
        >
            <div className="relative">
                <CanvasThumbnail storageKey={project.coverStorageKey} title={project.title} rounded="rounded-none" />
                <div className="absolute left-2 top-2 flex items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
                    <input
                        type="checkbox"
                        checked={selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => toggleSelected(project.id, event.target.checked)}
                        className="size-4 rounded border-white/70 bg-white/90 shadow-sm accent-stone-950"
                        aria-label={`选择 ${project.title}`}
                    />
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            toggleStarred(project.id);
                        }}
                        className={cn(
                            "grid size-7 place-items-center rounded-md bg-white/90 text-stone-600 shadow-sm backdrop-blur-sm transition hover:bg-white",
                            project.starred && "text-amber-500 hover:text-amber-600",
                        )}
                        aria-label={project.starred ? "取消收藏" : "收藏"}
                        title={project.starred ? "取消收藏" : "收藏"}
                    >
                        <Star className={cn("size-3.5", project.starred && "fill-current")} />
                    </button>
                </div>
                <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                { key: "export", icon: <Download className="size-3.5" />, label: "导出", onClick: ({ domEvent }) => { domEvent.stopPropagation(); void exportCanvasProjects([project], project.title || "无限画布"); } },
                                { key: "rename", icon: <Pencil className="size-3.5" />, label: "重命名", onClick: ({ domEvent }) => { domEvent.stopPropagation(); startEditing(project.id, project.title); } },
                                { key: "star", icon: <Star className={cn("size-3.5", project.starred && "fill-current")} />, label: project.starred ? "取消收藏" : "收藏", onClick: ({ domEvent }) => { domEvent.stopPropagation(); toggleStarred(project.id); } },
                                { type: "divider" },
                                { key: "delete", icon: <Trash2 className="size-3.5" />, danger: true, label: "删除", onClick: ({ domEvent }) => { domEvent.stopPropagation(); setDeleteIds([project.id]); } },
                            ],
                        }}
                    >
                        <Button
                            type="text"
                            size="small"
                            shape="circle"
                            icon={<MoreHorizontal className="size-4" />}
                            aria-label="更多操作"
                            onClick={(event) => event.stopPropagation()}
                        />
                    </Dropdown>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-1.5 px-3.5 py-3">
                {editing ? (
                    <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        <Input
                            className="min-w-0"
                            value={editingTitle}
                            onChange={(event) => setEditingTitle(event.target.value)}
                            onKeyDown={(event) => event.key === "Enter" && saveTitle()}
                            autoFocus
                        />
                        <Button type="text" size="small" shape="circle" icon={<Check className="size-4" />} onClick={saveTitle} aria-label="保存名称" />
                        <Button type="text" size="small" shape="circle" icon={<X className="size-4" />} onClick={stopEditing} aria-label="取消重命名" />
                    </div>
                ) : (
                    <h2 className="truncate text-sm font-semibold text-stone-900" title={project.title}>
                        {project.title}
                    </h2>
                )}
                <p className="flex items-center justify-between text-xs text-stone-500">
                    <span>{formatRelativeTime(project.updatedAt)}</span>
                    <span>{project.nodes.length} 节点 · {project.connections.length} 连线</span>
                </p>
            </div>
        </article>
    );
}