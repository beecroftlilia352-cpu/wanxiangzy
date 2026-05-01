"use client";

import { PersonStanding, Shirt, UserRound } from "lucide-react";

export function FeatureTabs({ active }: { active: "tryon" | "pose" | "model" }) {
  const items = [
    { key: "tryon" as const, href: "/create", label: "服装上身", icon: Shirt },
    { key: "pose" as const, href: "/pose", label: "姿势裂变", icon: PersonStanding },
    { key: "model" as const, href: "/model", label: "专属模特", icon: UserRound },
  ];

  return (
    <aside className="w-[92px] border-r bg-white flex flex-col items-center py-4 gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.key;
        return (
          <a
            key={item.key}
            href={item.href}
            className={`w-[72px] h-[72px] rounded-xl flex flex-col items-center justify-center gap-1.5 text-[11px] font-medium transition-all ${
              isActive
                ? "bg-purple-50 text-purple-600 ring-1 ring-purple-200 shadow-sm"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </a>
        );
      })}
    </aside>
  );
}
