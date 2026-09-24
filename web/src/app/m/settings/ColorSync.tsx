"use client";
import { useEffect } from "react";

/** اختيار دائرة لون يملأ حقل اللون المحفوظ. */
export function ColorSync() {
  useEffect(() => {
    const radios = document.querySelectorAll<HTMLInputElement>("input[name=brandColorPick]");
    const on = (e: Event) => {
      const i = document.getElementById("brandColor") as HTMLInputElement | null;
      if (i) i.value = (e.target as HTMLInputElement).value;
    };
    radios.forEach((r) => r.addEventListener("change", on));
    return () => radios.forEach((r) => r.removeEventListener("change", on));
  }, []);
  return null;
}
