const MODEL_QUALITY =
  "photorealistic, 8K ultra-detailed, commercial portrait quality, cinematic color grade, sharp facial details, sharp hair details, raw photo quality";

export const MODEL_FACE_STYLE_RULE =
  "人脸风格规则：参考图不仅用于五官融合，也用于定义最终模特的长相风格、审美方向和气质标签。必须提取参考图中最明显的脸部审美特征、年龄感、眼神气质、面部氛围、镜头表现力和整体模特感，让生成结果看起来像同一类风格的专属模特，而不是普通随机人脸。";

export const MODEL_MAKEUP_RULE =
  "妆感规则：参考图也用于提取妆容风格，包括底妆质感、遮瑕程度、眉形、眼妆色系、眼妆轮廓、眼线、睫毛、卧蚕、腮红位置、修容高光位置、唇形、唇色、唇妆质地和整体妆感浓淡。最终模特需要保留参考图的妆发审美和面部氛围，但妆容必须自然真实、贴合商业模特摄影，不要夸张网红妆、脏妆、塑料感或过度磨皮。";

export const MODEL_FUSION_RULE =
  "融合规则：最终模特是由所有人脸参考图融合出来的新身份，需要综合每张图的脸型优势、五官比例、眼神气质、肤色、妆感和真实质感；如果参考图之间差异明显，按自然真人审美融合成协调的新脸，不要生成与任意单张参考图几乎完全相同的脸，也不要机械平均成没有风格记忆点的陌生脸。";

export const MODEL_SKIN_TONE_RULE =
  "肤色规则：从参考人脸图中提取自然肤色范围、冷暖调、明暗层次、局部红润、阴影层次和真实皮肤质感，生成协调自然的肤色；不要默认美白，不要雪白皮，不要冷白皮，不要过度提亮肤色，不要把亚洲肤色统一变成瓷白。";

export const MODEL_FACE_SHAPE_RULE =
  "脸型骨相规则：参考图用于提取真实脸型结构，包括脸长宽比例、颧骨位置、下颌线、下巴形状、额头宽度、面中比例、太阳穴饱满度和面部骨相。最终模特可以自然美化，但不能统一变成标准鹅蛋脸、小V脸、尖下巴或网红脸，必须保留参考图中有辨识度的脸型倾向。";

export const MODEL_FEATURE_IDENTITY_RULE =
  "五官辨识度规则：保留参考图中有记忆点的眼型、眼距、眉眼关系、鼻梁高度、鼻翼宽度、鼻头形状、人中长度、唇形厚薄、嘴角走势和面部不对称细节；不要自动优化成大眼、高鼻、尖下巴、过度标准化的精修美女脸。";

export const MODEL_AGE_TEXTURE_RULE =
  "年龄感和肤质规则：保留参考图的年龄感、成熟度、面部软组织状态、眼下细纹、法令纹、皮肤微纹理、真实皮肤反光和局部瑕疵；不要统一少女化，不要磨成无纹理蜡像皮。";

export function getModelQualityPrompt() {
  return MODEL_QUALITY;
}

export function buildModelIdentityRoleStatement(params: {
  referenceCount: number;
  hairReferenceIndex?: number | null;
  hairColorReferenceIndex?: number | null;
}) {
  const refs = Array.from({ length: Math.max(params.referenceCount, 1) }, (_, index) => `图${index + 1}`).join("、");
  const extraRoles = [
    params.hairReferenceIndex ? `图${params.hairReferenceIndex} 是发型参考图，只参考发型轮廓、长度、刘海、分缝、蓬松度和发丝走向，不参考人脸身份` : "",
    params.hairColorReferenceIndex ? `图${params.hairColorReferenceIndex} 是发色参考图，只参考头发颜色、明暗层次和染发质感，不参考人脸身份` : "",
  ].filter(Boolean);

  return `图像角色：${refs} 是专属模特的人脸与风格融合参考图，可能来自同一个人，也可能来自不同人物；必须融合这些参考图的脸型骨相、五官比例、眼鼻唇特征、肤色、气质、妆感、年龄感、面部氛围和真实细节，生成一个新的稳定专属模特身份；不要只复制其中某一张图，也不要简单平均成陌生脸${extraRoles.length ? `；${extraRoles.join("；")}` : ""}。`;
}

export function enforceModelPromptRequirements(params: {
  prompt: string;
  referenceCount: number;
  hairReferenceIndex?: number | null;
  hairColorReferenceIndex?: number | null;
}) {
  if (!params.prompt.trim()) return "";

  let nextPrompt = params.prompt
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const roleStatement = buildModelIdentityRoleStatement({
    referenceCount: params.referenceCount,
    hairReferenceIndex: params.hairReferenceIndex,
    hairColorReferenceIndex: params.hairColorReferenceIndex,
  });
  const expectedRefs = Array.from({ length: params.referenceCount }, (_, index) => `图${index + 1}`);
  const missingRole =
    expectedRefs.some((ref) => !nextPrompt.includes(ref)) ||
    !/(融合|风格|妆感|肤色|脸型|骨相|气质|reference images|face style|makeup)/i.test(nextPrompt);

  if (missingRole) {
    nextPrompt = `${roleStatement}\n${nextPrompt}`;
  }

  const requiredRules = [
    ["融合规则", MODEL_FUSION_RULE],
    ["人脸风格规则", MODEL_FACE_STYLE_RULE],
    ["妆感规则", MODEL_MAKEUP_RULE],
    ["肤色规则", MODEL_SKIN_TONE_RULE],
    ["脸型骨相规则", MODEL_FACE_SHAPE_RULE],
    ["五官辨识度规则", MODEL_FEATURE_IDENTITY_RULE],
    ["年龄感和肤质规则", MODEL_AGE_TEXTURE_RULE],
  ] as const;
  requiredRules.forEach(([marker, rule]) => {
    if (!nextPrompt.includes(marker)) nextPrompt = `${nextPrompt}\n${rule}`;
  });

  if (params.hairReferenceIndex && !nextPrompt.includes(`图${params.hairReferenceIndex}`)) {
    nextPrompt = `${nextPrompt}\n图${params.hairReferenceIndex} 只作为发型参考，不作为人脸身份参考。`;
  }

  if (params.hairColorReferenceIndex && !nextPrompt.includes(`图${params.hairColorReferenceIndex}`)) {
    nextPrompt = `${nextPrompt}\n图${params.hairColorReferenceIndex} 只作为发色参考，不作为人脸身份参考。`;
  }

  const missingQuality = MODEL_QUALITY
    .split(", ")
    .filter((dimension) => !nextPrompt.includes(dimension));
  if (missingQuality.length) {
    nextPrompt = `${nextPrompt}\n图像质量：${MODEL_QUALITY}`;
  }

  if (!/标准鹅蛋脸|小V脸|雪白皮|冷白皮/.test(nextPrompt)) {
    nextPrompt = `${nextPrompt}\n负面审美约束：不要默认美白，不要雪白皮或冷白皮，不要标准鹅蛋脸、小V脸、尖下巴、大眼高鼻网红审美，不要丢失参考图的脸型辨识度、肤色层次、年龄感和真实骨相。`;
  }

  return nextPrompt;
}
