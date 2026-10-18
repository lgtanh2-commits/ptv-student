import { feedbackBody, type FeedbackBoard, type FeedbackKind } from "@lms/shared";
import { ref } from "vue";
import { api } from "@/api/client";
import { useForm } from "@/features/forms/useForm";
import { messages } from "@/messages";

/**
 * The path (no query, no #) of the screen the person came from, which the router keeps in the
 * history state. Nothing when they landed here directly.
 */
export function previousPagePath(state: unknown): string | undefined {
  const back = (state as { back?: unknown } | null)?.back;
  if (typeof back !== "string" || !back.startsWith("/") || back.startsWith("//")) return undefined;
  return back.split(/[?#]/)[0] || undefined;
}

/** The public board: what Tutorio accepted (to do), is building (in progress) and finished (done). */
export function useFeedbackBoard() {
  const board = ref<FeedbackBoard | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function reload(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      board.value = await api<FeedbackBoard>("/feedback/board");
    } catch (err) {
      board.value = null;
      error.value = err instanceof Error ? err.message : messages.common.somethingWrong;
    } finally {
      loading.value = false;
    }
  }

  return { board, loading, error, reload };
}

/** Sending feedback. `onSent` runs after the server saved it. */
export function useSendFeedback(onSent: () => void, deps: { page?: string } = {}) {
  const page = "page" in deps ? deps.page : previousPagePath(window.history.state);

  const form = useForm<{ kind: FeedbackKind; message: string }>(
    { kind: "inconvenient", message: "" },
    {
      schema: feedbackBody,
      submit: async (values) => {
        await api<{ ok: true }>("/feedback", {
          method: "POST",
          body: { kind: values.kind, message: values.message, ...(page ? { page } : {}) },
        });
        values.kind = "inconvenient";
        values.message = "";
        onSent();
      },
    },
  );

  return { form };
}
