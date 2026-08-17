"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import type { ResourceAsset, ResourcePickerRequest, ResourcePickerResult } from "./types";

const ResourcePickerDialog = dynamic(
  () => import("./ResourcePickerDialog").then((module) => module.ResourcePickerDialog),
  { ssr: false },
);

type PendingPicker = {
  request: ResourcePickerRequest;
  resolve: (value: ResourcePickerResult) => void;
};

type ResourcePickerContextValue = {
  openResourcePicker: (request: ResourcePickerRequest) => Promise<ResourcePickerResult>;
};

const ResourcePickerContext = createContext<ResourcePickerContextValue | null>(null);

export function ResourceLibraryProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPicker | null>(null);
  const pendingRef = useRef<PendingPicker | null>(null);

  const settle = useCallback((value: ResourcePickerResult) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const openResourcePicker = useCallback((request: ResourcePickerRequest) => {
    pendingRef.current?.resolve(null);
    return new Promise<ResourcePickerResult>((resolve) => {
      const next = { request, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const value = useMemo(() => ({ openResourcePicker }), [openResourcePicker]);

  useEffect(() => () => {
    pendingRef.current?.resolve(null);
    pendingRef.current = null;
  }, []);

  return (
    <ResourcePickerContext.Provider value={value}>
      {children}
      {pending ? (
        <ResourcePickerDialog
          open
          request={pending.request}
          onCancel={() => settle(null)}
          onConfirm={(assets: ResourceAsset[]) => settle(assets)}
        />
      ) : null}
    </ResourcePickerContext.Provider>
  );
}

export function useResourcePicker(): ResourcePickerContextValue {
  const context = useContext(ResourcePickerContext);
  if (!context) throw new Error("useResourcePicker must be used within ResourceLibraryProvider");
  return context;
}
