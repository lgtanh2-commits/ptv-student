import { SERVER_TEXT, translate, type Language, type ServerText } from "@lms/shared";
import type { EmailMessage } from "../email/provider";
import type { Kind } from "../repos/notifications";

/**
 * Emails, notifications and Telegram messages are made in English and stored or sent as finished text. They are
 * put into the recipient's language with only the table texts their kind can hold, so a name or homework title
 * that looks like another table text (`"Bob handed in work"`, `"Due soon: x"`) is never translated as that text:
 * it is user content and stays as it is.
 */
const textsOf = (ids: readonly string[]): readonly ServerText[] =>
  SERVER_TEXT.filter((e) => ids.includes(e.id));

/** The table texts each email can hold (its subject and its lines; see email/templates.ts and invoices). */
export const EMAIL_IDS: Record<string, readonly string[]> = {
  verify_email: [
    "Please confirm your email",
    "Hi {name},",
    "Thanks for joining. Please confirm your email address. This also signs you in:",
    "This link works for 24 hours. If you did not sign up, you can ignore this email.",
  ],
  magic_link: [
    "Your sign in link",
    "Hi {name},",
    "Use this link to sign in. You do not need a password:",
    "This link works for 15 minutes and only once. If you did not ask for it, you can ignore this email.",
  ],
  invite: [
    "{teacherName} invited you",
    "Hi {studentName},",
    "{teacherName} invited you to join their class. Accept the invite here:",
    "This link works for 7 days. If you do not know this person, you can ignore this email.",
  ],
  invoice: [
    "Your fee receipt for {monthName(current.period)}",
    "Hello {current.student_name},",
    "{issued.teacherName} sent you a fee receipt for {monthName(current.period)}.",
    "You can open it here and print it:",
    "You need to sign in with this email address.",
  ],
};

/** The table texts the title and the body of each kind of notification can hold. The rest is user content. */
export const NOTICE_IDS: Record<Kind, { title: readonly string[]; body: readonly string[] }> = {
  homework_new: { title: ["New homework: {title}"], body: [] },
  homework_due: { title: ["Due soon: {title}"], body: [] },
  homework_returned: { title: ["Your work was scored: {title}"], body: [] },
  homework_again: { title: ["Please change your work: {title}"], body: [] },
  receipt_sent: { title: ["New fee receipt: {monthName(current.period)}"], body: [] },
  work_handed_in: { title: ["{s.name} handed in work"], body: [] },
  lesson_changed: {
    title: ["Your class time changed"],
    body: ["{lesson.course_name} · now {body.date} {body.startTime}"],
  },
};

const NONE: readonly ServerText[] = [];
const emailTables = new Map(Object.entries(EMAIL_IDS).map(([kind, ids]) => [kind, textsOf(ids)]));
const noticeTables = new Map(
  Object.entries(NOTICE_IDS).map(([kind, ids]) => [
    kind,
    { title: textsOf(ids.title), body: textsOf(ids.body) },
  ]),
);

/** The email in `lang`: the subject and each line on its own (a link line is not a table text and stays). */
export function emailIn(message: EmailMessage, lang: Language): EmailMessage {
  const table = emailTables.get(message.kind) ?? NONE;
  return {
    ...message,
    subject: translate(message.subject, lang, table),
    text: message.text
      .split("\n")
      .map((line) => translate(line, lang, table))
      .join("\n"),
  };
}

/** The title and body of a stored notification in `lang`. A kind we do not know is shown as it was stored. */
export function noticeIn(
  row: { kind: string; title: string; body: string },
  lang: Language,
): { title: string; body: string } {
  const tables = noticeTables.get(row.kind);
  return {
    title: translate(row.title, lang, tables?.title ?? NONE),
    body: translate(row.body, lang, tables?.body ?? NONE),
  };
}
