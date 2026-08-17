"use client";

import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Upload, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ResourceAssetCard,
  ResourceAssetGrid,
  ResourceCategoryNav,
  ResourceEmptyState,
  ResourceErrorState,
  ResourceFilters,
  ResourceLoadingState,
  type ResourceCategoryItem,
} from "./ResourceLibraryPrimitives";
import { uploadLocalResources } from "./api";
import {
  createResourceSelectionReducer,
  getResourcePickerBudget,
  isResourceAssetExcluded,
  resourceAssetIdentity,
} from "./selection";
import { useResourceAssets, useResourceFacets } from "./useResourceLibraryData";
import type { ResourceAsset, ResourceMediaType, ResourcePickerRequest } from "./types";
import styles from "./resource-picker.module.css";

const DEFAULT_REQUEST: ResourcePickerRequest = {
  selectionMode: "single",
  maxCount: 1,
  mediaTypes: ["image"],
};

const DEFAULT_ALLOWED_MEDIA: ResourceMediaType[] = ["image", "video"];

export function ResourcePickerDialog({
  open,
  request,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  request: ResourcePickerRequest | null;
  onCancel: () => void;
  onConfirm: (assets: ResourceAsset[]) => void;
}) {
  const t = useTranslations("ResourceLibrary");
  const effectiveRequest = request ?? DEFAULT_REQUEST;
  const budget = getResourcePickerBudget(effectiveRequest);
  const allowedMedia = effectiveRequest.mediaTypes?.length
    ? effectiveRequest.mediaTypes
    : DEFAULT_ALLOWED_MEDIA;
  const [activeCategory, setActiveCategory] = useState("upload");
  const [media, setMedia] = useState<"all" | ResourceMediaType>(allowedMedia.length === 1 ? allowedMedia[0] : "all");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const reducer = useMemo(() => createResourceSelectionReducer(effectiveRequest), [effectiveRequest]);
  const [selection, dispatch] = useReducer(reducer, { selected: [], limitReached: false });
  const { facets } = useResourceFacets(open);
  const assetsQuery = useMemo(() => ({
    source: activeCategory === "upload" ? "upload" as const : "generation" as const,
    module: activeCategory === "upload" ? undefined : activeCategory,
    media: media === "all" ? (allowedMedia.length === 1 ? allowedMedia[0] : undefined) : media,
    view: effectiveRequest.view,
    limit: 30,
  }), [activeCategory, allowedMedia, effectiveRequest.view, media]);
  const assets = useResourceAssets(assetsQuery, open);

  useEffect(() => {
    dispatch({ type: "clear" });
    setActiveCategory("upload");
    setMedia(allowedMedia.length === 1 ? allowedMedia[0] : "all");
    setUploadError("");
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo<ResourceCategoryItem[]>(() => [
    { key: "upload", label: t("categories.localUploads"), kind: "upload" },
    ...facets.modules
      .filter((facet) => facet.count > 0)
      .map((facet) => ({
        key: facet.key,
        label: t(`modules.${facet.key}`),
        count: facet.count,
        kind: "module" as const,
      })),
  ], [facets.modules, t]);

  const visibleItems = assets.items.filter((asset) => allowedMedia.includes(asset.mediaType));
  const canUpload = budget > 0 && (
    effectiveRequest.selectionMode === "single" || selection.selected.length < budget
  );
  const selectedIdentities = new Map(
    selection.selected.map((asset, index) => [resourceAssetIdentity(asset), index + 1]),
  );

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !canUpload) return;
    setUploading(true);
    setUploadError("");
    try {
      const remaining = effectiveRequest.selectionMode === "single" ? 1 : budget - selection.selected.length;
      const result = await uploadLocalResources(files.slice(0, remaining));
      for (const asset of result.assets) {
        assets.setItems((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
        dispatch({ type: "toggle", asset });
      }
      if (result.errors.length) throw result.errors[0];
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("states.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const renderContent = () => {
    if (budget <= 0) {
      return (
        <ResourceEmptyState
          title={t("picker.limitReachedTitle")}
          description={t("picker.limitReachedDescription")}
        />
      );
    }
    if (assets.state === "loading") return <ResourceLoadingState label={t("states.loading")} />;
    if (assets.state === "error") {
      return (
        <ResourceErrorState
          title={t("states.loadFailedTitle")}
          description={assets.error?.message ?? t("states.loadFailedDescription")}
          retryLabel={t("actions.retry")}
          onRetry={assets.reload}
        />
      );
    }
    if (!visibleItems.length) {
      return (
        <ResourceEmptyState
          kind={activeCategory === "upload" ? "upload" : "empty"}
          title={activeCategory === "upload" ? t("empty.uploadTitle") : t("empty.moduleTitle")}
          description={activeCategory === "upload" ? t("empty.uploadDescription") : t("empty.moduleDescription")}
          action={activeCategory === "upload" ? (
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading || !canUpload}>
              <Upload aria-hidden="true" />{t("actions.localUpload")}
            </Button>
          ) : undefined}
        />
      );
    }
    return (
      <>
        <ResourceAssetGrid label={t("picker.gridLabel")}>
          {visibleItems.map((asset) => {
            const order = selectedIdentities.get(resourceAssetIdentity(asset));
            const selected = Boolean(order);
            const excluded = isResourceAssetExcluded(asset, effectiveRequest);
            const atLimit = selection.selected.length >= budget && !selected;
            return (
              <ResourceAssetCard
                key={asset.id}
                asset={asset}
                selected={selected}
                selectedOrder={order}
                selectable
                disabled={excluded || atLimit}
                selectLabel={selected ? t("card.removeSelection", { title: asset.title }) : t("card.select", { title: asset.title })}
                videoLabel={t("filters.video")}
                onSelect={(item) => dispatch({ type: "toggle", asset: item })}
              />
            );
          })}
        </ResourceAssetGrid>
        {assets.hasMore && (
          <div className={styles.loadMore}>
            <Button variant="outline" disabled={assets.loadingMore} onClick={assets.loadMore}>
              {assets.loadingMore ? t("states.loading") : t("actions.loadMore")}
            </Button>
          </div>
        )}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <DialogContent
        className={`${styles.dialog} max-w-none sm:max-w-none`}
        showCloseButton={false}
        aria-describedby="resource-picker-description"
      >
        <header className={styles.header}>
          <div>
            <DialogTitle className={styles.title}>{request?.title ?? t("picker.title")}</DialogTitle>
            <DialogDescription id="resource-picker-description" className={styles.description}>
              {t("picker.selectionHint", { selected: selection.selected.length, max: budget })}
            </DialogDescription>
          </div>
          <Button variant="ghost" size="icon" aria-label={t("actions.close")} onClick={onCancel}>
            <X aria-hidden="true" />
          </Button>
        </header>
        <div className={styles.body}>
          <ResourceCategoryNav
            label={t("categories.title")}
            items={categories}
            activeKey={activeCategory}
            onChange={setActiveCategory}
            footer={(
              <Button className={styles.sidebarUpload} variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading || !canUpload}>
                <Upload aria-hidden="true" />{uploading ? t("states.uploading") : t("actions.localUpload")}
              </Button>
            )}
          />
          <section className={styles.content} aria-label={t("picker.gridLabel")}>
            <ResourceFilters
              media={media}
              onMediaChange={setMedia}
              allowedMedia={allowedMedia}
              mediaLabel={t("filters.mediaLabel")}
              allMediaLabel={t("filters.allMedia")}
              imageLabel={t("filters.image")}
              videoLabel={t("filters.video")}
              trailing={activeCategory === "upload" ? (
                <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading || !canUpload}>
                  <Upload aria-hidden="true" />{uploading ? t("states.uploading") : t("actions.localUpload")}
                </Button>
              ) : undefined}
            />
            {uploadError && (
              <div className={styles.inlineError} role="alert"><AlertCircle aria-hidden="true" />{uploadError}</div>
            )}
            <div className={styles.scrollArea}>{renderContent()}</div>
          </section>
        </div>
        <footer className={styles.footer}>
          <span aria-live="polite">
            {selection.limitReached && selection.selected.length >= budget
              ? t("picker.limitReachedInline", { max: budget })
              : t("picker.selectedCount", { selected: selection.selected.length, max: budget })}
          </span>
          <div className={styles.footerActions}>
            <Button variant="outline" size="lg" onClick={onCancel}>{t("actions.cancel")}</Button>
            <Button size="lg" disabled={selection.selected.length === 0} onClick={() => onConfirm(selection.selected)}>
              {t("actions.confirm")}
            </Button>
          </div>
        </footer>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept={allowedMedia.map((type) => `${type}/*`).join(",")}
          multiple={effectiveRequest.selectionMode === "multiple"}
          onChange={handleFiles}
        />
      </DialogContent>
    </Dialog>
  );
}
