export const VIP_GENERATION_PRIORITY = 2 as const;
export const AGED_STANDARD_GENERATION_PRIORITY = 5 as const;
export const STANDARD_GENERATION_PRIORITY = 20 as const;

export type GenerationQueuePriority =
  | typeof VIP_GENERATION_PRIORITY
  | typeof AGED_STANDARD_GENERATION_PRIORITY
  | typeof STANDARD_GENERATION_PRIORITY;

export function isGenerationQueuePriority(value: unknown): value is GenerationQueuePriority {
  return value === VIP_GENERATION_PRIORITY
    || value === AGED_STANDARD_GENERATION_PRIORITY
    || value === STANDARD_GENERATION_PRIORITY;
}
