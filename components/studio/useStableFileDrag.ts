"use client";

import { useMemo, useRef, type DragEvent } from "react";

type StableFileDragOptions = {
  isDragging?: boolean;
  setDragging?: (dragging: boolean) => void;
  onFiles?: (files: File[]) => unknown | Promise<unknown>;
  fileFilter?: (file: File) => boolean;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  stopPropagation?: boolean;
};

function hasFileDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types || []).includes("Files");
}

function fileMatchesAccept(file: File, accept?: string) {
  if (!accept || accept.trim() === "" || accept.trim() === "*/*") return true;
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  return accept
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((rule) => {
      if (rule.startsWith(".")) return fileName.endsWith(rule);
      if (rule.endsWith("/*")) return fileType.startsWith(`${rule.slice(0, -1)}`);
      return fileType === rule;
    });
}

export type StableFileDragContext = {
  finishDragging: () => void;
};

export function useStableFileDrag<T extends HTMLElement = HTMLElement>({
  isDragging,
  setDragging,
  onFiles,
  fileFilter,
  accept,
  multiple,
  disabled,
  stopPropagation,
}: StableFileDragOptions) {
  const dragDepthRef = useRef(0);

  return useMemo(() => {
    const finishDragging = () => {
      dragDepthRef.current = 0;
      setDragging?.(false);
    };

    const prepareFileEvent = (event: DragEvent<T>) => {
      if (!hasFileDrag(event)) return false;
      event.preventDefault();
      if (stopPropagation) event.stopPropagation();
      return true;
    };

    return {
      finishDragging,
      dragHandlers: {
        onDragEnter: (event: DragEvent<T>) => {
          if (!prepareFileEvent(event) || disabled) return;
          dragDepthRef.current += 1;
          setDragging?.(true);
        },
        onDragLeave: (event: DragEvent<T>) => {
          if (!prepareFileEvent(event) || disabled) return;
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragging?.(false);
        },
        onDragOver: (event: DragEvent<T>) => {
          if (!prepareFileEvent(event)) return;
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
          if (disabled) return;
          if (!isDragging) setDragging?.(true);
        },
        onDrop: (event: DragEvent<T>) => {
          if (!prepareFileEvent(event)) return;
          finishDragging();
          if (disabled) return;
          const files = Array.from(event.dataTransfer.files || [])
            .filter((file) => fileMatchesAccept(file, accept))
            .filter((file) => !fileFilter || fileFilter(file));
          const acceptedFiles = multiple === false ? files.slice(0, 1) : files;
          if (acceptedFiles.length > 0) void onFiles?.(acceptedFiles);
        },
        onDragEnd: (event: DragEvent<T>) => {
          if (stopPropagation) event.stopPropagation();
          finishDragging();
        },
      },
    };
  }, [accept, disabled, fileFilter, isDragging, multiple, onFiles, setDragging, stopPropagation]);
}
