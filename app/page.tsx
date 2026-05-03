import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  Camera,
  CheckCircle2,
  Images,
  Layers3,
  PenLine,
  PersonStanding,
  Quote,
  Shirt,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";

const primaryModules = [
  {
    href: "/create",
    title: "服装上身",
    desc: "上传单件或多件服装，选择模特、场景和姿势，一次生成真实上身成片。",
    image: "/home-showcase/model-striped-top-white-skirt.png",
    imageClass: "object-contain object-bottom p-4",
    icon: Shirt,
    tag: "图1 服装硬参考",
    layout: "lg:col-span-2",
  },
  {
    href: "/grass",
    title: "服装种草图",
    desc: "用系统模板、上传参考图或自定义提示词，生成小红书、电商封面和穿搭分享。",
    image: "/home-showcase/model-grey-tank-denim.jpg",
    imageClass: "object-cover object-top",
    icon: Sparkles,
    tag: "场景与氛围参考",
    layout: "",
  },
  {
    href: "/model-background",
    title: "模特换背景",
    desc: "默认只换背景，也可换背景换模特或只换脸，服装和穿搭单品保持不变。",
    image: "/home-showcase/background-male-jacket.webp",
    imageClass: "object-cover object-center",
    icon: Images,
    tag: "背景 / 模特控制",
    layout: "",
  },
  {
    href: "/pose",
    title: "姿势裂变",
    desc: "同人物、同穿搭、同场景，扩展 2x2 多姿势图，适合详情页和内容矩阵。",
    image: "/home-showcase/pose-grid-black-outfit.png",
    imageClass: "object-cover object-top",
    icon: PersonStanding,
    tag: "四宫格动作",
    layout: "lg:col-span-2",
  },
];

const secondaryModules = [
  {
    href: "/model",
    title: "专属模特",
    desc: "用 1-3 张人像沉淀脸型、肤色、发型、妆感和品牌人物气质。",
    image: "/home-showcase/exclusive-model-02.png",
    icon: UserRound,
  },
  {
    href: "/garment-3d",
    title: "服装 3D",
    desc: "把平铺、挂拍或人台图转成更有厚度和材质感的商品展示图。",
    image: "/home-showcase/garment-blue-hoodie-3d.png",
    icon: Box,
  },
  {
    href: "/history",
    title: "作品与复用",
    desc: "回看输入图、模型、参数和提示词版本，快速复用稳定的生产路径。",
    image: "/home-showcase/model-black-crop-widepants.png",
    icon: Layers3,
  },
];

const workflow = [
  {
    icon: Camera,
    title: "素材进入",
    desc: "服装、模特、背景、姿势和 3D 参考各自有明确角色，不混用图片逻辑。",
  },
  {
    icon: PenLine,
    title: "提示词锁定",
    desc: "顶部显示图片关系，完整提示词和模型执行版本可复制、可优化、可追溯。",
  },
  {
    icon: Wand2,
    title: "批量产出",
    desc: "按模块选择比例、分辨率和数量，快速生成品牌主图、内容封面和商拍素材。",
  },
];

const testimonials = [
  {
    name: "Lina",
    role: "女装品牌主理人",
    quote: "上新前先跑种草图和换背景图，能很快判断哪套视觉更适合投放。服装不乱变，是我最看重的点。",
  },
  {
    name: "Chen",
    role: "电商视觉负责人",
    quote: "模块拆开之后，团队知道每张图应该起什么作用。提示词能复用，返工少了很多。",
  },
  {
    name: "Mika",
    role: "内容策划",
    quote: "专属模特加姿势裂变很适合做内容矩阵，一套素材可以延展出多条风格统一的内容。",
  },
];

const partners = [
  "MODELAB",
  "AURORA STUDIO",
  "NOVA SHOP",
  "V-LINE",
  "LOOKBASE",
  "STOCKROOM",
  "LENSKIT",
  "FABRIC AI",
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f7f2fb] text-slate-950">
      <section className="relative isolate overflow-hidden bg-slate-950 text-white">
        <Image
          src="/home-showcase/model-black-crop-widepants.png"
          alt="VastWear 服装视觉生成"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[68%_18%]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.9)_0%,rgba(15,23,42,0.68)_44%,rgba(15,23,42,0.16)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,transparent,rgba(247,242,251,1))]" />

        <div className="relative mx-auto flex min-h-[520px] max-w-7xl flex-col justify-center px-5 py-12 sm:min-h-[580px] sm:px-6 lg:min-h-[620px] lg:px-8">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/20 px-3 py-1 text-xs font-black text-white/80 shadow-sm backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-200" />
              服装视觉生成工作台
            </p>
            <h1 className="mt-6 text-6xl font-black leading-[0.9] tracking-normal sm:text-7xl lg:text-8xl">
              VastWear
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/75 sm:text-xl sm:leading-8">
              把服装上身、种草图、换背景、姿势裂变、专属模特和服装 3D 放进一套清晰的品牌视觉生产流程。
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/create"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#7c3aed,#db2777)] px-6 text-sm font-black text-white shadow-xl shadow-fuchsia-950/25 transition hover:brightness-110"
              >
                开始创作
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/grass"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/20"
              >
                生成种草图
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main>
        <section className="mx-auto max-w-7xl px-5 pb-14 pt-8 sm:px-6 lg:px-8">
          <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,0.65fr)_minmax(320px,0.35fr)] lg:items-end">
            <div>
              <p className="text-xs font-black text-violet-500">Core Modules</p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">先选一个生产入口。</h2>
            </div>
            <p className="text-sm leading-6 text-slate-500">
              每个模块都有独立的输入关系和提示词执行版本，避免把服装、人物、背景和参考图混成一团。
            </p>
          </div>

          <div className="grid auto-rows-[340px] gap-4 lg:grid-cols-3">
            {primaryModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${item.layout} group relative overflow-hidden rounded-[30px] border border-violet-100 bg-slate-950 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_80px_rgba(88,28,135,0.18)]`}
                >
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    sizes="(min-width: 1024px) 44vw, 100vw"
                    className={`${item.imageClass} opacity-[0.92] transition duration-500 group-hover:scale-[1.03]`}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(88,28,135,0.08)_0%,rgba(76,29,149,0.22)_42%,rgba(15,23,42,0.88)_100%)]" />
                  <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/25 px-3 py-1 text-[11px] font-black text-white shadow-sm backdrop-blur-xl">
                      <Icon className="h-3.5 w-3.5" />
                      {item.tag}
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-violet-700 shadow-lg transition group-hover:translate-x-1">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="absolute inset-x-4 bottom-4">
                    <h3 className="text-2xl font-black text-white">{item.title}</h3>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">{item.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {secondaryModules.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group grid grid-cols-[112px_minmax(0,1fr)] gap-4 rounded-3xl border border-violet-100 bg-white/90 p-3 shadow-sm backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_50px_rgba(88,28,135,0.12)]"
                >
                  <div className="relative overflow-hidden rounded-2xl bg-violet-50">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      sizes="140px"
                      className="object-cover object-top transition duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="flex min-h-32 flex-col justify-center">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-violet-500" />
                      <h3 className="text-base font-black text-slate-950">{item.title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="bg-[#efe8f7]">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:px-8">
            <div>
              <p className="text-xs font-black text-violet-500">Visual Pipeline</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">不是拼提示词，是管理图片关系。</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                VastWear 把“服装硬参考、场景参考、模特参考、姿势参考、3D 参考”拆成可理解的输入角色。模型执行时先读图片关系，再按模块规则生成。
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {["服装不改款", "图像角色清楚", "提示词可复用", "多模块上新"].map((tag) => (
                  <span key={tag} className="rounded-full border border-violet-100 bg-white/75 px-3 py-1 text-xs font-bold text-violet-700 shadow-sm">
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {workflow.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-3xl border border-white/75 bg-white/80 p-5 shadow-sm backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-violet-400">0{index + 1}</span>
                      <Icon className="h-5 w-5 text-violet-500" />
                    </div>
                    <h3 className="mt-8 text-lg font-black text-slate-950">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-stretch">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { src: "/home-showcase/exclusive-model-01.png", title: "专属模特资产", desc: "沉淀品牌人物气质" },
                { src: "/home-showcase/model-male-black-knitwear.jpg", title: "男装商拍风格", desc: "背景和光影可替换" },
                { src: "/home-showcase/model-white-top-denim-shorts.jpg", title: "通用模特素材", desc: "适配上身和种草" },
                { src: "/home-showcase/garment-blue-hoodie-3d.png", title: "服装 3D 表达", desc: "保留廓形与面料厚度" },
              ].map((item) => (
                <div key={item.title} className="relative min-h-64 overflow-hidden rounded-[28px] bg-violet-50 shadow-sm">
                  <Image src={item.src} alt={item.title} fill sizes="320px" className="object-cover object-top" />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,rgba(15,23,42,0.72)_100%)]" />
                  <div className="absolute inset-x-4 bottom-4">
                    <p className="text-sm font-black text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-white/70">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[30px] border border-violet-100 bg-white/90 p-6 shadow-sm backdrop-blur-xl">
              <p className="text-xs font-black text-violet-500">Use Cases</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950">首页应该让用户马上知道能做什么。</h2>
              <div className="mt-6 space-y-4">
                {[
                  "新品没有模特图：先用服装上身生成一组成片。",
                  "商品图太单一：用换背景生成不同季节、城市和场景版本。",
                  "需要社媒内容：用种草模板或上传参考图生成封面。",
                  "同一套穿搭不够用：用姿势裂变扩展动作和构图。",
                ].map((item) => (
                  <div key={item} className="flex gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                    <p className="text-sm leading-6 text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
              <Link
                href="/create"
                className="mt-8 inline-flex h-11 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#7c3aed,#db2777)] px-5 text-sm font-black text-white shadow-lg shadow-fuchsia-950/20 transition hover:brightness-110"
              >
                进入工作台
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="border-y border-violet-100 bg-white/70 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
            <div className="mb-8 grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
              <div>
                <p className="text-xs font-black text-violet-500">虚拟用户评价</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950">团队会怎样使用 VastWear。</h2>
              </div>
              <p className="text-sm leading-6 text-slate-500">以下为占位评价，用于页面氛围和信息层级，后续可替换为真实客户案例。</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {testimonials.map((item) => (
                <article key={item.name} className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm backdrop-blur-xl">
                  <Quote className="h-5 w-5 text-fuchsia-500" />
                  <p className="mt-4 text-sm leading-7 text-slate-600">{item.quote}</p>
                  <div className="mt-6 flex items-center gap-3 border-t border-violet-100 pt-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7c3aed,#db2777)] text-sm font-black text-white">
                      {item.name.slice(0, 1)}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-950">{item.name}</p>
                      <p className="text-xs text-slate-500">{item.role}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black text-violet-500">合作伙伴</p>
              <h2 className="mt-2 text-3xl font-black text-slate-950">预留品牌与渠道合作位。</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-slate-500">当前为 logo 占位，后续可替换为真实客户、渠道、供应链和内容机构标识。</p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {partners.map((item) => (
              <div key={item} className="flex h-20 items-center justify-center rounded-3xl border border-violet-100 bg-white/90 px-4 text-center shadow-sm backdrop-blur-xl">
                <div>
                  <BadgeCheck className="mx-auto mb-2 h-4 w-4 text-violet-400" />
                  <p className="text-xs font-black tracking-normal text-slate-500">{item}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
