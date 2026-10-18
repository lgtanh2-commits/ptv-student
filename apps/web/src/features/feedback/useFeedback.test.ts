import { afterEach, describe, expect, it, vi } from "vitest";
import { previousPagePath, useFeedbackBoard, useSendFeedback } from "./useFeedback";

function reply(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}
function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(handler);
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("previousPagePath", () => {
  it("keeps only the path of the page the person came from", () => {
    expect(previousPagePath({ back: "/courses/12?tab=x#top" })).toBe("/courses/12");
    expect(previousPagePath({ back: "/" })).toBe("/");
  });
  it("gives nothing when they landed directly or the value is odd", () => {
    expect(previousPagePath(null)).toBeUndefined();
    expect(previousPagePath({})).toBeUndefined();
    expect(previousPagePath({ back: "https://evil.example" })).toBeUndefined();
    expect(previousPagePath({ back: "//evil.example" })).toBeUndefined();
  });
});

describe("useSendFeedback", () => {
  const make = (onSent = vi.fn(), deps: { page?: string } = { page: "/schedule" }) => ({
    onSent,
    send: useSendFeedback(onSent, deps),
  });

  it("posts kind, message and the previous path once, then calls onSent and resets", async () => {
    const fetchFn = stubFetch(() => reply(201, { ok: true }));
    const { onSent, send } = make();
    send.form.values.kind = "bug";
    send.form.values.message = "The button does nothing";
    await send.form.submit();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("/api/feedback");
    expect(JSON.parse(String(init?.body))).toEqual({
      kind: "bug",
      message: "The button does nothing",
      page: "/schedule",
    });
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(send.form.values.message).toBe("");
    expect(send.form.values.kind).toBe("inconvenient");
  });

  it("sends no page when they landed directly", async () => {
    const fetchFn = stubFetch(() => reply(201, { ok: true }));
    const { send } = make(vi.fn(), { page: undefined });
    send.form.values.message = "Something is not handy";
    await send.form.submit();
    expect(JSON.parse(String(fetchFn.mock.calls[0]![1]?.body))).toEqual({
      kind: "inconvenient",
      message: "Something is not handy",
    });
  });

  it("shows a field error under the message on a 400 and keeps the text", async () => {
    stubFetch(() =>
      reply(400, {
        error: { code: "VALIDATION_FAILED", message: "Check", fields: { message: "Too short" } },
      }),
    );
    const { onSent, send } = make();
    send.form.values.message = "Long enough text";
    await send.form.submit();
    expect(send.form.errors.value.message).toBe("Too short");
    expect(send.form.values.message).toBe("Long enough text");
    expect(onSent).not.toHaveBeenCalled();
  });

  it("shows the general error on a 429 and keeps the text", async () => {
    stubFetch(() => reply(429, { error: { code: "RATE_LIMITED", message: "Slow down" } }));
    const { onSent, send } = make();
    send.form.values.message = "Long enough text";
    await send.form.submit();
    expect(send.form.formError.value).toBe("Slow down");
    expect(send.form.values.message).toBe("Long enough text");
    expect(onSent).not.toHaveBeenCalled();
  });

  it("does not call the server for a message that is too short", async () => {
    const fetchFn = stubFetch(() => reply(201, { ok: true }));
    const { send } = make();
    send.form.values.message = "abc";
    await send.form.submit();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(send.form.errors.value.message).toBeTruthy();
  });

  it("sends once when submitted twice at the same time", async () => {
    const fetchFn = stubFetch(() => reply(201, { ok: true }));
    const { send } = make();
    send.form.values.message = "Long enough text";
    await Promise.all([send.form.submit(), send.form.submit()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("useFeedbackBoard", () => {
  it("loads the three columns", async () => {
    const board = { todo: [], inProgress: [], done: [] };
    stubFetch(() => reply(200, board));
    const b = useFeedbackBoard();
    await b.reload();
    expect(b.board.value).toEqual(board);
    expect(b.loading.value).toBe(false);
    expect(b.error.value).toBeNull();
  });

  it("reports an error and keeps no board when loading fails", async () => {
    stubFetch(() => reply(500, { error: { code: "INTERNAL", message: "Oops" } }));
    const b = useFeedbackBoard();
    await b.reload();
    expect(b.board.value).toBeNull();
    expect(b.error.value).toBe("Oops");
  });
});
