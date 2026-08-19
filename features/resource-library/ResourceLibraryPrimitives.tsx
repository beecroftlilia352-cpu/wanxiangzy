"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import {
  Check,
  FileQuestion,
  Film,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResourceAsset, ResourceMediaType } from "./types";
import styles from "./resource-library.module.css";

export type ResourceCategoryItem = {
  key: string;
  label: string;
  count?: number;
  kind: "upload" | "module";
};

export function ResourceCategoryNav({
  label,
  items,
  activeKey,
  onChange,
  footer,
}: {
  label: string;
  items: ResourceCategoryItem[];
  activeKey: string;
  onChange: (key: string) => void;
  footer?: ReactNode;
}) {
  return (
    <nav className={styles.categoryNav} aria-label={label}>
      <div className={styles.categoryHeading}>
        <FolderOpen aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className={styles.categoryScroller}>
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={styles.categoryButton}
            data-active={activeKey === item.key || undefined}
            aria-current={activeKey === item.key ? "true" : undefined}
            onClick={() => onChange(item.key)}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" && <span className={styles.categoryCount}>{item.count}</span>}
          </button>
        ))}
      </div>
      {footer && <div className={styles.categoryFooter}>{footer}</div>}
    </nav>
  );
}

export function ResourceFilters({
  media,
  onMediaChange,
  allowedMedia,
  mediaLabel,
  allMediaLabel,
  imageLabel,
  videoLabel,
  module,
  onModuleChange,
  moduleOptions = [],
  moduleLabel,
  allModulesLabel,
  trailing,
}: {
  media: "all" | ResourceMediaType;
  onMediaChange: (value: "all" | ResourceMediaType) => void;
  allowedMedia: ResourceMediaType[];
  mediaLabel: string;
  allMediaLabel: string;
  imageLabel: string;
  videoLabel: string;
  module?: string;
  onModuleChange?: (value: string) => void;
  moduleOptions?: Array<{ value: string; label: string }>;
  moduleLabel?: string;
  allModulesLabel?: string;
  trailing?: ReactNode;
}) {
  const canSwitchMedia = allowedMedia.length > 1;
  return (
    <div className={styles.filters}>
      <div className={styles.filterCluster}>
        {onModuleChange && moduleOptions.length > 0 && (
          <label className={styles.selectLabel}>
            <span className="sr-only">{moduleLabel}</span>
            <select value={module ?? "all"} onChange={(event) => onModuleChange(event.target.value)}>
              <option value="all">{allModulesLabel}</option>
              {moduleOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        )}
        {canSwitchMedia && (
          <label className={styles.selectLabel}>
            <span className="sr-only">{mediaLabel}</span>
            <select value={media} onChange={(event) => onMediaChange(event.target.value as "all" | ResourceMediaType)}>
              <option value="all">{allMediaLabel}</option>
              {allowedMedia.includes("image") && <option value="image">{imageLabel}</option>}
              {allowedMedia.includes("video") && <option value="video">{videoLabel}</option>}
            </select>
          </label>
        )}
      </div>
      {trailing}
    </div>
  );
}

export function ResourceAssetCard({
  asset,
  selected = false,
  selectedOrder,
  selectable = false,
  disabled = false,
  selectLabel,
  videoLabel,
  onSelect,
  onDelete,
  deleteLabel,
}: {
  asset: ResourceAsset;
  selected?: boolean;
  selectedOrder?: number;
  selectable?: boolean;
  disabled?: boolean;
  selectLabel: string;
  videoLabel: string;
  onSelect?: (asset: ResourceAsset) => void;
  onDelete?: (asset: ResourceAsset) => void;
  deleteLabel?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const locale = useLocale();
  const visualUrl = asset.previewUrl || asset.url;
  const cardTitle = asset.title || asset.originalFilename || asset.id;

  return (
    <article
      className={cn(styles.assetCard, disabled && styles.assetCardDisabled)}
      data-selected={selected || undefined}
      role="listitem"
    >
      <button
        type="button"
        className={styles.assetCardMain}
        aria-label={selectLabel}
        aria-pressed={selectable ? selected : undefined}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled || selected) onSelect?.(asset);
        }}
      >
        <span className={styles.assetVisual}>
          {asset.mediaType === "video" ? (
            <video src={visualUrl} muted playsInline preload="metadata" aria-label={cardTitle} />
          ) : !imageFailed ? (
            <Image
              src={visualUrl}
              alt={cardTitle}
              fill
              unoptimized
              sizes="(max-width: 720px) 46vw, (max-width: 1280px) 24vw, 220px"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className={styles.assetFallback} aria-hidden="true"><ImageIcon /></span>
          )}
          {asset.mediaType === "video" && (
            <span className={styles.mediaBadge}><Film aria-hidden="true" />{videoLabel}</span>
          )}
          {selected && (
            <span className={styles.selectionBadge} aria-hidden="true">
              {selectedOrder ?? <Check />}
            </span>
          )}
        </span>
        <span className={styles.assetMeta}>
          <strong title={cardTitle}>{cardTitle}</strong>
          {asset.createdAt && (
            <time dateTime={asset.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(asset.createdAt))}</time>
          )}
        </span>
      </button>
      {onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={styles.deleteButton}
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={() => onDelete(asset)}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </article>
  );
}

export function ResourceAssetGrid({ children, label }: { children: ReactNode; label: string }) {
  return <div className={styles.assetGrid} role="list" aria-label={label}>{children}</div>;
}

export function ResourceLoadingState({ label }: { label: string }) {
  return (
    <div className={styles.statePanel} role="status" aria-live="polite">
      <LoaderCircle className={styles.stateSpinner} aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ResourceEmptyState({
  title,
  description,
  action,
  kind = "empty",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  kind?: "empty" | "upload";
}) {
  return (
    <div className={styles.statePanel}>
      <span className={styles.stateIcon} aria-hidden="true">
        {kind === "upload" ? <Upload /> : <FileQuestion />}
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ResourceErrorState({
  title,
  description,
  retryLabel,
  onRetry,
}: {
  title: string;
  description: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className={styles.statePanel} role="alert">
      <span className={styles.stateIcon} aria-hidden="true"><RefreshCw /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      <Button variant="outline" onClick={onRetry}><RefreshCw aria-hidden="true" />{retryLabel}</Button>
    </div>
  );
}
