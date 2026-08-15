import dynamic from "next/dynamic";
import { StudioModuleSkeleton } from "@/components/studio/StudioModuleSkeleton";

const PageClient = dynamic(() => import("./page-client"), {
  loading: () => <StudioModuleSkeleton variant="default" />,
});

import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("Header");
  return {
    title: t("features.faceSwap.label"),
    description: t("features.faceSwap.description"),
  };
}

export default function Page() {
  return <PageClient />;
}
