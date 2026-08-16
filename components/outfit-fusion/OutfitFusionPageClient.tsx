"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useGenerationPolling } from "@/hooks/use-generation-polling";
import { FeatureTabs } from "@/components/FeatureTabs";
import { ModuleTaskRail } from "@/components/studio/ModuleTaskRail";
import { OutfitFusionComposer } from "@/components/outfit-fusion/OutfitFusionComposer";
import { OutfitFusionExampleGallery } from "@/components/outfit-fusion/OutfitFusionExampleGallery";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import type { TaskSelectionSession } from "@/components/studio/useTaskSelectionSession";
import { useTaskQueueGeneration } from "@/components/studio/useTaskQueueGeneration";
import { useStudioAuth } from "@/components/studio/useStudioAuth";
import { cn, downloadImage, generateDownloadFilename, MAX_FILE_SIZE, MAX_FILE_SIZE_MB, uploadImage } from "@/lib/utils";
import { safeTaskQueueUrls, type TaskQueueItem, type TaskStatusGroup } from "@/lib/task-queue";
import { getCreditCost } from "@/lib/api/lingya";
import { showInsufficientCreditsToast } from "@/lib/ui/credit-copy";
import { fetchHistoryApplyDetail, getHistoryApplyFailureMessage, isHistoryApplyRowFailed, takeApplyDetail, type HistoryApplyDetail, type HistoryJobPayload } from "@/lib/history-apply";
import {
  buildOutfitFusionComposerText,
  buildOutfitFusionPrompt,
  buildOutfitFusionVisibleFaceText,
  buildOutfitFusionVisionPromptRequest,
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
import { createGenericImagePreviewSession, createImagePreviewSession, type ImagePreviewAction } from "@/lib/studio-image-preview";
import { OutfitFusionTaskCard, type OutfitFusionTask } from "@/features/outfit-fusion/OutfitFusionTaskCard";
import { OutfitFusionFocusAction } from "@/features/outfit-fusion/OutfitFusionFocusAction";
import { TaskInputReuseStack } from "@/features/outfit-fusion/TaskInputReuseStack";
import { LoadableResultImage } from "@/features/outfit-fusion/LoadableResultImage";
import {
  getOutfitFusionRoleLabelKey,
  getIndexedAssetLabel,
  getOutfitFusionTaskGridClass,
} from "@/features/outfit-fusion/task-card-helpers";

const PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "repair", label: "AI修图" },
  { kind: "aiVideo", label: "AI视频" },
  { kind: "modelBackground", label: "换背景" },
  { kind: "pose", label: "姿势裂变" },
  { kind: "productSet", label: "商品套图" },
  { kind: "regenerateAll", label: "重新创作" },
  { kind: "feedback", label: "反馈" },
];

/** /api/general-image 轮询返回的强类型：除 status 外都容错。 */
type PollState = {
  status: string;
  progress?: number;
  result_urls?: unknown;
  error?: unknown;
};

function extractPollResultUrls(state: PollState): string[] {
  if (!Array.isArray(state.result_urls)) return [];
  return state.result_urls.filter((url: unknown): url is string => typeof url === "string" && url.trim().length > 0);
}

function clampPollProgress(state: PollState, fallback = 24): number {
  const parsed = Number(state.progress);
  if (Number.isFinite(parsed)) return Math.min(Math.max(Math.round(parsed), 24), 99);
  return fallback;
}

export function OutfitFusionPageClient() {
  const t = useTranslations("OutfitFusion");
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
  const applyOutfitFusionApplyDetailRef = useRef(applyOutfitFusionApplyDetail);
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
    title: t("moduleName"),
    defaultExpectedCount: DEFAULT_OUTFIT_FUSION_CONFIG.genCount,
    applyPath: "/outfit-fusion",
  });

  // 每次生成触发一次轮询：pollCtxRef.current 由调用方先赋值，startPolling() 立刻开始。
  // buildUrl / onTick / onComplete / onError 都从 ref 里读取 identity（hook 只在 start 时
  // 读取 configRef.current，id 字段用 ref 绕过"config 在 render 时被冻结"的问题）。
  const pollCtxRef = useRef<{
    taskId: string;
    remoteId: string;
    expectedCount: number;
    inputThumbnails: string[];
  } | null>(null);
  const { start: startPolling } = useGenerationPolling<PollState>({
    id: "",
    buildUrl: () => {
      const id = pollCtxRef.current?.remoteId ?? "";
      return `/api/general-image?generation_id=${encodeURIComponent(id)}`;
    },
    isTerminal: (state) => state.status === "completed" || state.status === "failed",
    intervalMs: 2000,
    maxAttempts: 90,
    maxConsecutiveServerErrors: 5,
    onTick: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const latestUrls = extractPollResultUrls(state);
      const nextProgress = clampPollProgress(state);
      updateTask(ctx.taskId, {
        statusGroup: state.status === "completed" ? "completed" : state.status === "failed" ? "failed" : "running",
        progress: state.status === "completed" ? 100 : nextProgress,
        resultUrls: latestUrls,
        expectedCount: ctx.expectedCount,
        error: typeof state.error === "string" ? state.error : null,
      });
      taskQueue.markRunning(ctx.remoteId, {
        expectedCount: ctx.expectedCount,
        inputThumbnails: ctx.inputThumbnails,
        resultThumbnails: latestUrls,
        resultCount: latestUrls.length,
        progress: nextProgress,
        status: "processing",
      });
    },
    onComplete: (state) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const finalUrls = extractPollResultUrls(state);
      updateTask(ctx.taskId, {
        statusGroup: state.status === "completed" ? "completed" : "failed",
        progress: state.status === "completed" ? 100 : 100,
        resultUrls: finalUrls,
        expectedCount: ctx.expectedCount,
        error: typeof state.error === "string" ? state.error : null,
      });
      if (state.status === "completed") {
        taskQueue.markCompleted(ctx.remoteId, {
          expectedCount: ctx.expectedCount,
          inputThumbnails: ctx.inputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalUrls.length,
        });
        toast.success(t("toast.generateComplete"));
      } else {
        const message = typeof state.error === "string" ? state.error : t("toast.generateFailed");
        taskQueue.markFailed(ctx.remoteId, message, {
          expectedCount: ctx.expectedCount,
          inputThumbnails: ctx.inputThumbnails,
          resultThumbnails: finalUrls,
          resultCount: finalUrls.length,
        });
      }
      taskQueue.refresh();
    },
    onError: (error) => {
      const ctx = pollCtxRef.current;
      if (!ctx) return;
      const message = error.message || t("toast.pollTimeout");
      taskQueue.markFailed(ctx.remoteId, message, {
        expectedCount: ctx.expectedCount,
        inputThumbnails: ctx.inputThumbnails,
      });
      updateTask(ctx.taskId, {
        error: message,
        progress: 100,
        statusGroup: "failed",
      });
      taskQueue.refresh();
    },
  });

  useEffect(() => {
    applyOutfitFusionApplyDetailRef.current = applyOutfitFusionApplyDetail;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const detail = await takeApplyDetail("outfitFusion");
      if (cancelled || !detail) return;
      applyOutfitFusionApplyDetailRef.current(detail);
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
          applyOutfitFusionApplyDetailRef.current(historyDetail);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t("toast.historyLoadFailed"));
        }
      })();
    }

    window.addEventListener("wanxiang:history-apply", handleHistoryApply);
    return () => window.removeEventListener("wanxiang:history-apply", handleHistoryApply);
  }, []);

  useEffect(() => {
    const scrollContainer = mainRef.current;
    const getScrollTop = () => scrollContainer ? scrollContainer.scrollTop : window.scrollY;
    lastScrollYRef.current = getScrollTop();
    scrollIntentRef.current = { direction: null, distance: 0 };
    if (getScrollTop() > 180) {
      setComposerCollapsed(true);
    }
    const restoreChecks = [120, 360, 760].map((delay) =>
      window.setTimeout(() => {
        const scrollTop = getScrollTop();
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
      const projectedScrollTop = Math.max(0, getScrollTop() + event.deltaY);
      applyScrollIntent(event.deltaY, projectedScrollTop);
    }
    const handleWheelEvent: EventListener = (event) => {
      if (event instanceof WheelEvent) handleWheel(event);
    };
    const scrollPoll = window.setInterval(() => {
      const scrollTop = getScrollTop();
      const delta = scrollTop - lastScrollYRef.current;
      if (Math.abs(delta) < 3) return;
      lastScrollYRef.current = scrollTop;
      applyScrollIntent(delta, scrollTop);
    }, 120);

    const scrollTarget: Window | HTMLElement = scrollContainer || window;
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    scrollTarget.addEventListener("wheel", handleWheelEvent, { passive: true });
    return () => {
      scrollTarget.removeEventListener("scroll", handleScroll);
      scrollTarget.removeEventListener("wheel", handleWheelEvent);
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
      title: t("previewTitle"),
      urls: previewTask.resultUrls,
      expectedCount: previewTask.expectedCount,
      statusGroup: previewTask.statusGroup,
      taskId: previewTask.remoteId || previewTask.taskNo,
      createdAt: previewTask.createdAt,
      references: outfitFusionReferencesFromAssets(previewTask.inputAssets),
      promptText: previewTask.prompt,
      selectedIndex: preview?.index || 0,
      resultTitlePrefix: t("resultTitlePrefix"),
      aspectRatio: getOutfitFusionAspectRatioLabel(previewTask.config.aspectRatio, t),
      metaItems: [
        { label: t("meta.source"), value: t("meta.sourceValue") },
        { label: t("meta.ratio"), value: getOutfitFusionAspectRatioLabel(previewTask.config.aspectRatio, t) },
        { label: t("meta.resolution"), value: previewTask.config.imageSize },
        { label: t("meta.model"), value: previewTask.config.aiModel },
        { label: t("meta.taskId"), value: previewTask.remoteId || previewTask.taskNo },
      ],
    });
  }, [preview?.index, previewTask, t]);

  const assetPreviewIndex = useMemo(() => {
    if (!assetPreviewId) return -1;
    return assets.findIndex((asset) => asset.id === assetPreviewId);
  }, [assetPreviewId, assets]);

  const assetPreview = useMemo(() => {
    if (assetPreviewIndex < 0) return null;
    const asset = assets[assetPreviewIndex];
    if (!asset) return null;
    const label = t("imageNumber", { index: assetPreviewIndex + 1 });
    return {
      asset,
      label,
      roleLabel: t(getOutfitFusionRoleLabelKey(asset.role)),
    };
  }, [assetPreviewIndex, assets, t]);

  const assetPreviewSession = useMemo(() => {
    if (!assetPreview) return null;
    const metaItems = [
      { label: t("meta.imageType"), value: assetPreview.roleLabel },
      { label: t("meta.imageNo"), value: assetPreview.label },
    ];
    return createImagePreviewSession({
      module: "outfitFusion",
      title: `${assetPreview.label} · ${assetPreview.roleLabel}`,
      statusGroup: "completed",
      selectedIndex: 0,
      metaItems,
      results: [{
        url: assetPreview.asset.url,
        title: assetPreview.label,
        badgeLabel: assetPreview.roleLabel,
        status: "completed",
      }],
    });
  }, [assetPreview, t]);

  useEffect(() => {
    if (assetPreviewId && !assets.some((asset) => asset.id === assetPreviewId)) {
      setAssetPreviewId(null);
    }
  }, [assetPreviewId, assets]);

  function applyTemplate(template: OutfitFusionTemplate) {
    const namedAssets = template.assets.map((asset, index) => ({
      ...asset,
      name: asset.name || getIndexedAssetLabel(asset, index),
    }));
    setSelectedTemplate(template);
    setAssets(namedAssets);
    setPrompt(limitComposerPrompt(buildOutfitFusionComposerText(template)));
    setConfig((current) => ({
      ...current,
      genCount: clampOutfitFusionCount(template.outputCount || current.genCount),
      aspectRatio: "auto",
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
        toast.error(t("toast.notImage", { name: file.name }));
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(t("toast.exceedSize", { name: file.name, max: MAX_FILE_SIZE_MB }));
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
      toast.success(t("toast.uploadSuccess"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("toast.uploadFailed"));
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
      toast.info(t("toast.uploadMaterialFirst"));
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
          prompt: buildOutfitFusionVisionPromptRequest(assets, seedPrompt),
        }),
      });
      const data = await response.json().catch(() => ({})) as { prompt?: unknown; source?: unknown; error?: unknown };
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : t("toast.aiWriteFailed"));
      }
      const nextPrompt = data.source === "fallback"
        ? seedPrompt
        : typeof data.prompt === "string" && data.prompt.trim()
        ? normalizeOutfitFusionAssistantPrompt(data.prompt, seedPrompt)
        : seedPrompt;
      setPrompt(limitComposerPrompt(getOutfitFusionDisplayPrompt(nextPrompt, seedPrompt)));
      toast.success(data.source === "fallback" ? t("toast.promptGenerated") : t("toast.visionDone"));
    } catch (error) {
      setPrompt(seedPrompt);
      toast.error(error instanceof Error ? error.message : t("toast.aiWriteFailedKeepBase"));
    } finally {
      setAutoWriting(false);
    }
  }

  function handleJumpToBottom() {
    setComposerCollapsed(false);
    scrollContainerToBottom(mainRef.current, 30);
  }

  function scrollTaskListToTop(delay = 0) {
    scrollNodeToContainerTop(mainRef.current, taskListRef.current, 24, delay);
    scrollNodeToContainerTop(mainRef.current, taskListRef.current, 24, delay + 240);
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
      toast.success(t("toast.taskIdCopied"));
    } catch {
      toast.error(t("toast.copyFailed"));
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
      toast.error(t("toast.uploadMaterialFirst"));
      return;
    }
    if (!inputPrompt.trim()) {
      toast.error(t("toast.fillPromptFirst"));
      return;
    }

    const expectedCount = clampOutfitFusionCount(inputConfig.genCount);
    const taskCost = getCreditCost(inputConfig.aiModel, inputConfig.imageSize, inputConfig.aspectRatio) * expectedCount;
    const inputThumbnails = inputAssets.map((asset) => asset.url);
    if (!isAuthenticated && !(await refreshAuth())) {
      toast.error(t("toast.loginFirst"));
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
      config: { ...inputConfig, genCount: expectedCount },
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
    toast.success(t("toast.createSuccess"));

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
        pollCtxRef.current = { taskId, remoteId, expectedCount, inputThumbnails };
        startPolling();
      } else {
        taskQueue.markFailed(taskId, t("toast.submitNoTaskId"), {
          expectedCount,
          inputThumbnails,
        });
        updateTask(taskId, {
          error: t("toast.submitNoTaskId"),
          progress: 100,
          statusGroup: "failed",
        });
      }
    } catch (error) {
      setCreating(false);
      const message = error instanceof Error ? error.message : t("toast.submitFailed");
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
      throw new Error(typeof data.error === "string" ? data.error : t("toast.submitFailed"));
    }
    return {
      generationId: typeof data.generation_id === "string" ? data.generation_id : null,
      creditsRemaining: typeof data.credits_remaining === "number" ? data.credits_remaining : undefined,
    };
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
      // Apply even if the session went stale mid-fetch — swallowing silently
      // here was the root cause of "click a row, preview doesn't update". A
      // real abort would have hit the catch block via session.signal.
      if (detail.payload.kind !== "outfitFusion") {
        upsertTaskFromQueueItem(item);
        return true;
      }
      applyOutfitFusionHistoryPayload(detail.payload, detail.resultUrls.length ? detail.resultUrls : safeTaskQueueUrls(item.resultThumbnails), item, {
        silent: session.reason === "restore",
      });
      return true;
    } catch {
      if (session.signal.aborted) return undefined;
      upsertTaskFromQueueItem(item);
      if (item.statusGroup === "failed") toast.error(item.error || t("toast.historyTaskLoadFailed"));
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
      aspectRatio: payload.aspectRatio === "auto" || payload.aspectRatio === "1:1" ? payload.aspectRatio : "3:4",
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
    if (!options?.silent) toast.success(t("toast.historyApplied"));
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
      : isHistoryApplyRowFailed(detail.row)
        ? "failed"
        : "running";
    const now = new Date().toISOString();
    return {
      id,
      module: "outfitFusion",
      title: t("moduleName"),
      status: detail.row.status || (statusGroup === "completed" ? "completed" : "processing"),
      statusGroup,
      time: "0:00",
      createdAt: now,
      updatedAt: now,
      completedAt: statusGroup === "completed" ? now : null,
      error: getHistoryApplyFailureMessage(detail.row, ""),
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
    const existingTask = tasks.find((task) => task.remoteId === item.id || task.id === item.id || task.id === `queue-${item.id}`);
    const inputAssets = patch.inputAssets || existingTask?.inputAssets || safeTaskQueueUrls(item.inputThumbnails).map((url, index) => ({
      id: `queue-${item.id}-${index}`,
      role: "outfit" as const,
      url,
      name: getIndexedAssetLabel({ role: "outfit" }, index),
    }));
    const resultUrls = patch.resultUrls || safeTaskQueueUrls(item.resultThumbnails);
    const queueTitle = item.title?.trim() || "";
    const titleLooksGeneric = !queueTitle || queueTitle === t("moduleName") || queueTitle === t("taskGenericTitle");
    const fallbackPrompt = titleLooksGeneric ? prompt.trim() || buildPromptDraft(inputAssets, "outfit") : queueTitle;
    const restoredPrompt = patch.prompt || existingTask?.prompt || fallbackPrompt;
    const preservedTaskPatch = {
      prompt: restoredPrompt,
      requestPrompt: patch.requestPrompt || existingTask?.requestPrompt || restoredPrompt,
      config: patch.config || existingTask?.config || DEFAULT_OUTFIT_FUSION_CONFIG,
    };
    const restoredTask: OutfitFusionTask = {
      id: `queue-${item.id}`,
      remoteId: item.id,
      taskNo: item.id,
      templateId: null,
      createdAt: item.createdAt,
      statusGroup: item.statusGroup,
      progress: item.progress,
      inputAssets,
      expectedCount: Math.max(1, patch.expectedCount || item.expectedCount || resultUrls.length || existingTask?.expectedCount || preservedTaskPatch.config.genCount || DEFAULT_OUTFIT_FUSION_CONFIG.genCount),
      resultUrls,
      error: item.error || null,
      ...patch,
      ...preservedTaskPatch,
    };
    setTasks([restoredTask]);
  }

  return (
    <div className="studio-workbench outfit-fusion-workbench flex min-h-[calc(100dvh-64px)] flex-col bg-[#f4f5fb] lg:flex-row">
      <FeatureTabs active="outfitFusion" />
      <ModuleTaskRail
        module="outfitFusion"
        moduleLabel={t("moduleName")}
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
          <div className="mx-auto mb-5 w-full max-w-[1120px] text-[12px] leading-5 tracking-normal text-codex-faint dark:text-codex-muted">
            {t("disclaimer")}
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
                  formatTaskTime={formatTaskTime}
                />
              ))}
            </div>
          </div>

          <div className={cn("animate-fade-in motion-reduce:animate-none", tasks.length > 0 && "mt-8")}>
            <h1 className="mb-6 text-center text-[24px] font-semibold leading-[34px] tracking-normal text-codex-ink dark:text-white">{t("heroTitle")}</h1>
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

      {previewSession ? (
        <StudioImagePreviewDialog
          open
          onClose={() => {
            setPreview(null);
          }}
          session={previewSession}
          filenamePrefix="outfit-fusion"
          selectedIndex={preview?.index || 0}
          onSelectedIndexChange={(index) => {
            if (preview) setPreview({ taskId: preview.taskId, index });
          }}
          actions={PREVIEW_ACTIONS}
          onRegenerateAll={!previewTask ? undefined : () => {
            void handleRegenerate(previewTask);
          }}
        />
      ) : null}
      {assetPreviewSession ? (
        <StudioImagePreviewDialog
          open
          onClose={() => setAssetPreviewId(null)}
          session={assetPreviewSession}
          filenamePrefix="outfit-fusion-asset"
          selectedIndex={0}
          actions={[]}
          className="studio-image-preview-dialog-content--asset"
        />
      ) : null}
    </div>
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

function getOutfitFusionAspectRatioLabel(value: OutfitFusionConfig["aspectRatio"], t?: (key: string) => string) {
  return value === "auto" ? (t ? t("smartAspect") : "智能") : value;
}


function normalizeOutfitFusionAssetRole(value: unknown): OutfitFusionAssetRole | null {
  if (value === "reference" || value === "model" || value === "outfit") return value;
  return null;
}

function inferOutfitFusionRoleFromPrompt(prompt: string, index: number): OutfitFusionAssetRole {
  void prompt;
  void index;
  return "outfit";
}

function getUploadedAssetName(role: OutfitFusionAssetRole, existing: OutfitFusionAsset[], offset: number) {
  const index = existing.filter((asset) => asset.role === role).length + offset + 1;
  if (role === "model") return `模特图${index}`;
  return `${getOutfitFusionRoleLabel(role)}${index}`;
}


function buildPromptDraft(inputAssets: OutfitFusionAsset[], fallbackRole: OutfitFusionAssetRole) {
  const assets = inputAssets.length ? inputAssets : [{ role: fallbackRole } as OutfitFusionAsset];
  const outfitCount = assets.filter((asset) => asset.role === "outfit").length;
  const referenceIndex = assets.findIndex((asset) => asset.role === "reference");
  const modelIndex = assets.findIndex((asset) => asset.role === "model");
  const base = referenceIndex >= 0
    ? `让图${referenceIndex + 1}的人物姿态、构图和场景氛围作为画面基础`
    : "让自然商业模特";
  const outfitText = `穿上、佩戴或手持${outfitCount || 1}张搭配图中的服装、鞋包和配饰`;
  const faceText = modelIndex >= 0
    ? `，${buildOutfitFusionVisibleFaceText(`图${modelIndex + 1}`)}`
    : "";
  return `${base}，${outfitText}${faceText}，生成真实自然、细节准确、适合电商展示的模特穿搭图。`;
}

function formatTaskTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function scrollContainerToBottom(container: HTMLElement | null, delay = 0) {
  window.setTimeout(() => {
    const target = container || (document.scrollingElement as HTMLElement | null);
    target?.scrollTo({ top: target.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, delay);
}

function scrollNodeToContainerTop(container: HTMLElement | null, node: HTMLElement | null, offset = 0, delay = 0) {
  if (!node) return;
  window.setTimeout(() => {
    window.requestAnimationFrame(() => {
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const top = Math.max(0, container.scrollTop + nodeRect.top - containerRect.top - offset);
        container.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
        return;
      }
      const top = Math.max(0, window.scrollY + node.getBoundingClientRect().top - offset);
      window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });
  }, delay);
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}


function limitComposerPrompt(value: string) {
  return value.slice(0, 800);
}
