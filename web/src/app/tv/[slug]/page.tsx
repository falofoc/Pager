import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { tvSnapshot } from "@/server/tv";
import { TvApp } from "./TvApp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "شاشة الأرقام", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ key?: string }> }) {
  const slug = (await params).slug;
  const key = (await searchParams).key ?? null;
  const snap = await tvSnapshot(slug, key);
  if (!snap) notFound();
  const h = await headers();
  const origin = (process.env.APP_URL?.trim() || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`).replace(/\/$/, "");
  return <TvApp initial={snap} slug={slug} tvKey={key!} claimUrl={`${origin}/c/${slug}`} />;
}
