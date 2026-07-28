"use client";

import { useEffect, useState } from "react";
import { Layers3 } from "lucide-react";

import { resolveImageUrl } from "@/services/image-storage";
import { cn } from "@/lib/utils";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

// Resolves a project's coverStorageKey to a displayable URL. Returns the
// resolved URL synchronously when given a fully-qualified data: URL or
// already-public storage URL; otherwise hits the image-storage service and
// returns the resolved data URL once available. Returns null if no key.
function useResolvedCover(storageKey?: string | null) {
    const [resolved, setResolved] = useState<string | null>(() => {
        if (!storageKey) return null;
        // Already a data: URL — renderable directly.
        if (storageKey.startsWith("data:")) return storageKey;
        // An http(s) URL is already public; no need to round-trip through
        // storage (which is meant for our own bucket).
        if (/^https?:\/\//.test(storageKey)) return storageKey;
        return null;
    });

    useEffect(() => {
        if (!storageKey) {
            setResolved(null);
            return;
        }
        if (storageKey.startsWith("data:") || /^https?:\/\//.test(storageKey)) {
            setResolved(storageKey);
            return;
        }
        let cancelled = false;
        void resolveImageUrl(storageKey, "").then((url) => {
            if (!cancelled) setResolved(url || null);
        });
        return () => {
            cancelled = true;
        };
    }, [storageKey]);

    return resolved;
}

export function CanvasThumbnail({
    storageKey,
    title,
    className,
    rounded = "rounded-lg",
}: {
    storageKey?: string | null;
    title: string;
    className?: string;
    rounded?: string;
}) {
    const url = useResolvedCover(storageKey);
    if (url) {
        return (
            <div className={cn("relative aspect-[16/10] w-full overflow-hidden bg-stone-100", rounded, className)}>
                <RawPreviewImage
                    src={url}
                    alt={title}
                    width={640}
                    height={400}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                />
            </div>
        );
    }
    return <CanvasThumbnailPlaceholder title={title} className={className} rounded={rounded} />;
}

export function CanvasThumbnailPlaceholder({ title, className, rounded = "rounded-lg" }: { title: string; className?: string; rounded?: string }) {
    const initials = computeInitials(title);
    const hue = computeHue(title);
    return (
        <div
            className={cn("relative aspect-[16/10] w-full overflow-hidden", rounded, className)}
            style={{
                backgroundImage: `linear-gradient(135deg, hsl(${hue} 30% 96%) 0%, hsl(${(hue + 40) % 360} 28% 88%) 100%)`,
            }}
        >
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-2 text-stone-500">
                    <div className="grid size-10 place-items-center rounded-md bg-white/70 shadow-sm backdrop-blur-sm">
                        <Layers3 className="size-5" aria-hidden="true" />
                    </div>
                    <span className="text-sm font-medium tracking-wide text-stone-600">{initials}</span>
                </div>
            </div>
        </div>
    );
}

function computeInitials(title: string) {
    const cleaned = title.trim();
    if (!cleaned) return "未命名";
    const ascii = cleaned.match(/[A-Za-z0-9]/g);
    if (ascii && ascii.length >= 2) return ascii.slice(0, 2).join("").toUpperCase();
    const han = Array.from(cleaned.replace(/\s+/g, ""));
    if (han.length >= 2) return han.slice(0, 2).join("");
    return cleaned.slice(0, 2);
}

// Deterministic per-title hue so the same project always lands on the same
// gradient — saves re-rendering flicker when the card re-mounts.
function computeHue(title: string) {
    let hash = 0;
    for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
}
