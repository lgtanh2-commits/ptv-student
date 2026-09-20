import type { Env } from "../env";

const API = "https://api.telegram.org";

export interface TelegramClient {
  /** Sends a plain text message. Never throws: a failure is logged and reported as `false`. */
  sendMessage(chatId: string, text: string): Promise<boolean>;
}

/**
 * Talks to the Telegram Bot API. `null` when no bot is set up (TELEGRAM_BOT_TOKEN missing), so the rest of
 * the app can treat Telegram as an optional feature without checking every setting itself.
 */
export function telegramClient(env: Env): TelegramClient | null {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  return {
    async sendMessage(chatId, text) {
      try {
        const res = await fetch(`${API}/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          // The body may explain (for example the person blocked the bot). Never logged: it can hold chat text.
          console.error(JSON.stringify({ msg: "telegram send failed", status: res.status }));
          return false;
        }
        return true;
      } catch (err) {
        console.error(JSON.stringify({ msg: "telegram send failed", err: String(err) }));
        return false;
      }
    },
  };
}
