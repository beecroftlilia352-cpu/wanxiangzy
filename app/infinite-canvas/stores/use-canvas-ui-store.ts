import { create } from "zustand";
import { persist } from "zustand/middleware";

type CanvasUiStore = {
    editingProjectId: string | null;
    editingProjectTitle: string;
    selectedProjectIds: string[];
    deleteProjectIds: string[];

    // Figma-style home UI. sidebarCollapsed persists so the user's layout
    // choice survives reloads; the rest are session-only.
    sidebarCollapsed: boolean;
    searchQuery: string;
    starredOnly: boolean;
    selectedProjectId: string | null;

    startEditingProject: (id: string, title: string) => void;
    setEditingProjectTitle: (title: string) => void;
    stopEditingProject: () => void;
    toggleSelectedProjectId: (id: string, selected: boolean) => void;
    setDeleteProjectIds: (ids: string[]) => void;
    removeSelectedProjectIds: (ids: string[]) => void;

    setSidebarCollapsed: (collapsed: boolean) => void;
    toggleSidebarCollapsed: () => void;
    setSearchQuery: (query: string) => void;
    setStarredOnly: (value: boolean) => void;
    setSelectedProjectId: (id: string | null) => void;
};

export const useCanvasUiStore = create<CanvasUiStore>()(
    persist(
        (set) => ({
            editingProjectId: null,
            editingProjectTitle: "",
            selectedProjectIds: [],
            deleteProjectIds: [],

            sidebarCollapsed: false,
            searchQuery: "",
            starredOnly: false,
            selectedProjectId: null,

            startEditingProject: (editingProjectId, editingProjectTitle) => set({ editingProjectId, editingProjectTitle }),
            setEditingProjectTitle: (editingProjectTitle) => set({ editingProjectTitle }),
            stopEditingProject: () => set({ editingProjectId: null }),
            toggleSelectedProjectId: (id, selected) => set((state) => ({ selectedProjectIds: selected ? [...new Set([...state.selectedProjectIds, id])] : state.selectedProjectIds.filter((item) => item !== id) })),
            setDeleteProjectIds: (deleteProjectIds) => set({ deleteProjectIds }),
            removeSelectedProjectIds: (ids) => set((state) => ({ selectedProjectIds: state.selectedProjectIds.filter((id) => !ids.includes(id)) })),

            setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
            toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
            setSearchQuery: (searchQuery) => set({ searchQuery }),
            setStarredOnly: (starredOnly) => set({ starredOnly }),
            setSelectedProjectId: (selectedProjectId) => set({ selectedProjectId }),
        }),
        {
            // Only persist layout choices; transient UI state stays in-memory
            // so reloads land on a fresh "all files" view.
            name: "infinite-canvas:canvas_ui_store",
            partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
        },
    ),
);