export type AdminAssetListItem = {
  id: string;
  userId: string;
  sourceType: "generation" | "reference" | "favorite-plan";
  module: string;
  moduleLabel: string;
  title: string;
  status: string;
  urls: string[];
  inputUrls: string[];
  createdAt: string | null;
  updatedAt: string | null;
  detailUrl: string;
  moderationCase?: AdminModerationCase | null;
};

export type AdminAssetList = {
  rows: AdminAssetListItem[];
  total: number;
  warnings: string[];
};

export type AdminAssetStorageProvider = "aliyun-oss" | "imgbb" | "data-url" | "external" | "unknown";

export type AdminAssetLifecycleStage = "protected" | "retained" | "migrate" | "review" | "archive";

export type AdminAssetLifecycleAction =
  | "retain"
  | "migrate_to_oss"
  | "review_temp_inputs"
  | "archive_generated_result"
  | "freeze_and_hide";

export type AdminAssetLifecyclePolicy = {
  id: string;
  title: string;
  description: string;
  stage: AdminAssetLifecycleStage;
  action: AdminAssetLifecycleAction;
  threshold: string;
};

export type AdminAssetLifecycleItem = AdminAssetListItem & {
  providers: AdminAssetStorageProvider[];
  urlCount: number;
  inputCount: number;
  ageDays: number;
  stage: AdminAssetLifecycleStage;
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
  recommendedAction: AdminAssetLifecycleAction;
  moderationAction: string | null;
};

export type AdminAssetLifecycleOverview = {
  generatedAt: string;
  rows: AdminAssetLifecycleItem[];
  policies: AdminAssetLifecyclePolicy[];
  metrics: {
    sampledAssets: number;
    sampledUrls: number;
    ossUrls: number;
    imgbbUrls: number;
    externalUrls: number;
    dataUrls: number;
    unknownUrls: number;
    migrationCandidates: number;
    archiveCandidates: number;
    protectedAssets: number;
    reviewCandidates: number;
    hiddenAssets: number;
  };
  warnings: string[];
};

export type AdminModerationCase = {
  id: string;
  sourceType: string;
  sourceId: string;
  action: string;
  status: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
};

export type AdminModerationList = {
  rows: AdminModerationCase[];
  available: boolean;
  warnings: string[];
};
