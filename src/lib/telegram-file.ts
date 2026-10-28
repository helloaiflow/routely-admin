/* ───────────────────────────────────────────────────────────────────────────
 * IVY label photos live on Telegram (the driver sends them to the IVY bot).
 * We never persist a Telegram download URL: it embeds the bot token. A scan's
 * `image_url` holds only a Telegram reference:
 *   - a `file_id` (no "/") — durable; resolved with getFile on every read.
 *     Written by IVY v10 from 2026-10-28 on.
 *   - a `file_path` like "photos/file_123.jpg" — legacy rows (cleaned of the
 *     token on 2026-10-28). Telegram expires these, so most now 404.
 * The token comes from IVY_TELEGRAM_BOT_TOKEN, server-side only.
 * ───────────────────────────────────────────────────────────────────────────*/

const TG_FILE_URL_RE = /^https:\/\/api\.telegram\.org\/file\/bot[^/]+\/(.+)$/;

/** Reduce a stored image reference to a token-free file_id / file_path. */
export function telegramRef(stored: string): string {
  const m = TG_FILE_URL_RE.exec(stored.trim());
  return m ? m[1] : stored.trim();
}

/** Fetch an IVY label photo from Telegram. Null on any failure. */
export async function fetchTelegramImage(
  stored: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  const token = process.env.IVY_TELEGRAM_BOT_TOKEN ?? "";
  const ref = telegramRef(stored);
  if (!token || !ref) return null;

  try {
    let filePath = ref;
    if (!ref.includes("/")) {
      const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(ref)}`, {
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      const json = (await meta.json().catch(() => null)) as { ok?: boolean; result?: { file_path?: string } } | null;
      if (!json?.ok || !json.result?.file_path) return null;
      filePath = json.result.file_path;
    }

    const res = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!res.ok || !res.body) return null;
    let contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      // Telegram serves photos as octet-stream at times; trust the extension.
      if (/\.(jpe?g)$/i.test(filePath)) contentType = "image/jpeg";
      else if (/\.png$/i.test(filePath)) contentType = "image/png";
      else if (/\.webp$/i.test(filePath)) contentType = "image/webp";
      else return null;
    }
    return { body: res.body, contentType };
  } catch {
    return null;
  }
}
