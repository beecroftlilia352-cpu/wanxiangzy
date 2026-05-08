import Image from "next/image";
import type { ReactNode } from "react";

export type StudioEmptyStateProps = {
  title: string;
  description: string;
  imageSrc?: string;
  imageAlt?: string;
  steps?: Array<{ title: string; description: string }>;
  actions?: ReactNode;
};

export function StudioEmptyState({
  title,
  description,
  imageSrc,
  imageAlt = "",
  steps,
  actions,
}: StudioEmptyStateProps) {
  return (
    <div className="studio-empty-state">
      {imageSrc && (
        <div className="studio-empty-state-media">
          <Image src={imageSrc} alt={imageAlt} fill sizes="(max-width: 768px) 160px, 220px" className="object-cover object-top" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="studio-empty-state-kicker">Preview Guide</p>
        <h3 className="studio-empty-state-title">{title}</h3>
        <p className="studio-empty-state-description">{description}</p>
        {steps?.length ? (
          <ol className="studio-empty-state-steps">
            {steps.map((step, index) => (
              <li key={step.title} className="studio-empty-state-step">
                <span>{index + 1}</span>
                <div>
                  <p>{step.title}</p>
                  <small>{step.description}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
