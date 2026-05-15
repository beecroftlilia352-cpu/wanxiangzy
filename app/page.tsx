import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  Camera,
  CheckCircle2,
  GalleryHorizontalEnd,
  Images,
  Layers3,
  PersonStanding,
  Shirt,
  Sparkles,
  UserRound,
} from "lucide-react";
import { codexTheme } from "@/lib/design/codex-theme";

const showcase = {
  garment: "/home-showcase/garment-blue-hoodie-3d.png",
  model: "/home-showcase/model-striped-top-white-skirt.png",
  result: "/home-showcase/model-black-crop-widepants.png",
  pose: "/home-showcase/pose-grid-black-outfit.png",
};

const modules = [
  {
    href: "/create",
    title: "服装上身",
    desc: "保留服装版型、颜色和细节，生成真实模特上身成片。",
    icon: Shirt,
    image: "/home-showcase/model-striped-top-white-skirt.png",
  },
  {
    href: "/product-set",
    title: "商品套图",
    desc: "主图、辅图和详情图一次规划，适合电商上新。",
    icon: GalleryHorizontalEnd,
    image: "/home-showcase/model-black-crop-widepants.png",
  },
  {
    href: "/grass",
    title: "种草图",
    desc: "生成小红书封面、内容配图和穿搭分享图。",
    icon: Images,
    image: "/home-showcase/model-grey-tank-denim.jpg",
  },
  {
    href: "/model-background",
    title: "换背景",
    desc: "保留人物和服装，替换棚拍、城市、季节和场景。",
    icon: Camera,
    image: "/home-showcase/background-male-jacket.webp",
  },
  {
    href: "/pose",
    title: "姿势裂变",
    desc: "同一套穿搭生成多姿势、多构图内容矩阵。",
    icon: PersonStanding,
    image: "/home-showcase/pose-grid-black-outfit.png",
  },
  {
    href: "/garment-3d",
    title: "服装 3D",
    desc: "把平铺、挂拍或人台图转成更有体积的商品展示。",
    icon: Box,
    image: "/home-showcase/garment-blue-hoodie-3d.png",
  },
];

const workflow = [
  ["上传素材", "服装、模特、姿势、背景和商品图都有明确角色。"],
  ["选择工作流", "按上身、套图、种草、换背景、姿势或 3D 选择模块。"],
  ["生成并复用", "结果、参数和提示词进入作品库，失败任务也可套用重试。"],
];

const quality = [
  "服装不乱改",
  "图片角色清楚",
  "提示词可追溯",
  "历史作品可复用",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#eef4ff] text-codex-ink">
      <section className="relative isolate min-h-[calc(100dvh-64px)] overflow-hidden">
        <div className="absolute inset-0 bg-[var(--codex-gradient-hero)]" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-b from-transparent to-[#07080d]" />
        <div className="relative mx-auto flex min-h-[calc(100dvh-64px)] max-w-7xl flex-col items-center px-5 pb-0 pt-16 text-center sm:px-6 lg:px-8">
          <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/70 bg-white/88 shadow-[0_24px_80px_rgba(7,8,13,0.20)] backdrop-blur-xl">
            <Image src={codexTheme.brand.logo} alt="" width={48} height={48} className="h-12 w-12 object-contain" priority />
          </div>
          <h1 className="mt-8 text-[56px] font-[820] leading-[0.92] tracking-[-0.055em] text-[#050505] sm:text-[86px] lg:text-[104px]">
            {codexTheme.brand.name}
          </h1>
          <p className="mt-7 max-w-3xl text-base font-semibold leading-7 text-[#101322]/82 sm:text-lg">
            {codexTheme.brand.tagline}
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#30374c]/72 sm:text-base">
            {codexTheme.brand.description}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/create"
              className="codex-primary-action inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold"
            >
              进入工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/product-set"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-black/8 bg-white/18 px-6 text-sm font-bold text-[#111318] backdrop-blur-xl transition hover:bg-white/35"
            >
              生成商品套图
            </Link>
          </div>
          <p className="mt-7 text-xs font-semibold text-[#30374c]/62">
            支持服装上身、商品套图、种草图、换背景、姿势裂变、专属模特和服装 3D
          </p>

          <HomeProductMockup />
        </div>
      </section>

      <main className="bg-[#07080d] text-white">
        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/46">Fashion visual workflows</p>
            <h2 className="mt-4 text-4xl font-[820] tracking-[-0.04em] sm:text-5xl">
              把服装视觉生产拆成可控工作流。
            </h2>
            <p className="mt-5 text-base leading-7 text-white/62">
              VastWearGen 不只是生成一张图，而是把素材关系、生成参数、结果复用和任务状态放进同一个生产界面。
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.06] shadow-[0_24px_80px_rgba(0,0,0,0.24)] transition hover:-translate-y-1 hover:bg-white/[0.09]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#111525]">
                    <Image src={item.image} alt={item.title} fill sizes="(min-width:1024px) 33vw, 100vw" className="object-cover object-top opacity-90 transition duration-500 group-hover:scale-[1.04]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07080d] via-transparent to-transparent" />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-2 text-sm font-bold text-white">
                        <Icon className="h-4 w-4 text-[#aeb8ff]" />
                        {item.title}
                      </span>
                      <ArrowRight className="h-4 w-4 text-white/40 transition group-hover:translate-x-1 group-hover:text-white" />
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/58">{item.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.04]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#aeb8ff]">Production pipeline</p>
              <h2 className="mt-4 text-4xl font-[820] tracking-[-0.04em] sm:text-5xl">
                从素材进入，到结果复用。
              </h2>
              <p className="mt-5 text-base leading-7 text-white/62">
                工作台会把服装硬参考、模特参考、背景参考和结果版本分清楚，减少返工，也让团队知道每张图为什么这样生成。
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {quality.map((item) => (
                  <span key={item} className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-bold text-white/76">
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {workflow.map(([title, desc], index) => (
                <div key={title} className="rounded-[26px] border border-white/10 bg-white/[0.07] p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-black text-[#07080d]">
                    {index + 1}
                  </span>
                  <h3 className="mt-8 text-lg font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/58">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-stretch">
            <div className="relative min-h-[420px] overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.06]">
              <Image src="/home-showcase/pose-grid-black-outfit.png" alt="VastWearGen 姿势裂变结果" fill sizes="(min-width:1024px) 60vw, 100vw" className="object-cover object-top opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#07080d]/84 via-[#07080d]/22 to-transparent" />
              <div className="absolute bottom-8 left-8 max-w-md">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#aeb8ff]">Reusable assets</p>
                <h2 className="mt-3 text-4xl font-[820] tracking-[-0.04em]">让每次上新都沉淀成模板。</h2>
                <p className="mt-4 text-sm leading-7 text-white/64">历史作品、任务参数和生成说明可以继续套用，失败任务也能带着原参数重新进入工作流。</p>
              </div>
            </div>
            <div className="rounded-[34px] border border-white/10 bg-white/[0.07] p-7">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#aeb8ff]">Start here</p>
              <h2 className="mt-4 text-3xl font-[820] tracking-[-0.04em]">先从最常用的服装上身开始。</h2>
              <div className="mt-6 space-y-4">
                {["上传一张服装图", "选择系统模特或上传模特", "选择生成比例和数量", "生成后保存到作品库"].map((item) => (
                  <div key={item} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#aeb8ff]" />
                    <p className="text-sm leading-6 text-white/66">{item}</p>
                  </div>
                ))}
              </div>
              <Link href="/create" className="codex-primary-action mt-8 inline-flex h-12 items-center gap-2 rounded-full px-6 text-sm font-bold">
                生成服装上身图
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function HomeProductMockup() {
  return (
    <div className="relative mt-16 w-full max-w-5xl translate-y-8 sm:mt-20">
      <div className="overflow-hidden rounded-t-[30px] border border-white/14 bg-[#07080d] text-left shadow-[0_44px_140px_rgba(7,8,13,0.48)]">
        <div className="flex h-10 items-center justify-between border-b border-white/10 bg-white/[0.04] px-4">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="hidden items-center gap-2 text-xs font-semibold text-white/50 sm:flex">
            <Sparkles className="h-3.5 w-3.5" />
            VastWearGen workspace
          </div>
          <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold text-white/72">Ready</span>
        </div>
        <div className="grid min-h-[420px] grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)_260px]">
          <aside className="border-b border-white/10 bg-white/[0.04] p-4 md:border-b-0 md:border-r">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-white/38">Inputs</p>
            <div className="mt-4 space-y-3">
              <MockInputCard label="服装硬参考" image={showcase.garment} />
              <MockInputCard label="模特参考" image={showcase.model} />
              <MockInputCard label="姿势参考" image={showcase.pose} />
            </div>
          </aside>
          <section className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white">服装上身工作流</p>
                <p className="mt-1 text-[11px] text-white/42">4 张结果 · 3:4 · 可复用参数</p>
              </div>
              <span className="rounded-full bg-[#5b7cff]/18 px-3 py-1 text-[11px] font-bold text-[#dbe8ff]">生成中 82%</span>
            </div>
            <div className="grid h-[330px] grid-cols-2 gap-3">
              {[showcase.result, showcase.model, showcase.pose, showcase.result].map((src, index) => (
                <div key={`${src}-${index}`} className="relative overflow-hidden rounded-2xl bg-white/[0.06]">
                  <Image src={src} alt="" fill sizes="220px" className="object-cover object-top opacity-90" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#07080d]/65 to-transparent" />
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-1 text-[10px] font-bold text-white/80">
                    Result {index + 1}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <aside className="border-t border-white/10 bg-white/[0.04] p-4 md:border-l md:border-t-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-white/38">Task queue</p>
            <div className="mt-4 space-y-3">
              {["保留衣服纹理", "锁定模特站姿", "生成商品主图", "写入作品库"].map((item, index) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-white/82">{item}</span>
                    <BadgeCheck className={`h-4 w-4 ${index < 2 ? "text-[#89f0bd]" : "text-[#aeb8ff]"}`} />
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#5b7cff] to-[#dbe8ff]" style={{ width: `${index < 2 ? 100 : 64}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function MockInputCard({ label, image }: { label: string; image: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-2">
      <div className="relative h-20 overflow-hidden rounded-xl bg-white/[0.08]">
        <Image src={image} alt="" fill sizes="160px" className="object-cover object-top" />
      </div>
      <p className="mt-2 text-[11px] font-bold text-white/72">{label}</p>
    </div>
  );
}
