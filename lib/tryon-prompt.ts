export const TRYON_QUALITY =
  "photorealistic raw camera photo, natural fashion editorial quality, realistic skin texture, true fabric texture, believable light and shadow, unforced natural expression, non-synthetic real-person appearance";

export type TryOnGarmentAudience = "women" | "men";
export type TryOnAgeGroup = "adult" | "teen" | "big_child" | "middle_child" | "small_child" | "toddler";
export type TryOnGarmentCategory = "regular" | "intimate";

export const TRYON_GARMENT_AUDIENCE_LABELS: Record<TryOnGarmentAudience, string> = {
  women: "女装",
  men: "男装",
};

export const TRYON_AGE_GROUP_LABELS: Record<TryOnAgeGroup, string> = {
  adult: "成人",
  teen: "青少年",
  big_child: "大童",
  middle_child: "中童",
  small_child: "小童",
  toddler: "幼童",
};

export const TRYON_GARMENT_CATEGORY_LABELS: Record<TryOnGarmentCategory, string> = {
  regular: "常规服装",
  intimate: "内衣/泳衣类",
};

const TRYON_GARMENT_AUDIENCES: TryOnGarmentAudience[] = ["women", "men"];
const TRYON_AGE_GROUPS: TryOnAgeGroup[] = ["adult", "teen", "big_child", "middle_child", "small_child", "toddler"];
const TRYON_GARMENT_CATEGORIES: TryOnGarmentCategory[] = ["regular", "intimate"];
const CHILD_AGE_GROUPS: TryOnAgeGroup[] = ["big_child", "middle_child", "small_child", "toddler"];

export const TRYON_CLOTHING_IMAGE_ROLE_RULE =
  "服装图角色隔离规则：所有标记为服装图的输入图只提供服装本身信息，即使图里有真人、模特、人台、脸、身体、姿势、背景、房间、户外环境、光线或构图，也一律不得作为人物身份、姿势、背景、场景、镜头距离或构图参考；只提取目标衣服的品类、版型、颜色、图案/logo、面料、纹理、长短、领口、袖口、下摆、口袋、纽扣/拉链、缝线和穿着层次。最终人物、姿势、背景和构图只来自参考图、模特脸图、用户选择或系统默认，不得复制服装图里的穿衣人和拍摄环境。";

export const TRYON_GARMENT_RULE =
  "服装还原规则：必须忠实还原服装图中的品类、版型、肩线、领口、袖长、腰线、下摆、开合位置、颜色、面料、纹理、图案、印花、刺绣、纽扣、拉链、口袋、缝线和所有可见细节；不要凭空新增配饰、图案、logo 或改变服装长度和结构。";

export const TRYON_FIT_RULE =
  "人体贴合规则：服装需要像真实拍摄中自然穿在人身上一样贴合身体，允许根据姿势产生真实褶皱、拉伸、遮挡、压痕、垂坠和边缘轮廓变化；优先保证服装真实贴合与结构还原，不要让服装像贴纸、平铺图或漂浮在身体外。";

export const TRYON_MATERIAL_RULE =
  "材质重量规则：根据服装图判断面料厚度、硬挺或柔软程度、弹性、垂坠重量、透明度、光泽和织物纹理；生成时必须让布料褶皱、边缘厚度、阴影和反光符合真实材质，不要把厚面料变薄、软面料变硬或把哑光面料变成亮面。";

export const TRYON_SKIN_TONE_RULE =
  "肤色规则：有参考人物时，以参考人物身体可见皮肤为最终肤色和光影基准，脸、颈部、胸口、手臂、手部的冷暖调、明暗、反光和阴影必须连续；无参考人物时才使用模特脸图的自然肤色范围。不要自动美白、不要雪白皮、不要冷白皮、不要过度提亮肤色，不要把亚洲肤色统一变成瓷白。";

export const TRYON_BODY_PROPORTION_RULE =
  "体态比例规则：人物身体比例、头身比、肩颈宽度、躯干长度、腰胯比例、四肢长度和脚下接触点必须真实稳定；有全身参考图时，身体骨架、站姿尺度、镜头距离和人物占画面比例优先参考全身参考图；不要大头小身、短腿、玩偶感、Q版比例、过度瘦身、窄肩、夸张小腰或改变身体骨架。";

export const TRYON_COLOR_RULE =
  "色彩管理规则：保持准确白平衡和真实曝光，保留服装原始颜色、肤色层次和场景光色；不要把画面统一调成过曝白亮、粉白滤镜或冷白皮风格。";

export const TRYON_PHOTOGRAPHY_RULE =
  "商业摄影规则：画面必须像真实相机拍摄的服装图片，肤色自然、毛孔和轻微瑕疵可见、表情不过度营业、布料纹理和背景材质真实、光影方向可信、景深和焦点自然；允许真实照片里的轻微不完美和非对称感。不要生成过干净棚拍、素材库假笑、AI精修脸、蜡像、塑料皮肤或过度磨皮。";

export const TRYON_REFERENCE_RULE =
  "参考图规则：优先保持参考图中的人物姿势、身体角度、四肢位置、头部朝向、手部动作、背景、构图、镜头角度、光影方向和人物位置；但允许为了服装真实贴合人体而产生自然褶皱、遮挡关系和边缘轮廓调整。";

export function buildTryOnReferencePrompt(referenceImageNumber?: number) {
  const referenceRef = `图${referenceImageNumber || 2}`;
  return `参考图规则：${referenceRef}是最终画面的主参考图和画面骨架，必须保持${referenceRef}中的可见身体范围、裁切边界、人物姿势、身体角度、可见四肢位置、背景、构图、镜头角度、光影方向、人物位置和镜头距离；如果${referenceRef}是上半身、下半身、腿部、无头局部或特写图，最终也必须保持同类裁切和可见范围，不要自动拉远成全身图，不要补出参考图没有出现的头、脸、完整躯干、腿或脚。只允许为了服装真实贴合人体产生自然褶皱、遮挡关系和边缘轮廓调整。`;
}

export const TRYON_FACE_RULE =
  "模特脸规则：模特脸图是最终脸部身份锚点，提供可识别身份、完整五官结构、五官大小比例、脸型轮廓和五官相对位置；不提供肤色、妆容、表情、身体比例、年龄身高、头部大小、肩宽、四肢长度、服装、姿势、背景、构图或场景光线。有参考人物时，必须把参考图的表情、肤色、妆容和光影迁移到模特脸身份上，而不是保留参考图原脸；最终脸必须仍然一眼像模特脸图本人。不要复制模特脸图的笑容、雪白肤色或妆容，不要保留参考图原脸身份，不要证件照式换脸、大头、长脖子、肤色断层、不同图层光影、过度磨皮、小V脸、假笑模板脸或过度对称的AI脸。";

type TryOnPromptContext = {
  garmentAudience?: TryOnGarmentAudience;
  ageGroup?: TryOnAgeGroup;
  garmentCategory?: TryOnGarmentCategory;
  hasReference?: boolean;
  hasModelFace?: boolean;
  referenceImageNumber?: number;
  modelFaceImageNumber?: number;
};

export function normalizeTryOnGarmentAudience(value: unknown): TryOnGarmentAudience {
  return typeof value === "string" && TRYON_GARMENT_AUDIENCES.includes(value as TryOnGarmentAudience)
    ? value as TryOnGarmentAudience
    : "women";
}

export function normalizeTryOnAgeGroup(value: unknown): TryOnAgeGroup {
  return typeof value === "string" && TRYON_AGE_GROUPS.includes(value as TryOnAgeGroup)
    ? value as TryOnAgeGroup
    : "adult";
}

export function normalizeTryOnGarmentCategory(value: unknown): TryOnGarmentCategory {
  return typeof value === "string" && TRYON_GARMENT_CATEGORIES.includes(value as TryOnGarmentCategory)
    ? value as TryOnGarmentCategory
    : "regular";
}

export function buildTryOnAudiencePrompt(params: {
  garmentAudience?: TryOnGarmentAudience;
  ageGroup?: TryOnAgeGroup;
}) {
  const audience = normalizeTryOnGarmentAudience(params.garmentAudience);
  const ageGroup = normalizeTryOnAgeGroup(params.ageGroup);

  const ageLabel = TRYON_AGE_GROUP_LABELS[ageGroup];
  const audienceLabel = TRYON_GARMENT_AUDIENCE_LABELS[audience];
  const genderLabel = audience === "women" ? "女性" : "男性";
  const childGenderText = audience === "women" ? "女童" : "男童";

  if (CHILD_AGE_GROUPS.includes(ageGroup)) {
    return `服装适用人群规则：用户选择${audienceLabel}，年龄段为${ageLabel}，当前按真实${ageLabel}${childGenderText}服装上身处理；性别线、年龄感和身体比例以该选择为准，不再自动切换为成人或其他年龄段。`;
  }

  if (ageGroup === "teen") {
    return `服装适用人群规则：用户选择${audienceLabel}，年龄段为青少年，当前按真实青少年${genderLabel}服装上身处理；性别线、年龄感和身体比例以该选择为准，不再自动切换为成人或儿童。`;
  }

  return `服装适用人群规则：用户选择${audienceLabel}，年龄段为成人，当前按真实成人${genderLabel}商业模特服装上身处理；性别线、年龄感和身体比例以该选择为准，不再自动切换为儿童或青少年。`;
}

export function buildTryOnGarmentCategoryPrompt(params: {
  garmentCategory?: TryOnGarmentCategory;
  ageGroup?: TryOnAgeGroup;
}) {
  const category = normalizeTryOnGarmentCategory(params.garmentCategory);
  if (category !== "intimate") return "";

  return "敏感服装安全规则：用户声明服装为贴身/泳装类商品，按成人商业服装目录照或泳装 lookbook 处理；只展示服装版型、面料、剪裁、颜色和真实穿着贴合，不生成裸露生殖器、乳头、透明走光、性行为、挑逗姿势、床上/情色场景、未成年人或未成年人外观；画面保持中性、专业、非色情。";
}

export function buildTryOnBodyProportionPrompt(params: TryOnPromptContext = {}) {
  const audience = normalizeTryOnGarmentAudience(params.garmentAudience);
  const ageGroup = normalizeTryOnAgeGroup(params.ageGroup);
  const ageLabel = TRYON_AGE_GROUP_LABELS[ageGroup];
  const audienceLabel = TRYON_GARMENT_AUDIENCE_LABELS[audience];
  const genderLabel = audience === "women" ? "女性" : "男性";
  const childGenderText = audience === "women" ? "女童" : "男童";

  if (CHILD_AGE_GROUPS.includes(ageGroup)) {
    return `体态比例规则：当前为${ageLabel}${childGenderText}，使用真实儿童比例和自然站姿；头身比、手脚大小、肩颈宽度、躯干长度、腿长、表情和脚下接触点都要符合${ageLabel}年龄段。不要成人化、性感化、浓妆化、成熟挑逗姿势、网红成人脸、Q版比例、玩偶比例、大头小身或短腿。`;
  }

  if (ageGroup === "teen") {
    return `体态比例规则：当前为青少年${genderLabel}，使用真实青少年商业模特比例和健康自然姿态；头部大小、肩颈、腰胯、四肢长度、头身比、站姿尺度和脚下接触点必须稳定自然。不要成人化、性感化、浓妆化、成熟挑逗姿势、玩偶比例、Q版比例、大头小身或过度拉腿。`;
  }

  return `体态比例规则：当前为成人${audienceLabel}，使用真实成人${genderLabel}商业模特比例；人物肩颈、腰胯、躯干、四肢长度、头身比、脚下接触点和参考图中的站姿尺度必须稳定自然。不要把成人${audienceLabel}无依据幼龄化，不要大头小身、短腿、玩偶比例、过度拉长腿、过度瘦身、窄肩或夸张小腰。`;
}

export function buildTryOnFacePrompt(params: TryOnPromptContext = {}) {
  const audience = normalizeTryOnGarmentAudience(params.garmentAudience);
  const ageGroup = normalizeTryOnAgeGroup(params.ageGroup);
  const ageLabel = TRYON_AGE_GROUP_LABELS[ageGroup];
  const genderLabel = audience === "women" ? "女性" : "男性";
  const childGenderText = audience === "women" ? "女童" : "男童";
  const targetIdentity = CHILD_AGE_GROUPS.includes(ageGroup)
    ? `${ageLabel}${childGenderText}`
    : ageGroup === "teen"
      ? `青少年${genderLabel}`
      : `成人${genderLabel}`;
  const faceRef = params.modelFaceImageNumber ? `图${params.modelFaceImageNumber}模特脸图` : "模特脸图";
  const referenceRef = params.referenceImageNumber ? `图${params.referenceImageNumber}参考图` : "参考图";

  if (params.hasReference) {
    return `模特脸规则（身份迁移）：${faceRef}是最终脸部身份锚点，控制可识别身份、脸型轮廓、眼睛形状和间距、眉形、鼻梁/鼻尖/鼻翼结构、嘴部固有形状、五官大小比例和整体相似度；${referenceRef}只作为表情、肤色、妆容、头部姿态、头部大小、光影和皮肤连续性的驱动图。必须把${referenceRef}的表情/肤色/妆容迁移到${faceRef}身份上，而不是为了保留表情而保留${referenceRef}原脸。${referenceRef}原来的眼睛、鼻子、嘴巴和脸型不能保留为最终身份特征，但${referenceRef}的表情运动状态必须保留：嘴巴开合、嘴角方向、笑/不笑强度、眼睛睁合、眉毛紧张度、视线、下颌放松程度和整体情绪都以${referenceRef}为准。最终脸必须一眼看出来自${faceRef}本人；如果不像${faceRef}，即使服装、姿势或表情正确也算失败。表情处理方式是让${faceRef}这个人做出${referenceRef}的表情：${referenceRef}冷脸闭嘴时，最终是${faceRef}身份的冷脸闭嘴；${referenceRef}微笑时，最终是${faceRef}身份按${referenceRef}强度微笑。肤色处理采用参考图原则：按${referenceRef}的肤色、妆容和场景光线重新打光，使脸、颈部、胸口、手臂、手部等可见皮肤像同一张照片里连续拍摄，保留毛孔、轻微瑕疵、局部红润、真实阴影和自然不对称。${faceRef}只在身份/相似度/五官结构上优先，${referenceRef}在表情/肤色/妆容/姿态/比例/光影上优先；不要证件照式正脸、贴上去的头、面具边缘、不同图层光影、头过大/过小、长脖子、肤色断层、过度磨皮、小V脸、雪白皮、假笑模板脸、复制${faceRef}笑容、复制${faceRef}肤色、复制${faceRef}妆容、保留${referenceRef}原脸身份或生成弱相似度的通用网红脸。最终年龄感必须与${targetIdentity}身体自然匹配。`;
  }

  return `模特脸规则：${faceRef}是唯一脸部身份参考，最终人物脸部身份必须使用该图的五官、五官大小比例、脸型倾向和身份气质；${faceRef}不提供身体比例、服装、姿势、背景、构图、固定表情、固定肤色或固定妆容。最终头部大小、脖颈长度、肩颈连接、身体肤色和光影要和生成身体统一，年龄感必须与${targetIdentity}身体自然匹配；表情保持自然克制，不要复制夸张假笑。不要把服装图或参考图中的脸误当成最终身份，不要自动改成标准鹅蛋脸、小V脸、雪白皮、假笑模板脸、素材库笑脸或过度对称的AI脸。`;
}

export function buildTryOnNegativePrompt(params: TryOnPromptContext = {}) {
  const audience = normalizeTryOnGarmentAudience(params.garmentAudience);
  const ageGroup = normalizeTryOnAgeGroup(params.ageGroup);
  const audienceLabel = TRYON_GARMENT_AUDIENCE_LABELS[audience];
  const garmentCategory = normalizeTryOnGarmentCategory(params.garmentCategory);
  const intimateNegative = garmentCategory === "intimate"
    ? "；不要裸露生殖器、乳头、透明走光、性行为、挑逗姿势、床上/情色场景、未成年人或未成年人外观"
    : "";
  const base = "负面约束：不要生成多余人物，不要扭曲身体和服装，不要改变服装结构，不要保留错误的参考图原脸，不要硬贴脸，不要面具边缘，不要肤色断层，不要自动美白，不要雪白皮或冷白皮，不要塑料皮肤，不要蜡像感，不要卡通感，不要AI渲染感，不要素材库假笑，不要过干净灰底棚拍，不要过度对称AI脸，不要文字水印";

  if (CHILD_AGE_GROUPS.includes(ageGroup)) {
    return `${base}；不要成人化、性感化、浓妆化、成熟挑逗姿势、网红成人脸、Q版比例、玩偶比例、大头小身或短腿${intimateNegative}。`;
  }

  if (ageGroup === "teen") {
    return `${base}；不要成人化、性感化、浓妆化、成熟挑逗姿势、玩偶比例、Q版比例、大头小身或过度拉腿${intimateNegative}。`;
  }

  return `${base}；不要把成人${audienceLabel}无依据幼龄化，不要大头小身、短腿、玩偶比例、过度拉长腿或过度瘦身${intimateNegative}。`;
}

export function applyTryOnAudiencePrompt(
  prompt: string,
  params: { garmentAudience?: TryOnGarmentAudience; ageGroup?: TryOnAgeGroup }
) {
  return replaceOrInsertRuleLine(
    prompt,
    "服装适用人群规则",
    buildTryOnAudiencePrompt(params)
  );
}

export function applyTryOnGarmentCategoryPrompt(
  prompt: string,
  params: { garmentCategory?: TryOnGarmentCategory; ageGroup?: TryOnAgeGroup }
) {
  const rule = buildTryOnGarmentCategoryPrompt(params);
  if (!rule) return prompt;

  return replaceOrInsertRuleLine(
    prompt,
    "敏感服装安全规则",
    rule,
    2
  );
}

export function buildTryOnFramePrompt(params: {
  aspectRatio?: string;
  hasReference?: boolean;
  referenceImageNumber?: number;
}) {
  const aspectText = params.aspectRatio && params.aspectRatio !== "auto"
    ? `${params.aspectRatio} 画幅`
    : "用户选择的画幅比例";
  const referenceRef = `图${params.referenceImageNumber || 2}`;
  const referenceRule = params.hasReference
    ? `必须保持${referenceRef}的人物占画面比例、镜头距离、上下留白、裁切边界和可见身体范围；如果${referenceRef}是全身图，不要裁成半身或特写；如果${referenceRef}是上半身、下半身、腿部、无头局部或特写图，不要自动拉远成全身图，也不要补出参考图没有出现的头、脸、完整躯干、腿或脚。`
    : "根据服装类型选择完整展示服装结构的构图，默认不要过近裁切。";

  return `画幅构图规则：最终输出必须严格保持${aspectText}。${referenceRule}不要改变参考图的主体尺度和裁切意图；参考图中可见且未与目标服装冲突的下装、鞋履、配饰、手部、背景和场景应自然保留。`;
}

export function applyTryOnFramePrompt(
  prompt: string,
  params: { aspectRatio?: string; hasReference?: boolean; referenceImageNumber?: number }
) {
  return replaceOrInsertRuleLine(
    prompt,
    "画幅构图规则",
    buildTryOnFramePrompt(params),
    3
  );
}

function replaceOrInsertRuleLine(
  prompt: string,
  marker: string,
  rule: string,
  insertIndex = Number.MAX_SAFE_INTEGER
) {
  const lines = prompt.trim().split("\n");
  const existingIndex = lines.findIndex((line) => line.includes(marker));
  if (existingIndex >= 0) {
    lines[existingIndex] = rule;
    return lines.join("\n").trim();
  }

  lines.splice(Math.min(insertIndex, lines.length), 0, rule);
  return lines.join("\n").trim();
}

export function enforceTryOnPromptRequirements(
  prompt: string,
  expectedRefs: string[] = [],
  context: TryOnPromptContext = {}
) {
  if (!prompt.trim()) return "";

  let nextPrompt = prompt
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(
      "只使用图1这件单件服装进行上身，不要额外生成套装、下装或不存在的搭配单品。",
      "只将图1这件单件服装应用到对应身体部位，不要额外生成图1以外的新服装；参考图中原本存在且不与图1冲突的下装、鞋履和配饰应自然保留，用于维持完整人物构图和真实穿搭关系。"
    )
    .trim();

  nextPrompt = applyTryOnAudiencePrompt(nextPrompt, context);
  nextPrompt = applyTryOnGarmentCategoryPrompt(nextPrompt, context);
  nextPrompt = replaceOrInsertRuleLine(nextPrompt, "体态比例规则", buildTryOnBodyProportionPrompt(context));

  const missingRefs = expectedRefs.filter((ref) => !nextPrompt.includes(ref));
  if (missingRefs.length) {
    nextPrompt = `必须保留并正确使用这些图号：${expectedRefs.join("、")}。${nextPrompt}`;
  }

  const requiredRules = [
    ["服装图角色隔离规则", TRYON_CLOTHING_IMAGE_ROLE_RULE],
    ["敏感服装安全规则", buildTryOnGarmentCategoryPrompt(context)],
    ["服装还原规则", TRYON_GARMENT_RULE],
    ["人体贴合规则", TRYON_FIT_RULE],
    ["材质重量规则", TRYON_MATERIAL_RULE],
    ["肤色规则", TRYON_SKIN_TONE_RULE],
    ["色彩管理规则", TRYON_COLOR_RULE],
    ["商业摄影规则", TRYON_PHOTOGRAPHY_RULE],
  ] as const;
  requiredRules.forEach(([marker, rule]) => {
    if (rule && !nextPrompt.includes(marker)) nextPrompt = `${nextPrompt}\n${rule}`;
  });

  if (context.hasModelFace ?? nextPrompt.includes("模特脸")) {
    nextPrompt = replaceOrInsertRuleLine(nextPrompt, "模特脸规则", buildTryOnFacePrompt(context));
  }

  const missingQuality = TRYON_QUALITY
    .split(", ")
    .filter((dimension) => !nextPrompt.includes(dimension));
  if (missingQuality.length) {
    nextPrompt = `${nextPrompt}\n图像质量：${TRYON_QUALITY}`;
  }

  if (!/负面约束|不要生成多余人物|No extra people/i.test(nextPrompt)) {
    nextPrompt = `${nextPrompt}\n${buildTryOnNegativePrompt(context)}`;
  } else {
    nextPrompt = replaceOrInsertRuleLine(nextPrompt, "负面约束", buildTryOnNegativePrompt(context));
  }

  return nextPrompt;
}
