import { AdminFeaturesClient } from "@/components/admin/AdminFeaturesClient";
import { getAdminFeatureRegistry } from "@/lib/admin/features";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  const registry = await getAdminFeatureRegistry();

  return <AdminFeaturesClient registry={registry} />;
}
