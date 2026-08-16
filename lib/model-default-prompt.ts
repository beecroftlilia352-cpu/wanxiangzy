import { enforceModelPromptRequirements } from "@/lib/model-prompt";
import { buildModelShootStylePrompt, type ModelShootStyle } from "@/lib/module-style-presets";

type Gender = "female" | "male";

type Args = {
  refCount: number;
  gender: Gender;
  hairStyle: string | null;
  hairColor: string | null;
  hasHairReference: boolean;
  hasHairColorReference: boolean;
  modelStyle: ModelShootStyle;
};

/**
 * 根据当前 gender / 发型 / 发色 / 参考图存在性，构造模型生成的默认提示词。
 *
 * 计算参考图索引规则：
 *   - 发型参考图排在所有服装参考图之后（refCount + 1）
 *   - 发色参考图排在发型参考图之后（refCount + hasHairReference ? 2 : 1）
 *
 * 实际文本内容走 lib/model-prompt.enforceModelPromptRequirements() 拼装，
 * 这里只关心索引偏移，避免在 page 组件里嵌入一堆魔术数字。
 */
export function buildModelDefaultPrompt({
  refCount,
  gender,
  hairStyle,
  hairColor,
  hasHairReference,
  hasHairColorReference,
  modelStyle,
}: Args) {
  const hairImageIndex = refCount + 1;
  const hairColorImageIndex = refCount + (hasHairReference ? 2 : 1);
  return enforceModelPromptRequirements({
    prompt: buildModelShootStylePrompt(modelStyle),
    referenceCount: refCount,
    gender,
    hairStyle,
    hairColor,
    hairReferenceIndex: hasHairReference ? hairImageIndex : null,
    hairColorReferenceIndex: hasHairColorReference ? hairColorImageIndex : null,
  });
}