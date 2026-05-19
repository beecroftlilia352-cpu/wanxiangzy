import { POSE_SERIES_STYLES, getPoseSeriesStylePoseLines, type PoseSeriesStyle } from "@/lib/module-style-presets";

export type PoseOutputMode = "grid" | "separate";

export const POSE_QUALITY =
  "photorealistic, 8K ultra-detailed, commercial fashion editorial quality, cinematic color grade, sharp facial details, sharp fabric texture, raw photo quality";

export const POSE_LAYOUT_REQUIREMENT =
  "必须生成单张图片中的 2x2 四宫格 / four-panel pose variation / contact sheet，四个分格分别展示姿势1、姿势2、姿势3、姿势4；不要只生成单人单姿势，不要只生成一张普通照片，不要把四个姿势拆成多张独立图片。";

export const POSE_SEPARATE_LAYOUT_REQUIREMENT =
  "输出方式：当前请求只生成一张 3:4 单人完整图片；不要四宫格、拼图、分屏、边框、编号文字或 contact sheet。";

export const POSE_SEPARATE_VARIATION_REQUIREMENT =
  "单图裂变规则：每张独立图必须有清晰不同的身体角度、手臂动作、重心、视线或步态；保留图1身份、服装、场景和光影，但不要复制图1原动作，也不要让同组多张看起来只是同一姿势的轻微重绘。";

export const POSE_SEPARATE_STORYBOARD_REQUIREMENT =
  "单张生产线分镜：同组四张独立图必须像同一套商业时装分镜；每张先执行自己的槽位，并在身体角度、动作高度、手部动作、视线、表情或景别上与其它槽位拉开差异。禁止四张都正面静站、同一手势、同一视线或同一全身构图。";

export const POSE_CONSISTENCY_REQUIREMENT =
  "四个分格必须保持图1同一个人物身份、同一张脸、同一脸型骨相、同一自然肤色、同一发型、同一身体比例、同一套服装、同一面料纹理、同一颜色图案、同一背景场景、同一光线、同一色调和同一摄影质量。";

export const POSE_SOURCE_ROLE_REQUIREMENT =
  "图1角色：唯一的人物、服装、比例、场景和光线参考；文字只改变姿势、可选镜头和构图。";

export const POSE_CAMERA_REQUIREMENT =
  "四个分格都必须使用同一个风格档位下的统一镜头语言，保持同一相机距离、同一焦段、同一视平线和同一画幅留白；允许在 50mm / 70mm / 85mm 中按风格选择一致焦段，但禁止 close-up、特写、wide angle、大广角、high angle、俯拍、low angle、仰拍，避免改变人物比例或服装展示范围。";

export const POSE_PROPORTION_LOCK_RULE =
  "比例锁定：保持图1头身比、头部大小、肩宽、腰胯、四肢长度、脚部大小、腰线和服装穿着尺度；不要拉高拉瘦、长腿化或变体型。";

export const POSE_SERIES_RULE =
  "时装大片连贯性规则：四个分格必须像同一套商业时装大片的连续 pose sheet，而不是四张不同照片拼贴；保持统一构图、统一背景、统一光线、统一肤色质感、统一色彩管理和统一服装展示尺度。";

export const POSE_CLOTHING_RULE =
  "服装展示规则：四个姿势都要清楚展示同一套服装的版型、腰线、肩线、袖长、下摆、面料垂坠、纹理和图案；允许动作造成自然褶皱、遮挡和张力变化，但绝不能改变服装结构、颜色、图案、长度、开口位置或搭配关系。";

export const POSE_BODY_RULE =
  "身体动作规则：动作变化要自然、可信、符合真人关节运动，保留图1或自然商业模特的真实头身比例、肩宽、腰胯比例、四肢长度和体态；避免夸张扭腰、断手、错位手指、肢体拉长、腿被拉长、头被缩小、身体比例漂移或过度瘦身。";

export const POSE_SKIN_COLOR_RULE =
  "肤色和色彩规则：四个分格必须保留图1人物的自然肤色、肤色明暗、冷暖调、局部红润、阴影层次和真实皮肤质感；保持准确白平衡和真实曝光，不要自动美白、不要雪白皮、不要冷白皮、不要过度提亮肤色，不要把画面统一调成过曝白亮或粉白滤镜。";

export const POSE_FACE_SHAPE_RULE =
  "脸型五官规则：四个分格必须保持图1人物的脸型骨相、脸长宽比例、颧骨、下颌线、下巴形状、眼型、眼距、鼻翼宽度、唇形和真实五官辨识度；不要自动变成标准鹅蛋脸、小V脸、尖下巴、大眼高鼻的网红脸。";

export const POSE_CREATIVE_VARIATION_RULE =
  "姿势：未逐条指定时，由 AI 按风格自由设计自然、不同、适合展示服装的姿势；不要套模板。";

export const POSE_EXPRESSION_VARIATION_REQUIREMENT =
  "表情控制：保持同一个人、同一张脸、不要换脸，但四个分格需要轻微自然的表情差异，避免复制粘贴脸；建议分别呈现平静自然、自信微笑、柔和浅笑、专注或轻微回眸的眼神表情。不要夸张表情，不要改变五官身份。";

export const POSE_EXPRESSION_CONSISTENT_REQUIREMENT =
  "表情控制：四个分格保持接近一致的自然表情，只允许极轻微的眼神和嘴角变化；不要夸张表情，不要改变五官身份。";

const POSE_SINGLE_IMAGE_CONSISTENCY_REQUIREMENT =
  "当前单张图片必须保持图1同一个人物身份、同一张脸、同一脸型骨相、同一自然肤色、同一发型、同一身体比例、同一套服装、同一背景场景、同一光线、同一色调和同一摄影质量。";

const POSE_SINGLE_IMAGE_CAMERA_REQUIREMENT =
  "当前单张图片使用商业时装中景全身或七分身构图，保持自然相机距离、50mm/70mm/85mm 中长焦质感、视平线机位和完整服装展示；禁止 close-up、特写、wide angle、大广角、俯拍、仰拍或夸张透视。";

const POSE_SINGLE_EXPRESSION_VARIATION_REQUIREMENT =
  "表情控制：当前单张图片保持图1同一个人和同一张脸，可按当前姿势产生轻微自然表情变化；不要夸张表情，不要改变五官身份，不要复制成僵硬表情。";

const POSE_SINGLE_EXPRESSION_CONSISTENT_REQUIREMENT =
  "表情控制：当前单张图片保持图1接近一致的自然表情，只允许极轻微眼神和嘴角变化；不要夸张表情，不要改变五官身份。";

const DEFAULT_POSE_LINES = [
  "姿势1：正面自然站立，双手自然下垂或轻触口袋，表情平静自然，眼神直视镜头，完整展示服装正面版型。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势2：身体轻微侧转30度，肩线放松，一手轻抚头发或整理衣领，柔和浅笑，展示服装侧面轮廓和肩颈线条。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势3：重心轻微偏移，一手叉腰或扶腰，另一只手自然下垂，自信微笑，展示服装腰线、廓形和面料垂坠。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
  "姿势4：轻微迈步或转身的自然动态，专注或轻微回眸的自然表情，衣服产生真实褶皱、张力和垂坠，不改变服装结构。镜头：consistent medium full-body framing, 50mm lens, eye level angle",
];

const NEGATIVE_POSE_REQUIREMENT =
  "负面约束：不要换脸，不要换衣服，不要改变场景，不要改变服装结构，不要生成多余人物，不要扭曲手指和肢体，不要身体比例漂移，不要自动美白，不要雪白皮或冷白皮，不要标准鹅蛋脸或小V脸，不要塑料皮肤，不要AI渲染感，不要文字水印。";

export function enforcePosePromptRequirements(
  prompt: string,
  options: { varyExpression?: boolean; poseStyle?: PoseSeriesStyle; outputMode?: PoseOutputMode } = {}
) {
  if (!prompt.trim()) return "";

  let nextPrompt = prompt
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!/图1/.test(nextPrompt)) {
    nextPrompt = `保持图1的人物身份、服装、场景、光影一致。${nextPrompt}`;
  }

  if (!/图1角色|图像角色硬规则/.test(nextPrompt)) {
    nextPrompt = `${POSE_SOURCE_ROLE_REQUIREMENT}\n${nextPrompt}`;
  }

  if (options.outputMode === "separate") {
    nextPrompt = normalizeSeparatePromptScope(removeGridLayoutWording(nextPrompt));
    if (!/当前请求只生成一张|不要四宫格|不要生成四宫格/.test(nextPrompt)) {
      nextPrompt = `${POSE_SEPARATE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
    }
  } else if (!/(四宫格|2x2|four-panel|4-panel|contact sheet)/i.test(nextPrompt)) {
    nextPrompt = `${POSE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
  }

  if (!/same face identity|同一张脸|人物身份/.test(nextPrompt)) {
    const consistencyRule = options.outputMode === "separate"
      ? POSE_SINGLE_IMAGE_CONSISTENCY_REQUIREMENT
      : POSE_CONSISTENCY_REQUIREMENT;
    nextPrompt = `${consistencyRule}\n${nextPrompt}`;
  }

  const requiredRules = [
    ["时装大片连贯性规则", POSE_SERIES_RULE],
    ["服装展示规则", POSE_CLOTHING_RULE],
    ["身体动作规则", POSE_BODY_RULE],
    ["肤色和色彩规则", POSE_SKIN_COLOR_RULE],
    ["脸型五官规则", POSE_FACE_SHAPE_RULE],
  ] as const;
  requiredRules.forEach(([marker, rule]) => {
    if (!nextPrompt.includes(marker)) {
      const nextRule = options.outputMode === "separate" ? toSinglePoseRule(rule) : rule;
      nextPrompt = `${nextPrompt}\n${nextRule}`;
    }
  });

  nextPrompt = nextPrompt
    .split("\n")
    .filter((line) => !/表情控制|表情：|表情-|expression variation|facial expression/i.test(line))
    .join("\n")
    .trim();
  const expressionRule = options.varyExpression === false
    ? options.outputMode === "separate" ? POSE_SINGLE_EXPRESSION_CONSISTENT_REQUIREMENT : POSE_EXPRESSION_CONSISTENT_REQUIREMENT
    : options.outputMode === "separate" ? POSE_SINGLE_EXPRESSION_VARIATION_REQUIREMENT : POSE_EXPRESSION_VARIATION_REQUIREMENT;
  nextPrompt = `${nextPrompt}\n${expressionRule}`;

  if (!/consistent .*medium full-body framing|consistent medium full-body framing/i.test(nextPrompt)) {
    const cameraRule = options.outputMode === "separate"
      ? POSE_SINGLE_IMAGE_CAMERA_REQUIREMENT
      : POSE_CAMERA_REQUIREMENT;
    nextPrompt = `${nextPrompt}\n${cameraRule}`;
  }

  const poseLines = getPoseSeriesStylePoseLines(options.poseStyle);
  const requiredPoseLines = options.poseStyle === "user_custom" ? [] : poseLines.length ? poseLines : DEFAULT_POSE_LINES;
  requiredPoseLines.forEach((line, index) => {
    const poseNumber = index + 1;
    if (!new RegExp(`姿势\\s*${poseNumber}`).test(nextPrompt)) {
      nextPrompt = `${nextPrompt}\n${line}`;
    }
  });

  if (!/不要换脸|不要换衣服|不要改变场景/.test(nextPrompt)) {
    nextPrompt = `${nextPrompt}\n${NEGATIVE_POSE_REQUIREMENT}`;
  }

  const missingQuality = POSE_QUALITY
    .split(", ")
    .filter((dimension) => !nextPrompt.includes(dimension));
  if (missingQuality.length) {
    nextPrompt = `${nextPrompt}\n${POSE_QUALITY}`;
  }

  return nextPrompt;
}

export function buildSeparatePoseSlotDirective(poseIndex: number, poseStyle?: PoseSeriesStyle) {
  const safeIndex = Math.min(Math.max(Math.floor(Number(poseIndex) || 1), 1), 4);
  const directives = getSeparatePoseSlotDirectives(poseStyle);
  return directives[safeIndex - 1];
}

export function buildSeparatePoseStoryboardPlan(poseStyle?: PoseSeriesStyle) {
  const directives = getSeparatePoseSlotDirectives(poseStyle);
  return [
    "生产线四槽计划：",
    ...directives.map((directive, index) => `${index + 1}. ${directive}`),
    "全组差异校验：至少两张为完整服装展示，至少一张在景别或姿态高度上明显不同（半身、中近景、坐姿、蹲姿、倚靠或侧后背面展示任选其一）；不要把四张都做成同一距离的正面站姿。",
  ].join("\n");
}

export function buildSeparatePosePrompt(prompt: string, poseIndex: number) {
  const explicitPosePattern = new RegExp(`^\\s*姿势\\s*${poseIndex}[：:]`, "m");
  const poseStyle = inferPoseStyleFromPrompt(prompt);
  const explicitPoseLines = extractExplicitPoseLines(prompt);
  const hasExplicitPoseLine = explicitPosePattern.test(prompt);
  const currentPoseLine = explicitPoseLines.find((line) => explicitPosePattern.test(line));
  const slotDirective = buildSeparatePoseSlotDirective(poseIndex, poseStyle);
  const scopedPrompt = scopeSeparatePosePrompt(prompt, poseIndex);

  return [
    buildSeparatePosePriorityDirective(poseIndex),
    hasExplicitPoseLine
      ? [
          `当前姿势硬目标：${currentPoseLine}`,
          poseStyle === "user_custom" ? "" : `动作强化解释：${slotDirective}`,
        ].filter(Boolean).join("\n")
      : `当前姿势硬目标：${slotDirective}`,
    scopedPrompt,
    `本次单图任务：只生成姿势${poseIndex}这一张完整图片。`,
    "动作必须真正落地到画面：身体角度、手臂位置、重心、视线或步态至少有三项按当前姿势变化；不要把图1原动作轻微重绘。",
    "只保持图1人物身份、服装、场景、光线、肤色、身体比例和摄影质感一致。",
    "不要生成四宫格、拼图、分屏、边框、编号文字或 contact sheet。",
  ].filter(Boolean).join("\n");
}

function buildSeparatePosePriorityDirective(poseIndex: number) {
  const safeIndex = Math.min(Math.max(Math.floor(Number(poseIndex) || 1), 1), 4);
  return [
    `HARD TARGET POSE SLOT ${safeIndex}/4.`,
    `Generate exactly ONE standalone 3:4 photo for pose ${safeIndex}.`,
    "This API call has no memory of the other three calls; execute only this pose slot, not a group plan.",
    "Do NOT generate a 2x2 grid, collage, contact sheet, split-screen, border, label, or all four poses in one image.",
    "Change the pose from the source image while keeping the same person identity, outfit, scene, lighting, skin tone, camera quality, and realistic body proportions.",
  ].join("\n");
}

function scopeSeparatePosePrompt(prompt: string, poseIndex: number) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const poseMatch = line.match(/^姿势\s*([1-4])[：:]/);
      if (poseMatch) return Number(poseMatch[1]) === poseIndex;
      return !/(本组四张|生产线四槽计划|用户自定义四槽计划|全组差异校验|其它槽位|其他槽位|同组四张|四张独立图|四张独立图片|每次单图任务)/.test(line);
    })
    .join("\n")
    .trim();
}

function extractExplicitPoseLines(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^姿势\s*[1-4][：:]/.test(line));
}

function inferPoseStyleFromPrompt(prompt: string): PoseSeriesStyle | undefined {
  const markerMatch = prompt.match(/姿势裂变拍摄风格档位：([^。\n]+)/);
  if (!markerMatch) return undefined;
  const label = markerMatch[1].trim();
  return POSE_SERIES_STYLES.find((style) => label.includes(style.label))?.value;
}

function getSeparatePoseSlotDirectives(poseStyle?: PoseSeriesStyle) {
  switch (poseStyle) {
    case "luxury_white_studio":
    case "ecommerce_clean":
      return [
        "槽位1方向：正面或三分之二正面商品展示，完整全身或七分身，重心轻微偏移，一只手自然插兜、扶包带或轻触衣摆；目标是看清服装正面版型，不能复刻图1原动作。",
        "槽位2方向：侧面结构展示，身体侧转 30-45 度，肩线和胯部角度与槽位1明显不同，一只手整理袖口、衣领或下摆；突出侧面轮廓、腰线、裤脚/裙摆和面料垂坠。",
        "槽位3方向：动态迈步商品展示，全身走动或转身中，脚步跨度、手臂摆动和视线方向与前两张明显不同；保持白底/浅底干净，展示行走时的真实褶皱。",
        "槽位4方向：背面、侧后 45 度回眸，或适合商品详情的半身/中近景；手部动作与前三张不同，可整理下摆、扶腰或自然垂放；展示背部结构、后腰线、肩背轮廓或上衣细节，仍保持商品图清晰度。",
      ];
    case "luxury_lookbook":
      return [
        "槽位1方向：克制高级的三分之二正面站姿，完整展示服装轮廓，重心自然偏移，手部轻触衣摆、包带或口袋；留白优雅，但不能复刻图1原动作。",
        "槽位2方向：柔和侧转 30 度，肩颈放松，一只手整理头发、领口或袖口；视线可看向镜头外，展示服装侧面线条和面料垂感。",
        "槽位3方向：自然慢步、轻微转身或风格化行走，动作有呼吸感，脚步和手臂节奏与前两张明显不同；像同一套 lookbook 里的动态成片。",
        "槽位4方向：坐姿、倚靠、侧后身或回眸任选更适合图1的一种，姿态安静、有品牌大片感；景别可略近于前三张，展示衣服垂坠、袖口、领口或背面轮廓，表情克制。",
      ];
    case "fashion_editorial":
      return [
        "槽位1方向：有张力的正面或三分之二正面，肩线更明确，一只手扶腰、扶包或制造利落线条；不要复刻图1原动作，服装结构必须清楚。",
        "槽位2方向：更强的侧转、斜向构图或身体扭转，手臂动作拉开空间，可整理发丝、领口或外套；突出轮廓和镜头表现力。",
        "槽位3方向：动态迈步、转身中或重心强切换，身体曲线和手臂轮廓与前两张不同；保留服装结构但增加 editorial 张力。",
        "槽位4方向：低姿态、坐姿、倚靠、侧后回眸或低头看向一侧任选其一；姿势有大片感但关节自然，景别或动作高度必须与前三张明显不同，服装仍清楚可读。",
      ];
    case "korean_clean":
      return [
        "槽位1方向：清透自然的正面轻站姿，完整展示服装正面，重心微偏，手部轻触衣摆、包带或自然下垂；温柔克制，不能复刻图1原动作。",
        "槽位2方向：柔和侧转，肩颈放松，一只手轻整理头发、袖口或衣领；表情自然清爽，视线方向与槽位1不同，展示侧面线条。",
        "槽位3方向：轻微走动、小步转身或自然迈步，动作轻盈，脚步和手臂位置与前两张明显不同；保持自然光感和真实肤色。",
        "槽位4方向：坐姿、蹲坐、倚靠、侧后身或轻回眸任选适合图1的一种，姿态干净安静；景别可略近，展示上衣领口、袖口、下摆或背面/侧后轮廓，不要网红夸张摆拍。",
      ];
    case "xiaohongshu_lifestyle":
      return [
        "槽位1方向：真实生活方式站姿，重心随意，一只手拿包、手机、帽子或轻触衣摆；像随手拍但完整展示服装，不能复刻图1原动作。",
        "槽位2方向：身体侧转看向镜头外，可整理头发、扶帽檐或调整包带；动作轻松，手臂和视线与槽位1不同，像种草照片组里的第二张。",
        "槽位3方向：自然走动、转身、轻微互动感或街拍步态，脚步和手臂与前两张明显不同；保留真实环境和服装可购买清晰度。",
        "槽位4方向：坐姿、蹲坐、倚靠、侧后回眸、低头看衣服细节或自然转身任选其一；氛围生活化，景别或动作高度必须与前三张明显不同，动作不能像棚拍模板。",
      ];
    case "euro_campaign":
      return [
        "槽位1方向：自信挺拔的正面或三分之二正面，肩线打开，一只手扶腰、插兜或拿包；气场明确但不能复刻图1原动作。",
        "槽位2方向：强侧转 35-50 度，身体线条更有力量，手臂动作制造几何轮廓；展示侧面比例和服装结构。",
        "槽位3方向：大步迈出、转身中或重心强切换，动作更有 campaign 张力；手臂和脚步与前两张明显不同。",
        "槽位4方向：侧后身、回眸、倚靠、坐姿或更强姿态的背面展示任选其一；动作高度或景别必须与前三张拉开，保持品牌广告感，同时服装细节和人物身份稳定。",
      ];
    case "source_continuity":
    default:
      return [
        "槽位1方向：沿用原图摄影氛围的正面或轻微三分之二正面，完整展示服装正面版型，重心转移到一侧，一只手自然插兜、扶包带或轻触衣摆，另一只手放松；不能复刻图1原动作。",
        "槽位2方向：沿用原图氛围但身体明显侧转 25-45 度，肩线和胯部角度与槽位1不同，一只手整理头发、衣领、帽檐或袖口，视线可看向镜头外；展示侧面轮廓和面料垂坠。",
        "槽位3方向：沿用原图场景中的轻微迈步、动态行走或自然转身，双脚站位和手臂摆放与前两张不同，可自然提包、扶腰或让手臂随步态摆动；展示衣服运动中的褶皱和真实重量。",
        "槽位4方向：沿用原图氛围做坐姿、蹲坐、倚靠、侧后身、回眸或更明显的身体转向任选其一；动作高度、景别或视线必须与前三张明显不同，可扶腰、整理下摆或自然垂放；展示背面/侧后轮廓或局部细节，同时保持脸部身份可识别。",
      ];
  }
}

function removeGridLayoutWording(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/不要生成四宫格|不要生成.*拼图|不要生成.*contact sheet/i.test(line)) return true;
      return !/(四宫格|2x2|four-panel|4-panel|contact sheet|分格|分屏|拼图|pose sheet)/i.test(line);
    })
    .join("\n")
    .trim();
}

function normalizeSeparatePromptScope(prompt: string) {
  return prompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      if (/^姿势\s*[1-4][：:]/.test(line)) return true;
      return !/(单图裂变规则|单张生产线分镜|本组四张|生产线四槽计划|用户自定义四槽计划|全组差异校验|其它槽位|其他槽位|同组四张|四张独立图|四张独立图片)/.test(line);
    })
    .map((line) => /^姿势\s*[1-4][：:]/.test(line) ? line : toSinglePoseRule(line))
    .join("\n")
    .trim();
}

function toSinglePoseRule(rule: string) {
  return rule
    .replace(/同组四张独立图片都必须/g, "当前单张图片必须")
    .replace(/同组四张独立图片/g, "当前单张图片")
    .replace(/四张独立图中的姿势/g, "当前姿势")
    .replace(/四张独立图片/g, "当前单张图片")
    .replace(/四张独立图/g, "当前单张图片")
    .replace(/四个分格必须/g, "当前单张图片必须")
    .replace(/四个分格/g, "当前单张图片")
    .replace(/四个姿势都要/g, "当前单张图片必须")
    .replace(/四个姿势/g, "当前姿势")
    .replace(/四格/g, "当前单张图片")
    .replace(/每格/g, "当前单张图片")
    .replace(/同一套商业时装大片的连续 pose sheet，而不是四张不同照片拼贴/g, "图1延展出来的同一套商业时装大片画面")
    .replace(/同一套商业时装大片的连续姿势系列，而不是四张风格割裂的照片/g, "图1延展出来的同一套商业时装大片画面")
    .replace(/同组独立图/g, "当前单张图片")
    .replace(/四宫格/g, "单图");
}
