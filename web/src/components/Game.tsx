"use client";
import { useEffect, useRef } from "react";

const R = 6;
const S = 16;

function hexToRgb(h: string): number[] {
  const v = parseInt(h.replace("#", "").slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
const rgb = (c: number[]) => `rgb(${c.join(",")})`;

function symmetric(r: number, s: number): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < 8; k++) {
    out.push([r, (s + 2 * k) % S]);
    out.push([r, (S - 1 - s + 2 * k + S) % S]);
  }
  return out;
}

/** لعبة الزخرفة: كل لمسة تلوّن خلية وتنعكس ثماني مرات. تُحفظ في sessionStorage. */
export function Game({ color, storageKey }: { color: string; storageKey: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cells = useRef<number[][]>(Array.from({ length: R }, () => new Array(S).fill(0)));
  const api = useRef<{ random: () => void; clear: () => void } | null>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const rmax = size * 0.46;
    const rmin = size * 0.07;
    const b = hexToRgb(color);
    const pal = [mix(b, [255, 255, 255], 0.15), mix(b, [255, 255, 255], 0.55), hexToRgb("#C99A2E"), mix(b, [28, 27, 26], 0.35)].map(rgb);

    const save = () => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(cells.current));
        sessionStorage.setItem(storageKey + ":png", canvas.toDataURL("image/png"));
      } catch {}
    };
    const draw = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      for (let r = 0; r < R; r++) {
        const r0 = rmin + ((rmax - rmin) * r) / R;
        const r1 = rmin + ((rmax - rmin) * (r + 1)) / R - size * 0.008;
        for (let s = 0; s < S; s++) {
          const a0 = (s / S) * Math.PI * 2 - Math.PI / 2 + 0.012;
          const a1 = ((s + 1) / S) * Math.PI * 2 - Math.PI / 2 - 0.012;
          ctx.beginPath();
          ctx.arc(cx, cy, r1, a0, a1);
          ctx.arc(cx, cy, r0, a1, a0, true);
          ctx.closePath();
          const v = cells.current[r][s];
          ctx.fillStyle = v ? pal[(v - 1) % pal.length] : "#F4F2ED";
          ctx.fill();
        }
      }
      ctx.beginPath();
      ctx.arc(cx, cy, rmin - size * 0.012, 0, Math.PI * 2);
      ctx.fillStyle = pal[2];
      ctx.fill();
    };
    const random = () => {
      cells.current = cells.current.map((row) => row.map(() => 0));
      for (let r = 0; r < R; r++) {
        const s = Math.floor(Math.random() * S);
        const v = 1 + Math.floor(Math.random() * 3);
        if (Math.random() < 0.85) symmetric(r, s).forEach(([rr, ss]) => (cells.current[rr][ss] = v));
        if (Math.random() < 0.5) symmetric(r, (s + 3) % S).forEach(([rr, ss]) => (cells.current[rr][ss] = (v % 3) + 1));
      }
      draw();
      save();
    };
    const clear = () => {
      cells.current = cells.current.map((row) => row.map(() => 0));
      draw();
      save();
    };
    api.current = { random, clear };

    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) cells.current = JSON.parse(saved);
      else random();
    } catch {
      random();
    }
    draw();

    let down = false;
    let last = "";
    const paint = (x: number, y: number, drag: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const px = ((x - rect.left) * size) / rect.width;
      const py = ((y - rect.top) * size) / rect.height;
      const d = Math.hypot(px - cx, py - cy);
      if (d < rmin || d > rmax) return;
      const r = Math.min(R - 1, Math.floor((d - rmin) / ((rmax - rmin) / R)));
      let a = Math.atan2(py - cy, px - cx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      const s = Math.floor((a / (Math.PI * 2)) * S) % S;
      const key = `${r}:${s}`;
      if (drag && key === last) return;
      last = key;
      const nv = drag ? cells.current[r][s] || 1 : (cells.current[r][s] + 1) % 4;
      symmetric(r, s).forEach(([rr, ss]) => (cells.current[rr][ss] = nv));
      draw();
      save();
    };
    const onDown = (e: PointerEvent) => {
      down = true;
      last = "";
      paint(e.clientX, e.clientY, false);
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
    };
    const onMove = (e: PointerEvent) => down && paint(e.clientX, e.clientY, true);
    const onUp = () => (down = false);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [color, storageKey]);

  return (
    <>
      <canvas ref={ref} className="game-canvas" width={480} height={480} aria-label="لوحة الزخرفة: المس أو اسحب لتلوين الخلايا" />
      <div className="row" style={{ alignSelf: "stretch" }}>
        <button type="button" className="btn white grow" onClick={() => api.current?.random()}>زخرفة جديدة</button>
        <button type="button" className="btn white grow" onClick={() => api.current?.clear()}>مسح</button>
      </div>
    </>
  );
}
