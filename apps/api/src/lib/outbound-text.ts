import { SERVER_TEXT, translate, type Language, type ServerText } from "@lms/shared";
import type { EmailMessage } from "../email/provider";
import type { Kind } from "../repos/notifications";

/**
 * Emails and notifications (and the push messages made from them) are made in English and stored or sent as finished text. They are
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

/**
 * The table texts the title and the body of each kind of notification can hold. The rest is user content.
 * The texts marked "before 2026-10-24" translate notifications stored with the old wording; they can be removed
 * after 2027-01-23 (notifications are deleted after 90 days).
 */
export const NOTICE_IDS: Record<Kind, { title: readonly string[]; body: readonly string[] }> = {
  homework_new: {
    title: [
      "You have a new assignment!",
      "New homework: {title}", // before 2026-10-24
    ],
    body: ["You have a new assignment from {course}."],
  },
  homework_due: {
    title: [
      "{title} is due soon",
      "Due soon: {title}", // before 2026-10-24
    ],
    body: ["Your assignment is due in 24 hours. Try to finish it early!"],
  },
  homework_overdue: {
    title: [
      "{title} is overdue!",
      "Overdue: {title}. Please finish it soon.", // before 2026-10-24
      "Overdue and closed: {title}. Ask your teacher to open it again.", // before 2026-10-24
    ],
    body: [
      "Your assignment is past its due date. Please hand it in as soon as you can!",
      "Your assignment is past its due date and can no longer be handed in. Please contact your teacher for help!",
    ],
  },
  homework_returned: {
    title: [
      "{title} has been marked",
      "Your work was scored: {title}", // before 2026-10-24
    ],
    body: ["Your results are ready. Tap to view."],
  },
  homework_again: {
    title: [
      "Please revise {title}",
      "Please change your work: {title}", // before 2026-10-24
    ],
    body: ["Your teacher has asked you to redo this assignment. Tap to view."],
  },
  receipt_sent: {
    title: [
      "You have a new fee receipt!",
      "New fee receipt: {monthName(current.period)}", // before 2026-10-24
    ],
    body: ["Your teacher has sent you a new fee receipt. Tap to view."],
  },
  work_handed_in: {
    // "Nam handed in work" (old) also fits "{name} handed in {title}"; the old text has more fixed words, so it wins.
    title: [
      "{s.name} handed in work", // before 2026-10-24
      "{name} handed in {title}",
    ],
    body: ["Please check {name}'s work."],
  },
  lesson_changed: {
    title: [
      "Your lesson has been changed",
      "Your class time changed", // before 2026-10-24
    ],
    body: [
      "Your lesson has been updated. Tap to view.",
      "{lesson.course_name} · now {body.date} {body.startTime}", // before 2026-10-24
    ],
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
