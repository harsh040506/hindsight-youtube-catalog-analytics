const REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "SESSION_SECRET"] as const;

/** Whitespace-only values (a common copy-paste slip in hosting dashboards) count as missing. */
const has = (k: string) => Boolean(process.env[k]?.trim());

export function authConfigured(): boolean {
  return REQUIRED.every(has);
}

export function missingEnv(): string[] {
  return REQUIRED.filter((k) => !has(k));
}

/** Non-fatal configuration problems worth surfacing to the site owner. Never includes values. */
export function configWarnings(): string[] {
  const w: string[] = [];
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret.length < 32) w.push("SESSION_SECRET is shorter than 32 characters. Use `openssl rand -base64 32`.");
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  if (id && !id.endsWith(".apps.googleusercontent.com")) w.push("GOOGLE_CLIENT_ID doesn’t look like a Google OAuth client ID (it should end in .apps.googleusercontent.com).");
  const kvUrl = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
  const kvToken = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();
  if (Boolean(kvUrl) !== Boolean(kvToken)) w.push("Only half of the shared store is configured (URL and token both needed), so rate limits are per instance.");
  else if (kvUrl && !kvUrl.startsWith("https://")) w.push("The shared store URL should start with https://.");
  const app = process.env.APP_URL?.trim();
  if (app) {
    try {
      const u = new URL(app);
      if (u.protocol !== "https:" && u.hostname !== "localhost") w.push("APP_URL should start with https://.");
    } catch {
      w.push("APP_URL isn’t a valid URL, so it is being ignored.");
    }
  }
  return w;
}

/** APP_URL only when it is a well-formed http(s) origin; a typo must not break sign-in. */
export function appUrl(): string | null {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}
