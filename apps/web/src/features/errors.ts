import { ApiError } from "@/api/client";
import { messages } from "@/messages";

/** The words to show for an error from the server or the network. */
export const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : messages.common.somethingWrong;

export const statusOf = (err: unknown): number | undefined =>
  err instanceof ApiError ? err.status : undefined;
