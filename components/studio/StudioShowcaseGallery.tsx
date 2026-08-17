"use client";

import Image from "next/image";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Copy, Eye, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StudioShowcaseExample } from "@/lib/showcase-examples";
import { cn } from "@/lib/utils";

type StudioShowcaseGalleryProps = {
  onCreateSimilar: (example: StudioShowcaseExample) => void;
};

type ShowcaseResponse = {
  enabled?: boolean;
  items?: StudioShowcaseExample[];
};

export function StudioShowcaseGallery({ onCreateSimilar }: StudioShowcaseGalleryProps) {
  const locale = useLocale();
  const isChinese = locale.toLowerCase().startsWith("zh");
  const copy = useMemo(() => isChinese ? zhCopy : enCopy, [isChinese]);
  const [items, setItems] = useState<StudioShowcaseExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StudioShowcaseExample | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetch("/api/showcase-examples", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`showcase ${response.status}`);
        return response.json() as Promise<ShowcaseResponse>;
      })
      .then((payload) => {
        if (!active) return;
        setItems(payload.enabled === false ? [] : Array.isArray(payload.items) ? payload.items : []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (active) setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  function applyExample(example: StudioShowcaseExample) {
    onCreateSimilar(example);
    setSelected(null);
  }

  if (!loading && items.length === 0) return null;

  return (
    <section className="studio-showcase" aria-labelledby="studio-showcase-title">
      <div className="studio-showcase-heading">
        <span aria-hidden="true" />
        <h2 id="studio-showcase-title">{copy.title}</h2>
        <span aria-hidden="true" />
      </div>
      <p className="studio-showcase-intro">{copy.subtitle}</p>

      {loading ? (
        <ShowcaseSkeleton label={copy.loading} />
      ) : (
        <div className="studio-showcase-grid">
          {items.map((item) => (
            <ShowcaseCard
              key={item.id}
              item={item}
              previewLabel={copy.preview}
              createLabel={copy.create}
              onPreview={() => setSelected(item)}
              onCreate={() => applyExample(item)}
            />
          ))}
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="studio-showcase-dialog" showCloseButton>
          {selected ? (
            <>
              <DialogTitle className="sr-only">{selected.title}</DialogTitle>
              <DialogDescription className="sr-only">{copy.detailDescription}</DialogDescription>
              <div className="studio-showcase-dialog-media">
                <Image
                  src={selected.imageUrl}
                  alt={selected.title}
                  fill
                  priority
                  sizes="(max-width: 900px) 94vw, 62vw"
                  className="object-contain"
                />
              </div>
              <aside className="studio-showcase-dialog-details">
                <div className="studio-showcase-author">
                  {selected.authorAvatarUrl ? (
                    <Image src={selected.authorAvatarUrl} alt="" width={32} height={32} className="rounded-full object-cover" />
                  ) : (
                    <span className="studio-showcase-author-fallback"><ImageIcon aria-hidden="true" /></span>
                  )}
                  <div>
                    <p>{selected.authorName}</p>
                    <span>{selected.publishedAt ? selected.publishedAt.slice(0, 10) : copy.curated}</span>
                  </div>
                </div>

                <div className="studio-showcase-detail-section">
                  <p className="studio-showcase-detail-label">{copy.workInfo}</p>
                  <h3>{selected.title}</h3>
                  <div className="studio-showcase-prompt">{selected.prompt}</div>
                  <button
                    type="button"
                    className="studio-showcase-copy"
                    onClick={async () => {
                      await navigator.clipboard.writeText(selected.prompt);
                      toast.success(copy.copied);
                    }}
                  >
                    <Copy aria-hidden="true" />
                    {copy.copyPrompt}
                  </button>
                  <div className="studio-showcase-meta">
                    <span>{selected.model}</span>
                    <span>{selected.aspectRatio}</span>
                    <span>{selected.imageSize}</span>
                  </div>
                </div>

                <Button className="studio-showcase-dialog-create" onClick={() => applyExample(selected)}>
                  {copy.create}
                  <ArrowUpRight aria-hidden="true" />
                </Button>
              </aside>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ShowcaseCard({
  item,
  previewLabel,
  createLabel,
  onPreview,
  onCreate,
}: {
  item: StudioShowcaseExample;
  previewLabel: string;
  createLabel: string;
  onPreview: () => void;
  onCreate: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const ratio = normalizeAspectRatio(item.aspectRatio);
  const referenceImages = item.referenceImageUrls.length ? item.referenceImageUrls : [item.imageUrl];
  return (
    <article className="studio-showcase-card" style={{ aspectRatio: ratio }}>
      <Image
        src={item.imageUrl}
        alt={item.title}
        fill
        loading="lazy"
        sizes="(max-width: 640px) 46vw, (max-width: 1280px) 30vw, 270px"
        className={cn("studio-showcase-card-image", loaded && "is-loaded")}
        onLoad={() => setLoaded(true)}
      />
      {!loaded ? <span className="studio-showcase-card-loading" aria-hidden="true" /> : null}
      <div className="studio-showcase-card-overlay">
        <button type="button" className="studio-showcase-card-preview" onClick={onPreview}>
          <Eye aria-hidden="true" />
          {previewLabel}
        </button>
        <div className="studio-showcase-card-footer">
          <div className="studio-showcase-card-references" aria-hidden="true">
            {referenceImages.slice(0, 3).map((url, index) => (
              <span key={`${url}-${index}`}>
                <Image src={url} alt="" fill sizes="52px" className="object-cover" />
              </span>
            ))}
          </div>
          <button type="button" className="studio-showcase-card-create" onClick={onCreate}>{createLabel}</button>
        </div>
      </div>
    </article>
  );
}

function ShowcaseSkeleton({ label }: { label: string }) {
  return (
    <div className="studio-showcase-skeleton" role="status" aria-label={label}>
      {["3 / 4", "3 / 4", "4 / 5", "3 / 4", "1 / 1", "3 / 4", "4 / 5", "3 / 4"].map((ratio, index) => (
        <span key={`${ratio}-${index}`} style={{ aspectRatio: ratio }} />
      ))}
    </div>
  );
}

function normalizeAspectRatio(value: string) {
  const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return "3 / 4";
  return `${match[1]} / ${match[2]}`;
}

const zhCopy = {
  title: "创建相似",
  subtitle: "从案例开始，替换参考图或调整描述，快速得到你的版本。",
  preview: "预览",
  create: "创建相似",
  loading: "正在加载创作案例",
  detailDescription: "查看示例详情并创建相似图片",
  curated: "精选案例",
  workInfo: "作品信息",
  copyPrompt: "复制描述",
  copied: "描述已复制",
};

const enCopy = {
  title: "Create similar",
  subtitle: "Start from an example, replace the reference or refine the prompt, and make it yours.",
  preview: "Preview",
  create: "Create similar",
  loading: "Loading examples",
  detailDescription: "Preview the example and create a similar image",
  curated: "Curated example",
  workInfo: "Work information",
  copyPrompt: "Copy prompt",
  copied: "Prompt copied",
};
