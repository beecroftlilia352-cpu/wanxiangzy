import { Clapperboard } from "lucide-react";
import { AiVideoExperience } from "@/app/video/AiVideoExperience";
import { supportsVideoMotionControl } from "@/lib/api/video-catalog";
import { getAdminVideoProviderOverride } from "@/lib/api/video-provider-registry.server";

export const dynamic = "force-dynamic";

export default async function MotionControlPage() {
  let supported = false;
  try {
    const override = await getAdminVideoProviderOverride();
    supported = Boolean(override?.enabled && override.apiKey && supportsVideoMotionControl(override.provider));
  } catch {
    supported = false;
  }

  if (!supported) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
            <Clapperboard className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-lg font-black text-slate-900">暂不支持参考视频</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            当前视频供应商不支持用参考视频驱动动作，请使用「图生视频」或「首尾帧」功能。
          </p>
        </div>
      </div>
    );
  }

  return <AiVideoExperience mode="motion-control" />;
}
