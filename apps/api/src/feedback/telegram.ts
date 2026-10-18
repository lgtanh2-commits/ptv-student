import type { FeedbackKind } from "@lms/shared";
import type { Env } from "../env";
import { telegramClient } from "../telegram/client";

// The owner reads this in Telegram, in Vietnamese. It is not a text a student or teacher sees, so it is not
// in the translation table (scripts/i18n/scan-server.mjs skips this file).

/** Telegram refuses more than 4,096 characters; stay below with some room. */
const MAX_TEXT = 4000;

const KIND_LABEL: Record<FeedbackKind, string> = {
  inconvenient: "Chưa tiện",
  bug: "Lỗi",
  feature: "Tính năng mới",
};

export interface FeedbackNotice {
  id: string;
  kind: FeedbackKind;
  message: string;
  name: string;
  email: string;
  role: "teacher" | "student";
  tenantName: string | null;
  page: string | null;
  language: string;
  userAgent: string | null;
}

/**
 * The message for the owner. The line to accept the feedback comes first, and the sender's words sit between
 * two marker lines, so nothing the sender wrote can pass for the real line to copy. Plain text: Telegram reads
 * no formatting in it. Cut to fit Telegram's limit by shortening the sender's words, never the SQL line.
 */
export function feedbackTelegramText(o: FeedbackNotice): string {
  const head = [
    `Góp ý mới (${KIND_LABEL[o.kind]})`,
    "Để duyệt:",
    `UPDATE feedback SET status = 'todo', public_title = '...' WHERE id = '${o.id}';`,
    "",
    `Loại: ${KIND_LABEL[o.kind]}`,
    `Người gửi: ${o.name} <${o.email}>`,
    `Vai trò: ${o.role === "teacher" ? "Giáo viên" : "Học viên"}`,
    `Lớp: ${o.tenantName ?? "-"}`,
    `Trang: ${o.page ?? "-"}`,
    `Ngôn ngữ: ${o.language}`,
    `Thiết bị: ${o.userAgent ?? "-"}`,
    "",
    "--- Nội dung góp ý ---",
  ].join("\n");
  const tail = "\n--- Hết ---";
  const room = MAX_TEXT - head.length - tail.length - 1;
  const message = o.message.length > room ? `${o.message.slice(0, Math.max(0, room - 1))}…` : o.message;
  return `${head}\n${message}${tail}`.slice(0, MAX_TEXT);
}

/** Sends the notice to the owner's chat. Does nothing when the chat id or the bot is not set up. Never throws. */
export async function tellOwner(env: Env, o: FeedbackNotice): Promise<void> {
  const chatId = env.FEEDBACK_TELEGRAM_CHAT_ID?.trim();
  if (!chatId) return;
  await telegramClient(env)?.sendMessage(chatId, feedbackTelegramText(o));
}
