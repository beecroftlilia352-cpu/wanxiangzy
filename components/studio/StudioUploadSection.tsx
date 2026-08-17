import type { ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";
import { useStableFileDrag, type StableFileDragContext } from "@/components/studio/useStableFileDrag";

export type StudioUploadSectionProps = {
  title: ReactNode;
  actions?: ReactNode;
  inputRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  accept?: string;
  disabled?: boolean;
  isDragging?: boolean;
  setDragging?: (dragging: boolean) => void;
  className?: string;
  children: (openFileDialog: () => void, dragContext: StableFileDragContext) => ReactNode;
};

export function StudioUploadSection({
  title,
  actions,
  inputRef,
  onFiles,
  multiple,
  accept = "image/*",
  disabled = false,
  isDragging,
  setDragging,
  className,
  children,
}: StudioUploadSectionProps) {
  const openFileDialog = () => {
    if (!disabled) inputRef.current?.click();
  };
  const { dragHandlers, finishDragging } = useStableFileDrag<HTMLElement>({
    isDragging,
    setDragging,
    onFiles,
    accept,
    multiple: Boolean(multiple),
    disabled,
  });

  return (
    <section
      {...dragHandlers}
      className={cn("studio-upload-section", isDragging && "studio-upload-section-dragging", className)}
      aria-disabled={disabled || undefined}
    >
      <div className="studio-upload-header">
        <h3 className="studio-upload-title">{title}</h3>
        {actions && <div className="studio-section-actions">{actions}</div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(event) => {
          const input = event.currentTarget;
          if (disabled) {
            input.value = "";
            return;
          }
          void Promise.resolve(onFiles(Array.from(input.files || []))).finally(() => {
            input.value = "";
          });
        }}
      />

      {children(openFileDialog, { finishDragging })}
    </section>
  );
}
