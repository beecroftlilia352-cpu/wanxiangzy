"use client";

import { useMemo } from "react";

import type { CanvasProject } from "../stores/use-canvas-store";

// Shared filter used by the home page grid, the sidebar list, and any
// future surface that needs the same starred + search filtering. Keeping
// this in one place means the home page and sidebar always agree on
// what's "visible" — the home page grid and the sidebar list can't drift.
export function useFilteredProjects(
    projects: CanvasProject[],
    options: { searchQuery?: string; starredOnly?: boolean }
): CanvasProject[] {
    const { searchQuery = "", starredOnly = false } = options;
    return useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return projects.filter((project) => {
            if (starredOnly && !project.starred) return false;
            if (q && !project.title.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [projects, searchQuery, starredOnly]);
}