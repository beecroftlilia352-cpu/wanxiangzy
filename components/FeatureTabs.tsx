"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Box, Heart, Home, Images, PersonStanding, ServerCog, Shirt, UserRound } from "lucide-react";

type FeatureKey = "home" | "tryon" | "grass" | "modelBackground" | "pose" | "model" | "garment3d" | "apiTest";

const items: { key: FeatureKey; href: string; label: string; icon: typeof Shirt }[] = [
  { key: "home", href: "/", label: "首页", icon: Home },
  { key: "tryon", href: "/create", label: "服装上身", icon: Shirt },
  { key: "grass", href: "/grass", label: "服装种草图", icon: Heart },
  { key: "modelBackground", href: "/model-background", label: "模特换背景", icon: Images },
  { key: "pose", href: "/pose", label: "姿势裂变", icon: PersonStanding },
  { key: "model", href: "/model", label: "专属模特", icon: UserRound },
  { key: "garment3d", href: "/garment-3d", label: "服装 3D", icon: Box },
  { key: "apiTest", href: "/api-platform-test", label: "API 测试", icon: ServerCog },
];

export function FeatureTabs({ active }: { active: FeatureKey }) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const activeItem = activeRef.current;
    if (!scroller || !activeItem) return;

    const targetLeft = activeItem.offsetLeft - (scroller.clientWidth - activeItem.clientWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }, [active]);

  return (
    <aside className="studio-nav-rail w-full max-w-[100vw] shrink-0 overflow-hidden border-b px-2 py-2 lg:h-full lg:w-[116px] lg:max-w-none lg:border-b-0 lg:border-r lg:px-0 lg:py-5">
      <div ref={scrollerRef} className="flex w-full items-center gap-1 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <Link
              key={item.key}
              ref={isActive ? activeRef : undefined}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`studio-nav-item ${isActive ? "studio-nav-item-active" : ""} ${item.key === "home" ? "hidden lg:flex" : "flex"} h-12 min-w-[86px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-black transition-all lg:h-[76px] lg:w-[92px] lg:min-w-0`}
              title={item.label}
            >
              <Icon className="h-5 w-5" />
              <span className="whitespace-nowrap leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
