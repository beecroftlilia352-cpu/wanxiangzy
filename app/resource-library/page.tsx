import { getTranslations } from "next-intl/server";
import { ResourceLibraryPage } from "@/features/resource-library/ResourceLibraryPage";

export async function generateMetadata() {
  const t = await getTranslations("ResourceLibrary");
  return { title: t("page.title"), description: t("page.description") };
}

export default function Page() {
  return <ResourceLibraryPage />;
}
