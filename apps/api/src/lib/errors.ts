import { ERROR_CODES, translate, type ApiErrorBody, type ErrorCode, type Language } from "@lms/shared";

/** Throw this from any route. The global handler turns it into a JSON error. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, options?: { fields?: Record<string, string>; message?: string }) {
    super(options?.message ?? ERROR_CODES[code].message);
    this.name = "AppError";
    this.code = code;
    this.fields = options?.fields;
  }

  get status(): number {
    return ERROR_CODES[this.code].status;
  }
}

/** The JSON for an error, with the message and every field message in the person's language. */
export function errorBody(err: AppError, requestId: string, language: Language): ApiErrorBody {
  const fields = err.fields
    ? Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, translate(v, language)]))
    : undefined;
  return {
    error: {
      code: err.code,
      message: translate(err.message, language),
      ...(fields ? { fields } : {}),
      requestId,
    },
  };
}
