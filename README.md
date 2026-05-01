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
| 存储 | Supabase Storage | 服装/模特/参考图/结果图 |
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
# Supabase — https://supabase.com 免费创建项目
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# FASHN AI — https://fashn.ai 注册获取 API Key
FASHN_API_KEY=fashn_xxxxx

# Replicate — https://replicate.com 注册获取 Token
REPLICATE_API_TOKEN=r8_xxxxx
```

### 3. 初始化 Supabase

在 Supabase Dashboard → SQL Editor 中运行 `supabase/schema.sql` 创建所有表和策略。

然后在 Supabase Dashboard → Storage 中手动创建 4 个 Bucket（均设为 public）：
- `clothing`
- `models`
- `references`
- `results`

### 4. 启动

```bash
npm run dev
```

打开 http://localhost:3000

### 5. 添加预设模特和参考图

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
