import { LIMITS, type TelegramLinkCode, type TelegramStatus } from "@lms/shared";
import { z } from "zod";
import type { Actor } from "../auth/actor";
import type { Ctx } from "../auth/service";
import type { Env } from "../env";
import { randomToken, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { uuidv7 } from "../lib/id";
import {
  consumeLinkCode,
  deleteLinkStatement,
  deleteOtherLinkOfChatStatement,
  findLink,
  insertLinkCodeStatement,
  upsertLinkStatement,
} from "../repos/telegram";
import { AppError } from "../lib/errors";
import { telegramClient } from "./client";

/** Both settings must be there: one to send messages, one to build the "open Telegram" link. */
const isSetUp = (env: Env): env is Env & { TELEGRAM_BOT_USERNAME: string } =>
  telegramClient(env) !== null && Boolean(env.TELEGRAM_BOT_USERNAME);

export async function status(ctx: Ctx, actor: Actor): Promise<TelegramStatus> {
  const enabled = isSetUp(ctx.env);
  return { enabled, linked: enabled ? (await findLink(ctx.env.DB, actor.userId)) !== null : false };
}

/** A one-time link, good for LIMITS.telegramLinkMinutes. Opening it in Telegram links the chat to this person. */
export async function requestLinkCode(ctx: Ctx, actor: Actor): Promise<TelegramLinkCode> {
  if (!isSetUp(ctx.env)) throw new AppError("NOT_FOUND");
  const code = randomToken(24); // base64url: only the characters Telegram allows in a deep-link payload
  await insertLinkCodeStatement(ctx.env.DB, {
    id: uuidv7(),
    codeHash: await sha256Hex(code),
    userId: actor.userId,
    expiresAt: new Date(Date.now() + LIMITS.telegramLinkMinutes * 60_000).toISOString(),
  }).run();
  return {
    deepLink: `https://t.me/${ctx.env.TELEGRAM_BOT_USERNAME}?start=${code}`,
    expiresInMinutes: LIMITS.telegramLinkMinutes,
  };
}

export async function unlink(ctx: Ctx, actor: Actor): Promise<void> {
  await deleteLinkStatement(ctx.env.DB, actor.userId).run();
}

/** Checks the header Telegram sends on every webhook call. Without a secret set, nothing is ever accepted. */
export function isFromTelegram(env: Env, headerValue: string | undefined): boolean {
  return (
    Boolean(env.TELEGRAM_WEBHOOK_SECRET) &&
    Boolean(headerValue) &&
    timingSafeEqual(headerValue!, env.TELEGRAM_WEBHOOK_SECRET!)
  );
}

/** The little Telegram sends us: a chat and, when the person typed something, the text. Anything else is ignored. */
const telegramUpdateBody = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      text: z.string().max(4096).optional(),
    })
    .optional(),
});

/**
 * A message from Telegram. Only "/start <code>" does anything (it links the chat); anything else gets a short
 * reply so the person is not left wondering. Bad input is simply ignored: Telegram only needs a 200 back.
 */
export async function handleUpdate(env: Env, body: unknown): Promise<void> {
  const client = telegramClient(env);
  if (!client) return;
  const parsed = telegramUpdateBody.safeParse(body);
  const message = parsed.success ? parsed.data.message : undefined;
  if (!message) return;
  const chatId = String(message.chat.id);
  const code = /^\/start(?:@\w+)?\s+(\S+)/.exec(message.text ?? "")?.[1];
  if (!code) {
    await client.sendMessage(chatId, "Send /start with the code shown in the app to link your account.");
    return;
  }
  const link = await consumeLinkCode(env.DB, await sha256Hex(code));
  if (!link) {
    await client.sendMessage(chatId, "This code is not valid any more. Please ask the app for a new one.");
    return;
  }
  await env.DB.batch([
    deleteOtherLinkOfChatStatement(env.DB, chatId, link.user_id),
    upsertLinkStatement(env.DB, link.user_id, chatId),
  ]);
  await client.sendMessage(chatId, "Linked. You will get your notifications here too.");
}
