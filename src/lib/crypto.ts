import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const derive = (secret: string) => createHash("sha256").update(secret).digest();

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return derive(secret);
}

/** Keys tried when opening: the current secret, then SESSION_SECRET_PREVIOUS so a rotation doesn't sign everyone out. */
function keys(): Buffer[] {
  const out = [key()];
  const prev = process.env.SESSION_SECRET_PREVIOUS;
  if (prev && prev !== process.env.SESSION_SECRET) out.push(derive(prev));
  return out;
}

/** Sealed cookies are at most a few KB; anything far larger is junk and not worth decrypting. */
const MAX_TOKEN = 8192;

/** AES-256-GCM, output is base64url(iv | tag | ciphertext). */
export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

/** Returns null for anything missing, tampered, truncated, sealed with an unknown key, or not JSON. Never throws. */
export function open<T>(token: string | undefined): T | null {
  if (!token || token.length > MAX_TOKEN) return null;
  let buf: Buffer;
  let ks: Buffer[];
  try {
    buf = Buffer.from(token, "base64url");
    ks = keys();
  } catch {
    return null;
  }
  if (buf.length < 29) return null;
  for (const k of ks) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8")) as T;
    } catch { /* try the next key */ }
  }
  return null;
}
