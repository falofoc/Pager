/**
 * أرقام طلبات مقاومة للخطأ.
 * الرقم = خانات أساس + خانة تحقق، بحيث sum(w_i * d_i) ≡ 0 (mod 11) بأوزان متناقصة (n+1 .. 1).
 * الأوزان مختلفة وغير صفرية بمقياس 11، فأي خطأ في خانة واحدة وأي قلب لخانتين متجاورتين يُكتشف.
 */
export function checkDigit(base: string): number | null {
  if (!/^\d+$/.test(base) || base.length > 9) return null;
  const n = base.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (n + 1 - i) * Number(base[i]);
  const c = (11 - (sum % 11)) % 11;
  return c === 10 ? null : c;
}

export function isValidChecksumNumber(num: string): boolean {
  if (!/^\d{3,6}$/.test(num)) return false;
  const c = checkDigit(num.slice(0, -1));
  return c !== null && c === Number(num.slice(-1));
}

/** الرقم التالي الصالح بعد المؤشر، متخطيًا الأرقام المستخدمة مؤخرًا. */
export function nextChecksumNumber(
  cursor: number,
  digits: number,
  isTaken: (n: string) => boolean,
): { number: string; cursor: number } {
  const baseLen = Math.min(Math.max(digits, 3), 6) - 1;
  const min = 10 ** (baseLen - 1);
  const max = 10 ** baseLen - 1;
  const span = max - min + 1;
  let idx = cursor >= min && cursor <= max ? cursor - min : -1;
  for (let i = 0; i < span; i++) {
    idx = (idx + 1) % span;
    const base = String(min + idx);
    const c = checkDigit(base);
    if (c === null) continue;
    const num = base + c;
    if (isTaken(num)) continue;
    return { number: num, cursor: min + idx };
  }
  throw new Error("NO_NUMBERS_AVAILABLE");
}

/** الرقم التالي في وضع الأرقام المتسلسلة (بلا تحقق). */
export function nextSequentialNumber(cursor: number, digits: number, isTaken: (n: string) => boolean) {
  const max = 10 ** Math.min(Math.max(digits, 2), 6) - 1;
  let c = cursor;
  for (let i = 0; i < max; i++) {
    c = c >= max ? 1 : c + 1;
    const num = String(c);
    if (!isTaken(num)) return { number: num, cursor: c };
  }
  throw new Error("NO_NUMBERS_AVAILABLE");
}
