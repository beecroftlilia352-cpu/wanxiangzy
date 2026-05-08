import type { HTMLAttributes, ReactNode } from "react";

export type StudioSectionProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function StudioSection({
  title,
  description,
  badge,
  actions,
  children,
  className = "",
  ...sectionProps
}: StudioSectionProps) {
  return (
    <section className={`studio-section ${className}`} {...sectionProps}>
      <div className="studio-section-header">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="studio-section-title">{title}</h3>
            {badge}
          </div>
          {description && <p className="studio-section-description">{description}</p>}
        </div>
        {actions && <div className="studio-section-actions">{actions}</div>}
      </div>
      <div className="studio-section-body">{children}</div>
    </section>
  );
}
