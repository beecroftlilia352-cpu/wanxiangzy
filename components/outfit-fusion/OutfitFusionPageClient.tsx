"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Clapperboard,
  Copy,
  Download,
  Eye,
  Loader2,
  PenLine,
  RefreshCw,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { OutfitFusionComposer } from "@/components/outfit-fusion/OutfitFusionComposer";
import { OutfitFusionExampleGallery } from "@/components/outfit-fusion/OutfitFusionExampleGallery";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { cn, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { isTaskRunning, safeTaskQueueUrls, type TaskQueueItem, type TaskStatusGroup } from "@/lib/task-queue";
import { getCreditCost } from "@/lib/api/lingya";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { fetchHistoryApplyDetail, takeApplyDetail, type HistoryApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import {
  buildOutfitFusionComposerText,
  buildOutfitFusionPrompt,
  clampOutfitFusionCount,
  DEFAULT_OUTFIT_FUSION_CONFIG,
  getOutfitFusionRoleLabel,
  getOutfitFusionDisplayPrompt,
  normalizeOutfitFusionAssistantPrompt,
  outfitFusionReferencesFromAssets,
  OUTFIT_FUSION_TEMPLATES,
  type OutfitFusionAsset,
  type OutfitFusionAssetRole,
  type OutfitFusionConfig,
  type OutfitFusionTemplate,
} from "@/lib/outfit-fusion";
import { createGenericImagePreviewSession, type ImagePreviewAction } from "@/lib/studio-image-preview";

type OutfitFusionTask = {
  id: string;
  remoteId?: string | null;
  taskNo: string;
  templateId?: string | null;
  createdAt: string;
  statusGroup: TaskStatusGroup;
  progress: number;
  prompt: string;
  requestPrompt: string;
  inputAssets: OutfitFusionAsset[];
  config: OutfitFusionConfig;
  expectedCount: number;
  resultUrls: string[];
  error?: string | null;
};

const PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "repair", label: "高清修复" },
  { kind: "productSet", label: "裂变套图" },
  { kind: "aiVideo", label: "生成视频" },
  { kind: "modelBackground", label: "智能改图" },
  { kind: "regenerateAll", label: "重新生成" },
  { kind: "feedback", label: "反馈" },
];

const INPUT_ASSET_PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
];

export function OutfitFusionPageClient() {
  const router = useRouter();
  const [assets, setAssets] = useState<OutfitFusionAsset[]>([]);
  const [prompt, setPrompt] = useState("");
  const [config, setConfig] = useState<OutfitFusionConfig>(DEFAULT_OUTFIT_FUSION_CONFIG);
  const [selectedTemplate, setSelectedTemplate] = useState<OutfitFusionTemplate | null>(null);
  const [tasks, setTasks] = useState<OutfitFusionTask[]>([]);
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const [uploadRole, setUploadRole] = useState<OutfitFusionAssetRole>("outfit");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [autoWriting, setAutoWriting] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [composerReserveHeight, setComposerReserveHeight] = useState(320);
  const [preview, setPreview] = useState<{ taskId: string; index: number } | null>(null);
  const [assetPreviewId, setAssetPreviewId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const taskListRef = useRef<HTMLDivElement | null>(null);
  const composerWrapRef = useRef<HTMLDivElement | null>(null);
  const lastScrollYRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollIntentRef = useRef<{ direction: "up" | "down" | null; distance: number }>({ direction: null, distance: 0 });
  const lastComposerToggleAtRef = useRef(0);
  const {
    authChecked,
    isAuthenticated,
    credits,
    setCredits,
    refreshAuth,
  } = useStudioAuth();
  const authIsAnonymous = authChecked && !isAuthenticated;
  const totalCost = getCreditCost(config.aiModel, config.imageSize, config.aspectRatio) * clampOutfitFusionCount(config.genCount);
  const taskQueue = useTaskQueueGeneration({
    module: "outfitFusion",
    title: "搭配融图",
    defaultExpectedCount: DEFAULT_OUTFIT_FUSION_CONFIG.genCount,
    applyPath: "/outfit-fusion",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detail = await takeApplyDetail("outfitFusion");
      if (cancelled || !detail) return;
      applyOutfitFusionApplyDetail(detail);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleHistoryApply(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; module?: string }>).detail;
      if (!detail?.id || (detail.module && detail.module !== "outfitFusion")) return;
      const generationId = detail.id;
      void (async () => {
        try {
          const historyDetail = await fetchHistoryApplyDetail(generationId, "outfitFusion");
          applyOutfitFusionApplyDetail(historyDetail);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "作品库参数加载失败");
        }
      })();
    }

    window.addEventListener("wanxiang:history-apply", handleHistoryApply);
    return () => window.removeEventListener("wanxiang:history-apply", handleHistoryApply);
  }, []);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    scrollIntentRef.current = { direction: null, distance: 0 };
    if (window.scrollY > 180) {
      setComposerCollapsed(true);
    }
    const restoreChecks = [120, 360, 760].map((delay) =>
      window.setTimeout(() => {
        const scrollTop = window.scrollY;
        lastScrollYRef.current = scrollTop;
        if (scrollTop > 180) {
          setComposerCollapsed(true);
        }
      }, delay)
    );
    function applyScrollIntent(delta: number, scrollTop: number) {
      const absDelta = Math.abs(delta);
      const activeElement = document.activeElement;
      const isEditingComposer = activeElement instanceof Element && Boolean(composerWrapRef.current?.contains(activeElement));
      if (isEditingComposer || absDelta < 3) return;

      if (scrollTop < 96 && delta < 0) {
        scrollIntentRef.current = { direction: null, distance: 0 };
        setComposerCollapsed(false);
        return;
      }

      const direction = delta > 0 ? "down" : "up";
      const currentIntent = scrollIntentRef.current;
      scrollIntentRef.current = currentIntent.direction === direction
        ? { direction, distance: currentIntent.distance + absDelta }
        : { direction, distance: absDelta };

      const now = window.performance.now();
      if (now - lastComposerToggleAtRef.current < 240) return;

      if (direction === "down" && scrollIntentRef.current.distance >= 72 && !composerCollapsed) {
        lastComposerToggleAtRef.current = now;
        scrollIntentRef.current = { direction, distance: 0 };
        setComposerCollapsed(true);
      }

      if (direction === "up" && scrollIntentRef.current.distance >= 44 && composerCollapsed) {
        lastComposerToggleAtRef.current = now;
        scrollIntentRef.current = { direction, distance: 0 };
        setComposerCollapsed(false);
      }
    }

    function handleScroll() {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        const scrollTop = window.scrollY;
        const delta = scrollTop - lastScrollYRef.current;
        lastScrollYRef.current = scrollTop;
        applyScrollIntent(delta, scrollTop);
      });
    }
    function handleWheel(event: WheelEvent) {
      const target = event.target;
      if (target instanceof Element && composerWrapRef.current?.contains(target)) return;
      const projectedScrollTop = Math.max(0, window.scrollY + event.deltaY);
      applyScrollIntent(event.deltaY, projectedScrollTop);
    }
    const scrollPoll = window.setInterval(() => {
      const scrollTop = window.scrollY;
      const delta = scrollTop - lastScrollYRef.current;
      if (Math.abs(delta) < 3) return;
      lastScrollYRef.current = scrollTop;
      applyScrollIntent(delta, scrollTop);
    }, 120);

    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true });
    document.body?.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll);
      document.body?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("wheel", handleWheel);
      window.clearInterval(scrollPoll);
      restoreChecks.forEach((timer) => window.clearTimeout(timer));
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [assets.length, composerCollapsed, prompt, tasks.length]);

  useEffect(() => {
    const node = composerWrapRef.current;
    if (!node) return;
    const targetNode = node;
    function updateHeight() {
      const nextHeight = Math.ceil(targetNode.getBoundingClientRect().height);
      setComposerHeight(nextHeight);
      if (!composerCollapsed) {
        setComposerReserveHeight(Math.max(320, nextHeight + 48));
      }
    }
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(targetNode);
    window.addEventListener("resize", updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [assets.length, autoWriting, composerCollapsed, config.aiModel, config.genCount, config.imageSize, creating, prompt, uploading]);

  const previewTask = useMemo(() => {
    if (!preview) return null;
    return tasks.find((task) => task.id === preview.taskId) || null;
  }, [preview, tasks]);

  const composerBottomReserve = Math.max(320, composerReserveHeight, composerHeight + 24);

  const previewSession = useMemo(() => {
    if (!previewTask) return null;
    return createGenericImagePreviewSession({
      module: "outfitFusion",
      title: "搭配融图生成",
      urls: previewTask.resultUrls,
      expectedCount: previewTask.expectedCount,
      statusGroup: previewTask.statusGroup,
      taskId: previewTask.remoteId || previewTask.taskNo,
      createdAt: previewTask.createdAt,
      references: outfitFusionReferencesFromAssets(previewTask.inputAssets),
      promptText: previewTask.prompt,
      selectedIndex: preview?.index || 0,
      resultTitlePrefix: "生成图",
      aspectRatio: previewTask.config.aspectRatio,
      metaItems: [
        { label: "来源", value: "搭配融图生成" },
        { label: "比例", value: previewTask.config.aspectRatio },
        { label: "分辨率", value: previewTask.config.imageSize },
        { label: "模型", value: previewTask.config.aiModel },
        { label: "任务 ID", value: previewTask.remoteId || previewTask.taskNo },
      ],
    });
  }, [preview?.index, previewTask]);

  const assetPreviewIndex = useMemo(() => {
    if (!assetPreviewId) return -1;
    return assets.findIndex((asset) => asset.id === assetPreviewId);
  }, [assetPreviewId, assets]);

  const assetPreviewSession = useMemo(() => {
    if (assetPreviewIndex < 0) return null;
    const selectedAsset = assets[assetPreviewIndex];
    if (!selectedAsset) return null;
    const label = selectedAsset.name || getIndexedAssetLabel(selectedAsset, assetPreviewIndex);
    return createGenericImagePreviewSession({
      module: "outfitFusion",
      title: "输入素材预览",
      urls: assets.map((asset) => asset.url),
      expectedCount: assets.length,
      statusGroup: "completed",
      references: outfitFusionReferencesFromAssets(assets),
      promptText: prompt,
      selectedIndex: assetPreviewIndex,
      resultTitlePrefix: "输入素材",
      aspectRatio: config.aspectRatio,
      metaItems: [
        { label: "素材类型", value: getOutfitFusionRoleLabel(selectedAsset.role) },
        { label: "素材编号", value: label },
        { label: "比例", value: config.aspectRatio },
      ],
    });
  }, [assetPreviewIndex, assets, config.aspectRatio, prompt]);

  useEffect(() => {
    if (assetPreviewId && !assets.some((asset) => asset.id === assetPreviewId)) {
      setAssetPreviewId(null);
    }
  }, [assetPreviewId, assets]);

  const activePreviewSession = assetPreviewSession || previewSession;
  const activePreviewIndex = assetPreviewSession ? assetPreviewIndex : preview?.index || 0;

  function applyTemplate(template: OutfitFusionTemplate) {
    const namedAssets = template.assets.map((asset, index) => ({
      ...asset,
      name: asset.name || getTemplateAssetName(template.assets, asset, index),
    }));
    setSelectedTemplate(template);
    setAssets(namedAssets);
    setPrompt(limitComposerPrompt(buildOutfitFusionComposerText(template)));
    setConfig((current) => ({
      ...current,
      genCount: clampOutfitFusionCount(template.outputCount || current.genCount),
      aspectRatio: "3:4",
    }));
    setComposerCollapsed(false);
  }

  function handleUploadClick(role: OutfitFusionAssetRole) {
    setUploadRole(role);
    window.requestAnimationFrame(() => {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.click();
      }
    });
  }

  async function handleFiles(files: FileList | File[] | null, roleOverride = uploadRole) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const role = roleOverride;
    const limited = role === "outfit" ? selected.slice(0, Math.max(1, 8 - assets.filter((asset) => asset.role === "outfit").length)) : selected.slice(0, 1);
    const valid = limited.filter((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name} 不是图片文件`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} 超过 ${MAX_FILE_SIZE_MB}MB`);
        return false;
      }
      return true;
    });
    if (!valid.length) return;

    setUploading(true);
    try {
      const uploaded: OutfitFusionAsset[] = [];
      for (const file of valid) {
        const result = await uploadImage(file);
        uploaded.push({
          id: `upload-${Date.now()}-${uploaded.length}`,
          role,
          url: result.display_url || result.url,
          name: getUploadedAssetName(role, assets, uploaded.length),
        });
      }
      setSelectedTemplate(null);
      setAssets((current) => {
        const kept = role === "outfit" ? current : current.filter((asset) => asset.role !== role);
        return [...kept, ...uploaded].slice(0, 10);
      });
      if (!prompt.trim()) {
        setPrompt(limitComposerPrompt(buildPromptDraft(uploaded, role)));
      }
      toast.success("素材已上传到 OSS");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveAsset(id: string) {
    setAssets((current) => current.filter((asset) => asset.id !== id));
    setSelectedTemplate(null);
  }

  function handleClear() {
    setAssets([]);
    setPrompt("");
    setSelectedTemplate(null);
    setConfig(DEFAULT_OUTFIT_FUSION_CONFIG);
  }

  async function handleAutoWrite() {
    if (!assets.length) {
      toast.info("请先上传或套用搭配素材");
      return;
    }
    const seedPrompt = prompt.trim() || (selectedTemplate ? buildOutfitFusionComposerText(selectedTemplate) : buildPromptDraft(assets, "outfit"));
    setAutoWriting(true);
    try {
      const response = await fetch("/api/general-image/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "image-to-image",
          reference_urls: assets.map((asset) => asset.url),
          prompt: buildVisionPromptRequest(assets, seedPrompt),
        }),
      });
      const data = await response.json().catch(() => ({})) as { prompt?: unknown; source?: unknown; error?: unknown };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "AI 帮写失败");
      }
      const nextPrompt = data.source === "fallback"
        ? seedPrompt
        : typeof data.prompt === "string" && data.prompt.trim()
        ? normalizeOutfitFusionAssistantPrompt(data.prompt, seedPrompt)
        : seedPrompt;
      setPrompt(limitComposerPrompt(getOutfitFusionDisplayPrompt(nextPrompt, seedPrompt)));
      toast.success(data.source === "fallback" ? "已生成搭配描述" : "视觉分析完成");
    } catch (error) {
      setPrompt(seedPrompt);
      toast.error(error instanceof Error ? error.message : "AI 帮写失败，已保留基础描述");
    } finally {
      setAutoWriting(false);
    }
  }

  function handleJumpToBottom() {
    setComposerCollapsed(false);
    scrollNodeIntoView(bottomRef.current, "end", 30);
  }

  function scrollTaskListToTop(delay = 0) {
    scrollNodeToViewportTop(taskListRef.current, 84, delay);
    scrollNodeToViewportTop(taskListRef.current, 84, delay + 240);
  }

  function handleExpandComposer() {
    setComposerCollapsed(false);
  }

  function handleCollapseComposer() {
    setComposerCollapsed(true);
  }

  function handleReedit(task: OutfitFusionTask) {
    setAssets(task.inputAssets);
    setPrompt(limitComposerPrompt(task.prompt));
    setConfig(task.config);
    setSelectedTemplate(OUTFIT_FUSION_TEMPLATES.find((item) => item.id === task.templateId) || null);
    setComposerCollapsed(false);
  }

  function handleDeleteTask(id: string) {
    setTasks((current) => current.filter((task) => task.id !== id));
  }

  async function handleCopyTask(task: OutfitFusionTask) {
    const value = task.remoteId || task.taskNo;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("任务编号已复制");
    } catch {
      toast.error("复制失败，请手动选择任务编号");
    }
  }

  function handleGenerate() {
    void createTaskFromState(assets, prompt, config, selectedTemplate);
  }

  async function handleRegenerate(task: OutfitFusionTask) {
    const template = OUTFIT_FUSION_TEMPLATES.find((item) => item.id === task.templateId) || null;
    await createTaskFromState(task.inputAssets, task.prompt, task.config, template);
  }

  async function createTaskFromState(
    inputAssets: OutfitFusionAsset[],
    inputPrompt: string,
    inputConfig: OutfitFusionConfig,
    template: OutfitFusionTemplate | null
  ) {
    if (!inputAssets.length) {
      toast.error("请先上传或套用搭配素材");
      return;
    }
    if (!inputPrompt.trim()) {
      toast.error("请先填写搭配描述");
      return;
    }

    const expectedCount = clampOutfitFusionCount(inputConfig.genCount);
    const taskCost = getCreditCost(inputConfig.aiModel, inputConfig.imageSize, inputConfig.aspectRatio) * expectedCount;
    const inputThumbnails = inputAssets.map((asset) => asset.url);
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error("请先登录");
      router.push("/login");
      return;
    }
    if (credits !== null && credits < taskCost) {
      showInsufficientCreditsToast({ required: taskCost, balance: credits, onRecharge: () => router.push("/pricing") });
      return;
    }

    const taskId = `outfit-fusion-${Date.now()}`;
    const taskNo = String(281115000 + Math.floor(Math.random() * 9000));
    const requestPrompt = buildOutfitFusionPrompt({
      templatePrompt: inputPrompt,
      assets: inputAssets,
      config: inputConfig,
    });
    const task: OutfitFusionTask = {
      id: taskId,
      taskNo,
      templateId: template?.id || null,
      createdAt: new Date().toISOString(),
      statusGroup: "running",
      progress: 12,
      prompt: inputPrompt,
      requestPrompt,
      inputAssets: inputAssets.map((asset) => ({ ...asset })),
      config: { ...inputConfig, genCount: expectedCount },
      expectedCount,
      resultUrls: [],
    };

    setTasks([task]);
    taskQueue.startTask({
      id: taskId,
      expectedCount,
      inputThumbnails,
      progress: task.progress,
      status: "processing",
      statusGroup: "running",
      applyUrl: "",
    });
    setComposerCollapsed(true);
    scrollTaskListToTop(80);
    toast.success("创建成功，请等待任务执行完成");

    setCreating(true);
    try {
      const result = await submitGeneration(task);
      setCreating(false);
      if (typeof result.creditsRemaining === "number") setCredits(result.creditsRemaining);
      const remoteId = result.generationId;
      if (remoteId) {
        updateTask(taskId, { remoteId, progress: 24 });
        taskQueue.replaceWithServerTask(taskId, {
          id: remoteId,
          expectedCount,
          inputThumbnails,
          progress: 24,
          status: "processing",
          statusGroup: "running",
          applyUrl: `/outfit-fusion?task=${encodeURIComponent(remoteId)}`,
        });
        taskQueue.refresh();
        void pollGeneration(taskId, remoteId, expectedCount, inputThumbnails).catch(async (error) => {
          taskQueue.markFailed(remoteId, error instanceof Error ? error.message : "生成轮询超时", {
            expectedCount,
            inputThumbnails,
          });
          updateTask(taskId, {
            error: error instanceof Error ? error.message : "生成轮询超时",
            progress: 100,
            statusGroup: "failed",
          });
          taskQueue.refresh();
        });
      } else {
        taskQueue.markFailed(taskId, "任务提交失败，未返回任务编号", {
          expectedCount,
          inputThumbnails,
        });
        updateTask(taskId, {
          error: "任务提交失败，未返回任务编号",
          progress: 100,
          statusGroup: "failed",
        });
      }
    } catch (error) {
      setCreating(false);
      const message = error instanceof Error ? error.message : "生成任务提交失败";
      taskQueue.markFailed(taskId, message, {
        expectedCount,
        inputThumbnails,
      });
      updateTask(taskId, { error: message, progress: 100, statusGroup: "failed" });
      toast.error(message);
    }
  }

  async function submitGeneration(task: OutfitFusionTask): Promise<{ generationId: string | null; creditsRemaining?: number }> {
    const response = await fetch("/api/general-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "image-to-image",
        prompt: task.requestPrompt,
        user_prompt: task.prompt,
        reference_urls: task.inputAssets.map((asset) => asset.url),
        input_assets: task.inputAssets.map((asset) => ({
          id: asset.id,
          role: asset.role,
          url: asset.url,
          name: asset.name,
        })),
        ai_model: task.config.aiModel,
        aspect_ratio: task.config.aspectRatio,
        image_size: task.config.imageSize,
        gen_count: task.expectedCount,
        module_kind: "outfitFusion",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        await refreshAuth();
        router.push("/login");
      }
      if (response.status === 402 && typeof data.balance === "number") {
        setCredits(data.balance);
      }
      throw new Error(typeof data.error === "string" ? data.error : "生成任务提交失败");
    }
    return {
      generationId: typeof data.generation_id === "string" ? data.generation_id : null,
      creditsRemaining: typeof data.credits_remaining === "number" ? data.credits_remaining : undefined,
    };
  }

  async function pollGeneration(taskId: string, remoteId: string, expectedCount: number, inputThumbnails: string[]) {
    let latestUrls: string[] = [];
    for (let attempt = 0; attempt < 90; attempt++) {
      await wait(2000);
      const response = await fetch(`/api/general-image?generation_id=${encodeURIComponent(remoteId)}`);
      if (!response.ok) continue;
      const state = await response.json();
      const progress = Number(state.progress);
      const nextProgress = Number.isFinite(progress) ? Math.min(Math.max(Math.round(progress), 24), 99) : Math.min(24 + attempt * 3, 92);
      if (Array.isArray(state.result_urls) && state.result_urls.length) {
        latestUrls = state.result_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0);
      }
      updateTask(taskId, {
        statusGroup: state.status === "completed" ? "completed" : state.status === "failed" ? "failed" : "running",
        progress: state.status === "completed" ? 100 : nextProgress,
        resultUrls: latestUrls,
        expectedCount,
        error: typeof state.error === "string" ? state.error : null,
      });
      if (state.status === "completed") {
        taskQueue.markCompleted(remoteId, {
          expectedCount,
          inputThumbnails,
          resultThumbnails: latestUrls,
          resultCount: latestUrls.length,
        });
        toast.success("搭配融图生成完成");
        taskQueue.refresh();
        return;
      }
      if (state.status === "failed") {
        taskQueue.markFailed(remoteId, typeof state.error === "string" ? state.error : "生成失败", {
          expectedCount,
          inputThumbnails,
          resultThumbnails: latestUrls,
          resultCount: latestUrls.length,
        });
        throw new Error(typeof state.error === "string" ? state.error : "生成失败");
      }
      taskQueue.markRunning(remoteId, {
        expectedCount,
        inputThumbnails,
        resultThumbnails: latestUrls,
        resultCount: latestUrls.length,
        progress: nextProgress,
        status: "processing",
      });
    }
    throw new Error("生成超时");
  }

  function updateTask(id: string, patch: Partial<OutfitFusionTask>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  }

  function handleContinueCreate() {
    setPreview(null);
    setAssetPreviewId(null);
    setTasks([]);
    setAssets([]);
    setPrompt("");
    setSelectedTemplate(null);
    setConfig(DEFAULT_OUTFIT_FUSION_CONFIG);
    setComposerCollapsed(false);
  }

  function handleRailRunningTask(item: TaskQueueItem) {
    const existing = tasks.find((task) => task.remoteId === item.id || task.id === item.id);
    if (existing) {
      scrollTaskListToTop(40);
      return;
    }
    upsertTaskFromQueueItem(item);
    scrollTaskListToTop(40);
  }

  async function handleRailTaskSelect(item: TaskQueueItem, session: TaskSelectionSession) {
    if (session.reason === "restore" && item.statusGroup !== "running" && item.statusGroup !== "queued") {
      return true;
    }
    try {
      const detail = await fetchHistoryApplyDetail(item.id, "outfitFusion", session.signal);
      if (!session.isCurrent()) return true;
      if (detail.payload.kind !== "outfitFusion") {
        upsertTaskFromQueueItem(item);
        return true;
      }
      applyOutfitFusionHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), item, {
        silent: session.reason === "restore",
      });
      return true;
    } catch (error) {
      if (session.signal.aborted || !session.isCurrent()) return true;
      upsertTaskFromQueueItem(item);
      if (item.statusGroup === "failed") toast.error(item.error || "历史任务加载失败");
      return true;
    }
  }

  function applyOutfitFusionHistoryPayload(
    payload: Extract<HistoryJobPayload, { kind: "outfitFusion" }>,
    resultUrls: string[],
    item: TaskQueueItem,
    options?: { silent?: boolean }
  ) {
    const restoredAssets = restoreOutfitFusionAssetsFromPayload(payload, item.id);
    const restoredConfig: OutfitFusionConfig = {
      aiModel: payload.aiModel,
      aspectRatio: payload.aspectRatio === "1:1" ? "1:1" : "3:4",
      imageSize: payload.imageSize,
      quality: DEFAULT_OUTFIT_FUSION_CONFIG.quality,
      genCount: clampOutfitFusionCount(payload.genCount),
    };
    const displayPrompt = getOutfitFusionDisplayPrompt(payload.userPrompt || payload.prompt);

    setSelectedTemplate(null);
    setAssets(restoredAssets);
    setPrompt(limitComposerPrompt(displayPrompt));
    setConfig(restoredConfig);
    upsertTaskFromQueueItem(item, {
      prompt: displayPrompt,
      requestPrompt: payload.prompt,
      inputAssets: restoredAssets,
      config: restoredConfig,
      resultUrls,
      statusGroup: resultUrls.length ? "completed" : item.statusGroup,
      progress: resultUrls.length ? 100 : item.progress,
    });
    setComposerCollapsed(false);
    scrollTaskListToTop(80);
    if (!options?.silent) toast.success("已套用侧边历史任务");
  }

  function applyOutfitFusionApplyDetail(
    detail: HistoryApplyDetail<"outfitFusion">,
    options?: { silent?: boolean }
  ) {
    const item = createTaskQueueItemFromApplyDetail(detail);
    applyOutfitFusionHistoryPayload(
      detail.payload,
      detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails),
      item,
      options
    );
  }

  function createTaskQueueItemFromApplyDetail(detail: HistoryApplyDetail<"outfitFusion">): TaskQueueItem {
    const id = detail.row.id || `history-${Date.now()}`;
    const resultUrls = detail.resultUrls;
    const inputThumbnails = getOutfitFusionPayloadAssetUrls(detail.payload);
    const statusGroup: TaskStatusGroup = resultUrls.length
      ? "completed"
      : String(detail.row.status || "").toLowerCase().includes("fail")
        ? "failed"
        : "running";
    const now = new Date().toISOString();
    return {
      id,
      module: "outfitFusion",
      title: "搭配融图",
      status: detail.row.status || (statusGroup === "completed" ? "completed" : "processing"),
      statusGroup,
      time: "0:00",
      createdAt: now,
      updatedAt: now,
      completedAt: statusGroup === "completed" ? now : null,
      error: "",
      progress: statusGroup === "completed" ? 100 : statusGroup === "failed" ? 0 : 30,
      expectedCount: clampOutfitFusionCount(detail.payload.genCount),
      resultCount: resultUrls.length,
      inputThumbnails,
      resultThumbnails: resultUrls,
      thumbnails: resultUrls.length ? resultUrls : inputThumbnails.slice(0, 4),
      applyUrl: `/outfit-fusion?apply=${encodeURIComponent(id)}`,
    };
  }

  function upsertTaskFromQueueItem(item: TaskQueueItem, patch: Partial<OutfitFusionTask> = {}) {
    const inputAssets = patch.inputAssets || safeTaskQueueUrls(item.inputThumbnails).map((url, index) => ({
      id: `queue-${item.id}-${index}`,
      role: "outfit" as const,
      url,
      name: getIndexedAssetLabel({ role: "outfit" }, index),
    }));
    const resultUrls = patch.resultUrls || safeTaskQueueUrls(item.resultThumbnails);
    const restoredTask: OutfitFusionTask = {
      id: `queue-${item.id}`,
      remoteId: item.id,
      taskNo: item.id,
      templateId: null,
      createdAt: item.createdAt,
      statusGroup: item.statusGroup,
      progress: item.progress,
      prompt: item.title || "搭配融图任务",
      requestPrompt: item.title || "搭配融图任务",
      inputAssets,
      config: DEFAULT_OUTFIT_FUSION_CONFIG,
      expectedCount: Math.max(1, item.expectedCount || resultUrls.length || DEFAULT_OUTFIT_FUSION_CONFIG.genCount),
      resultUrls,
      error: item.error || null,
      ...patch,
    };
    setTasks([restoredTask]);
  }

  function buildVisionPromptRequest(inputAssets: OutfitFusionAsset[], seedPrompt: string) {
    const roleLines = inputAssets.map((asset, index) => {
      const label = getPromptAssetLabel(asset, index);
      if (asset.role === "reference") {
        return `图${index + 1}对应【${label}】：只参考人物姿态、构图、场景、光影和穿搭关系，不复制无关商品。`;
      }
      if (asset.role === "model") {
        return `图${index + 1}对应【${label}】：只参考最终模特的脸型、发型、身形比例、年龄气质和身份特征。`;
      }
      return `图${index + 1}对应【${label}】：识别商品类别、颜色、材质、版型、图案、Logo、鞋包配饰和正确穿戴位置。`;
    });

    return [
      "这是搭配融图的 AI 帮写任务，请调用视觉理解能力分析所有输入图。",
      "只输出一段可直接放进输入框的中文自然语言提示词，长度 60-180 字，不要分段，不要标题，不要列表，不要 Markdown，不要解释。",
      "输出格式：让【参考图X】的模特穿着【搭配图Y】的商品，戴着【搭配图Z】的配饰，拿着【搭配图N】的包，把模特换成【模特图M】的模特。X/Y/Z/N/M 必须替换成真实素材编号，不要照抄格式示例。",
      "必须保留并使用【参考图1】、【搭配图2】、【模特图6】这类完整编号标记；不要只写“图1”“参考图”或“第一张图”。",
      "如果有参考图，用“让【参考图X】的模特...”开头；如果没有参考图，用“让模特...”开头；如果有模特图，用“把模特换成【模特图X】的模特”结尾。",
      "搭配图只写商品关系：穿着、戴着、拿着、背着、佩戴等动作，以及品类、颜色、材质、图案、款式；不要写素材规则、负面约束、生成张数、模型名、比例、清晰度、拼图、宫格、模板、候选图、多张图或合集。",
      "图片输入关系如下，仅供你判断编号和商品，不要原样输出：",
      ...roleLines,
      seedPrompt ? "当前输入框内容已经是最终图片关系句；仅允许修正识别错误或补充缺失商品，不要输出任何说明前缀。" : "",
      seedPrompt || "",
      "最终只返回这一句话本身，不要追加“真实自然商业摄影质感”等后台固定规则。",
    ].filter(Boolean).join("\n");
  }

  return (
    <div className="studio-workbench outfit-fusion-workbench flex min-h-[calc(100dvh-64px)] flex-col bg-[#f4f5fb] lg:flex-row">
      <FeatureTabs active="outfitFusion" />
      <ModuleTaskRail
        module="outfitFusion"
        moduleLabel="搭配融图"
        onContinue={handleContinueCreate}
        onRunningTask={handleRailRunningTask}
        onCompletedTask={handleRailTaskSelect}
      />

      <main
        ref={mainRef}
        className="min-w-0 flex-1 overflow-visible"
        style={{ paddingBottom: composerBottomReserve }}
      >
        <section className="px-4 pb-8 pt-10 sm:px-6 lg:px-10">
          <div className="mx-auto mb-5 w-full max-w-[1120px] text-[12px] leading-5 tracking-normal text-slate-400">
            因产品处于持续学习调优阶段，可能有不恰当的信息，请您谨慎甄别。
          </div>

          <div ref={taskListRef} className="mx-auto w-full max-w-[1120px]">
            <div className={cn("space-y-4", tasks.length > 0 && "mb-8")}>
              {tasks.map((task, index) => (
                <OutfitFusionTaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  onPreview={(index) => setPreview({ taskId: task.id, index })}
                  onReedit={() => handleReedit(task)}
                  onReuseInputs={() => handleReedit(task)}
                  onRegenerate={() => void handleRegenerate(task)}
                  onCopy={() => void handleCopyTask(task)}
                  onDelete={() => handleDeleteTask(task.id)}
                />
              ))}
            </div>
          </div>

          <div className={cn("animate-fade-in motion-reduce:animate-none", tasks.length > 0 && "mt-8")}>
            <h1 className="mb-6 text-center text-[24px] font-semibold leading-[34px] tracking-normal text-slate-900">自由搭配组合，生成模特图</h1>
            <OutfitFusionExampleGallery
              templates={OUTFIT_FUSION_TEMPLATES}
              activeTemplateId={selectedTemplate?.id || null}
              onUseTemplate={applyTemplate}
            />
          </div>
        </section>

        <div ref={bottomRef} className="h-1" />
      </main>

      <div
        ref={composerWrapRef}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform lg:left-[calc(var(--studio-nav-rail-width)+var(--studio-task-rail-width))] lg:right-0 lg:px-6"
      >
        <OutfitFusionComposer
          assets={assets}
          prompt={prompt}
          config={config}
          collapsed={composerCollapsed}
          generating={creating}
          autoWriting={autoWriting}
          uploading={uploading}
          creditCost={totalCost}
          credits={credits}
          authIsAnonymous={authIsAnonymous}
          onPromptChange={setPrompt}
          onConfigChange={setConfig}
          onUploadClick={handleUploadClick}
          onUploadFiles={(role, files) => void handleFiles(files, role)}
          onPreviewAsset={setAssetPreviewId}
          onRemoveAsset={handleRemoveAsset}
          onClear={handleClear}
          onAutoWrite={handleAutoWrite}
          onGenerate={handleGenerate}
          onCollapse={handleCollapseComposer}
          onExpand={handleExpandComposer}
          onJumpToBottom={handleJumpToBottom}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/heic"
        multiple={uploadRole === "outfit"}
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      {activePreviewSession ? (
        <StudioImagePreviewDialog
          open
          onClose={() => {
            if (assetPreviewSession) {
              setAssetPreviewId(null);
            } else {
              setPreview(null);
            }
          }}
          session={activePreviewSession}
          filenamePrefix="outfit-fusion"
          selectedIndex={activePreviewIndex}
          onSelectedIndexChange={(index) => {
            if (assetPreviewSession) {
              const nextAsset = assets[index];
              if (nextAsset) setAssetPreviewId(nextAsset.id);
              return;
            }
            if (preview) setPreview({ taskId: preview.taskId, index });
          }}
          actions={assetPreviewSession ? INPUT_ASSET_PREVIEW_ACTIONS : PREVIEW_ACTIONS}
          onRegenerateAll={assetPreviewSession || !previewTask ? undefined : () => {
            void handleRegenerate(previewTask);
          }}
        />
      ) : null}
    </div>
  );
}

function OutfitFusionTaskCard({
  task,
  index,
  onPreview,
  onReedit,
  onReuseInputs,
  onRegenerate,
  onCopy,
  onDelete,
}: {
  task: OutfitFusionTask;
  index: number;
  onPreview: (index: number) => void;
  onReedit: () => void;
  onReuseInputs: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const running = task.statusGroup === "running" || task.statusGroup === "queued";
  const failed = task.statusGroup === "failed";
  const slots = Math.max(task.expectedCount, task.resultUrls.length, 1);
  const hasPendingSlot = running && task.resultUrls.length < slots;
  const displaySlots = running ? Math.max(task.resultUrls.length + (hasPendingSlot ? 1 : 0), 1) : slots;
  const compactRunning = running && task.resultUrls.length === 0;
  const [promptExpanded, setPromptExpanded] = useState(false);
  const canExpandPrompt = task.prompt.length > 64;

  return (
    <article
      className="animate-slide-up rounded-[8px] bg-white p-3 shadow-sm ring-1 ring-slate-100 transition duration-300 hover:shadow-[0_14px_34px_rgba(15,23,42,0.09)] motion-reduce:animate-none sm:p-4"
      style={{ animationDelay: `${Math.min(index * 40, 160)}ms` }}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <TaskInputReuseStack assets={task.inputAssets} onReuse={onReuseInputs} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-[14px] leading-[23px] tracking-normal text-slate-900", !promptExpanded && "line-clamp-2")}>{task.prompt}</p>
            {canExpandPrompt ? (
              <button
                type="button"
                onClick={() => setPromptExpanded((value) => !value)}
                className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-[5px] px-1.5 py-0.5 text-xs font-medium text-[var(--codex-accent)] transition hover:bg-[rgba(91,124,255,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)]"
                aria-expanded={promptExpanded}
              >
                {promptExpanded ? "收起" : "展开"}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", promptExpanded && "rotate-180")} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className={cn("mt-3 grid gap-[3px]", compactRunning ? "grid-cols-1 md:max-w-[250px]" : "grid-cols-2 md:grid-cols-4")}>
            {Array.from({ length: displaySlots }, (_, index) => {
              const url = task.resultUrls[index];
              return url ? (
                <button
                  key={`${task.id}-${index}`}
                  type="button"
                  onClick={() => onPreview(index)}
                  className="studio-result-card outfit-fusion-result-card group/slot relative aspect-[3/4] cursor-zoom-in overflow-hidden rounded-[4px] bg-[#f4f6fa] text-sm text-slate-400 outline-none transition duration-300 hover:z-[1] hover:shadow-[0_10px_28px_rgba(15,23,42,0.18)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)] focus-visible:ring-offset-2"
                >
                  <LoadableResultImage src={url} alt={`生成图${index + 1}`} />
                  <span className="pointer-events-none absolute left-2 top-2 rounded-[4px] bg-[var(--codex-accent)] px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white shadow-sm">
                    {index + 1}/{slots}
                  </span>
                  <span className="studio-result-focus-layer" aria-hidden={false}>
                    <span className="studio-result-focus-view inline-flex h-8 items-center gap-1.5 px-3">
                      <Eye className="h-4 w-4" />
                      查看
                    </span>
                    <span className="studio-result-focus-actions">
                      <span className="studio-result-focus-action inline-flex items-center gap-1.5">
                        <WandSparkles className="h-3.5 w-3.5" />
                        <span>AI修图</span>
                      </span>
                      <span className="studio-result-focus-action inline-flex items-center gap-1.5">
                        <Clapperboard className="h-3.5 w-3.5" />
                        <span>AI视频</span>
                      </span>
                      <span className="studio-result-focus-action inline-flex items-center gap-1.5">
                        <Download className="h-3.5 w-3.5" />
                        <span>下载</span>
                      </span>
                    </span>
                  </span>
                </button>
              ) : (
                <div
                  key={`${task.id}-${index}`}
                  role="status"
                  aria-live="polite"
                  className="gen-card relative aspect-[3/4] overflow-hidden rounded-[7px] bg-[#edf4ff] text-sm text-slate-500"
                >
                  {!failed ? (
                    <>
                      <span className="studio-loading-card-base" />
                      <span className="studio-loading-card-sheen" />
                    </>
                  ) : null}
                  <div className="relative z-[1] flex h-full flex-col items-center justify-center gap-3">
                    {failed ? (
                      <span className="text-amber-600">生成失败</span>
                    ) : (
                      <>
                        <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/82 shadow-[0_12px_28px_rgba(91,124,255,0.22)] backdrop-blur-sm">
                          <span className="absolute inset-0 rounded-full bg-[rgba(91,124,255,0.18)] animate-ping motion-reduce:animate-none" />
                          <Loader2 className="relative h-6 w-6 animate-spin text-[var(--codex-accent)]" />
                        </div>
                        <span className="rounded-full bg-white/72 px-2 py-1 text-xs font-medium text-[#5065d8] shadow-sm">预计2~3分钟</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {running ? (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="studio-loader-progress h-full rounded-full bg-[linear-gradient(90deg,var(--codex-accent),#8ea2ff)] transition-all duration-500 ease-out"
                style={{ width: `${Math.min(Math.max(task.progress, 8), 100)}%` }}
              />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span>{formatTaskTime(task.createdAt)}</span>
              <span>|</span>
              <span>任务: {task.remoteId || task.taskNo}</span>
              <button
                type="button"
                onClick={onCopy}
                className="rounded-[5px] p-0.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)]"
                aria-label="复制任务编号"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {running ? <span className="text-[var(--codex-accent)]">{task.progress}%</span> : null}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={onReedit} className="inline-flex items-center gap-1 rounded-[5px] px-1 py-0.5 text-slate-700 transition hover:bg-[rgba(91,124,255,0.08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)]">
                <PenLine className="h-3.5 w-3.5" />
                重新编辑
              </button>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={running}
                className="inline-flex items-center gap-1 rounded-[5px] px-1 py-0.5 text-slate-700 transition hover:bg-[rgba(91,124,255,0.08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)] disabled:text-slate-300"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重新生成
              </button>
              <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-[5px] px-1 py-0.5 text-slate-500 transition hover:bg-[rgba(91,124,255,0.08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)]">
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </div>
    </article>
  );
}

function TaskInputReuseStack({ assets, onReuse }: { assets: OutfitFusionAsset[]; onReuse: () => void }) {
  const displayAssets = assets.slice(0, 3);
  const hiddenCount = Math.max(assets.length - displayAssets.length, 0);
  const hasHiddenAssets = hiddenCount > 0;

  return (
    <div className="hidden w-[96px] shrink-0 sm:block">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onReuse}
              className="group/reuse relative h-[60px] w-[96px] rounded-[6px] outline-none transition focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.45)] focus-visible:ring-offset-2"
              aria-label="再次使用图片"
            >
              {displayAssets.map((asset, index) => (
                <span
                  key={asset.id}
                  className={cn(
                    "absolute top-1 h-12 w-10 overflow-hidden rounded-[4px] border border-white bg-white shadow-sm transition duration-300 group-hover/reuse:-translate-y-1 group-hover/reuse:shadow-md group-focus-visible/reuse:-translate-y-1 group-focus-visible/reuse:shadow-md",
                    index === 0 && "left-0 -rotate-6",
                    index === 1 && (hasHiddenAssets ? "left-5 rotate-1" : "left-6 rotate-2"),
                    index === 2 && (hasHiddenAssets ? "left-10 rotate-3" : "left-12 rotate-6")
                  )}
                >
                  <span className="absolute left-0 top-0 z-[1] max-w-full truncate rounded-br-[4px] bg-slate-950/72 px-1 py-0.5 text-[9px] font-semibold leading-none text-white">
                    {getOutfitFusionRoleLabel(asset.role)}
                  </span>
                  <img src={asset.url} alt={asset.name || `输入${index + 1}`} className="h-full w-full object-cover" />
                </span>
              ))}
              {hasHiddenAssets ? (
                <span className="absolute right-0 top-1 z-[4] flex h-12 w-10 rotate-6 items-center justify-center overflow-hidden rounded-[4px] border border-white bg-[linear-gradient(135deg,rgba(31,41,55,0.92),rgba(100,116,139,0.78))] text-[12px] font-bold leading-none text-white shadow-[0_6px_14px_rgba(15,23,42,0.20)] transition duration-300 group-hover/reuse:-translate-y-1 group-hover/reuse:shadow-md group-focus-visible/reuse:-translate-y-1 group-focus-visible/reuse:shadow-md">
                  +{hiddenCount}
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" sideOffset={6} className="rounded-[4px] bg-slate-950 px-2.5 py-1 text-xs font-medium text-white">
            再次使用图片
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function LoadableResultImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      {!loaded ? (
        <>
          <span className="studio-loading-card-base" />
          <span className="studio-loading-card-sheen" />
        </>
      ) : null}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={cn(
          "h-full w-full object-contain transition duration-500 group-hover/slot:scale-[1.012]",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
    </>
  );
}

function getTemplateAssetName(_assets: OutfitFusionAsset[], asset: OutfitFusionAsset, index: number) {
  return getIndexedAssetLabel(asset, index);
}

type OutfitFusionHistoryPayload = Extract<HistoryJobPayload, { kind: "outfitFusion" }>;

function restoreOutfitFusionAssetsFromPayload(payload: OutfitFusionHistoryPayload, sourceId: string): OutfitFusionAsset[] {
  const payloadAssets = Array.isArray(payload.assets) ? payload.assets : [];
  const restoredFromAssets = payloadAssets.flatMap((asset, index) => {
    const url = typeof asset.url === "string" ? asset.url.trim() : "";
    const role = normalizeOutfitFusionAssetRole(asset.role);
    if (!url || !role) return [];
    return [{
      id: asset.id || `history-${sourceId}-${index}`,
      role,
      url,
      name: asset.name || getIndexedAssetLabel({ role }, index),
    }];
  });
  if (restoredFromAssets.length) return restoredFromAssets;

  return getOutfitFusionPayloadAssetUrls(payload).map((url, index) => {
    const role = inferOutfitFusionRoleFromPrompt(payload.prompt, index);
    return {
      id: `history-${sourceId}-${index}`,
      role,
      url,
      name: getIndexedAssetLabel({ role }, index),
    };
  });
}

function getOutfitFusionPayloadAssetUrls(payload: OutfitFusionHistoryPayload) {
  const assetUrls = Array.isArray(payload.assets)
    ? payload.assets
        .map((asset) => typeof asset.url === "string" ? asset.url.trim() : "")
        .filter((url) => url.length > 0)
    : [];
  if (assetUrls.length) return assetUrls;
  return payload.referenceUrls.filter((url) => typeof url === "string" && url.trim().length > 0);
}

function normalizeOutfitFusionAssetRole(value: unknown): OutfitFusionAssetRole | null {
  if (value === "reference" || value === "model" || value === "outfit") return value;
  return null;
}

function inferOutfitFusionRoleFromPrompt(prompt: string, index: number): OutfitFusionAssetRole {
  const oneBasedIndex = index + 1;
  if (prompt.includes(`【参考图${oneBasedIndex}】`)) return "reference";
  if (prompt.includes(`【模特图${oneBasedIndex}】`)) return "model";
  return "outfit";
}

function getUploadedAssetName(role: OutfitFusionAssetRole, existing: OutfitFusionAsset[], offset: number) {
  const index = existing.filter((asset) => asset.role === role).length + offset + 1;
  if (role === "model") return `模特图${index}`;
  return `${getOutfitFusionRoleLabel(role)}${index}`;
}

function getPromptAssetLabel(asset: OutfitFusionAsset, index: number) {
  const name = asset.name?.trim();
  if (name) return name.replace(/^模特(\d+)$/, "模特图$1");
  return getIndexedAssetLabel(asset, index);
}

function getIndexedAssetLabel(asset: Pick<OutfitFusionAsset, "role">, index: number) {
  if (asset.role === "reference") return `参考图${index + 1}`;
  if (asset.role === "model") return `模特图${index + 1}`;
  return `搭配图${index + 1}`;
}

function buildPromptDraft(inputAssets: OutfitFusionAsset[], fallbackRole: OutfitFusionAssetRole) {
  const assets = inputAssets.length ? inputAssets : [{ role: fallbackRole } as OutfitFusionAsset];
  const outfitCount = assets.filter((asset) => asset.role === "outfit").length;
  const hasReference = assets.some((asset) => asset.role === "reference");
  const hasModel = assets.some((asset) => asset.role === "model");
  return [
    hasReference ? "让参考图中的人物姿态、构图和场景氛围作为画面基础，" : "",
    `融合${outfitCount || 1}张搭配图中的服装、鞋包和配饰，`,
    hasModel ? "把最终人物替换为模特图中的面部、发型和气质，" : "",
    "生成真实自然、细节准确、适合电商展示的模特穿搭图。",
  ].join("");
}

function formatTaskTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function scrollNodeIntoView(node: HTMLElement | null, block: ScrollLogicalPosition, delay = 0) {
  window.setTimeout(() => {
    node?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block });
  }, delay);
}

function scrollNodeToViewportTop(node: HTMLElement | null, offset = 0, delay = 0) {
  if (!node) return;
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      const top = Math.max(0, window.scrollY + node.getBoundingClientRect().top - offset);
      window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }, delay);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function limitComposerPrompt(value: string) {
  return value.slice(0, 800);
}
