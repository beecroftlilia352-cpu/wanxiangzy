import { AdminShowcaseExamplesClient } from "@/components/admin/AdminShowcaseExamplesClient";
import { getStudioShowcaseRegistry } from "@/lib/showcase-examples.server";

export const dynamic = "force-dynamic";

export default async function AdminShowcasePage() {
  const registry = await getStudioShowcaseRegistry();
  return <AdminShowcaseExamplesClient registry={registry} />;
}
