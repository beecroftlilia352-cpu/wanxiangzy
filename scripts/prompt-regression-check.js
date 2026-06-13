const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;

  const mod = { exports: {} };
  const localRequire = (id) => {
    if (id.startsWith("@/")) {
      return loadTsModule(`${id.slice(2)}.ts`);
    }
    throw new Error(`Unexpected runtime require "${id}" while loading ${relativePath}`);
  };

  moduleCache.set(filename, mod.exports);
  new Function("exports", "require", "module", "__filename", "__dirname", output)(
    mod.exports,
    localRequire,
    mod,
    filename,
    path.dirname(filename)
  );
  return mod.exports;
}

function assertIncludes(value, needle, label) {
  if (!value.includes(needle)) {
    throw new Error(`${label} 缺少：${needle}`);
  }
}

function assertNotIncludes(value, needle, label) {
  if (value.includes(needle)) {
    throw new Error(`${label} 不应包含：${needle}`);
  }
}

const tryon = loadTsModule("lib/tryon-prompt.ts");
const compiler = loadTsModule("lib/api/prompt-compiler.ts");
const lingya = loadTsModule("lib/api/lingya.ts");
const garmentDetails = loadTsModule("lib/garment-detail-references.ts");
const garmentAngles = loadTsModule("lib/garment-angle-references.ts");

const basePrompt = [
  "图像角色：图1是单件服装图，图2是参考图，图3是模特脸图。",
  "任务：将图1的单件服装穿在图2参考图中的人物身上，并将人物脸部替换为图3的模特脸。",
  tryon.TRYON_CLOTHING_IMAGE_ROLE_RULE,
  tryon.buildTryOnAudiencePrompt({ garmentAudience: "women", ageGroup: "adult" }),
  tryon.buildTryOnFramePrompt({ aspectRatio: "3:4", hasReference: true, referenceImageNumber: 2 }),
  tryon.TRYON_GARMENT_RULE,
  tryon.TRYON_FIT_RULE,
  tryon.TRYON_MATERIAL_RULE,
  tryon.TRYON_SKIN_TONE_RULE,
  tryon.buildTryOnBodyProportionPrompt({ garmentAudience: "women", ageGroup: "adult" }),
  tryon.TRYON_COLOR_RULE,
  tryon.TRYON_PHOTOGRAPHY_RULE,
  tryon.buildTryOnNegativePrompt({ garmentAudience: "women", ageGroup: "adult" }),
].join("\n");

const oldFramePrompt = basePrompt.replace(
  /画幅构图规则：[^\n]+/,
  "画幅构图规则：最终输出必须严格保持1:1 画幅。"
);
const refreshedFramePrompt = tryon.applyTryOnFramePrompt(oldFramePrompt, {
  aspectRatio: "4:5",
  hasReference: true,
  referenceImageNumber: 2,
});
assertIncludes(refreshedFramePrompt, "4:5 画幅", "画幅规则替换");
assertIncludes(refreshedFramePrompt, "图2参考图", "画幅参考图号");
assertNotIncludes(refreshedFramePrompt, "1:1 画幅", "画幅规则替换");

const oldAudiencePrompt = basePrompt.replace(
  /服装适用人群规则：[^\n]+/,
  "服装适用人群规则：用户选择女装，年龄段为成人。"
);
const refreshedAudiencePrompt = tryon.applyTryOnAudiencePrompt(oldAudiencePrompt, {
  garmentAudience: "men",
  ageGroup: "teen",
});
assertIncludes(refreshedAudiencePrompt, "用户选择男装", "人群规则替换");
assertIncludes(refreshedAudiencePrompt, "年龄段为青少年", "人群规则替换");
assertNotIncludes(refreshedAudiencePrompt, "年龄段为成人", "人群规则替换");

const enforced = tryon.enforceTryOnPromptRequirements(refreshedFramePrompt, ["图1", "图2", "图3"], {
  garmentAudience: "women",
  ageGroup: "adult",
  hasModelFace: true,
});
assertNotIncludes(enforced, "儿童/青少年服装不要成人化", "成人女装提示词精简");
assertNotIncludes(enforced, "青少年/大童/中童/小童/幼童", "成人女装提示词精简");
assertIncludes(enforced, "当前为成人女装", "成人女装条件规则");
assertIncludes(enforced, "服装图角色隔离规则", "真人服装图角色隔离");
assertIncludes(enforced, "不得作为人物身份、姿势、背景、场景、镜头距离或构图参考", "真人服装图角色隔离");

const childPrompt = tryon.enforceTryOnPromptRequirements(basePrompt, ["图1", "图2", "图3"], {
  garmentAudience: "men",
  ageGroup: "small_child",
  hasModelFace: true,
});
assertIncludes(childPrompt, "当前为小童男童", "童装条件规则");
assertIncludes(childPrompt, "不要成人化", "童装条件规则");
assertNotIncludes(childPrompt, "当前为成人女装", "童装条件规则");

const singleTryOn = lingya.buildTryOnPrompt({
  clothingCount: 1,
  clothingMode: "single",
  garmentAudience: "women",
  ageGroup: "adult",
  aspectRatio: "3:4",
  hasModelFace: false,
  hasReference: true,
}).prompt;
assertIncludes(singleTryOn, "use image 1 only as clothing source", "单件英文精简提示");
assertIncludes(singleTryOn, "replace the outfit on the person in image 2 with the clothing from image 1", "单件英文精简提示");
assertIncludes(singleTryOn, "Strict role lock: image 1 = clothing source ONLY; image 2 = target body / pose / head placement / composition / background / lighting / skin continuity ONLY", "单件角色锁定");
assertIncludes(singleTryOn, "Do not mix roles under any circumstance", "单件角色锁定");
assertIncludes(singleTryOn, "Clothing source isolation - HARD", "单件服装源隔离");
assertIncludes(singleTryOn, "Ignore any face, body, pose, skin, lighting, background", "单件服装源隔离");
assertIncludes(singleTryOn, "image 2 is the target canvas", "单件参考图动态规则");
assertIncludes(singleTryOn, "Conflict priority: clothing = image 1; body/pose/composition/background = image 2", "单件优先级规则");
assertIncludes(singleTryOn, "Failure handling: if anything is ambiguous", "单件失败处理规则");
assertNotIncludes(singleTryOn, "如果有参考图", "单件参考图不使用条件句");
assertIncludes(singleTryOn, "Single-garment rule", "单件服装动态规则");
assertNotIncludes(singleTryOn, "输入顺序规则", "不再重排图片");

const multiTryOn = lingya.buildTryOnPrompt({
  clothingCount: 2,
  clothingMode: "multi",
  clothingRoles: ["upper", "lower"],
  garmentAudience: "women",
  ageGroup: "adult",
  aspectRatio: "3:4",
  hasModelFace: true,
  hasReference: true,
}).prompt;
assertIncludes(multiTryOn, "固定底图编辑：以 image 3 作为身体、姿势、构图、光照和场景底图，只把最终脸部身份替换为 image 4", "多件固定底图规则");
assertIncludes(multiTryOn, "- image 1 = 上装来源 only。", "多件角色锁定");
assertIncludes(multiTryOn, "- image 2 = 下装来源 only。", "多件角色锁定");
assertIncludes(multiTryOn, "- image 3 = 底图与表情 only", "多件角色锁定");
assertIncludes(multiTryOn, "- image 4 = 最终脸部身份 only", "多件角色锁定");
assertIncludes(multiTryOn, "【HARD 硬规则 · 必须使用模特脸】", "多件脸部身份锁");
assertIncludes(multiTryOn, "生成一张与 image 4 无关的新脸", "多件脸部身份锁");
assertIncludes(multiTryOn, "不提供表情、肤色、妆容、姿态、身体、服装、光照或背景", "多件模特脸不提供表情");
assertIncludes(multiTryOn, "编辑任务：", "多件本地编辑规则");
assertIncludes(multiTryOn, "只把 image 3 人物中对应的上装和下装替换为 image 1 和 image 2 的服装。", "多件替换规则");
assertIncludes(multiTryOn, "表情类别、强度、情绪方向、视线、面部张力", "多件参考图整体表情状态");
assertIncludes(multiTryOn, "脸部身份规则：", "多件脸部身份替换规则");
assertIncludes(multiTryOn, "保持 image 3 已检测到的可见身体范围、身体比例、裁切边界、镜头距离", "多件参考图构图锁定规则");
assertIncludes(multiTryOn, "不允许改变 image 3 的整体机位、画幅和场景", "多件镜头画幅规则");
assertIncludes(multiTryOn, "服装主图规则：", "多件服装主图规则");
assertIncludes(multiTryOn, "image 1 和 image 2 是服装主图，只提供要上身的服装本身", "多件服装图角色");
assertIncludes(multiTryOn, "即使图中有人、假人、背景或摆拍场景，也不要复制其中的人物", "多件服装图人物场景隔离");
assertIncludes(multiTryOn, "材质类型、面料纹理、织法、光泽、厚薄、透明度", "多件服装材质细节锁");
assertIncludes(multiTryOn, "不要把材质改成别的布料，也不要简化或重设计服装细节", "多件服装细节防重设计");
assertIncludes(multiTryOn, "如果 image 1 只有一件上装，不要增加额外上装。", "多件上装不发散规则");
assertIncludes(multiTryOn, "如果 image 2 只有一件下装，不要增加额外下装。", "多件下装不发散规则");
assertIncludes(multiTryOn, "最终脸部身份必须来自 image 4", "多件模特脸规则");
assertIncludes(multiTryOn, "脸型、五官、骨相、眉眼鼻嘴比例和可识别度都以 image 4 为准", "多件模特脸规则");
assertIncludes(multiTryOn, "不要照搬 image 4 原图的表情强度、肤色、妆容、光照、姿态、身体比例和背景。", "多件模特脸排除规则");
assertIncludes(multiTryOn, "最终脸部必须像 image 4 本人", "多件模特脸强制生效规则");
assertIncludes(multiTryOn, "image 3 只提供表情类别、强度、情绪方向", "多件表情适配");
assertIncludes(multiTryOn, "融合只允许发生在表情肌肉、视线、肤色重新打光、妆容匹配、毛孔、阴影和边缘过渡", "多件自然融合边界");
assertIncludes(multiTryOn, "不要改变 image 4 的脸型、眉形、眼距、鼻结构、嘴形、五官比例和可识别度", "多件禁止改身份结构");
assertIncludes(multiTryOn, "自然衔接 image 3 的颈部、胸口、手臂或手部肤色", "多件肤色光影融合");
assertIncludes(multiTryOn, "1. image 4 控制最终脸部身份和五官比例", "多件优先级规则");
assertIncludes(multiTryOn, "3. image 3 控制表情方向与强度", "多件优先级规则");
assertIncludes(multiTryOn, "它不能控制最终脸部身份", "多件优先级规则");
assertIncludes(multiTryOn, "身份替换在每张输出中都必须生效", "多件身份强制规则");
assertNotIncludes(multiTryOn, "Face identity lock - HARD:", "多件脸部身份锁去重");
assertNotIncludes(multiTryOn, "Expression transfer:", "多件表情迁移去重");
assertNotIncludes(multiTryOn, "must_use_model_face", "多件不暴露内部换脸模式");
assertNotIncludes(multiTryOn, "preserve_reference_face", "多件不暴露内部保脸模式");
assertNotIncludes(multiTryOn, "服装来源隔离", "多件不使用内部化服装标题");
assertNotIncludes(multiTryOn, "image 3 = target try-on reference: visible body range, crop boundary, pose family, visible expression/skin/makeup when present", "有脸参考图不能弱化表情");
assertNotIncludes(multiTryOn, "facial expression exactly", "多件不能回到表情几何硬锁");
assertNotIncludes(multiTryOn, "exact expression geometry", "多件不能回到表情几何硬锁");
assertNotIncludes(multiTryOn, "如果有参考图", "多件参考图不使用条件句");
assertNotIncludes(multiTryOn, "如果有模特脸图", "多件模特脸不使用条件句");

const groupedDetailPrompt = garmentDetails.buildGarmentDetailReferencePrompt({
  groups: [
    {
      clothingIndex: 0,
      clothingImageNumber: 1,
      clothingLabel: "上装",
      urls: ["collar.png", "fabric.png"],
      detailImageNumbers: [5, 6],
    },
    {
      clothingIndex: 1,
      clothingImageNumber: 2,
      clothingLabel: "下装",
      urls: ["hem.png"],
      detailImageNumbers: [7],
    },
  ],
});
assertIncludes(groupedDetailPrompt, "服装细节归属规则", "多件服装细节归属标题");
assertIncludes(groupedDetailPrompt, "image 5、image 6 只补充 image 1（上装）", "上装细节归属");
assertIncludes(groupedDetailPrompt, "image 7 只补充 image 2（下装）", "下装细节归属");
assertIncludes(groupedDetailPrompt, "不得用于其他主服装图", "细节图不能跨服装使用");
assertIncludes(groupedDetailPrompt, "不跨件迁移", "细节图不能跨件迁移");

const poseAnglePrompt = garmentAngles.buildPoseGarmentAngleReferencePrompt({
  startImageNumber: 2,
  references: [
    { url: "upper-back.png", target: "upper", view: "back" },
    { url: "lower-side.png", target: "lower", view: "side" },
  ],
});
assertIncludes(poseAnglePrompt, "服装角度参考规则", "姿势裂变服装角度参考标题");
assertIncludes(poseAnglePrompt, "image 2 = 上装背面角度参考", "姿势裂变上装背面角度归属");
assertIncludes(poseAnglePrompt, "image 3 = 下装侧面角度参考", "姿势裂变下装侧面角度归属");
assertIncludes(poseAnglePrompt, "上装角度只影响上装", "姿势裂变上装角度隔离");
assertIncludes(poseAnglePrompt, "下装角度只影响下装", "姿势裂变下装角度隔离");
assertNotIncludes(poseAnglePrompt, "局部细节补充", "姿势裂变不用服装细节语义");

const upperOnlyTryOn = lingya.buildTryOnPrompt({
  clothingCount: 1,
  clothingMode: "multi",
  clothingRoles: ["upper"],
  garmentAudience: "women",
  ageGroup: "adult",
  aspectRatio: "3:4",
  hasModelFace: true,
  hasReference: true,
}).prompt;
assertIncludes(upperOnlyTryOn, "只把 image 2 人物的上装替换为 image 1 的上装。", "单上装替换规则");
assertIncludes(upperOnlyTryOn, "保留 image 2 可见下装、鞋、腿、手、配饰、背景和场景", "单上装可见下半身保护");
assertIncludes(upperOnlyTryOn, "不要扩展原裁切。", "单上装裁切外区域保护");
assertIncludes(upperOnlyTryOn, "不能保留 image 2 原脸身份", "单上装图3脸优先");
assertIncludes(upperOnlyTryOn, "如果 image 1 只有一件上装，不要增加额外上装。", "单上装不凭空发散");

const lowerBodyNoHeadAnalysis = {
  index: 1,
  bodyCrop: "lower_body",
  personVisible: true,
  faceVisible: false,
  headVisible: false,
  upperBodyVisible: false,
  lowerBodyVisible: true,
  handsVisible: false,
  feetVisible: true,
  detailFocus: ["pants", "leg stance"],
  promptNotes: "Keep the waist-to-feet crop and do not add a head, face, shoulders, or full torso.",
  confidence: 0.95,
};

const lowerNoFaceWithModelFace = lingya.buildTryOnPrompt({
  clothingCount: 1,
  clothingMode: "multi",
  clothingRoles: ["lower"],
  garmentAudience: "women",
  ageGroup: "adult",
  aspectRatio: "3:4",
  hasModelFace: true,
  hasReference: true,
  referenceAnalysis: lowerBodyNoHeadAnalysis,
}).prompt;
assertIncludes(lowerNoFaceWithModelFace, "Head/face absence lock - HARD:", "下半身无头硬锁");
assertIncludes(lowerNoFaceWithModelFace, "image 2 is a lower-body-only target frame with no visible head or face", "下半身无头目标");
assertIncludes(lowerNoFaceWithModelFace, "ignore image 3 completely for this no-head crop", "下半身无头忽略模特脸");
assertIncludes(lowerNoFaceWithModelFace, "A result with any visible face or newly added head is invalid", "下半身无头禁止出脸");
assertNotIncludes(lowerNoFaceWithModelFace, "Reconstruct the final face", "下半身无头不重建脸");

const lowerNoFaceWithoutModelFace = lingya.buildTryOnPrompt({
  clothingCount: 1,
  clothingMode: "multi",
  clothingRoles: ["lower"],
  garmentAudience: "women",
  ageGroup: "adult",
  aspectRatio: "3:4",
  hasModelFace: false,
  hasReference: true,
  referenceAnalysis: lowerBodyNoHeadAnalysis,
}).prompt;
assertIncludes(lowerNoFaceWithoutModelFace, "Head/face absence lock - HARD:", "无模特脸下半身无头硬锁");
assertIncludes(lowerNoFaceWithoutModelFace, "do not invent a default face or complete person", "无模特脸下半身无头不补脸");
assertIncludes(lowerNoFaceWithoutModelFace, "no head, no face, no upper torso, no full-body expansion", "无模特脸下半身角色锁");
assertIncludes(lowerNoFaceWithoutModelFace, "There is no visible face, head, hair, neck, shoulders, or upper torso to preserve; do not add any of them.", "无模特脸下半身不保留脸");
assertNotIncludes(lowerNoFaceWithoutModelFace, "Preserve image 2's original facial identity", "无模特脸下半身不保留脸身份");

const nanoCompiled = compiler.compileImagePromptForModel({
  kind: "tryon",
  model: "nano-banana-2",
  prompt: enforced,
});

assertIncludes(nanoCompiled, "图像角色", "tryon compiler 临时直出");
assertNotIncludes(nanoCompiled, "短版执行提示", "tryon compiler 临时直出");

const gptCompiled = compiler.compileImagePromptForModel({
  kind: "tryon",
  model: "gpt-image-2",
  prompt: multiTryOn,
});
assertIncludes(gptCompiled, "固定底图编辑：以 image 3 作为身体、姿势、构图、光照和场景底图，只把最终脸部身份替换为 image 4", "gpt-image-2 精简直出");
assertNotIncludes(gptCompiled, "GPT-Image-2 执行提示", "gpt-image-2 临时极简直出");
assertNotIncludes(gptCompiled, "服装图角色隔离规则", "gpt-image-2 临时极简直出");
assertNotIncludes(gptCompiled, "输入顺序规则", "gpt-image-2 不再重排图片");

const gptRuntimePrompt = lingya.applyTryOnRequestPrompt("BASE", {
  model: "gpt-image-2",
  candidateIndex: 1,
  candidateCount: 4,
  referenceUrl: "target.jpg",
  modelFaceUrl: "face.jpg",
});
assertIncludes(gptRuntimePrompt, "摄影风格：跟随参考图的影调", "tryon photo finish directive");
assertIncludes(gptRuntimePrompt, "光线方向、色温、曝光、白平衡", "tryon reference photo finish");
assertIncludes(gptRuntimePrompt, "景深、相机质感、滤镜氛围", "tryon reference camera finish");
assertIncludes(gptRuntimePrompt, "服装固有色、图案、logo、面料纹理", "tryon finish safeguards");
assertIncludes(gptRuntimePrompt, "不要厚重美颜滤镜", "tryon no heavy beauty filter");
assertIncludes(gptRuntimePrompt, "不要漂白衣服颜色", "tryon no color bleaching");
assertIncludes(multiTryOn, "头部或全身不可见时不要补画", "tryon crop-aware body completion guard");
assertIncludes(gptRuntimePrompt, "人物身份、肤色连续性和身体比例保持准确", "tryon finish safeguards");
assertIncludes(gptRuntimePrompt, "在套用全局色调前", "tryon face skin continuity before finish");
assertIncludes(gptRuntimePrompt, "候选 2/4", "tryon candidate directive");
assertIncludes(gptRuntimePrompt, "参考图摄影氛围", "tryon candidate keeps reference mood");
assertNotIncludes(gptRuntimePrompt, "Nano Banana try-on mode", "gpt-image-2 no banana directive");

const gptRuntimePromptWithReferenceFace = lingya.applyTryOnRequestPrompt("BASE", {
  model: "gpt-image-2",
  candidateIndex: 1,
  candidateCount: 4,
  referenceUrl: "target.jpg",
  modelFaceUrl: "face.jpg",
  referenceAnalysis: {
    index: 1,
    bodyCrop: "upper_body",
    personVisible: true,
    faceVisible: true,
    headVisible: true,
    upperBodyVisible: true,
    lowerBodyVisible: false,
    handsVisible: true,
    feetVisible: false,
    detailFocus: ["face", "upper body"],
    promptNotes: "Use the visible face and upper-body crop.",
    confidence: 0.92,
  },
});
assertIncludes(gptRuntimePromptWithReferenceFace, "候选之间不要改变脸部、表情、视线、头部姿态、头部大小", "tryon candidate locks reference face performance");
assertIncludes(gptRuntimePromptWithReferenceFace, "候选差异只能来自服装版型", "tryon candidate varies garment only");
assertNotIncludes(gptRuntimePromptWithReferenceFace, "For GPT candidate variation", "tryon reference face lock disables gpt expression variation");
assertNotIncludes(gptRuntimePromptWithReferenceFace, "micro-expression", "tryon reference face lock removes expression variation");

const nanoRuntimePrompt = lingya.applyTryOnRequestPrompt("BASE", {
  model: "nano-banana-2",
  candidateIndex: 0,
  candidateCount: 4,
  referenceUrl: "target.jpg",
  modelFaceUrl: "face.jpg",
});
assertIncludes(nanoRuntimePrompt, "摄影风格：跟随参考图的影调", "nano-banana also uses reference photo finish");
assertNotIncludes(nanoRuntimePrompt, "Nano Banana try-on mode", "nano-banana uses common tryon prompt");
assertNotIncludes(nanoRuntimePrompt, "Proportion guard:", "nano-banana uses common tryon prompt");
assertNotIncludes(nanoRuntimePrompt, "For GPT candidate variation", "nano-banana no gpt expression directive");

console.log("prompt regression check passed");
