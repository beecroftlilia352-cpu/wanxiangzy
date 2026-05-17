import { getPoseSeriesStylePoseLines, type PoseSeriesStyle } from "@/lib/module-style-presets";

export type PoseOutputMode = "grid" | "separate";

export const POSE_QUALITY =
  "photorealistic, commercial fashion photography, sharp face and fabric details, natural skin texture";

export const POSE_LAYOUT_REQUIREMENT =
  "输出方式：生成单张 2x2 四宫格，每格一个姿势；不要拆成多张图。";

export const POSE_SEPARATE_LAYOUT_REQUIREMENT =
  "输出方式：每个姿势单独一张图；当前请求只生成指定姿势，不要四宫格、拼图或分屏。";

export const POSE_SEPARATE_VARIATION_REQUIREMENT =
  "单图裂变规则：每张独立图必须有清晰不同的身体角度、手臂动作、重心、视线或步态；保留图1身份、服装、场景和光影，但不要复制图1原动作，也不要让同组多张看起来只是同一姿势的轻微重绘。";

export const POSE_SEPARATE_STORYBOARD_REQUIREMENT =
  "单张生产线分镜：同组四张独立图必须像同一套商业时装分镜；每张先执行自己的槽位，并在身体角度、动作高度、手部动作、视线、表情或景别上与其它槽位拉开差异。禁止四张都正面静站、同一手势、同一视线或同一全身构图。";

export const POSE_CONSISTENCY_REQUIREMENT =
  "一致性：保持图1同一人物、脸、肤色、发型、身体比例、服装、场景、光线和摄影质感。";

export const POSE_SOURCE_ROLE_REQUIREMENT =
  "图1角色：唯一的人物、服装、比例、场景和光线参考；文字只改变姿势、可选镜头和构图。";

export const POSE_PROPORTION_LOCK_RULE =
  "比例锁定：保持图1头身比、头部大小、肩宽、腰胯、四肢长度、脚部大小、腰线和服装穿着尺度；不要拉高拉瘦、长腿化或变体型。";

export const POSE_SERIES_RULE =
  "系列感：像同一套商业时装片的连续姿势系列，风格统一但动作有变化。";

export const POSE_CLOTHING_RULE =
  "服装：保留版型、颜色、图案、材质、腰线、肩线、袖长、下摆和搭配关系；只允许自然褶皱变化。";

export const POSE_BODY_RULE =
  "动作：自然可信，符合真人关节；避免断手、错位手指、肢体拉长、比例漂移和过度瘦身。";

export const POSE_SKIN_COLOR_RULE =
  "肤色：保留图1自然肤色、明暗、冷暖和真实皮肤质感；不要美白、冷白、过曝或粉白滤镜。";

export const POSE_FACE_SHAPE_RULE =
  "脸：保留图1脸型骨相、五官比例和辨识度；不要网红脸、小V脸、尖下巴或过度美颜。";

export const POSE_CREATIVE_VARIATION_RULE =
  "姿势：未逐条指定时，由 AI 按风格自由设计自然、不同、适合展示服装的姿势；不要套模板。";

export const POSE_EXPRESSION_VARIATION_REQUIREMENT =
  "表情：保持同一张脸，允许 AI 按姿势和风格自由发挥自然表情变化；不要夸张或换脸。";

export const POSE_EXPRESSION_CONSISTENT_REQUIREMENT =
  "表情：尽量保持一致，只允许轻微自然差异；不要夸张或换脸。";

const NEGATIVE_POSE_REQUIREMENT =
  "负面：不要换脸、换衣服、改场景、改服装结构、多余人物、肢体畸形、比例漂移、过度美颜、AI感、文字水印。";

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

  if (!/图像角色硬规则/.test(nextPrompt)) {
    nextPrompt = `${POSE_SOURCE_ROLE_REQUIREMENT}\n${nextPrompt}`;
  }

  if (options.outputMode === "separate") {
    nextPrompt = removeGridLayoutWording(nextPrompt);
    if (!/每个姿势单独生成一张完整图片|不要生成四宫格/.test(nextPrompt)) {
      nextPrompt = `${POSE_SEPARATE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
    }
    if (!nextPrompt.includes("单图裂变规则：")) {
      nextPrompt = `${nextPrompt}\n${POSE_SEPARATE_VARIATION_REQUIREMENT}`;
    }
    if (!nextPrompt.includes("单张生产线分镜：")) {
      nextPrompt = `${nextPrompt}\n${POSE_SEPARATE_STORYBOARD_REQUIREMENT}`;
    }
  } else if (!/(四宫格|2x2|four-panel|4-panel|contact sheet)/i.test(nextPrompt)) {
    nextPrompt = `${POSE_LAYOUT_REQUIREMENT}\n${nextPrompt}`;
  }

  if (!/same face identity|同一张脸|人物身份/.test(nextPrompt)) {
    const consistencyRule = options.outputMode === "separate"
      ? toSeparateOutputRule(POSE_CONSISTENCY_REQUIREMENT)
      : POSE_CONSISTENCY_REQUIREMENT;
    nextPrompt = `${consistencyRule}\n${nextPrompt}`;
  }

  const requiredRules = [
    ["系列感：", POSE_SERIES_RULE],
    ["服装：", POSE_CLOTHING_RULE],
    ["比例锁定：", POSE_PROPORTION_LOCK_RULE],
    ["动作：", POSE_BODY_RULE],
    ["肤色：", POSE_SKIN_COLOR_RULE],
    ["脸：", POSE_FACE_SHAPE_RULE],
  ] as const;
  requiredRules.forEach(([marker, rule]) => {
    if (!nextPrompt.includes(marker)) {
      const nextRule = options.outputMode === "separate" ? toSeparateOutputRule(rule) : rule;
      nextPrompt = `${nextPrompt}\n${nextRule}`;
    }
  });

  nextPrompt = nextPrompt
    .split("\n")
    .filter((line) => !/表情控制|表情：|表情-|expression variation|facial expression/i.test(line))
    .join("\n")
    .trim();
  const expressionRule = options.varyExpression === false
    ? POSE_EXPRESSION_CONSISTENT_REQUIREMENT
    : POSE_EXPRESSION_VARIATION_REQUIREMENT;
  nextPrompt = `${nextPrompt}\n${options.outputMode === "separate" ? toSeparateOutputRule(expressionRule) : expressionRule}`;

  const poseLines = getPoseSeriesStylePoseLines(options.poseStyle);
  const requiredPoseLines = options.poseStyle === "user_custom" ? [] : poseLines;
  requiredPoseLines.forEach((line, index) => {
    const poseNumber = index + 1;
    if (!new RegExp(`姿势\\s*${poseNumber}`).test(nextPrompt)) {
      nextPrompt = `${nextPrompt}\n${line}`;
    }
  });
  if (options.poseStyle !== "user_custom" && !/AI姿势创作规则/.test(nextPrompt)) {
    const creativeRule = options.outputMode === "separate"
      ? toSeparateOutputRule(POSE_CREATIVE_VARIATION_RULE)
      : POSE_CREATIVE_VARIATION_RULE;
    nextPrompt = `${nextPrompt}\n${creativeRule}`;
  }

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

function toSeparateOutputRule(rule: string) {
  return rule
    .replace(/四个分格/g, "同组四张独立图片")
    .replace(/四个姿势/g, "四张独立图中的姿势")
    .replace(/同一套商业时装大片的连续 pose sheet，而不是四张不同照片拼贴/g, "同一套商业时装大片的连续姿势系列，而不是四张风格割裂的照片")
    .replace(/每格/g, "每张图")
    .replace(/四格/g, "四张图")
    .replace(/四宫格/g, "同组独立图");
}
