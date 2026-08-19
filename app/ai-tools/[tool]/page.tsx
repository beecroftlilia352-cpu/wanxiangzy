import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AiToolboxExperience } from "@/features/ai-tools/AiToolboxExperience";
import { getAiToolUiConfig, isAiToolSlug } from "@/features/ai-tools/tool-ui-config";

type PageProps = {
  params: Promise<{ tool: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tool } = await params;
  if (!isAiToolSlug(tool)) return {};
  const config = getAiToolUiConfig(tool);
  return {
    title: `${config.title} · AI工具箱`,
    description: config.shortDescription,
  };
}

export default async function AiToolPage({ params }: PageProps) {
  const { tool } = await params;
  if (!isAiToolSlug(tool)) notFound();
  const config = getAiToolUiConfig(tool);
  return <AiToolboxExperience key={config.slug} config={config} />;
}
