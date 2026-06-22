import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { codexTheme } from "@/lib/design/codex-theme";

const partnerLogos = [
  {
    name: "OpenAI",
    src: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/partners/openai.svg",
  },
  {
    name: "Google",
    src: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/partners/google.svg",
  },
  {
    name: "ByteDance",
    src: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/partners/bytedance.svg",
  },
  {
    name: "Alibaba Cloud",
    src: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/partners/alibaba-cloud.svg",
  },
  {
    name: "AWS",
    src: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/partners/aws.svg",
  },
];

const showcase = {
  heroScreen: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-hero-workspace.png",
  tryonScreen: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-tryon-result.png",
  fusionScreen: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-fusion-grid-reference.png",
  poseScreen: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/screen-pose-result-grid.png",
  yellowDress: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-yellow-dress-garden-back.jpg",
  creamTop: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-cream-top-mini-skirt.png",
  navyPoseGrid: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-navy-shirt-pose-grid.jpg",
  blackDress: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-black-floral-dress.png",
  whiteDressSea: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-white-dress-sea.png",
  creamBlouse: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-cream-blouse-skirt.png",
  blueDress: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-blue-dress-garden-2.png",
  blueDressAlt: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-blue-dress-garden-3.png",
  blueTop: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-blue-top-white-pants.png",
  pinkTop: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/showcase-pink-top-garden.png",
} as const;

const featureRows = [
  {
    eyebrow: "Feature 01",
    title: "服装上身从参考图进入同一工作台",
    body: "把服装、模特、姿势和背景拆成清晰输入，围绕版型、颜色和人物比例生成可交付的上身图。",
    visual: "tryon",
  },
  {
    eyebrow: "Feature 02",
    title: "AI 视频延展静态商品图的表达",
    body: "从图片到视频、首尾帧和运动控制都放在同一个视觉工作台里，方便把已生成的服装图继续做成短视频素材。",
    visual: "video",
  },
  {
    eyebrow: "Feature 03",
    title: "融图把多张素材合成一组完整视觉",
    body: "自由搭配服装、参考图、模特和场景，快速得到统一风格的模特图、套图和后续可复用的视觉素材。",
    visual: "fusion",
  },
  {
    eyebrow: "Feature 04",
    title: "姿势裂变复用爆款构图",
    body: "从一张已验证的主图继续扩展坐姿、站姿、半身和细节角度，保持服装一致性并快速补齐投放素材。",
    visual: "fission",
  },
];

const sceneCards = [
  {
    title: "服装上身",
    description: "保留版型、颜色和细节，生成真人模特上身效果。",
    image: showcase.yellowDress,
  },
  {
    title: "AI 视频",
    description: "把已生成的服装图延展成适合投放和种草的动态短片。",
    video: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/ai-video-preview.mp4",
  },
  {
    title: "融图",
    description: "把服装、模特、场景和参考图合成一张统一风格的视觉。",
    image: showcase.blackDress,
  },
  {
    title: "姿势裂变",
    description: "用同一套服装和模特快速扩展多角度、多姿势素材。",
    image: showcase.navyPoseGrid,
  },
];

const testimonials = [
  {
    quote: "我们把上新前的试拍周期从两天压到半天，最关键的是服装细节能被稳定保留下来。",
    name: "女装品牌运营负责人",
    initials: "DW",
    avatar: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/testimonials/daniel-sikorskiy.webp",
  },
  {
    quote: "以前不同设计师做出来的图风格差很多，现在用同一套模特和参数，整个店铺看起来统一多了。",
    name: "独立设计师工作室",
    initials: "JW",
    avatar: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/testimonials/joey-wang.webp",
  },
  {
    quote: "商品套图和种草封面可以一起规划，运营同学不用在十几个工具之间来回切。",
    name: "电商内容团队",
    initials: "TR",
    avatar: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/testimonials/tess-rosania.webp",
  },
  {
    quote: "历史作品能直接复用参数，这对爆款补图特别有用，返工少了很多。",
    name: "跨境服饰卖家",
    initials: "KL",
    avatar: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/testimonials/austin-ray.webp",
  },
  {
    quote: "模特、姿势、背景分得很清楚，新同事也能照着流程把图做对。",
    name: "摄影制片团队",
    initials: "AM",
    avatar: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/testimonials/aaron-wang.webp",
  },
  {
    quote: "我们最喜欢的是失败任务可以带着原参数重试，排查问题比以前容易很多。",
    name: "品牌视觉负责人",
    initials: "SC",
    avatar: "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/testimonials/tres-wong-godfrey.webp",
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
    <div className="min-h-screen bg-white text-[#050505] home-no-dark" data-no-dark="true">
      <section className="home-landing-hero relative isolate overflow-hidden bg-[#e8e9f7] text-[#050505]">
        {/* P2.1 hero video: preload=metadata saves bandwidth, hidden on mobile,
            poster fallback so reduced-motion / mobile users see a still frame. */}
        <video className="home-hero-video-bg hidden md:block" autoPlay muted loop playsInline preload="metadata" poster="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/floral-a-poster.jpg" aria-hidden="true">
          <source src="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/floral-a.mp4" type="video/mp4" />
        </video>
        <div className="home-hero-video-scrim" aria-hidden="true" />
        <div className="home-hero-frame relative mx-auto flex min-h-[640px] max-w-[1440px] flex-col items-center px-5 pb-0 pt-[88px] text-center sm:min-h-[760px] sm:px-8 sm:pt-[108px] md:min-h-[960px] md:pt-[138px] lg:min-h-[1100px] lg:px-10 lg:pt-[156px] xl:min-h-[1240px] xl:pt-[176px]">
          <div className="home-logo-tile">
            <Image src="/gemini-icon.png" alt="" width={52} height={52} className="h-[52px] w-[52px] object-contain" priority />
          </div>

          <h1 className="mt-8 text-[58px] font-semibold leading-[0.95] text-[#050505] sm:text-[72px] lg:text-[88px]">
            {codexTheme.brand.name}
          </h1>
          <p className="mt-7 max-w-[720px] text-[18px] font-semibold leading-8 text-[#111827]/84 sm:text-[20px]">
            面向服装品牌、电商团队和内容团队的 AI 服装视觉生产智能体。
          </p>
          <p className="mt-3 max-w-[760px] text-[15px] leading-7 text-[#1f2937]/68">
            上传服装、模特、姿势和背景参考，一次完成上身图、商品套图、种草封面与可复用的视觉工作流。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/create" className="home-button home-button-dark">
              进入工作台
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link href="#same-agent" className="home-button home-button-soft">
              查看案例
            </Link>
          </div>

          <p className="mt-8 text-[13px] font-semibold text-[#29354d]/58">
            Available for 服装上身、AI 视频、融图、姿势裂变、商品套图和种草封面
          </p>

          <HeroConsole />
        </div>
      </section>

      <main className="bg-white text-[#050505]">
        <section id="partners" className="home-partner-band" aria-label="合作伙伴">
          {partnerLogos.map((partner) => (
            <div key={partner.name} className="home-partner-item" aria-label={partner.name}>
              <img src={partner.src} alt={partner.name} />
            </div>
          ))}
        </section>

        <section id="features" className="mx-auto max-w-[1440px] px-5 py-24 sm:px-8 lg:px-10">
          <div className="home-feature-intro">
            <h2>使用智能体生成服装视觉的最佳方式</h2>
          </div>
          <div className="mt-14 space-y-32">
            {featureRows.map((feature, index) => (
              <FeatureStrip key={feature.title} feature={feature} reverse={index % 2 === 1} />
            ))}
          </div>
        </section>

        <section id="same-agent" className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[760px] text-center">
            <h2 className="text-[36px] font-semibold leading-tight sm:text-[46px]">在每个上新场景中使用同一智能体</h2>
            <p className="mt-5 text-[15px] leading-7 text-[#4b5563]">
              在多个页面和环境中使用 VastWearGen，并通过你的团队素材库实现统一连接。
            </p>
            <Link href="/create" className="home-button home-button-dark mt-8">
              进入工作台
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {sceneCards.map((card) => (
              <Link key={card.title} href="/create" className="home-scene-card group">
                <div className="relative aspect-[1.16] overflow-hidden bg-[#f4f4f4]">
                  {"video" in card ? (
                    <video className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]" autoPlay muted loop playsInline preload="auto" aria-hidden="true">
                      <source src={card.video} type="video/mp4" />
                    </video>
                  ) : (
                    <Image
                      src={card.image}
                      alt={card.title}
                      fill
                      sizes="(min-width: 1024px) 33vw, 100vw"
                      className="object-cover object-top transition duration-500 group-hover:scale-[1.025]"
                    />
                  )}
                </div>
                <div className="p-6">
                  <h3 className="text-[20px] font-semibold leading-tight">{card.title}</h3>
                  <p className="mt-3 text-[14px] leading-6 text-[#5f6673]">{card.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section id="testimonials" className="mx-auto max-w-[1440px] px-5 pb-28 sm:px-8 lg:px-10">
          <h2 className="text-center text-[42px] font-semibold leading-tight sm:text-[56px]">What fashion teams are saying</h2>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((item) => (
              <article key={item.name} className="home-testimonial">
                <Image
                  src={item.avatar}
                  alt=""
                  width={64}
                  height={64}
                  className="home-testimonial-avatar"
                  aria-hidden="true"
                />
                <p className="mt-12 text-[18px] font-medium leading-8 text-[#111827]">“{item.quote}”</p>
                <p className="mt-16 text-[14px] font-semibold text-[#6b7280]">{item.name}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="home-final-video-cta relative isolate overflow-hidden">
          <video className="home-hero-video-bg" autoPlay muted loop playsInline preload="auto" aria-hidden="true">
            <source src="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/floral-a.mp4" type="video/mp4" />
          </video>
          <div className="home-final-video-scrim" aria-hidden="true" />
          <div className="relative z-[3] mx-auto flex min-h-[475px] max-w-[1440px] flex-col items-center justify-center px-5 py-20 text-center text-[#050505] sm:px-8 lg:px-10">
            <h2 className="text-[44px] font-semibold leading-tight sm:text-[65px]">立即试用 VastWearGen</h2>
            <p className="mt-6 max-w-[660px] text-[16px] font-medium leading-7 text-[#111827]/84">
              把服装视觉生产交给同一个 AI 工作流，从第一张参考图开始，到可复用的上新模板结束。
            </p>
            <Link href="/create" className="home-button home-button-dark mt-9">
              进入工作台
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function HeroConsole() {
  return (
    <div className="home-hero-console">
      <div className="home-codex-hero-shot home-codex-hero-shot-screenshot">
        <MacWindowShell className="home-hero-macos-shell">
          <Image
            src={showcase.heroScreen}
            alt="服装上身工作台截图"
            fill
            priority
            sizes="(min-width: 1280px) 1180px, 92vw"
            className="home-codex-hero-image"
          />
        </MacWindowShell>
      </div>
    </div>
  );
}

function FeatureStrip({
  feature,
  reverse = false,
}: {
  feature: (typeof featureRows)[number];
  reverse?: boolean;
}) {
  return (
    <article className={`home-feature-strip ${reverse ? "home-feature-strip-reverse" : ""}`}>
      <FeatureVisual type={feature.visual} />
      <div className="home-feature-copy-panel">
        <div className="max-w-[460px]">
          <p className="text-[13px] font-semibold text-[#3f5dff]">{feature.eyebrow}</p>
          <h2 className="mt-5 text-[30px] font-semibold leading-tight text-[#050505] sm:text-[38px]">{feature.title}</h2>
          <p className="mt-7 text-[15px] font-medium leading-7 text-[#4b5563]">{feature.body}</p>
        </div>
      </div>
    </article>
  );
}

function FeatureVisual({ type }: { type: string }) {
  if (type === "fusion") {
    return <FeatureScreenshot src={showcase.fusionScreen} alt="融图工作台截图" className="home-feature-screen-fusion" />;
  }

  if (type === "fission") {
    return <FeatureScreenshot src={showcase.poseScreen} alt="姿势裂变工作台截图" className="home-feature-screen-pose" />;
  }

  if (type === "video") {
    return (
      <div className="home-feature-visual home-feature-screen home-feature-visual-video">
        <MacWindowShell className="home-feature-macos-shell">
          <video className="h-full w-full object-cover" autoPlay muted loop playsInline preload="auto" aria-hidden="true">
            <source src="https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/home-showcase/ai-video-preview.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-br from-[#244cff]/20 via-transparent to-white/18" />
        </MacWindowShell>
      </div>
    );
  }

  return (
    <FeatureScreenshot src={showcase.tryonScreen} alt="服装上身工作台截图" className="home-feature-screen-tryon" />
  );
}

function FeatureScreenshot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`home-feature-visual home-feature-screen ${className}`}>
      <MacWindowShell className="home-feature-macos-shell">
        <Image src={src} alt={alt} fill sizes="(min-width: 1024px) 58vw, 100vw" className="home-feature-screen-img" />
      </MacWindowShell>
      <div className="home-feature-screen-glow" aria-hidden="true" />
    </div>
  );
}

function MacWindowShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`home-macos-shell ${className}`}>
      <div className="home-macos-topbar" aria-hidden="true">
        <span className="home-macos-dot home-macos-dot-red" />
        <span className="home-macos-dot home-macos-dot-yellow" />
        <span className="home-macos-dot home-macos-dot-green" />
        <span className="home-macos-layout-icon" />
      </div>
      <div className="home-macos-body">{children}</div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#ececec] bg-white text-[#050505]">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.1fr_repeat(4,1fr)] lg:px-10">
        <div>
          <p className="text-[18px] font-semibold text-[#050505]">VastWearGen</p>
          <p className="mt-4 max-w-[260px] text-[14px] leading-7 text-[#6b7280]">
            面向服装品牌、电商团队和内容团队的 AI 服装视觉生产工作台。
          </p>
        </div>
        {footerGroups.map((group) => (
          <div key={group.title}>
            <h3 className="text-[13px] font-semibold text-[#777]">{group.title}</h3>
            <ul className="mt-5 space-y-3">
              {group.links.filter(([, href]) => href !== "/agent").map(([label, href]) => (
                <li key={label}>
                  <Link href={href} className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#111] transition hover:text-[#555]">
                    {label}
                    {href !== "/" && <ExternalLink aria-hidden="true" className="h-3 w-3" />}
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
