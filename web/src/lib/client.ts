"use client";

/** معرّف الجهاز للولاء وربط الطلبات. عشوائي، يُحفظ في المتصفح فقط. */
export function deviceKey(): string {
  try {
    let k = localStorage.getItem("dorak:device");
    if (!k || !/^[A-Za-z0-9_-]{16,64}$/.test(k)) {
      const a = new Uint8Array(18);
      crypto.getRandomValues(a);
      k = btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem("dorak:device", k);
    }
    return k;
  } catch {
    return "ephemeral_" + Math.random().toString(36).slice(2, 14).padEnd(12, "x");
  }
}

let actx: AudioContext | null = null;

export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx = actx ?? new AC();
    if (actx.state === "suspended") void actx.resume();
  } catch {}
}

/** رنّة النداء: ثلاث نغمات قصيرة. */
export function chime() {
  try {
    if (!actx) unlockAudio();
    if (!actx) return;
    const t0 = actx.currentTime + 0.02;
    [659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = actx!.createOscillator();
      const g = actx!.createGain();
      o.type = "triangle";
      o.frequency.value = f;
      const t = t0 + i * 0.15;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g);
      g.connect(actx!.destination);
      o.start(t);
      o.stop(t + 0.45);
    });
  } catch {}
}

export function vibrate(pattern: number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}

export async function post<T = unknown>(url: string, data?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data === undefined ? "{}" : JSON.stringify(data) });
    const body = (await res.json().catch(() => ({}))) as T;
    return { ok: res.ok, status: res.status, data: body };
  } catch {
    return { ok: false, status: 0, data: { error: "NETWORK" } as T };
  }
}

export function b64ToUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export const fmtMin = (sec: number) => Math.max(1, Math.round(sec / 60));
export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
