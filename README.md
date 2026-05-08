# 万象衣造 AI｜VastWearGen — 智能虚拟换装

业内最佳实践的 AI 虚拟换装网站。上传服装，选择模特和参考图，AI 自动将衣服穿在参考图风格上，并替换为模特的面部。

## 技术栈

| 层 | 方案 | 说明 |
|---|---|---|
| 前端框架 | Next.js 15 + React 19 + TypeScript | App Router，全栈一体 |
| UI | Tailwind CSS + Radix Primitives + Lucide Icons | 现代组件化 |
| 状态管理 | Zustand | 轻量，支持 localStorage 缓存 |
| 认证 | Supabase Auth | 邮箱密码注册/登录，自动创建 profile |
| 数据库 | Supabase PostgreSQL | generations / models / profiles |
| 存储 | ImgBB 图床 + 存储适配器 | 用户上传图和生成结果图；Supabase Storage 保留为可替换方向 |
| **换装 AI** | **FASHN tryon-max** | 业内画质最强的虚拟换装 API |
| **人脸替换** | **Replicate InsightFaceSwap** | 人脸精确替换，自然融合 |
| 提示组件 | sonner | Toast 通知 |

## AI Pipeline

```
用户上传
  ├─ 服装图 (1-5 张)
  ├─ 模特脸部
  └─ 参考图 (姿势/场景/风格)
         │
         ▼
  ┌─────────────────────────────┐
  │ Step 1: FASHN tryon-max    │
  │ 衣服 + 参考图身体 → 换装图   │
  │ (保留参考图的姿势和背景)      │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │ Step 2: Replicate 人脸替换   │
  │ 换装图 + 模特脸部 → 最终成片  │
  │ (面部换成指定模特)            │
  └─────────────────────────────┘
```

## 快速开始

### 1. 安装依赖

```bash
cd ai-tryon
npm install
```

### 2. 配置环境变量

```bash
cp .env.local.example .env.local
```

填写以下内容：

```env
# Production required
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Feature required: image generation
LINGYA_BASE_URL=https://api.lingyaai.cn
LINGYA_API_KEY=your-lingya-api-key
PLATO_BASE_URL=https://api.bltcy.ai
PLATO_API_KEY=your-plato-api-key

# Feature required: prompt analysis / prompt optimization
ANALYZE_LLM_PROVIDER=xiaomi
XIAOMI_MIMO_API_KEY=your-xiaomi-mimo-api-key
XIAOMI_MIMO_BASE_URL=https://api.xiaomimimo.com
# tp- 开头的 Token Plan key 通常使用对应区域网关：
# XIAOMI_MIMO_BASE_URL=https://token-plan-sgp.xiaomimimo.com
XIAOMI_MIMO_MODEL=mimo-v2.5-pro
XIAOMI_MIMO_TEXT_MODEL=mimo-v2.5-pro
XIAOMI_MIMO_VISION_MODEL=mimo-v2.5

# Feature required: uploads and background processors
IMGBB_API_KEY=your-imgbb-api-key
JOB_PROCESSOR_SECRET=replace-with-at-least-32-random-characters
GENERATION_JOB_BATCH_SIZE=2
GENERATION_JOB_STALE_MINUTES=8

# Optional legacy providers
FASHN_API_KEY=
REPLICATE_API_TOKEN=
```

环境变量按三类处理：

- Production required: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`。生产环境必须设置 `NEXT_PUBLIC_APP_URL`，服务端生成公开图片 URL 时不会信任 forwarded host/proto 作为替代。
- Feature required: 对应功能实际被调用时必须设置，例如 `LINGYA_API_KEY` / `PLATO_API_KEY` 用于图像生成，`XIAOMI_MIMO_API_KEY` 用于小米提示词分析，`IMGBB_API_KEY` 用于上传，`JOB_PROCESSOR_SECRET` 或 `CRON_SECRET` 用于后台任务处理器。
- Optional: base URL、模型名、批处理大小、allowlist、legacy provider token 等可按部署需要覆盖。模块导入只会提示缺失项；具体运行路径需要某个值时才会报错。

生产环境的任务处理器密钥必须使用至少 32 个随机字符，不能使用 `change-me`、`secret`、`password` 等默认或弱值。`AGENT_WORKFLOW_PROCESSOR_SECRET` 和 `AGENT_EVAL_PROCESSOR_SECRET` 可作为 route-specific 覆盖；未设置时会回退到 `JOB_PROCESSOR_SECRET` 或 `CRON_SECRET`。

### 3. 初始化 Supabase

在 Supabase Dashboard → SQL Editor 中依次运行：
- `supabase/schema.sql`
- `supabase/credits-update.sql`
- `supabase/atomic-credit-rpc.sql`
- `supabase/agent-workflows.sql`
- `supabase/agent-brain-traces.sql`

当前上传和生成结果默认通过 ImgBB 图床保存，服务端统一走 `lib/api/image-storage.ts` 的存储适配器。Supabase Storage bucket 暂不作为默认运行依赖；如后续切换到 Supabase Storage，应在适配器中新增实现后再创建并配置对应 bucket/RLS。

### 4. 启动

```bash
npm run dev
```

打开 http://localhost:3000

### 5. 后台任务处理

生成接口会先写入 `generations.job_payload`，再由后台处理器认领执行。接口返回后即使运行环境中断，任务也能通过处理器继续恢复：

```bash
curl -H "Authorization: Bearer $JOB_PROCESSOR_SECRET" \
  http://localhost:3000/api/jobs/process-generations
```

生产环境建议配置定时任务每 1 分钟请求一次 `/api/jobs/process-generations`，使用强随机的 `JOB_PROCESSOR_SECRET` 或 `CRON_SECRET` 作为 Bearer Token。

智能 Agent 的多步骤视觉工作流使用独立处理器：

```bash
curl -H "Authorization: Bearer $JOB_PROCESSOR_SECRET" \
  http://localhost:3000/api/jobs/process-agent-workflows
```

生产环境建议同样每 1 分钟请求一次 `/api/jobs/process-agent-workflows`。如需隔离权限，可为该 route 单独设置 `AGENT_WORKFLOW_PROCESSOR_SECRET`。这个处理器负责执行文生图、图生图、换装、姿势裂变、3D 展示、电商详情页等 workflow step，并处理积分预占后的结算或释放。

Agent 质量闭环还提供两个生产处理器：

```bash
curl -H "Authorization: Bearer $JOB_PROCESSOR_SECRET" \
  http://localhost:3000/api/jobs/run-agent-evals
```

建议每天或每小时请求一次 `/api/jobs/run-agent-evals`。如需隔离权限，可为该 route 单独设置 `AGENT_EVAL_PROCESSOR_SECRET`。它会对近期使用过 Agent 的用户运行内置 eval + 用户差评沉淀 case，写入 `agent_eval_runs` 和 `agent_eval_results`，用于上线后回归评分。

生成 worker 内置视觉质量评估与一次自动修复重生策略：结果完成后会用视觉评估器检查数量、可访问性、任务一致性、人物/服装/版式风险；低于阈值时会自动追加修复提示词重生一次。可用 `AGENT_VISUAL_AUTO_REGENERATE_ENABLED=false` 关闭。

### 6. AWS Tag 自动部署

仓库内置 GitHub Actions：PR 和分支 push 会先运行 release gates；推送任意 Git tag 时，部署 workflow 会在上传发布包前运行同一组 gates，然后自动部署到 EC2。

先在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 添加：

```env
AWS_HOST=你的 EC2 公网 IP 或域名
AWS_USER=ec2-user
AWS_SSH_PRIVATE_KEY=你的 EC2 私钥内容
AWS_PORT=22
AWS_APP_DIR=/home/ec2-user/apps/wanxiangzy
AWS_APP_NAME=wanxiangzy
```

在 EC2 上只需手动创建一次生产环境文件：

```bash
mkdir -p ~/apps/wanxiangzy/shared
nano ~/apps/wanxiangzy/shared/.env.production
```

`.env.production` 至少需要包含 Production required 变量和部署启用功能对应的 Feature required 变量。特别注意：`NEXT_PUBLIC_APP_URL` 必须是线上公开域名，例如 `https://example.com`；后台处理器密钥必须是强随机值，不能沿用 `.env.local.example` 的占位值。

之后本地打 tag 并推送即可部署：

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 7. EdgeOne SSR 包体积检查

Tencent EdgeOne Cloud SSR Node functions 有 128 MiB 运行包限制。每次 `npm run build` 后可本地检查 `.next/server/server-reference-manifest`、`.next/standalone` 和 server chunks 的体积风险：

发布前运行完整检查；它会按顺序执行测试、提示词回归、干净生产构建和严格 SSR 包体积检查，失败时会停在首个失败步骤并给出下一步定位命令：

```bash
npm run check:release
```

```bash
npm run check:ssr-size
```

默认阈值为 128 MiB，超过 90% 会标记风险；风险输出会列出最大的 `.next/server` 文件、目录和可识别的 vendor chunk / route / trace 信息。单文件超过 8 MiB 会单独列出。可用环境变量调整：

```bash
SSR_SIZE_WARN_MIB=100 SSR_SIZE_LARGE_FILE_MIB=6 npm run check:ssr-size
```

如需在 CI 中让风险直接失败：

```bash
SSR_SIZE_FAIL_ON_RISK=1 npm run check:ssr-size
```

### 8. 添加预设模特和参考图

将模特头像放入 `public/models/`，参考图放入 `public/references/`：
- `public/models/female-1.jpg` ~ `female-3.jpg`
- `public/models/male-1.jpg` ~ `male-2.jpg`
- `public/references/pose-1.jpg`, `pose-2.jpg`
- `public/references/scene-1.jpg`, `scene-2.jpg`
- `public/references/style-1.jpg`, `style-2.jpg`

## 项目结构

```
ai-tryon/
├── app/
│   ├── api/tryon/route.ts    ← 核心 AI Pipeline API
│   ├── create/page.tsx        ← 换装工作流 (4 步)
│   ├── history/page.tsx       ← 历史记录
│   ├── login/page.tsx         ← 登录注册
│   └── layout.tsx             ← 全局布局
├── lib/
│   ├── api/
│   │   ├── fashn.ts           ← FASHN API 封装
│   │   └── face-swap.ts       ← Replicate 人脸替换封装
│   ├── store/tryon-store.ts   ← Zustand 状态管理
│   ├── supabase/              ← Supabase 客户端
│   └── utils.ts               ← 工具函数
├── types/index.ts             ← TypeScript 类型
├── supabase/schema.sql        ← 数据库初始化 SQL
└── middleware.ts               ← Auth 路由保护
```

## 成本估算

| API | 单价 | 每次生成 (1 件衣服) |
|---|---|---|
| FASHN tryon-max | ~4 credits/次 | ~$0.04 |
| Replicate face swap | ~$0.005/次 | ~$0.005 |
| **合计** | | **~$0.045** |

生成 5 件衣服的一次完整流程约 $0.05。

## 后续扩展方向

- 支付系统 (Stripe / 微信支付) 购买 credits
- OAuth 登录 (Google / GitHub / 微信)
- 批量队列和异步通知
- 用户自定义上传模特/参考图
- 视频换装 (FASHN Video Try-On)
- 社交分享功能
