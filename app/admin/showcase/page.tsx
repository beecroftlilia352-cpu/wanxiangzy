import { AdminShowcaseExamplesClient } from "@/components/admin/AdminShowcaseExamplesClient";
import { requireAdmin } from "@/lib/admin/auth";
import { getStudioShowcaseRegistry } from "@/lib/showcase-examples.server";
import { SHOWCASE_MODULES } from "@/lib/showcase-examples";

export const dynamic = "force-dynamic";

export default async function AdminShowcasePage() {
  await requireAdmin("assets:read");
  const registries = await Promise.all(SHOWCASE_MODULES.map((module) => getStudioShowcaseRegistry(module)));
  return <AdminShowcaseExamplesClient registries={registries} />;
}
