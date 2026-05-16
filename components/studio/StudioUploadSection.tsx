import type { ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

export type StudioUploadSectionProps = {
  title: ReactNode;
  actions?: ReactNode;
  inputRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void | Promise<void>;
  multiple?: boolean;
  accept?: string;
  isDragging?: boolean;
  setDragging?: (dragging: boolean) => void;
  className?: string;
  children: (openFileDialog: () => void) => ReactNode;
};

export function StudioUploadSection({
  title,
  actions,
  inputRef,
  onFiles,
  multiple,
  accept = "image/*",
  isDragging,
  setDragging,
  className,
  children,
}: StudioUploadSectionProps) {
  const openFileDialog = () => inputRef.current?.click();

  return (
    <section
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging?.(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging?.(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setDragging?.(false);
        void onFiles(Array.from(event.dataTransfer.files || []));
      }}
      className={cn("studio-upload-section", isDragging && "studio-upload-section-dragging", className)}
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
        className="hidden"
        onChange={(event) => {
          const input = event.currentTarget;
          void Promise.resolve(onFiles(Array.from(input.files || []))).finally(() => {
            input.value = "";
          });
        }}
      />

      {children(openFileDialog)}
    </section>
  );
}
