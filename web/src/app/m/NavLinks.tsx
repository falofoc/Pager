"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/m", label: "اليوم" },
  { href: "/m/settings", label: "إعدادات الفرع" },
  { href: "/m/integrations", label: "التكاملات والمفاتيح" },
  { href: "/m/print", label: "رموز الطباعة" },
  { href: "/m/branches", label: "الفروع" },
];

export function NavLinks() {
  const path = usePathname();
  const b = useSearchParams().get("b");
  return (
    <>
      {LINKS.map((l) => (
        <Link key={l.href} href={b && l.href !== "/m/branches" && l.href !== "/m/integrations" ? `${l.href}?b=${b}` : l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </>
  );
}
