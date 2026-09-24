import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { branchBySlug } from "@/server/customer";
import { parseSettings } from "@/server/settings";
import { ClaimApp } from "./ClaimApp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const b = await branchBySlug((await params).slug);
  return { title: b ? `${b.tenant.name} · تابع طلبك` : "تابع طلبك" };
}

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ n?: string }> }) {
  const branch = await branchBySlug((await params).slug);
  if (!branch) notFound();
  const s = parseSettings(branch.settings);
  return (
    <ClaimApp
      slug={branch.slug}
      brand={branch.tenant.name}
      name={branch.name}
      color={branch.brandColor}
      numbering={branch.numbering}
      mode={branch.mode}
      digits={s.numberDigits}
      prefill={(await searchParams).n ?? ""}
    />
  );
}
