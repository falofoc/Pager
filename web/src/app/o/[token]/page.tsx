import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { orderByToken } from "@/server/customer";
import { publicView } from "@/server/orders";
import { getVapid } from "@/server/appconfig";
import { touch } from "@/server/presence";
import { CustomerApp } from "./CustomerApp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const r = await orderByToken((await params).token);
  return { title: r ? `${r.order.kind === "TICKET" ? "دور" : "طلب"} ${r.order.number}` : "طلب", robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const r = await orderByToken((await params).token);
  if (!r) notFound();
  touch(r.order.id);
  const [view, vapid] = await Promise.all([publicView(r.order, r.branch), getVapid()]);
  return <CustomerApp initial={view} vapidKey={vapid.publicKey} />;
}
