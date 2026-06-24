import {
  Box,
  Brush,
  Layers,
  Shirt,
  Sparkles,
  Sprout,
  User,
  UserCircle2,
  Users,
  Wand2,
  Workflow,
  type LucideIcon,
} from "lucide-react";

/**
 * Module → icon mapping. Centralized here so every admin surface (KPI tiles,
 * breakdown lists, nav) renders the same glyph for the same module.
 *
 * Falls back to Sparkles for unknown keys — better than a question mark when
 * a new module ships before this file is updated.
 */
const MODULE_ICONS: Record<string, LucideIcon> = {
  tryon: Shirt,
  model: User,
  face: UserCircle2,
  faceSwap: UserCircle2,
  grass: Sprout,
  productSet: Layers,
  modelBackground: Brush,
  garment3d: Box,
  generalImage: Wand2,
  pose: Users,
  workflow: Workflow,
  image: Wand2,
};

export function moduleIcon(key: string | null | undefined): LucideIcon {
  if (!key) return Sparkles;
  return MODULE_ICONS[key] ?? Sparkles;
}
