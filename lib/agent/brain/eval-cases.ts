import type { AgentBrainDecision, AgentBrainRequest } from "@/lib/agent/brain/types";

export type BrainEvalCase = {
  id: string;
  title: string;
  request: AgentBrainRequest;
  expect: {
    action?: AgentBrainDecision["action"];
    module?: AgentBrainDecision["module"];
    visualTaskType?: NonNullable<AgentBrainDecision["visualTaskPlan"]>["taskType"];
    params?: Record<string, unknown>;
    mustClarify?: boolean;
  };
};

export const BRAIN_EVAL_CASES: BrainEvalCase[] = [
  {
    id: "commerce-detail-not-grass",
    title: "淘宝详情页不能误判成种草图",
    request: {
      userText: "根据这张图生成淘宝详情页",
      intentMode: "smart",
      images: [{ index: 1, url: "https://example.com/product.jpg", role: "source" }],
    },
    expect: {
      action: "generate",
      module: "general",
      visualTaskType: "commerce_detail",
    },
  },
  {
    id: "explicit-tryon-refs",
    title: "图2人物穿图1衣服要锁定图号关系",
    request: {
      userText: "图2人物穿图1衣服，然后生成4个不同姿势",
      intentMode: "smart",
      images: [
        { index: 1, url: "https://example.com/clothing.jpg", role: "clothing" },
        { index: 2, url: "https://example.com/person.jpg", role: "reference" },
      ],
    },
    expect: {
      action: "generate",
      module: "tryon",
      params: {
        clothing_urls: ["图1"],
        reference_url: "图2",
      },
    },
  },
  {
    id: "chat-mode-no-generation",
    title: "Chat 模式禁止生成",
    request: {
      userText: "生成一张时尚街拍",
      intentMode: "chat",
      images: [],
    },
    expect: {
      action: "chat",
      module: null,
    },
  },
  {
    id: "video-reserved",
    title: "视频能力预留但不执行",
    request: {
      userText: "把这张图做成走秀视频",
      intentMode: "smart",
      images: [{ index: 1, url: "https://example.com/person.jpg", role: "source" }],
    },
    expect: {
      action: "clarify",
      module: null,
      mustClarify: true,
    },
  },
  {
    id: "ambiguous-image-request",
    title: "模糊图片请求必须追问",
    request: {
      userText: "帮我搞一下",
      intentMode: "smart",
      images: [{ index: 1, url: "https://example.com/product.jpg", role: "auto" }],
    },
    expect: {
      action: "clarify",
      mustClarify: true,
    },
  },
];

export function evaluateBrainDecision(decision: AgentBrainDecision, testCase: BrainEvalCase) {
  const failures: string[] = [];
  const expected = testCase.expect;

  if (expected.action && decision.action !== expected.action) {
    failures.push(`action expected ${expected.action}, got ${decision.action}`);
  }
  if ("module" in expected && decision.module !== expected.module) {
    failures.push(`module expected ${expected.module}, got ${decision.module}`);
  }
  if (expected.visualTaskType && decision.visualTaskPlan?.taskType !== expected.visualTaskType) {
    failures.push(`visualTaskType expected ${expected.visualTaskType}, got ${decision.visualTaskPlan?.taskType || "none"}`);
  }
  if (expected.mustClarify && !decision.safety.requiresClarification && decision.action !== "clarify") {
    failures.push("expected clarification");
  }
  if (expected.params) {
    for (const [key, value] of Object.entries(expected.params)) {
      if (JSON.stringify(decision.params[key]) !== JSON.stringify(value)) {
        failures.push(`params.${key} expected ${JSON.stringify(value)}, got ${JSON.stringify(decision.params[key])}`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

