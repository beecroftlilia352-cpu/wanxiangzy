import Image from "next/image";
import { Workflow } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PreviewGuideStep = {
  title: string;
  desc: string;
  imageSrc?: string;
  imageAlt?: string;
  imageFit?: "cover" | "contain";
  badge?: string;
};

type PreviewGuideProps = {
  title: string;
  subtitle: string;
  steps: PreviewGuideStep[];
  imageSrc?: string;
  imageAlt?: string;
  imageFit?: "cover" | "contain";
  imagePriority?: boolean;
  presentation?: "standard" | "hero-image";
  icon?: ReactNode;
  actions?: ReactNode;
  variant?: "default" | "editorial";
};

export function PreviewGuide({
  title,
  subtitle,
  steps,
  imageSrc,
  imageAlt = "",
  imageFit = "cover",
  imagePriority = false,
  presentation = "standard",
  icon,
  actions,
  variant = "default",
}: PreviewGuideProps) {
  const hasStepImages = steps.some((step) => Boolean(step.imageSrc));
  const layout = presentation === "hero-image" ? "hero-image" : hasStepImages ? "gallery" : "overview";
  const stepGridClass = steps.length >= 4
    ? "sm:grid-cols-2 lg:grid-cols-4"
    : steps.length === 2
      ? "sm:grid-cols-2"
      : "sm:grid-cols-3";

  return (
    <div className="studio-preview-guide" data-variant={variant} data-layout={layout}>
      <div className="studio-preview-guide-content">
        <header className={cn("studio-preview-guide-header", presentation === "hero-image" && "sr-only")}>
          <h3 className="studio-preview-guide-title" style={{ textWrap: "balance" }}>{title}</h3>
          <p className="studio-preview-guide-subtitle">{subtitle}</p>
        </header>

        <div className="studio-preview-guide-panel">
          {presentation === "hero-image" ? (
            <div className="studio-preview-guide-hero-media">
              {imageSrc ? (
                <Image
                  src={imageSrc}
                  alt={imageAlt}
                  fill
                  priority={imagePriority}
                  sizes="(max-width: 768px) 92vw, (max-width: 1440px) 58vw, 980px"
                  className="studio-preview-guide-hero-image"
                />
              ) : (
                <div className="studio-preview-guide-media-placeholder">
                  <span>{icon || <Workflow className="h-7 w-7" aria-hidden="true" />}</span>
                </div>
              )}
            </div>
          ) : hasStepImages ? (
            <div className={cn("studio-preview-guide-grid", stepGridClass)}>
              {steps.map((step, index) => (
                <GuideMediaStep
                  key={step.title}
                  step={step}
                  index={index}
                  fallbackImageSrc={imageSrc}
                  fallbackImageAlt={imageAlt}
                  fallbackIcon={icon}
                  variant={variant}
                />
              ))}
            </div>
          ) : (
            <div className="studio-preview-guide-overview">
              <div
                className={cn(
                  "studio-preview-guide-overview-media",
                  imageFit === "contain" && "studio-preview-guide-overview-media-contain",
                )}
                aria-hidden={!imageSrc}
              >
                {imageSrc ? (
                  <Image
                    src={imageSrc}
                    alt={imageAlt}
                    fill
                    priority={imagePriority}
                    sizes="(max-width: 768px) 86vw, (max-width: 1280px) 48vw, 560px"
                    className="studio-preview-guide-overview-image"
                  />
                ) : (
                  <div className="studio-preview-guide-overview-icon">
                    {icon || <Workflow className="h-7 w-7" aria-hidden="true" />}
                  </div>
                )}
                <span className="studio-preview-guide-media-label">01—{String(steps.length).padStart(2, "0")}</span>
              </div>

              <ol className="studio-preview-guide-overview-steps">
                {steps.map((step, index) => (
                  <li key={step.title} className="studio-preview-guide-overview-step">
                    <span className="studio-preview-guide-overview-index">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <p className="studio-preview-guide-step-title">{step.title}</p>
                      {step.desc ? <p className="studio-preview-guide-step-description">{step.desc}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {actions ? <div className="studio-preview-guide-actions">{actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

function GuideMediaStep({
  step,
  index,
  fallbackImageSrc,
  fallbackImageAlt,
  fallbackIcon,
  variant,
}: {
  step: PreviewGuideStep;
  index: number;
  fallbackImageSrc?: string;
  fallbackImageAlt: string;
  fallbackIcon?: ReactNode;
  variant: "default" | "editorial";
}) {
  const src = step.imageSrc || fallbackImageSrc;
  const isContain = step.imageFit === "contain";

  return (
    <article className="studio-preview-guide-step">
      <div className="studio-preview-guide-media-frame">
        <div className={cn("studio-preview-guide-media", isContain && "studio-preview-guide-media-contain")}>
          {src ? (
            <Image
              src={src}
              alt={step.imageAlt || fallbackImageAlt || step.title}
              fill
              sizes="(max-width: 640px) 86vw, (max-width: 1024px) 42vw, 250px"
              className={cn("studio-preview-guide-image", isContain ? "object-contain" : "object-cover object-top")}
            />
          ) : (
            <div className="studio-preview-guide-media-placeholder">
              <span>{fallbackIcon || <Workflow className="h-7 w-7" aria-hidden="true" />}</span>
            </div>
          )}
          <span className="studio-preview-guide-badge">
            {step.badge || (variant === "editorial" ? String(index + 1).padStart(2, "0") : `${index + 1}`)}
          </span>
        </div>
      </div>
      <div className="studio-preview-guide-step-copy">
        <span className="studio-preview-guide-step-index">{String(index + 1).padStart(2, "0")}</span>
        <div className="min-w-0">
          <p className="studio-preview-guide-step-title">{step.title}</p>
          {step.desc ? <p className="studio-preview-guide-step-description">{step.desc}</p> : null}
        </div>
      </div>
    </article>
  );
}
