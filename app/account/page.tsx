import type { Metadata } from "next";
import { AccountCenterClient } from "@/components/account/AccountCenterClient";

export const metadata: Metadata = {
  title: "个人中心 | VastWearGen",
};

export default function AccountPage() {
  return <AccountCenterClient />;
}
