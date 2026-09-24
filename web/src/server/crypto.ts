import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let cachedKey: Buffer | null = null;

/** مفتاح التشفير: من APP_SECRET، وإلا يُولَّد مرة ويُحفظ في .data/app-secret */
function masterKey(): Buffer {
  if (cachedKey) return cachedKey;
  let secret = process.env.APP_SECRET?.trim();
  if (!secret) {
    const dir = path.join(process.cwd(), ".data");
    const file = path.join(dir, "app-secret");
    try {
      secret = fs.readFileSync(file, "utf8").trim();
    } catch {
      secret = crypto.randomBytes(32).toString("base64url");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, secret, { mode: 0o600 });
      console.warn("[dorak] APP_SECRET غير محدد. تم توليد مفتاح في .data/app-secret — احفظه في بيئة الإنتاج.");
    }
  }
  cachedKey = crypto.createHash("sha256").update(secret).digest();
  return cachedKey;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(blob: string): string | null {
  try {
    const [iv, tag, ct] = blob.split(".");
    const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString("base64url");

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(len: number, alphabet = ALNUM): string {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}
export const randomDigits = (len: number) => randomCode(len, "0123456789");

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${h.toString("base64url")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const h = crypto.scryptSync(pw, Buffer.from(salt, "base64url"), 32);
  const expected = Buffer.from(hash, "base64url");
  return expected.length === h.length && crypto.timingSafeEqual(h, expected);
}
