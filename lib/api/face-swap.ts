/**
 * 人脸替换 — Replicate InsightFaceSwap
 * ~$0.005/次
 */

import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export async function runFaceSwap(input: {
  target_image: string;
  source_image: string;
}): Promise<string> {
  const output = (await replicate.run(
    "lucataco/insightfaceswap:0f7b5a0f9da7b6fd3a1cf8ef46e6c6c8d6c8a2c9f5e8e8c9b5c5c8e8d9f9e8e",
    {
      input: {
        target_image: input.target_image,
        source_image: input.source_image,
      },
    }
  )) as string;

  return output;
}
