export type Garment3dOutputMode = "reference" | "prompt";

export const GARMENT_3D_QUALITY =
  "photorealistic commercial e-commerce garment display, natural fabric texture, realistic wrinkles and folds, crisp stitching details, clean studio lighting, true-to-source color and material, no plastic render look";

export function buildGarment3dPrompt(params: {
  garmentType: string;
  outputMode: Garment3dOutputMode;
  hasReference: boolean;
  userPrompt?: string | null;
}) {
  const roles = params.hasReference
    ? "图像角色：图1是用户上传的服装图，图2是3D立体服装参考图。"
    : "图像角色：图1是用户上传的服装图。";
  const referenceLine = params.hasReference
    ? "参考图2只用于学习立体展示方式、空间角度、支撑姿态、衣身厚度、袖管体积、阴影结构和棚拍光影；图1控制最终服装的款式、品类、颜色、材质、图案、logo/文字和所有细节。若图1与图2冲突，以图1为准，不得复制图2的背景元素、颜色、图案、文字或具体款式。"
    : "根据图1和用户提示生成类似被隐形人台轻轻撑起的立体效果，默认三分之二正面轻微旋转，使用干净白色或浅灰棚拍背景。";
  const structureLine =
    "3D结构目标：生成无真人、无头、无脸、无手、无腿、无皮肤的立体服装商品展示；服装像被隐形支撑撑起，但不能显示真人、人台、衣架、身体轮廓或皮肤。";
  const preservationLine =
    "结构保真：严格保留图1服装的品类、版型、前片、后片、侧缝、肩线、领口、袖窿、袖长、袖口、腰头、裤裆、裤腿、裙摆、下摆、开衩、帽绳、口袋、纽扣、拉链、缝线、拼接、褶皱、标签、logo/文字、图案、材质、纹理、厚薄、透明度和光泽。";
  const volumeLine =
    "体积与支撑：根据图1判断真实布料厚度、衣身空腔、袖管体积、下摆开口、重力垂坠、边缘厚度、接触阴影和软硬程度；薄纱、针织、皮革、牛仔、羽绒、硬挺面料要呈现对应支撑感。";
  const angleLine =
    "角度约束：不要误生成多件、背面视角、平铺图、商品合集或改款设计，除非用户要求或图1本身明确是背面/侧面；正背侧结构必须连续，不能把前后片混乱拼接。";
  const backgroundLine =
    "背景使用干净白色或浅灰棚拍背景，主体居中，边缘干净，真实商业棚拍质感。";
  const userRequirement = params.userPrompt?.trim()
    ? `用户补充要求：${params.userPrompt.trim()}`
    : params.hasReference
      ? "用户补充要求：无，优先按照图2的立体展示方式、厚度、支撑形态、空间角度和棚拍光影生成，同时图1保持最高优先级。"
      : "用户要求：衣服变为类似穿在人身上的立体效果，微微向左旋转，保留原始版型、面料厚度、纹理和所有细节。";

  return [
    roles,
    `任务：将图1的${params.garmentType || "服装"}从平面图或人台图转换为3D立体服装展示图。`,
    structureLine,
    referenceLine,
    preservationLine,
    volumeLine,
    angleLine,
    backgroundLine,
    userRequirement,
    `图像质量：${GARMENT_3D_QUALITY}。`,
    "负面约束：不要生成真人身体、不要生成模特脸、不要头发、不要手脚、不要皮肤、不要人台、不要衣架、不要多件衣服、不要商品合集、不要改变衣服品类、不要改变主色、不要改变材质、不要扭曲文字和 logo、不要把平铺图原样输出、不要卡通、不要AI塑料渲染感。"
  ].join(" ");
}
