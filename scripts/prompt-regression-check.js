const fs = require("fs");
const Module = require("module");
const path = require("path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const moduleCache = new Map();

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename);
  const source = fs.readFileSync(filename, "utf8");
  const nativeRequire = Module.createRequire(filename);
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
    if (id.startsWith(".")) {
      const resolved = path.resolve(path.dirname(filename), id);
      const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        path.join(resolved, "index.ts"),
        path.join(resolved, "index.tsx"),
      ];
      const tsFile = candidates.find((candidate) => candidate.startsWith(root) && fs.existsSync(candidate));
      if (tsFile) return loadTsModule(path.relative(root, tsFile));
    }
    return nativeRequire(id);
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

const basePrompt = [
  "图像角色：图1是参考图，图2是单件服装图，图3是模特脸图。",
  "任务：将图2的单件服装穿在图1参考图中的人物身上，并将人物脸部替换为图3的模特脸。",
  tryon.TRYON_CLOTHING_IMAGE_ROLE_RULE,
  tryon.buildTryOnAudiencePrompt({ garmentAudience: "women", ageGroup: "adult" }),
  tryon.buildTryOnFramePrompt({ aspectRatio: "3:4", hasReference: true, referenceImageNumber: 1 }),
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
  referenceImageNumber: 1,
});
assertIncludes(refreshedFramePrompt, "4:5 画幅", "画幅规则替换");
assertIncludes(refreshedFramePrompt, "图1参考图", "画幅参考图号");
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
assertIncludes(singleTryOn, "- image 2 = clothing source only:", "single role lock");
assertIncludes(singleTryOn, "Use image 1 as the base try-on photo; replace only the sourced outfit areas with image 2 as clothing source", "single concise prompt");
assertIncludes(singleTryOn, "not a person, body, pose, face, lighting, or background reference", "single role isolation");
assertIncludes(singleTryOn, "image 2 controls clothing only", "single role priority");
assertIncludes(singleTryOn, "Clothing source isolation - HARD", "单件服装源隔离");
assertIncludes(singleTryOn, "Ignore any face, body, pose, skin, lighting, background", "单件服装源隔离");
assertIncludes(singleTryOn, "image 2 is NOT person reference", "single clothing source isolation");
assertIncludes(singleTryOn, "Outfit-area rule", "single outfit-area rule");
assertIncludes(singleTryOn, "Do not reveal body areas outside the original crop", "single crop safety");
assertNotIncludes(singleTryOn, "如果有参考图", "单件参考图不使用条件句");
assertIncludes(singleTryOn, "Single-source garment rule", "single garment dynamic rule");
assertIncludes(singleTryOn, "image 2 defines the uploaded garment or outfit and its natural coverage", "single garment dynamic rule");
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
assertIncludes(multiTryOn, "Follow the image roles below exactly", "multi role contract");
assertIncludes(multiTryOn, "- image 2 = upper clothing source only:", "multi clothing role");
assertIncludes(multiTryOn, "- image 3 = lower clothing source only:", "multi clothing role");
assertIncludes(multiTryOn, "- image 1 = target/base canvas only:", "multi base role");
assertIncludes(multiTryOn, "- image 4 = final face identity only:", "multi face role");
assertIncludes(multiTryOn, "Use image 1 as the base try-on photo; replace only the sourced outfit areas with image 2 and image 3 as clothing sources; rebuild the final visible face from image 4", "multi main task");
assertIncludes(multiTryOn, "image 1 is the base canvas. Keep its body proportions", "multi base canvas lock");
assertIncludes(multiTryOn, "Clothing source isolation - HARD:", "multi clothing isolation");
assertIncludes(multiTryOn, "image 2, image 3 are NOT person reference", "multi clothing isolation");
assertIncludes(multiTryOn, "Wear each source on its assigned body area", "multi garment assembly");
assertIncludes(multiTryOn, "Sourced-outfit-area rule", "multi outfit-area rule");
assertIncludes(multiTryOn, "If image 2 contains only one garment, do not invent extra upper-body garments.", "多件上装不发散规则");
assertIncludes(multiTryOn, "If image 3 contains only one garment, do not invent extra lower-body garments.", "多件下装不发散规则");
assertIncludes(multiTryOn, "Face identity:", "multi face identity section");
assertIncludes(multiTryOn, "image 4 is the only final face identity source", "multi face identity lock");
assertIncludes(multiTryOn, "not image 1's original person", "multi face identity lock");
assertIncludes(multiTryOn, "not a generic influencer/catalog face", "multi face identity lock");
assertIncludes(multiTryOn, "image 1 may guide only expression category/intensity", "multi expression source boundary");
assertIncludes(multiTryOn, "It must not donate final face outline", "multi identity source boundary");
assertIncludes(multiTryOn, "Expression transfer:", "multi expression transfer");
assertIncludes(multiTryOn, "visible expression category, intensity, emotional direction", "multi expression transfer");
assertIncludes(multiTryOn, "one coherent performance", "multi expression transfer");
assertIncludes(multiTryOn, "without copying image 4's original expression", "multi face expression exclusion");
assertIncludes(multiTryOn, "without flattening image 1's expression into a neutral catalog face", "multi expression preservation");
assertIncludes(multiTryOn, "Face blending: rebuild the visible head-and-face area", "multi face blending");
assertIncludes(multiTryOn, "inside image 1's original head space", "multi head scale lock");
assertIncludes(multiTryOn, "do not enlarge the head/face", "multi head scale lock");
assertIncludes(multiTryOn, "Natural integration may adjust expression muscles", "multi natural integration");
assertIncludes(multiTryOn, "Do not change image 4's face outline", "multi identity structure lock");
assertIncludes(multiTryOn, "1. image 4 controls final facial identity", "multi priority");
assertIncludes(multiTryOn, "2. image 2 and image 3 controls clothing only", "multi priority");
assertIncludes(multiTryOn, "3. image 1 controls body proportions", "multi priority");
assertNotIncludes(multiTryOn, "image 1 = target try-on reference: visible body range, crop boundary, pose family, visible expression/skin/makeup when present", "有脸参考图不能弱化表情");
assertNotIncludes(multiTryOn, "facial expression exactly", "多件不能回到表情几何硬锁");
assertNotIncludes(multiTryOn, "exact expression geometry", "多件不能回到表情几何硬锁");
assertNotIncludes(multiTryOn, "如果有参考图", "多件参考图不使用条件句");
assertNotIncludes(multiTryOn, "如果有模特脸图", "多件模特脸不使用条件句");

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
assertIncludes(upperOnlyTryOn, "Upper-body-only rule: Replace only the conflicting upper-body outfit.", "upper-only replacement rule");
assertIncludes(upperOnlyTryOn, "Keep image 1's visible lower-body clothing, shoes, legs, hands, accessories, background, and scene close to the reference", "单上装可见下半身保护");
assertIncludes(upperOnlyTryOn, "Do not reveal lower-body areas outside the original crop.", "单上装裁切外区域保护");
assertIncludes(upperOnlyTryOn, "image 3 is the only final face identity source", "upper-only face priority");
assertIncludes(upperOnlyTryOn, "not image 1's original person", "upper-only face priority");
assertIncludes(upperOnlyTryOn, "If image 2 contains only one garment, do not invent extra upper-body garments.", "单上装不凭空发散");

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
assertIncludes(lowerNoFaceWithModelFace, "image 1 is a lower-body-only target frame with no visible head or face", "下半身无头目标");
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
assertIncludes(lowerNoFaceWithoutModelFace, "Do not generate, reveal, add, infer, or hallucinate any head, face, neck, shoulders, upper torso, portrait, or full-body expansion outside image 1's original crop.", "lower no-face crop lock");
assertIncludes(lowerNoFaceWithoutModelFace, "image 1 has no usable visible face/head for identity. Preserve the crop and do not invent a new face, head, hair, portrait, or full-body expansion.", "lower no-face identity lock");
assertNotIncludes(lowerNoFaceWithoutModelFace, "Preserve image 1's original facial identity", "无模特脸下半身不保留脸身份");

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
assertIncludes(gptCompiled, "Use image 1 as the base try-on photo; replace only the sourced outfit areas with image 2 and image 3 as clothing sources; rebuild the final visible face from image 4", "gpt-image-2 concise direct prompt");
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
assertIncludes(gptRuntimePrompt, "摄影风格：跟随image 1 / 图1参考图的影调", "tryon photo finish directive");
assertIncludes(gptRuntimePrompt, "光线方向、色温、曝光、白平衡、景深、相机质感、滤镜氛围", "tryon reference photo finish");
assertIncludes(gptRuntimePrompt, "服装固有色、图案、logo、面料纹理、人物身份、肤色连续性和身体比例保持准确", "tryon finish safeguards");
assertIncludes(gptRuntimePrompt, "不要厚重美颜滤镜、不要海报版式、不要添加文字、不要漂白衣服颜色", "tryon no generic filter");
assertIncludes(gptRuntimePrompt, "真人皮肤质感：保留可见毛孔、细微纹理、自然油光、局部红润、轻微瑕疵", "tryon real human skin finish");
assertIncludes(gptRuntimePrompt, "不要磨成瓷肌、塑料皮、蜡像皮、过度美颜", "tryon anti over-smoothing finish");
assertIncludes(lowerNoFaceWithoutModelFace, "Do not zoom out, do not convert it into a full-body portrait, and do not add a head, face, shoulders, or full torso.", "tryon crop-aware body completion guard");
assertIncludes(gptRuntimePrompt, "在套用全局色调前，让最终脸部肤色与image 1 / 图1参考图的颈、胸、手臂、手", "tryon face skin continuity before finish");
assertIncludes(gptRuntimePrompt, "多图输出规则：保持同一身份、脸部、表情、视线、头部姿态", "tryon multi-output short guard");
assertIncludes(gptRuntimePrompt, "仅允许服装褶皱、下摆、接触阴影和布料自然贴合有轻微差异", "tryon multi-output minimal variation");
assertNotIncludes(gptRuntimePrompt, "候选 ", "tryon runtime no candidate directive");
assertNotIncludes(gptRuntimePrompt, "候选之间不要改变脸部", "tryon runtime no candidate face lock");
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
assertIncludes(gptRuntimePromptWithReferenceFace, "多图输出规则：保持同一身份、脸部、表情、视线、头部姿态", "tryon reference face short multi-output guard");
assertNotIncludes(gptRuntimePromptWithReferenceFace, "候选 ", "tryon reference face no candidate directive");
assertNotIncludes(gptRuntimePromptWithReferenceFace, "候选差异只能来自服装版型", "tryon reference face no candidate variation");
assertNotIncludes(gptRuntimePromptWithReferenceFace, "For GPT candidate variation", "tryon reference face lock disables gpt expression variation");
assertNotIncludes(gptRuntimePromptWithReferenceFace, "micro-expression", "tryon reference face lock removes expression variation");

const nanoRuntimePrompt = lingya.applyTryOnRequestPrompt("BASE", {
  model: "nano-banana-2",
  candidateIndex: 0,
  candidateCount: 4,
  referenceUrl: "target.jpg",
  modelFaceUrl: "face.jpg",
});
assertIncludes(nanoRuntimePrompt, "摄影风格：跟随image 1 / 图1参考图的影调", "nano-banana also uses reference photo finish");
assertIncludes(nanoRuntimePrompt, "真人皮肤质感：保留可见毛孔、细微纹理、自然油光、局部红润、轻微瑕疵", "nano-banana real human skin finish");
assertNotIncludes(nanoRuntimePrompt, "Nano Banana try-on mode", "nano-banana uses common tryon prompt");
assertNotIncludes(nanoRuntimePrompt, "Proportion guard:", "nano-banana uses common tryon prompt");
assertNotIncludes(nanoRuntimePrompt, "For GPT candidate variation", "nano-banana no gpt expression directive");

console.log("prompt regression check passed");
