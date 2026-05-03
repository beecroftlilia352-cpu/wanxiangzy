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
assertIncludes(singleTryOn, "Strict role lock: image 1 = clothing source ONLY; image 2 = target body / pose / composition / background ONLY", "单件角色锁定");
assertIncludes(singleTryOn, "Do not mix roles under any circumstance", "单件角色锁定");
assertIncludes(singleTryOn, "Clothing source isolation - HARD", "单件服装源隔离");
assertIncludes(singleTryOn, "do NOT reuse identity, face, skin, body shape, pose", "单件服装源隔离");
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
assertIncludes(multiTryOn, "use image 1 and image 2 only as clothing sources", "多件英文精简提示");
assertIncludes(multiTryOn, "replace the outfit on the person in image 3 with the clothing from image 1 and image 2", "多件英文精简提示");
assertIncludes(multiTryOn, "use the face from image 4", "多件英文极简提示");
assertIncludes(multiTryOn, "Strict role lock: image 1 = upper clothing source ONLY; image 2 = lower clothing source ONLY; image 3 = target body / pose / composition / background ONLY; image 4 = face identity ONLY", "多件角色锁定");
assertIncludes(multiTryOn, "Multi-garment rule: image 1 = upper-body garment; image 2 = lower-body garment", "多件服装动态规则");
assertIncludes(multiTryOn, "image 4 is the final face identity ONLY", "多件模特脸动态规则");
assertIncludes(multiTryOn, "Fully replace the target facial identity with image 4", "多件模特脸覆盖规则");
assertIncludes(multiTryOn, "Conflict priority: face identity = image 4; clothing = image 1 and image 2; body/pose/composition/background = image 3", "多件优先级规则");
assertIncludes(multiTryOn, "never fall back to identity from image 1 and image 2 or image 3", "多件失败处理规则");
assertNotIncludes(multiTryOn, "如果有参考图", "多件参考图不使用条件句");
assertNotIncludes(multiTryOn, "如果有模特脸图", "多件模特脸不使用条件句");

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
assertIncludes(gptCompiled, "replace the outfit on the person in image 3 with the clothing from image 1 and image 2", "gpt-image-2 精简直出");
assertNotIncludes(gptCompiled, "GPT-Image-2 执行提示", "gpt-image-2 临时极简直出");
assertNotIncludes(gptCompiled, "服装图角色隔离规则", "gpt-image-2 临时极简直出");
assertNotIncludes(gptCompiled, "输入顺序规则", "gpt-image-2 不再重排图片");

console.log("prompt regression check passed");
