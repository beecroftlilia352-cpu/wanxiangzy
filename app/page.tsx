"use client";

import { Sparkles, Upload, UserRound, Image, Wand2 } from "lucide-react";

const STEPS = [
  {
    icon: Upload,
    title: "上传服装",
    desc: "上传 1-5 件衣服，支持 PNG/JPG/WebP",
  },
  {
    icon: UserRound,
    title: "选择模特",
    desc: "从预设模特库选择，或上传自己的模特图",
  },
  {
    icon: Image,
    title: "选参考图",
    desc: "选定姿势/场景/风格参考图",
  },
  {
    icon: Wand2,
    title: "AI 生成",
    desc: "一键生成，衣服穿在参考图的风格里，脸用模特的脸",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 px-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-100 via-white to-white" />
        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-50 text-purple-700 text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4" />
            基于前沿 AI 多图融合的虚拟换装引擎
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            AI 虚拟换装，
            <br />
            <span className="gradient-brand-text">一键生成时尚大片</span>
          </h1>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-10">
            上传服装、选择模特和参考图，AI 自动将衣服穿在参考图的姿势和风格上，
            并替换为模特的面部。业内领先的虚拟试衣体验。
          </p>
          <a
            href="/create"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full gradient-brand text-white text-lg font-semibold shadow-lg shadow-purple-200 hover:shadow-xl hover:shadow-purple-300 transition-all"
          >
            <Wand2 className="w-5 h-5" />
            立即创作
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-6xl mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-center mb-16">四步出大片</h2>
        <div className="grid md:grid-cols-4 gap-8">
          {STEPS.map((s, i) => (
            <div key={i} className="text-center group">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-brand flex items-center justify-center shadow-lg shadow-purple-100 group-hover:scale-110 transition-transform">
                <s.icon className="w-7 h-7 text-white" />
              </div>
              <div className="text-sm font-bold text-purple-600 mb-2">
                Step {i + 1}
              </div>
              <h3 className="text-lg font-bold mb-2">{s.title}</h3>
              <p className="text-sm text-gray-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-16">
            为什么选择 万象衣造 AI｜VastWearGen
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "业内最强画质",
                desc: "业内领先的 AI 换装模型，保持服装纹理、Logo 清晰不失真，支持 4K 输出。",
              },
              {
                title: "真实人脸替换",
                desc: "搭配 AI 人脸替换技术，模特面部自然融合，无违和感。",
              },
              {
                title: "批量快速生成",
                desc: "多件衣服并行处理，一次上传，同时出多张结果。",
              },
              {
                title: "灵活的风格控制",
                desc: "自选参考图，控制姿势、场景、光影，生成结果完全可控。",
              },
              {
                title: "历史记录管理",
                desc: "所有生成结果自动保存，随时查看和下载历史作品。",
              },
              {
                title: "安全可靠",
                desc: "基于 Supabase 的企业级存储和认证，数据私有安全。",
              },
            ].map((f, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 card-hover">
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
