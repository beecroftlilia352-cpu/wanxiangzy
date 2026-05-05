# 生产级视觉 Workflow Agent 架构设计

## 1. 目标定位

本项目最终要做的不是一个普通生图页面，也不是一组孤立模块，而是一个 GPT-like 的统一 AI 助手，底层具备生产级视觉任务工作流能力。

用户只需要像和 GPT 对话一样输入自然语言、上传图片。系统自动判断本轮是普通聊天、图片分析、单步生图，还是需要拆成多步骤视觉工作流。凡是涉及扣积分、调用生成模型、创建资产的动作，都必须先生成确认卡，用户确认后才执行。

最终产品形态：

```text
统一 AI 助手
  - 像 GPT 一样聊天、分析、追问、解释
  - 自动规划文生图、图生图、换装、姿势裂变、3D、电商图等任务
  - 多步骤任务以 workflow 卡片展示
  - 每一步可追踪、可重试、可编辑、可选择结果继续
  - 视频能力先不启用，但架构从第一天预留
```

核心原则：

```text
一个入口，两个内核：
Conversation Engine 负责自然对话；
Workflow Engine 负责生产级视觉任务执行。
```

## 2. 顶级流程总览

```text
1. 用户输入
   文本、图片、历史上下文、当前任务上下文

2. Context Builder
   整理当前会话、图片角色、用户偏好、历史任务、可用工具

3. Intent Router
   判断本轮消息进入哪条路径：
   - 普通聊天
   - 图片分析
   - 新建 workflow
   - 修改已有 workflow
   - 重试/继续某一步

4. Conversation Engine
   如果只是聊天，像 GPT 一样回答，不生成、不扣分

5. Workflow Planner
   如果是生产任务，用 LLM 根据 Tool Registry 生成结构化计划

6. Plan Validator
   校验工具是否存在、图片是否齐、依赖是否正确、模型是否支持、是否违反用户约束

7. Plan Repair
   轻微问题自动修复；缺关键信息则追问用户

8. Cost Estimator
   估算每一步积分和总成本

9. Confirmation Card
   展示任务目标、步骤、输入图片、预估成本、风险、自检项

10. 用户确认
    确认后才预占积分和创建正式 workflow

11. Workflow Runtime
    将 workflow 入队，后台 worker 按 DAG 执行步骤

12. Step Executor
    每个步骤通过统一 Model Gateway 调用模型

13. Quality Check
    每步完成后检查图片数量、比例、URL、空白、失败格式、基础质量

14. Asset Storage
    所有中间图、最终图、未来视频都资产化保存

15. Event Log / Tracing
    记录每次规划、校验、执行、重试、失败、扣费、完成

16. Credit Settlement
    成功步骤结算，失败或取消释放未使用积分

17. Human-in-the-loop
    用户可选择图、编辑提示词、重试单步、跳过单步、从某一步继续

18. Memory / Preference
    记录用户偏好，但只作为建议，不覆盖用户本轮明确指令
```

## 3. 系统分层

```text
app/
  api/
    agent/
      chat/
      workflows/
        plan/
        route.ts
        [id]/
          route.ts
          confirm/
          run/
          cancel/
          steps/[stepId]/retry/
          steps/[stepId]/edit/
          steps/[stepId]/select/
          steps/[stepId]/skip/
    jobs/
      process-agent-workflows/

lib/
  agent/
    workflow/
      types.ts
      tools.ts
      planner.ts
      validator.ts
      repair.ts
      cost.ts
      runtime.ts
      scheduler.ts
      repository.ts
      events.ts
      assets.ts
      quality.ts
      idempotency.ts
      model-gateway.ts
      model-capabilities.ts
      executors/
        text-to-image.ts
        image-to-image.ts
        tryon.ts
        pose-variation.ts
        garment-3d.ts
        commerce-detail.ts
        commerce-creative.ts
        background-replace.ts
        select-image.ts
        image-quality-check.ts
        prompt-repair.ts
        image-to-video.ts
        image-to-3d-asset.ts
    memory/
      user-preferences.ts
      task-context.ts
```

设计要求：

- Route Handler 只做认证、限流、创建任务、查询状态，不同步执行长任务。
- Worker/Job Processor 执行模型调用和 workflow step。
- 所有外部模型调用统一走 Model Gateway。
- Supabase Admin Client 保持懒初始化，避免 Next build 阶段读取运行时环境失败。

## 4. 入口模式设计

不要把聊天和工作流拆成两个割裂产品。行业最佳实践是统一入口，轻量模式控制。

前端可提供三个模式：

```text
智能模式 Auto       默认
纯聊天 Chat        只回答、分析、追问，不生成、不扣分
生产模式 Agent     更主动拆步骤、规划 workflow，但仍需确认后执行
```

行为示例：

```text
“这件衣服适合什么场景？”
-> Conversation Engine，普通分析

“图1人物穿图2衣服，再生成4个姿势”
-> Workflow Planner，生成确认卡

“不要生成，先分析一下”
-> Conversation Engine，即使在 Auto 模式也不生成

“继续用第2张做姿势”
-> 修改当前 workflow 或从指定 asset 继续
```

关键边界：

- 聊天消息和 workflow 状态必须分离存储。
- 当前任务上下文需要显式提示用户，例如“当前正在编辑：姿势裂变任务”。
- 用户必须能退出任务上下文，回到普通聊天。

## 5. Tool Registry 能力注册表

所有能力都作为 Tool 注册，不在业务里到处写 `if type === ...`。

### 5.1 第一版启用工具

```text
基础生成
- text_to_image
- image_to_image

服装专项
- tryon
- pose_variation
- garment_3d

电商专项
- commerce_detail
- commerce_creative
- background_replace

流程辅助
- select_image
- image_quality_check
- prompt_repair
```

### 5.2 预留但禁用工具

```text
未来预留
- image_to_video       disabled
- image_to_3d_asset    disabled
```

### 5.3 ToolDefinition

```ts
type ToolDefinition = {
  type: WorkflowToolType;
  enabled: boolean;
  title: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  requiredCapabilities: ModelCapabilityKey[];
  costPolicy: ToolCostPolicy;
  retryPolicy: ToolRetryPolicy;
  riskLevel: "low" | "medium" | "high";
};
```

### 5.4 3D 模块地位

`garment_3d` 必须和 `tryon`、`pose_variation` 同级，不是附属功能。

当前启用：

```text
garment_3d
用途：根据服装或商品图生成 3D 展示感图片、悬浮展示、立体商品图、电商详情页素材。
```

未来预留：

```text
image_to_3d_asset
用途：生成真实 3D 模型文件、旋转视图、GLB/OBJ/AR 资产。
状态：disabled。
```

3D 输入风险：

- 适合：平铺服装图、单品商品图、白底商品图、清晰服装正面图。
- 高风险：复杂街拍图、多人图、背景混乱图、已经姿势裂变后的图片。

Validator 遇到高风险输入时不一定阻断，但必须在确认卡里提示风险。

## 6. LLM Planner

Planner 负责语义理解和计划生成，但不直接执行。

### 6.1 输入

```ts
type PlannerInput = {
  userText: string;
  images: WorkflowInputImage[];
  conversationSummary?: string;
  activeWorkflow?: WorkflowContext | null;
  userPreferences?: UserPreferenceSnapshot;
  toolCatalog: ToolDefinition[];
  mode: "auto" | "chat" | "agent";
};
```

### 6.2 输出

Planner 必须输出结构化 JSON，并经过 schema 校验。

```ts
type WorkflowPlan = {
  intent: string;
  summary: string;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion?: string;
  imageRoles: ImageRoleResolution[];
  userConstraints: string[];
  assumptions: string[];
  steps: WorkflowStepPlan[];
};
```

### 6.3 Step Plan

```ts
type WorkflowStepPlan = {
  id: string;
  type: WorkflowToolType;
  title: string;
  dependsOn: string[];
  input: Record<string, unknown>;
  params: Record<string, unknown>;
  expectedOutput: WorkflowStepOutputShape;
  riskNotes?: string[];
};
```

### 6.4 Planner 原则

- 不根据关键词机械匹配，要根据真实意图判断。
- 用户说法不固定也要识别，例如“让这个人穿那件衣服”应规划为 `tryon`。
- 如果需要多个工具，按依赖顺序拆分。
- 如果缺图片角色或关键目标，返回 clarification，不要硬执行。
- 用户否定条件优先级高于模型联想，例如“不要种草”必须进入 `userConstraints`。

## 7. Validator 与 Repair

LLM 负责聪明，Validator 负责靠谱。

### 7.1 Validator 必查项

```text
1. step type 是否存在
2. tool 是否 enabled
3. step 依赖是否成环
4. step 数是否超过上限
5. 输入图片是否存在
6. 图片角色是否冲突
7. 模型是否支持该能力
8. 用户否定条件是否被违反
9. 视频/真 3D 是否 disabled
10. 成本是否超过用户或系统上限
11. 是否需要用户确认
12. 是否能降级或自动修复
```

### 7.2 Repair 策略

轻微问题可自动修复：

```text
- 图片引用“图一”规范化成“图1”
- 缺少 aspectRatio 时按工具默认补齐
- 用户要详情页但 planner 混入种草描述时移除冲突描述
- 视频 disabled 时移除视频 step，并保留“可用于视频的最终图片”说明
```

关键问题必须追问：

```text
- 多张图但无法判断人物图/服装图
- 用户要求换装但没有服装图
- 用户要求背景替换但没有明确原图
- 成本超过上限
```

### 7.3 Validator 输出

```ts
type PlanValidationResult = {
  ok: boolean;
  repairedPlan?: WorkflowPlan;
  errors: PlanValidationIssue[];
  warnings: PlanValidationIssue[];
  clarificationQuestion?: string;
  blockedStepIds: string[];
};
```

## 8. Workflow Runtime

### 8.1 Workflow 状态

```text
draft
planned
needs_confirmation
confirmed
queued
running
waiting_user
completed
partially_completed
failed
cancelled
```

### 8.2 Step 状态

```text
pending
ready
queued
running
completed
failed
skipped
waiting_user
cancelled
```

### 8.3 执行规则

- Runtime 按 DAG 执行 step。
- 一个 step 只有在所有依赖 completed 后才进入 ready。
- `select_image` 可以自动执行，也可以进入 `waiting_user`。
- 单步失败不应直接废掉整个 workflow，除非该 step 是关键依赖且无法跳过。
- workflow 允许 `partially_completed`，用户可以从已完成 step 继续。

## 9. Queue / Worker

生产环境不能把长任务放在普通 API 请求里同步跑。

推荐 EC2 部署：

```text
Next.js API
  ↓
Supabase/Postgres
  ↓
Redis + BullMQ
  ↓
PM2 Worker
  ↓
Model Gateway
```

如果第一阶段暂时没有 Redis，也要保留队列抽象：

```ts
type WorkflowScheduler = {
  enqueueWorkflow(workflowId: string): Promise<void>;
  enqueueStep(workflowId: string, stepId: string): Promise<void>;
};
```

这样可以先用数据库轮询 processor，后面无痛切 BullMQ。

## 10. Model Gateway

Executor 不直接调用灵芽、小米、OpenAI、豆包或未来视频模型，统一走 Model Gateway。

职责：

```text
- provider routing
- timeout
- retry
- fallback
- model capability check
- request normalization
- response normalization
- error classification
- prompt trace
```

### 10.1 Model Capability Registry

```ts
type ModelCapability = {
  model: string;
  provider: string;
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  supportsMultiImage: boolean;
  supportsVideo: boolean;
  supports3dAsset: boolean;
  supportedRatios: string[];
  supportedSizes: string[];
  maxImages: number;
  maxPromptLength: number;
};
```

Planner 决定“要做什么”，Validator/Gateway 决定“当前模型能不能做”。

## 11. Executor 设计

每个工具一个 executor。

```ts
type StepExecutor = {
  type: WorkflowToolType;
  execute(input: StepExecutionInput): Promise<StepExecutionResult>;
};
```

### 11.1 输出标准

```ts
type StepExecutionResult = {
  output: {
    imageUrls?: string[];
    videoUrls?: string[];
    selectedImageUrl?: string;
    assetIds?: string[];
    text?: string;
  };
  promptTrace?: PromptTraceItem[];
  providerTrace?: ProviderTraceItem[];
  quality?: QualityCheckResult;
};
```

### 11.2 必须支持的 executor

```text
text_to_image
image_to_image
tryon
pose_variation
garment_3d
commerce_detail
commerce_creative
background_replace
select_image
image_quality_check
prompt_repair
```

### 11.3 预留 executor

```text
image_to_video
image_to_3d_asset
```

预留 executor 必须存在，但 `enabled=false`，调用时由 Validator 阻断。

## 12. Cost / Credit 体系

多步骤任务必须先预估、再预占、后结算。

```text
plan
  ↓
estimate cost
  ↓
user confirm
  ↓
reserve credits
  ↓
run workflow
  ↓
settle completed steps
  ↓
release unused credits
```

### 12.1 费用模型

```ts
type WorkflowCostEstimate = {
  total: number;
  reserve: number;
  currency: "credits";
  steps: Array<{
    stepId: string;
    toolType: WorkflowToolType;
    estimatedCredits: number;
    reason: string;
  }>;
};
```

### 12.2 补偿逻辑

场景：

```text
tryon 成功，pose 失败
```

系统应支持：

- tryon 已成功资产保留。
- pose 未成功部分释放积分。
- workflow 标记为 `partially_completed` 或 `failed`，取决于是否还有可用输出。
- 用户可以从 tryon 结果继续重试 pose。

## 13. 数据库设计

### 13.1 agent_workflows

```sql
agent_workflows
- id uuid primary key
- user_id uuid not null
- conversation_id uuid
- status text not null
- intent text
- summary text
- mode text
- input_images jsonb
- active_plan_version_id uuid
- final_outputs jsonb
- cost_estimate jsonb
- cost_reserved integer
- cost_settled integer
- idempotency_key text
- error_message text
- created_at timestamptz
- updated_at timestamptz
```

### 13.2 agent_workflow_steps

```sql
agent_workflow_steps
- id uuid primary key
- workflow_id uuid not null
- step_key text not null
- type text not null
- title text not null
- status text not null
- depends_on text[]
- input jsonb
- params jsonb
- output jsonb
- quality jsonb
- error_message text
- retry_count integer
- started_at timestamptz
- completed_at timestamptz
- created_at timestamptz
- updated_at timestamptz
```

### 13.3 agent_workflow_events

```sql
agent_workflow_events
- id uuid primary key
- workflow_id uuid not null
- step_id uuid
- type text not null
- message text
- payload jsonb
- created_at timestamptz
```

### 13.4 agent_plan_versions

```sql
agent_plan_versions
- id uuid primary key
- workflow_id uuid
- user_id uuid not null
- version integer not null
- source text not null
- plan jsonb not null
- validation jsonb
- created_at timestamptz
```

必须保存：

```text
plan_v1 planner 原始输出
plan_v2 validator/repair 后输出
plan_v3 用户编辑后输出
```

### 13.5 agent_assets

```sql
agent_assets
- id uuid primary key
- user_id uuid not null
- workflow_id uuid
- step_id uuid
- kind text not null -- image | video | 3d_asset
- role text not null -- source | intermediate | final
- url text not null
- provider text
- model text
- metadata jsonb
- created_at timestamptz
```

### 13.6 agent_tool_runs

```sql
agent_tool_runs
- id uuid primary key
- workflow_id uuid not null
- step_id uuid not null
- tool_type text not null
- provider text
- model text
- request jsonb
- response jsonb
- status text
- error_message text
- latency_ms integer
- created_at timestamptz
```

### 13.7 agent_credit_reservations

```sql
agent_credit_reservations
- id uuid primary key
- user_id uuid not null
- workflow_id uuid not null
- amount_reserved integer not null
- amount_settled integer not null default 0
- amount_released integer not null default 0
- status text not null
- created_at timestamptz
- updated_at timestamptz
```

### 13.8 agent_user_preferences

```sql
agent_user_preferences
- user_id uuid primary key
- preferences jsonb not null
- updated_at timestamptz
```

## 14. API 设计

### 14.1 Plan

```text
POST /api/agent/workflows/plan
```

作用：

- 只生成计划和确认卡，不扣积分。
- 返回 plan、validation、costEstimate、confirmation。

### 14.2 Create

```text
POST /api/agent/workflows
```

作用：

- 创建 draft/planned workflow。
- 保存 plan_versions。

### 14.3 Confirm

```text
POST /api/agent/workflows/[id]/confirm
```

作用：

- 幂等确认。
- 预占积分。
- 状态进入 confirmed/queued。

### 14.4 Run

```text
POST /api/agent/workflows/[id]/run
```

作用：

- 将 workflow 入队。
- 不同步执行长任务。

### 14.5 Query

```text
GET /api/agent/workflows/[id]
```

作用：

- 查询 workflow、steps、events、assets。
- 前端轮询使用。

### 14.6 Step 操作

```text
POST /api/agent/workflows/[id]/steps/[stepId]/retry
POST /api/agent/workflows/[id]/steps/[stepId]/edit
POST /api/agent/workflows/[id]/steps/[stepId]/select
POST /api/agent/workflows/[id]/steps/[stepId]/skip
```

所有 mutation API 必须支持 idempotency key。

## 15. 幂等与并发

必须处理：

```text
- 用户重复点击确认
- 前端请求重试
- 浏览器刷新后重新提交
- worker 重复领取任务
- 同一步重复执行
```

策略：

- Confirm/Create API 使用 `idempotency_key`。
- Workflow step 领取使用数据库行锁或 queue lock。
- step 执行前检查状态，只允许 ready/queued/failed retry 进入 running。
- 结算积分时基于 reservation 状态做幂等。

## 16. Event Log / Observability

事件必须覆盖：

```text
plan_created
plan_validated
plan_repaired
workflow_created
workflow_confirmed
credit_reserved
workflow_queued
step_queued
step_started
provider_called
asset_uploaded
quality_checked
step_completed
step_failed
step_retried
step_skipped
workflow_completed
workflow_partially_completed
workflow_failed
credit_settled
credit_released
```

生产排障必须能回答：

```text
为什么这样规划？
Validator 改了什么？
调用了哪个模型？
扣了多少积分？
哪一步失败？
失败是否已退款/释放？
用户是否编辑过计划？
```

## 17. Quality Check

第一版规则检查：

```text
- URL 是否可访问
- 返回数量是否符合预期
- 文件大小是否合理
- 图片是否疑似空白
- 图片比例是否和目标接近
- provider 返回格式是否正确
- 多图任务是否缺图
```

后续视觉模型检查：

```text
- 人脸一致性
- 服装一致性
- 手指/肢体异常
- 文字乱码
- 详情页是否有分区
- 3D 展示是否主体完整
```

Quality Check 的结果必须进入 step output 和 event log。

## 18. 安全与风控

必须具备：

```text
- 用户级 rate limit
- workflow 最大 step 数
- 单任务最大积分成本
- 单用户并发 workflow 限制
- 图片大小限制
- 图片格式限制
- 外链下载超时
- 禁止内网 URL / SSRF
- prompt injection 防护
- disabled tool 阻断
- 敏感内容兜底
- admin/worker 接口 secret 校验
```

## 19. 前端体验

核心 UI 是 GPT-like 聊天 + workflow 卡片。

### 19.1 Confirmation Card

展示：

```text
- 用户目标
- AI 理解
- 图片角色
- 执行步骤
- 每步预计成本
- 总成本
- 风险预判
- 生成前自检
- 用户明确边界
- 确认按钮
```

### 19.2 Workflow Card

每个 step 显示：

```text
- 状态：等待、进行中、完成、失败、等待用户
- 输入
- 输出
- 事件摘要
- 重试
- 编辑提示词重试
- 选择某张图继续
- 跳过
- 查看失败原因
```

结果布局：

```text
1 张：大图
2 张：双列
3-4 张：网格
多步骤：结果挂在对应 step 下，不堆到聊天底部
```

## 20. 视频预留

第一版不启用视频，但必须完整预留：

```ts
image_to_video: {
  enabled: false,
  inputSchema: {
    sourceImage: "asset_ref",
    motionPrompt: "string",
    duration: "number"
  },
  outputSchema: {
    videoUrls: "string[]"
  }
}
```

Validator 遇到视频需求：

```text
当前视频能力未开启，我可以先完成图片链路，并保留可用于视频生成的最终图片。
```

以后启用视频，只新增 executor 和 provider adapter，不修改 planner/runtime/database/UI 主结构。

## 21. 上线验收标准

达到生产级必须满足：

```text
1. 普通聊天不会误触发扣费任务
2. 所有生成任务必须确认后执行
3. 文生图、图生图、换装、姿势、3D、电商图都通过 Tool Registry 接入
4. 多步骤 workflow 可追踪、可重试、可部分完成
5. 每一步都写 event log
6. 每个结果都写 asset
7. 积分支持预占、结算、释放
8. API 支持幂等
9. Worker 可重复领取但不会重复执行同一步
10. 模型调用统一走 Model Gateway
11. disabled 的视频/真 3D 工具不会被执行
12. 前端能展示计划、成本、步骤、结果、失败和重试
13. 线上失败能通过事件和 tool run 记录定位
```

## 22. 第一阶段落地顺序

虽然目标不是 MVP，但落地仍需按依赖顺序推进。

```text
1. workflow types
2. tool registry
3. model capability registry
4. planner
5. validator / repair
6. cost estimator
7. database migration
8. repository / events / assets
9. plan API
10. create / confirm / query API
11. runtime / scheduler
12. executors
13. worker processor
14. workflow card UI
15. step retry / select / edit / skip
16. quality check
17. credit reservation / settlement
18. production hardening
```

## 23. 最终判断

这套架构达到顶级生产级的关键是：

```text
用户感觉它像 GPT 一样自然；
系统内部像工作流平台一样可靠；
所有能力都可插拔；
所有步骤都可追踪；
所有失败都可恢复；
所有扣费都可解释；
未来视频接入不推翻架构。
```

最终一句话：

```text
一个入口，两个内核：
Conversation Engine 负责像 GPT 一样聊天；
Workflow Engine 负责生产级视觉任务执行；
Intent Router、Tool Registry、Validator、Runtime、Model Gateway、Event Log 和 Credit System 共同保证它可上线、可扩展、可排障。
```
