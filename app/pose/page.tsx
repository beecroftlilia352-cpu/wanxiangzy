import dynamic from "next/dynamic";
import { StudioModuleSkeleton } from "@/components/studio/StudioModuleSkeleton";

const PageClient = dynamic(() => import("./page-client"), {
  loading: () => <StudioModuleSkeleton variant="pose" />,
});

export default function Page() {
  return <PageClient />;
}
