import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Copy,
  ExternalLink,
  PanelTop,
  Quote,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { HeroGradientMotion } from "@/components/home/HeroGradientMotion";
import { codexTheme } from "@/lib/design/codex-theme";

const heroStats = ["服装硬参考", "模特参考", "姿势参考", "商品主图"];

const featureRows = [
  {
    eyebrow: "Feature 01",
    title: "为真实服装视觉生产而打造",
    body: "从常规上新图到高要求的品牌大片，VastWearGen 都能把服装、模特、姿势和场景拆成清晰的输入角色，让团队稳定生成可交付的视觉结果。",
    visual: "composer",
  },
  {
    eyebrow: "Feature 02",
    title: "专为多素材工作流而设计",
    body: "同一条任务可以同时管理服装图、专属模特、背景参考、姿势参考和历史作品。每个素材都有明确归属，避免反复上传、重复解释和结果不可追溯。",
    visual: "workspace",
  },
  {
    eyebrow: "Feature 03",
    title: "全面提升团队的出图标准",
    body: "生成前锁定参考，生成中记录参数，生成后沉淀到作品库。运营、设计和拍摄团队可以用同一套标准复用成功方案，从源头降低返工。",
    visual: "quality",
  },
];

const sceneCards = [
  {
    title: "服装上身",
    description: "保留版型、颜色和细节，生成真人模特上身效果。",
    image: "/home-showcase/model-striped-top-white-skirt.png",
    href: "/create",
  },
  {
    title: "商品套图",
    description: "主图、辅图、详情图按同一视觉体系批量输出。",
    image: "/home-showcase/model-black-crop-widepants.png",
    href: "/product-set",
  },
  {
    title: "终端式工作流",
    description: "用自然语言描述任务，快速串联素材、生成和复用。",
    image: "/home-showcase/pose-grid-black-outfit.png",
    href: "/agent",
  },
];

const quickTools = [
  {
    title: "在 VastWearGen 应用中开始",
    action: "进入服装上身",
    href: "/create",
    icon: PanelTop,
    image: "/home-showcase/model-white-top-denim-shorts.jpg",
  },
  {
    title: "前往工作流助理",
    action: "打开 AI 助理",
    href: "/agent",
    icon: WandSparkles,
    image: "/home-showcase/background-male-jacket.webp",
  },
  {
    title: "在素材工具中继续操作",
    action: "$ generate /product-set",
    href: "/general-image",
    icon: Code2,
    image: "/home-showcase/garment-blue-hoodie-3d.png",
  },
];

const testimonials = [
  {
    quote: "我们把上新前的试拍周期从两天压到半天，最关键的是服装细节能被稳定保留下来。",
    name: "女装品牌运营负责人",
  },
  {
    quote: "以前不同设计师做出来的图风格差很多，现在用同一套模特和参数，整个店铺看起来统一多了。",
    name: "独立设计师工作室",
  },
  {
    quote: "商品套图和种草封面可以一起规划，运营同学不用在十几个工具之间来回切。",
    name: "电商内容团队",
  },
  {
    quote: "历史作品能直接复用参数，这对爆款补图特别有用，返工少了很多。",
    name: "跨境服饰卖家",
  },
  {
    quote: "模特、姿势、背景分得很清楚，新同事也能照着流程把图做对。",
    name: "摄影制片团队",
  },
  {
    quote: "我们最喜欢的是失败任务可以带着原参数重试，排查问题比以前容易很多。",
    name: "品牌视觉负责人",
  },
];

const footerGroups = [
  {
    title: "产品",
    links: [
      ["服装上身", "/create"],
      ["商品套图", "/product-set"],
      ["种草图", "/grass"],
      ["换背景", "/model-background"],
      ["姿势裂变", "/pose"],
    ],
  },
  {
    title: "工作流",
    links: [
      ["工作流助理", "/agent"],
      ["素材生成", "/general-image"],
      ["专属模特", "/model"],
      ["服装 3D", "/garment-3d"],
    ],
  },
  {
    title: "资源",
    links: [
      ["作品库", "/history"],
      ["API 测试", "/api-platform-test"],
      ["模特库", "/model"],
      ["图片工具", "/general-image/image-to-image"],
    ],
  },
  {
    title: "公司",
    links: [
      ["关于我们", "/"],
      ["案例", "/history"],
      ["价格", "/create"],
      ["登录", "/login"],
    ],
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#030303] text-white">
      <section className="relative isolate min-h-[calc(100dvh-64px)] overflow-hidden bg-[#8aa8ff] text-[#050505]">
        <HeroGradient />
        <div className="relative mx-auto flex min-h-[calc(100dvh-64px)] max-w-[1440px] flex-col items-center px-5 pb-0 pt-20 text-center sm:px-8 lg:px-10">
          <div className="home-logo-tile">
            <Image src="/gemini-icon.png" alt="" width={52} height={52} className="h-[52px] w-[52px] object-contain" priority />
          </div>

          <h1 className="mt-7 text-[52px] font-semibold leading-none text-[#07101d] sm:text-[60px] lg:text-[68px]">
            {codexTheme.brand.name}
          </h1>
          <p className="mt-7 max-w-[760px] text-[17px] font-semibold leading-8 text-[#07101d]/82 sm:text-[19px]">
            面向服装品牌、电商团队和内容团队的 AI 服装视觉生产智能体。
          </p>
          <p className="mt-2 max-w-[760px] text-[15px] leading-7 text-[#1d2940]/68">
            上传服装、模特、姿势和背景参考，一次完成上身图、商品套图、种草封面与可复用的视觉工作流。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/create" className="home-button home-button-dark">
              立即进入工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/agent" className="home-button home-button-soft">
              Explore workflows
            </Link>
          </div>

          <p className="mt-7 text-[13px] font-semibold text-[#29354d]/58">
            支持服装上身、商品套图、换背景、姿势裂变、专属模特和服装 3D
          </p>

          <HeroConsole />
        </div>
      </section>

      <main className="bg-[#030303] text-white">
        <section className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-10">
          <div className="space-y-40">
            {featureRows.map((feature, index) => (
              <FeatureStrip key={feature.title} feature={feature} index={index} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[760px] text-center">
            <h2 className="text-[40px] font-semibold leading-tight sm:text-[52px]">在每个上新场景中使用同一智能体</h2>
            <p className="mt-5 text-[16px] leading-8 text-white/70">
              在多个页面和环境中使用 VastWearGen，并通过你的团队素材库实现统一连接。
            </p>
            <Link href="/agent" className="home-button home-button-light mt-8">
              详情请参阅工作流文档
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-16 grid gap-5 lg:grid-cols-3">
            {sceneCards.map((card) => (
              <Link key={card.title} href={card.href} className="home-scene-card group">
                <div className="relative aspect-[1.18] overflow-hidden bg-[#171717]">
                  <Image
                    src={card.image}
                    alt={card.title}
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover object-top opacity-80 transition duration-500 group-hover:scale-[1.035]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#101010]/6 via-[#101010]/12 to-[#101010]/88" />
                </div>
                <div className="p-6">
                  <h3 className="text-[22px] font-semibold leading-tight">{card.title}</h3>
                  <p className="mt-3 text-[14px] leading-6 text-white/62">{card.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-28 sm:px-8 lg:px-10">
          <div className="grid gap-5 lg:grid-cols-3">
            {quickTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link key={tool.title} href={tool.href} className="home-tool-card group">
                  <div className="relative aspect-[1.22] overflow-hidden bg-[#111]">
                    <Image
                      src={tool.image}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="object-cover object-top opacity-72 transition duration-500 group-hover:scale-[1.035]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#202020]" />
                    <div className="absolute inset-x-5 bottom-5 rounded-lg border border-white/12 bg-[#071b32]/72 p-4 text-left backdrop-blur-md">
                      <Icon className="h-6 w-6 text-[#dbe8ff]" />
                      <p className="mt-4 text-[15px] font-semibold text-white/88">{tool.title}</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <span className="home-button home-button-light w-full">
                      {tool.action}
                      {tool.action.startsWith("$") ? <Copy className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-5 pb-28 sm:px-8 lg:px-10">
          <h2 className="text-center text-[40px] font-semibold leading-tight sm:text-[52px]">用户正在这样分享</h2>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((item) => (
              <article key={item.name} className="home-testimonial">
                <Quote className="h-7 w-7 text-white/38" />
                <p className="mt-8 text-[18px] font-semibold leading-8 text-white/88">“{item.quote}”</p>
                <p className="mt-9 text-[13px] font-semibold text-white/48">{item.name}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="relative isolate overflow-hidden">
          <HeroGradient compact />
          <div className="relative mx-auto flex min-h-[520px] max-w-[1440px] flex-col items-center justify-center px-5 py-24 text-center text-[#dbe8ff] sm:px-8 lg:px-10">
            <h2 className="text-[44px] font-semibold leading-tight sm:text-[60px]">立即试用 VastWearGen</h2>
            <p className="mt-6 max-w-[720px] text-[17px] font-semibold leading-8 text-[#e8f0ff]/84">
              把服装视觉生产交给同一个 AI 工作流，从第一张参考图开始，到可复用的上新模板结束。
            </p>
            <Link href="/create" className="home-button home-button-light mt-9">
              下载并进入工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function HeroGradient({ compact = false }: { compact?: boolean }) {
  return <HeroGradientMotion compact={compact} />;
}

function HeroConsole() {
  return (
    <div className="home-hero-console">
      <div className="home-console-shell">
        <div className="home-console-sidebar">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#51d88a]" />
          </div>
          <div className="mt-7 space-y-2">
            {["New task", "自动化", "素材库"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-[12px] font-semibold text-white/64">
                <Sparkles className="h-3.5 w-3.5" />
                {item}
              </div>
            ))}
          </div>
          <p className="mt-8 text-[12px] font-semibold text-white/32">Workflows</p>
          <div className="mt-3 space-y-2">
            {["服装上身", "商品套图", "种草封面"].map((item, index) => (
              <div key={item} className={`home-console-nav ${index === 0 ? "home-console-nav-active" : ""}`}>
                <span>{item}</span>
                <span>{index === 0 ? "4h" : "2h"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="home-console-main">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[13px] font-semibold text-white/86">Create launch visuals</p>
              <p className="mt-1 text-[12px] text-white/38">vastweargen / fashion-drop</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full border border-white/12 px-3 py-1 text-[12px] font-semibold text-white/70">Open</span>
              <span className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-[#07101d]">Commit</span>
            </div>
          </div>
          <div className="grid min-h-[360px] md:grid-cols-[1fr_0.92fr]">
            <div className="p-5 text-left">
              <div className="rounded-lg border border-white/10 bg-white/[0.045] p-4">
                <p className="text-[14px] font-semibold leading-6 text-white/82">
                  为“春夏针织套装”生成一组可投放视觉：保留衣服纹理，使用自然光，输出主图、种草封面和详情图。
                </p>
                <p className="mt-4 text-[12px] font-semibold text-white/38">Thought 8s</p>
                <div className="mt-3 space-y-2">
                  {heroStats.map((item, index) => (
                    <div key={item} className="home-console-file">
                      <span>{item}</span>
                      <span className={index < 2 ? "text-[#71e4a8]" : "text-[#9db8ff]"}>{index < 2 ? "+ ready" : "queued"}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-[#061829] p-4">
                <p className="text-[13px] text-white/44">Ask VastWearGen anything</p>
                <div className="mt-7 flex items-center justify-between text-[13px] font-semibold text-white/64">
                  <span>+ GPT-Image workflow</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dbe8ff] text-[#07101d]">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>

            <div className="home-console-preview">
              <div className="home-preview-grid">
                <Image src="/home-showcase/model-striped-top-white-skirt.png" alt="" fill sizes="420px" className="object-cover object-top" />
              </div>
              <div className="home-preview-card">
                <BadgeCheck className="h-5 w-5 text-[#91ffc2]" />
                <p className="mt-3 text-[13px] font-semibold text-white/78">4 files generated</p>
                <p className="mt-1 text-[12px] text-white/42">main image, cover, detail, variant</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureStrip({
  feature,
  index,
}: {
  feature: (typeof featureRows)[number];
  index: number;
}) {
  const flipped = index % 2 === 1;

  return (
    <article className={`home-feature-strip ${flipped ? "lg:grid-cols-[1.22fr_0.78fr]" : "lg:grid-cols-[0.78fr_1.22fr]"}`}>
      <div className={`${flipped ? "lg:order-2" : ""} flex min-h-[520px] items-end bg-[#061829] p-8 sm:p-12`}>
        <div className="max-w-[460px]">
          <p className="text-[13px] font-semibold text-[#9db8ff]">{feature.eyebrow}</p>
          <h2 className="mt-5 text-[32px] font-semibold leading-tight text-[#dbe8ff] sm:text-[44px]">{feature.title}</h2>
          <p className="mt-7 text-[16px] font-semibold leading-8 text-[#dbe8ff]/78">{feature.body}</p>
          <div className="mt-8 flex flex-wrap gap-2">
            {["可复用参数", "素材角色清晰", "团队协作"].map((item) => (
              <span key={item} className="rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-[12px] font-semibold text-white/64">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
      <FeatureVisual type={feature.visual} />
    </article>
  );
}

function FeatureVisual({ type }: { type: string }) {
  if (type === "workspace") {
    return (
      <div className="home-feature-visual">
        <Image src="/home-showcase/pose-grid.png" alt="" fill sizes="760px" className="object-cover object-top opacity-[0.88]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#3f5dff]/20 via-transparent to-[#061829]/38" />
        <div className="home-floating-panel left-[12%] top-[16%] w-[260px]">
          <PanelTop className="h-5 w-5 text-[#dbe8ff]" />
          <p className="mt-4 text-[15px] font-semibold">Threads</p>
          <div className="mt-4 space-y-2">
            {["Create SKU hero", "Change background", "Add pose matrix", "Export covers"].map((item, index) => (
              <div key={item} className={`home-mini-row ${index === 0 ? "bg-white/14" : ""}`}>
                <span>{item}</span>
                <span>{index === 0 ? "4h" : `${index + 1}h`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === "quality") {
    return (
      <div className="home-feature-visual">
        <Image src="/home-showcase/model-black-crop-widepants.png" alt="" fill sizes="760px" className="object-cover object-top opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07101d]/30 via-[#487bff]/12 to-[#3e55ff]/48" />
        <div className="home-floating-panel right-[14%] top-[10%] w-[300px]">
          <ClipboardCheck className="h-5 w-5 text-[#dbe8ff]" />
          <p className="mt-4 text-[15px] font-semibold">Review output quality</p>
          <div className="mt-4 space-y-3">
            {["服装纹理未变形", "模特比例自然", "背景光线一致"].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.055] px-3 py-2 text-[12px] font-semibold text-white/70">
                <CheckCircle2 className="h-4 w-4 text-[#91ffc2]" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-feature-visual">
      <Image src="/home-showcase/background-male-jacket.webp" alt="" fill sizes="760px" className="object-cover object-center opacity-[0.78]" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#3156ff]/34 via-[#dbe8ff]/18 to-[#061829]/28" />
      <div className="home-floating-panel right-[13%] top-[8%] w-[320px]">
        <p className="rounded-lg bg-white/12 p-3 text-[13px] font-semibold leading-6 text-white/82">
          Generate a complete launch pack for the linen set, keep fabric texture and natural daylight.
        </p>
        <p className="mt-4 text-[12px] font-semibold text-white/42">Explored 3 references</p>
        <div className="mt-3 space-y-2">
          {["garment.png", "model.png", "background.webp"].map((item) => (
            <div key={item} className="home-console-file">
              <span>{item}</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#91ffc2]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-[#061829] text-[#dbe8ff]">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.1fr_repeat(4,1fr)] lg:px-10">
        <div>
          <p className="text-[18px] font-semibold text-white">VastWearGen</p>
          <p className="mt-4 max-w-[260px] text-[14px] leading-7 text-[#dbe8ff]/58">
            面向服装品牌、电商团队和内容团队的 AI 服装视觉生产工作台。
          </p>
        </div>
        {footerGroups.map((group) => (
          <div key={group.title}>
            <h3 className="text-[13px] font-semibold text-[#dbe8ff]/54">{group.title}</h3>
            <ul className="mt-5 space-y-3">
              {group.links.map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#dbe8ff] transition hover:text-white">
                    {label}
                    {href !== "/" && <ExternalLink className="h-3 w-3" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
