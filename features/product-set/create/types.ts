import type { AspectRatio } from "@/lib/api/lingya";
import type { HistoryJobPayload } from "@/lib/history-apply";
import type { ProductSetCopyDensity } from "@/lib/product-set";

export type ProductImage = {
  url: string;
  name: string;
};

export type ProductSetHistoryPayload = Extract<HistoryJobPayload, { kind: "productSet" }>;

export type CustomDraft = {
  name: string;
  typeDescription: string;
  moduleRole: string;
  contentScope: string;
  layoutRules: string;
  textRules: string;
  avoidRules: string;
  aspectRatio: AspectRatio;
  referenceImageUrls: string[];
  modelReferenceImageUrls: string[];
  otherReferenceImageUrls: string[];
  extraDescription: string;
  subjectConsistency: boolean;
  modelConsistency: boolean;
  intelligentCopy: boolean;
  copyDensity: ProductSetCopyDensity;
};

export type TemplateFilter = "all" | "selected" | "womenswear";

export type ProductSetAnalysisDetail = {
  image_role?: string;
  category?: { primary?: string; secondary?: string; category_confidence?: number };
  product?: {
    name_guess?: string;
    colors?: string[];
    style_tags?: string[];
    visible_details?: string[];
    possible_selling_points?: string[];
    usage_scenarios?: string[];
  };
  image_quality?: { quality_score?: number; can_generate?: boolean };
  generation_fit?: { recommended_style?: string; recommended_style_reason?: string; recommended_output_set?: string[] };
  visual_director?: {
    strategy_name?: string;
    style_strategy?: string;
    global_strategy?: {
      core_palette?: string;
      primary_color?: string;
      secondary_colors?: string[];
      accent_color?: string;
      color_temperature?: string;
      lighting?: string;
      typography?: string;
      texture_mood?: string;
    };
    main_plan?: Array<{ module_key?: string; purpose?: string; layout?: string; copy_rule?: string }>;
    details_plan?: Array<{ module_key?: string; purpose?: string; layout?: string; copy_rule?: string }>;
    main_scripts?: Array<{ screen_no?: number; module_key?: string; title?: string; global_tone?: string; scene_design?: string; visual_composition?: string; copy_content?: string; layout_rules?: string; constraints?: string }>;
    details_scripts?: Array<{ screen_no?: number; module_key?: string; title?: string; global_tone?: string; scene_design?: string; visual_composition?: string; copy_content?: string; layout_rules?: string; constraints?: string }>;
    layout_principles?: string[];
    copy_strategy?: string;
    negative_layouts?: string[];
  };
  missing_info?: string[];
  next_step?: { message_to_user?: string; can_continue_without_more_info?: boolean };
  prompt_summary?: string;
};
