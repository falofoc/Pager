import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentDevice } from "@/server/auth";
import { boardSnapshot, loadBranch } from "@/server/orders";
import { appUrl } from "@/server/appconfig";
import { headers } from "next/headers";
import { Board } from "./Board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "لوحة الموظف" };

export default async function Page() {
  const device = await currentDevice();
  if (!device) redirect("/s/join");
  const branch = await loadBranch(device.branchId);
  if (!branch) redirect("/s/join");
  const h = await headers();
  const origin = process.env.APP_URL?.trim() || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  void appUrl;
  return <Board initial={await boardSnapshot(branch)} deviceLabel={device.label} slug={branch.slug} origin={origin.replace(/\/$/, "")} />;
}
