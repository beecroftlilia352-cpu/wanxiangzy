/**
 * Virtual Try-On — Replicate IDM-VTON
 * $0.023/次, $5 ≈ 200+ 次生成
 */

import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

const VERSION = "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985";

export async function runTryOn(input: {
  human_img: string;
  garm_img: string;
}): Promise<string> {
  const prediction = await replicate.predictions.create({
    version: VERSION,
    input: {
      human_img: input.human_img,
      garm_img: input.garm_img,
      category: "upper_body",
      crop: false,
      seed: 42,
      steps: 30,
    },
  });

  // Poll until done
  let result;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    result = await replicate.predictions.get(prediction.id);
    if (result.status === "succeeded") break;
    if (result.status === "failed") throw new Error(result.error?.message || "Try-on failed");
  }

  const output = (result as any).output;
  const url = Array.isArray(output) ? output[0] : output;
  if (!url) throw new Error("No output from try-on");
  return url;
}
