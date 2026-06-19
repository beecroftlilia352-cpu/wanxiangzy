"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { BookOpen, Download, FileUp, FolderOpen, Menu, Plus, Trash2 } from "lucide-react";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "./components/canvas-project-card";
import { CanvasProjectDetailsPanel } from "./components/canvas-project-details-panel";
import { CanvasProjectSidebar, formatRelativeTime } from "./components/canvas-project-sidebar";
import { useFilteredProjects } from "./hooks/use-filtered-projects";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore } from "./stores/use-canvas-store";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { exportCanvasProjects } from "./utils/canvas-export";

export default function CanvasPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const projects = useCanvasStore((state) => state.projects);
    const createProject = useCanvasStore((state) => state.createProject);
    const importProject = useCanvasStore((state) => state.importProject);
    const selectedIds = useCanvasUiStore((state) => state.selectedProjectIds);
    const setDeleteIds = useCanvasUiStore((state) => state.setDeleteProjectIds);
    const searchQuery = useCanvasUiStore((state) => state.searchQuery);
    const starredOnly = useCanvasUiStore((state) => state.starredOnly);
    const selectedProjectId = useCanvasUiStore((state) => state.selectedProjectId);
    const setSelectedProjectId = useCanvasUiStore((state) => state.setSelectedProjectId);

    const sortedProjects = useMemo(() => [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [projects]);
    const visibleProjects = useFilteredProjects(sortedProjects, { searchQuery, starredOnly });

    const selectedProjects = useMemo(() => projects.filter((project) => selectedIds.includes(project.id)), [projects, selectedIds]);
    const sidebarProjects = sortedProjects;
    const detailsProject = useMemo(() => {
        if (selectedProjectId) {
            const match = projects.find((project) => project.id === selectedProjectId);
            if (match) return match;
        }
        return sortedProjects[0] ?? null;
    }, [projects, selectedProjectId, sortedProjects]);

    // Keep the details panel selection in sync with what the user is most
    // likely browsing — the most recently updated project on first paint,
    // and explicit selections thereafter. Clearing happens via the user
    // clicking a card-less area or after deletion (handled in card actions).
    useEffect(() => {
        if (!hydrated) return;
        if (selectedProjectId) return;
        const latest = sortedProjects[0];
        if (latest) setSelectedProjectId(latest.id);
    }, [hydrated, selectedProjectId, sortedProjects, setSelectedProjectId]);

    const enterProject = (id: string) => router.push(`/infinite-canvas/${id}`);

    const createAndEnter = () => {
        const id = createProject(`无限画布 ${projects.length + 1}`);
        enterProject(id);
    };

    const importCanvas = async (file?: File) => {
        if (!file) return;
        try {
            const zip = await readZip(file);
            const projectFile = zip.get("projects.json");
            if (!projectFile) throw new Error("missing projects.json");
            const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
            await Promise.all(
                data.projects.flatMap((project) =>
                    project.files.map(async (item) => {
                        const blob = zip.get(item.path);
                        if (!blob) return;
                        const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
                        await (item.storageKey.startsWith("image:") ? setImageBlob(item.storageKey, typedBlob) : setMediaBlob(item.storageKey, typedBlob));
                    }),
                ),
            );
            data.projects.forEach((item) => importProject(item.project));
            message.success(`已导入 ${data.projects.length} 个画布`);
        } catch {
            message.error("导入失败，请选择有效的画布压缩包");
        } finally {
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    return (
        <main className="flex min-h-[calc(100vh-76px)] overflow-hidden bg-[#fbfbfa] text-stone-950">
            <CanvasProjectSidebar projects={sidebarProjects} />

            <section className="flex min-w-0 flex-1 flex-col">
                <MobileSidebarTrigger projects={sidebarProjects} />

                <header className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-200 bg-white/60 px-6 py-5 backdrop-blur-sm">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">最近</p>
                        <h1 className="mt-1 text-2xl font-semibold tracking-tight">无限画布</h1>
                        <p className="mt-1 text-sm text-stone-500">
                            {visibleProjects.length === projects.length
                                ? `${projects.length} 个项目 · ${sortedProjects[0] ? `最近编辑 ${formatRelativeTime(sortedProjects[0].updatedAt)}` : "尚无最近活动"}`
                                : `${visibleProjects.length} / ${projects.length} 个项目`}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button href="/infinite-canvas/assets" icon={<FolderOpen aria-hidden="true" className="size-4" />} className="hidden sm:inline-flex">
                            素材库
                        </Button>
                        <Button href="/infinite-canvas/prompts" icon={<BookOpen aria-hidden="true" className="size-4" />} className="hidden sm:inline-flex">
                            提示词库
                        </Button>
                        {selectedIds.length ? (
                            <>
                                <Button
                                    disabled={!hydrated}
                                    icon={<Download aria-hidden="true" className="size-4" />}
                                    onClick={() => void exportCanvasProjects(selectedProjects, `无限画布-${selectedIds.length}个项目`)}
                                >
                                    导出选中 ({selectedIds.length})
                                </Button>
                                <Button disabled={!hydrated} icon={<Trash2 aria-hidden="true" className="size-4" />} onClick={() => setDeleteIds(selectedIds)}>
                                    删除选中 ({selectedIds.length})
                                </Button>
                            </>
                        ) : null}
                        <Button disabled={!hydrated} icon={<FileUp aria-hidden="true" className="size-4" />} onClick={() => inputRef.current?.click()}>
                            导入画布
                        </Button>
                        <Button disabled={!hydrated} type="primary" icon={<Plus aria-hidden="true" className="size-4" />} onClick={createAndEnter}>
                            新建画布
                        </Button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                    {!hydrated ? (
                        <section className="flex min-h-[360px] items-center justify-center text-sm text-stone-500">正在加载画布…</section>
                    ) : visibleProjects.length ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {visibleProjects.map((project) => (
                                <CanvasProjectCard key={project.id} project={project} />
                            ))}
                        </div>
                    ) : (
                        <EmptyState onCreate={createAndEnter} />
                    )}
                </div>
            </section>

            <CanvasProjectDetailsPanel project={detailsProject} />

            <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
            <CanvasDeleteProjectsDialog />

            {/* Selection summary toast at the bottom for bulk operations. */}
            {selectedIds.length > 1 ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
                    <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm shadow-lg">
                        <span className="font-medium">{selectedIds.length} 个项目已选中</span>
                        <Button size="small" icon={<Trash2 aria-hidden="true" className="size-3.5" />} onClick={() => setDeleteIds(selectedIds)}>
                            删除
                        </Button>
                        <Button size="small" onClick={() => void exportCanvasProjects(selectedProjects, `无限画布-${selectedIds.length}个项目`)} icon={<FileUp aria-hidden="true" className="size-3.5" />}>
                            导出
                        </Button>
                    </div>
                </div>
            ) : null}
        </main>
    );
}

function MobileSidebarTrigger({ projects }: { projects: import("./stores/use-canvas-store").CanvasProject[] }) {
    return (
        <div className="flex items-center border-b border-stone-200 px-4 py-2 md:hidden">
            <Sheet>
                <SheetTrigger asChild>
                    <button type="button" aria-label="打开画布库" className="grid size-9 place-items-center rounded-md border border-stone-200 bg-white text-stone-600">
                        <Menu aria-hidden="true" className="size-4" />
                    </button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                    <CanvasProjectSidebar projects={projects} />
                </SheetContent>
            </Sheet>
            <p className="ml-3 text-sm font-medium text-stone-700">画布库</p>
        </div>
    );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <section className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-white/60 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-stone-100 text-stone-600">
                <Plus aria-hidden="true" className="size-6" />
            </div>
            <h2 className="mt-5 text-xl font-medium">还没有画布</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-stone-500">新建一个画布后，就可以把图片、文字、视频和配置节点组织成可复用的创作流。</p>
            <Button type="primary" className="mt-6" icon={<Plus aria-hidden="true" className="size-4" />} onClick={onCreate}>
                新建画布
            </Button>
        </section>
    );
}