import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasAssistantSession, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "../types";

export type CanvasProject = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    chatSessions: CanvasAssistantSession[];
    activeChatId: string | null;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    viewport: ViewportTransform;
    // First image node's storageKey, captured at autosave time so cards can
    // render a thumbnail without scanning nodes on every paint. Additive —
    // existing projects without this field fall back to a placeholder.
    coverStorageKey?: string | null;
    // User-starred flag, toggleable from the sidebar / card hover actions.
    starred?: boolean;
};

type CanvasStore = {
    hydrated: boolean;
    projects: CanvasProject[];
    createProject: (title?: string) => string;
    importProject: (project: Partial<CanvasProject>) => string;
    openProject: (id: string) => CanvasProject | null;
    renameProject: (id: string, title: string) => void;
    deleteProjects: (ids: string[]) => void;
    replaceProjects: (projects: CanvasProject[]) => void;
    updateProject: (id: string, patch: Partial<Pick<CanvasProject, "nodes" | "connections" | "chatSessions" | "activeChatId" | "backgroundMode" | "showImageInfo" | "viewport" | "coverStorageKey" | "starred">>) => void;
    toggleProjectStarred: (id: string) => void;
};

const initialViewport: ViewportTransform = { x: 0, y: 0, k: 1 };
const CANVAS_STORE_KEY = "infinite-canvas:canvas_store";
type PersistedCanvasState = Pick<CanvasStore, "projects">;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let queuedPersistState: PersistedCanvasState | null = null;

/**
 * Derive the project's cover thumbnail from its first image node. Used by
 * every store action that mutates nodes so the cover stays in sync without a
 * separate migration. Returns null when no image node has a renderable URL.
 */
function deriveCoverStorageKey(nodes: CanvasNodeData[] | undefined): string | null {
    if (!nodes) return null;
    for (const node of nodes) {
        if (node.type !== CanvasNodeType.Image) continue;
        const storageKey = node.metadata?.storageKey;
        if (storageKey) return storageKey;
        const content = node.metadata?.content;
        if (content) return null; // data URL — keep placeholder until first storage write
    }
    return null;
}

const canvasStorage: PersistStorage<CanvasStore> = {
    getItem: async (name) => {
        const value = await localForageStorage.getItem(name);
        if (!value) return null;
        const parsed = JSON.parse(value) as StorageValue<CanvasStore>;
        queuedPersistState = parsed.state as PersistedCanvasState;
        return parsed;
    },
    setItem: (name, value) => {
        const nextState = value.state as PersistedCanvasState;
        if (queuedPersistState && queuedPersistState.projects === nextState.projects) return;
        queuedPersistState = nextState;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void localForageStorage.setItem(name, JSON.stringify(value));
        }, 400);
    },
    removeItem: (name) => localForageStorage.removeItem(name),
};

export const useCanvasStore = create<CanvasStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            projects: [],
            createProject: (title = "未命名画布") => {
                const now = new Date().toISOString();
                const id = nanoid();
                const project: CanvasProject = {
                    id,
                    title,
                    createdAt: now,
                    updatedAt: now,
                    nodes: [],
                    connections: [],
                    chatSessions: [],
                    activeChatId: null,
                    backgroundMode: "lines",
                    showImageInfo: false,
                    viewport: initialViewport,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return id;
            },
            importProject: (source) => {
                const now = new Date().toISOString();
                const nodes = source.nodes || [];
                const project: CanvasProject = {
                    id: nanoid(),
                    title: source.title || "导入画布",
                    createdAt: source.createdAt || now,
                    updatedAt: now,
                    nodes,
                    connections: source.connections || [],
                    chatSessions: source.chatSessions || [],
                    activeChatId: source.activeChatId || null,
                    backgroundMode: source.backgroundMode || "lines",
                    showImageInfo: source.showImageInfo || false,
                    viewport: source.viewport || initialViewport,
                    coverStorageKey: deriveCoverStorageKey(nodes) ?? source.coverStorageKey ?? null,
                };
                set((state) => ({ projects: [project, ...state.projects] }));
                return project.id;
            },
            openProject: (id) => {
                return get().projects.find((item) => item.id === id) || null;
            },
            renameProject: (id, title) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, title: title.trim() || project.title, updatedAt: new Date().toISOString() } : project)),
                })),
            deleteProjects: (ids) =>
                set((state) => {
                    const projects = state.projects.filter((project) => !ids.includes(project.id));
                    return { projects };
                }),
            replaceProjects: (projects) =>
                set({
                    projects: projects.map((project) => ({
                        ...project,
                        coverStorageKey: project.coverStorageKey ?? deriveCoverStorageKey(project.nodes),
                    })),
                }),
            updateProject: (id, patch) =>
                set((state) => ({
                    projects: state.projects.map((project) => {
                        if (project.id !== id) return project;
                        const next = { ...project, ...patch, updatedAt: new Date().toISOString() };
                        // Re-derive the cover thumbnail whenever the patch
                        // touches `nodes` so existing projects catch up to
                        // any image node that has been hydrated since the
                        // last save.
                        if (patch.nodes) {
                            next.coverStorageKey = patch.coverStorageKey ?? deriveCoverStorageKey(patch.nodes);
                        }
                        return next;
                    }),
                })),
            toggleProjectStarred: (id) =>
                set((state) => ({
                    projects: state.projects.map((project) => (project.id === id ? { ...project, starred: !project.starred } : project)),
                })),
        }),
        {
            name: CANVAS_STORE_KEY,
            storage: canvasStorage,
            partialize: (state) =>
                ({
                    projects: state.projects,
                }) as StorageValue<CanvasStore>["state"],
            onRehydrateStorage: () => (state) => {
                // Backfill the cover thumbnail for projects stored before the
                // `coverStorageKey` field shipped — existing data still has
                // the image nodes, just without the cached cover pointer.
                if (state) {
                    const backfilled = state.projects.map((project) =>
                        project.coverStorageKey ? project : { ...project, coverStorageKey: deriveCoverStorageKey(project.nodes) },
                    );
                    if (backfilled.some((project, index) => project !== state.projects[index])) {
                        useCanvasStore.setState({ projects: backfilled });
                    }
                }
                useCanvasStore.setState({ hydrated: true });
            },
        },
    ),
);
