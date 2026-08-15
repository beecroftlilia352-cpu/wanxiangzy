import dynamic from "next/dynamic";
import { StudioModuleSkeleton } from "@/components/studio/StudioModuleSkeleton";

const PageClient = dynamic(() => import("./page-client"), {
  loading: () => <StudioModuleSkeleton variant="tryon" />,
});


import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations("Header");
  return {
    title: t("features.tryon.label"),
    description: t("features.tryon.description"),
  };
}

export default function Page() {
  return <PageClient />;
}
