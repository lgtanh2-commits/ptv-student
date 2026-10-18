import { type ApiErrorBody, type ErrorCode, translate } from "@lms/shared";
import { language } from "@/messages";

/** An error returned by the API, with the stable code the UI can react to. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Same key on a retry means the server does the work only once. */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * The one way to call the API. Adds the header the server requires on every
 * request that changes data (CSRF defence) and turns error responses into ApiError.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { accept: "application/json", "x-lms-lang": language };
  if (method !== "GET") headers["x-lms-client"] = "web";
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      signal: options.signal,
    });
  } catch {
    throw new ApiError(
      "NETWORK",
      translate("We could not reach the server. Please check your internet and try again.", language),
      0,
    );
  }

  if (res.ok) return (await res.json()) as T;

  let error: Partial<ApiErrorBody["error"]> | undefined;
  try {
    // A proxy or the platform in front of the API can answer with JSON of another shape.
    error = ((await res.json()) as Partial<ApiErrorBody> | null)?.error;
  } catch {
    // not JSON
  }
  throw new ApiError(
    error?.code ?? "INTERNAL",
    error?.message ?? translate("Something went wrong. Please try again.", language),
    res.status,
    error?.fields,
    error?.requestId,
  );
}
