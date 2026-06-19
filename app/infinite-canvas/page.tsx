"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { ArrowRight, BookOpen, Download, FileUp, FolderOpen, Layers3, Plus, Sparkles, Trash2 } from "lucide-react";

import { readZip } from "@/lib/zip";
import { setMediaBlob } from "@/services/file-storage";
import { setImageBlob } from "@/services/image-storage";
import { CanvasDeleteProjectsDialog } from "./components/canvas-delete-projects-dialog";
import { CanvasProjectCard } from "./components/canvas-project-card";
import type { CanvasExportFile } from "./export-types";
import { useCanvasStore } from "./stores/use-canvas-store";
import { useCanvasUiStore } from "./stores/use-canvas-ui-store";
import { exportCanvasProjects } from "./utils/canvas-export";

const LANDING_SEEN_KEY = "infinite-canvas:landing-seen";

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
  const [landingReady, setLandingReady] = useState(false);
  const [showLanding, setShowLanding] = useState(false);

  useEffect(() => {
    const seen = window.localStorage.getItem(LANDING_SEEN_KEY) === "1";
    setShowLanding(!seen);
    setLandingReady(true);
  }, []);

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [projects]);
  const selectedProjects = useMemo(() => projects.filter((project) => selectedIds.includes(project.id)), [projects, selectedIds]);
  const totalNodes = useMemo(() => projects.reduce((sum, project) => sum + project.nodes.length, 0), [projects]);
  const totalConnections = useMemo(() => projects.reduce((sum, project) => sum + project.connections.length, 0), [projects]);

  const markLandingSeen = () => {
    window.localStorage.setItem(LANDING_SEEN_KEY, "1");
    setShowLanding(false);
  };

  const enterProject = (id: string) => {
    router.push(`/infinite-canvas/${id}`);
  };

  const createAndEnter = () => {
    markLandingSeen();
    enterProject(createProject(`无限画布 ${projects.length + 1}`));
  };

  const openLatestOrCreate = () => {
    markLandingSeen();
    const latest = sortedProjects[0];
    if (latest) {
      enterProject(latest.id);
      return;
    }
    enterProject(createProject("无限画布 1"));
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
      markLandingSeen();
      message.success(`已导入 ${data.projects.length} 个画布`);
    } catch {
      message.error("导入失败，请选择有效的画布压缩包");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!landingReady) {
    return (
      <main className="min-h-[calc(100vh-76px)] bg-[#fbfbfa] text-stone-950">
        <div className="mx-auto flex min-h-[520px] max-w-6xl items-center justify-center px-6 text-sm text-stone-500">正在加载画布...</div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-76px)] overflow-hidden bg-[#fbfbfa] text-stone-950">
      {showLanding ? (
        <LandingView hydrated={hydrated} onBegin={markLandingSeen} onOpen={openLatestOrCreate} />
      ) : (
        <section className="relative mx-auto flex w-full max-w-6xl flex-col gap-7 px-6 py-10">
          <div className="pointer-events-none absolute inset-0 -z-10 opacity-55 [background-image:radial-gradient(circle,#d7d7d2_1px,transparent_1px)] [background-size:18px_18px]" />

          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">画布库</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-normal">无限画布</h1>
              <p className="mt-2 text-sm text-stone-500">管理本地画布项目，导入导出节点、连线与素材引用。</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button href="/infinite-canvas/assets" icon={<FolderOpen className="size-4" />}>
                素材库
              </Button>
              <Button href="/infinite-canvas/prompts" icon={<BookOpen className="size-4" />}>
                提示词库
              </Button>
              {selectedIds.length ? (
                <>
                  <Button disabled={!hydrated} icon={<Download className="size-4" />} onClick={() => void exportCanvasProjects(selectedProjects, `无限画布-${selectedIds.length}个项目`)}>
                    导出选中
                  </Button>
                  <Button disabled={!hydrated} icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds(selectedIds)}>
                    删除选中
                  </Button>
                </>
              ) : null}
              {projects.length ? (
                <Button disabled={!hydrated} icon={<Trash2 className="size-4" />} onClick={() => setDeleteIds(projects.map((project) => project.id))}>
                  删除全部
                </Button>
              ) : null}
              <Button disabled={!hydrated} icon={<FileUp className="size-4" />} onClick={() => inputRef.current?.click()}>
                导入画布
              </Button>
              <Button disabled={!hydrated} type="primary" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                新建画布
              </Button>
            </div>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="项目" value={projects.length} />
            <Stat label="节点" value={totalNodes} />
            <Stat label="连线" value={totalConnections} />
          </div>

          {!hydrated ? (
            <section className="flex min-h-[360px] items-center justify-center border-y border-stone-200 text-sm text-stone-500">正在加载画布...</section>
          ) : sortedProjects.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedProjects.map((project) => (
                <CanvasProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-stone-200 text-center">
              <div className="grid size-12 place-items-center rounded-lg border border-stone-200 bg-white">
                <Layers3 className="size-5 text-stone-600" />
              </div>
              <h2 className="mt-5 text-xl font-medium">还没有画布</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-stone-500">新建一个画布后，就可以把图片、文字、视频和配置节点组织成可复用的创作流。</p>
              <Button type="primary" className="mt-6" icon={<Plus className="size-4" />} onClick={createAndEnter}>
                新建画布
              </Button>
            </section>
          )}
        </section>
      )}

      <input ref={inputRef} type="file" accept="application/zip,.zip" className="hidden" onChange={(event) => void importCanvas(event.target.files?.[0])} />
      <CanvasDeleteProjectsDialog />
    </main>
  );
}

function LandingView({ hydrated, onBegin, onOpen }: { hydrated: boolean; onBegin: () => void; onOpen: () => void }) {
  return (
    <section className="relative flex min-h-[calc(100vh-76px)] flex-col items-center overflow-hidden px-6">
      <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle,#deded9_1px,transparent_1px)] [background-size:18px_18px]" />
      <div className="pointer-events-none absolute left-[30%] top-16 size-16 rounded-full border border-stone-200" />

      <div className="relative z-10 flex w-full max-w-6xl flex-1 flex-col items-center justify-center pb-10 pt-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-600 shadow-sm">
          <Sparkles className="size-3.5" />
          图片、文字与图形的连续创作画布
        </div>
        <h1 className="mt-8 text-6xl font-semibold tracking-normal text-stone-950 md:text-7xl">无限画布</h1>
        <p className="mt-7 max-w-2xl text-sm leading-7 text-stone-600">在无限画布中生成、连接和重组图片、文字与图形，让创作从单次生成变成连续推演。</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button type="primary" size="large" onClick={onBegin}>
            开始使用 <ArrowRight className="ml-1 inline size-4" />
          </Button>
          <Button size="large" disabled={!hydrated} onClick={onOpen}>
            打开画布
          </Button>
        </div>
      </div>

      <div className="relative z-10 mb-14 w-full max-w-4xl border-t border-stone-200 pt-8">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div className="text-left">
            <h2 className="text-2xl font-semibold">沉淀每一次好结果</h2>
            <p className="mt-2 text-sm text-stone-500">收藏稳定出图的提示词、参考风格和结果图片，让下一次创作从已有经验开始。</p>
          </div>
          <button type="button" className="hidden text-sm font-medium text-stone-700 md:inline-flex" onClick={onBegin}>
            查看画布库 <ArrowRight className="ml-1 size-4" />
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {["生成节点", "连接上下文", "批量导出"].map((item) => (
            <div key={item} className="rounded-lg border border-stone-200 bg-white p-4 text-left shadow-sm">
              <div className="grid size-8 place-items-center rounded-md bg-stone-950 text-white">
                <Sparkles className="size-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{item}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-500">把灵感保存成可复用的画布资产。</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
