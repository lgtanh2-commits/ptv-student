import type { QuestionKind } from "@lms/shared";

/** One question read from pasted or uploaded text. Nothing is ever dropped: when the kind or the
 * correct answer cannot be told for sure, the question is still kept, with a note on what to check. */
export interface ParsedQuestion {
  /** Its position in the text, 1 and up, for the preview and for messages. */
  n: number;
  kind: QuestionKind;
  text: string;
  points: string;
  options: string[];
  correct: number | null;
  accepted: string[];
  review?: string;
}

const NUMBERING = /^\s*\d+[.)]\s*/;
const POINTS = /\(\s*(\d+(?:[.,]\d+)?)\s*(?:đ|điểm|pts?|points?)\s*\)\s*$/i;
const TAG_WRITTEN = /^\[\s*(tự luận|essay|written|writing)\s*\]\s*/i;
const TAG_SPEAKING = /^\[\s*(nói|nghe nói|speaking|speak)\s*\]\s*/i;
const OPTION = /^([A-Za-z])[.)]\s*(.*)$/;
const ANSWER_LINE = /^(đáp\s*án|answer)\s*:\s*(.*)$/i;
const ANSWER_LETTER = /^[A-Za-z]$/;

/** A `*` at the start or the end of an answer marks it as the correct one. */
function readOption(raw: string): { text: string; marked: boolean } {
  let s = raw.trim();
  let marked = false;
  if (s.startsWith("*")) {
    marked = true;
    s = s.slice(1).trim();
  }
  if (s.endsWith("*")) {
    marked = true;
    s = s.slice(0, -1).trim();
  }
  return { text: s, marked };
}

/**
 * Reads homework text (pasted, or from a file) into a list of questions.
 * Questions are separated by a blank line. See `apps/web/src/features/homework/sample.ts` for the format.
 */
export function parseHomeworkText(input: string): ParsedQuestion[] {
  const normalized = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized
    .split(/\n\s*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    )
    .filter((lines) => lines.length > 0);

  return blocks.map((lines, i): ParsedQuestion => {
    const n = i + 1;
    let head = lines[0]!.replace(NUMBERING, "").trim();
    const body = lines.slice(1);

    const pointsMatch = POINTS.exec(head);
    const points = pointsMatch ? pointsMatch[1]!.replace(",", ".") : null;
    if (pointsMatch) head = head.slice(0, pointsMatch.index).trim();

    const writtenTag = TAG_WRITTEN.exec(head);
    const speakingTag = !writtenTag ? TAG_SPEAKING.exec(head) : null;
    if (writtenTag) head = head.slice(writtenTag[0].length).trim();
    if (speakingTag) head = head.slice(speakingTag[0].length).trim();

    if (writtenTag || speakingTag) {
      const kind: QuestionKind = writtenTag ? "written" : "speaking";
      return {
        n,
        kind,
        text: [head, ...body].filter((l) => l !== "").join(" "),
        points: points ?? "5",
        options: [],
        correct: null,
        accepted: [],
      };
    }

    const optionLines = body
      .map((line) => ({ line, match: OPTION.exec(line) }))
      .filter((x): x is { line: string; match: RegExpExecArray } => x.match !== null);
    const answerLine = body.find((line) => ANSWER_LINE.test(line));
    const leftover = body.filter((line) => !OPTION.test(line) && line !== answerLine);

    if (optionLines.length >= 2) {
      let correct: number | null = null;
      let conflict = false;
      const options = optionLines.map(({ match }, oi) => {
        const { text, marked } = readOption(match[2]!);
        if (marked) {
          if (correct !== null) conflict = true;
          correct = oi;
        }
        return text;
      });
      if (answerLine) {
        const letter = ANSWER_LINE.exec(answerLine)![2]!.trim();
        if (ANSWER_LETTER.test(letter)) {
          const at = optionLines.findIndex(({ match }) => match[1]!.toUpperCase() === letter.toUpperCase());
          if (at >= 0) {
            if (correct !== null && correct !== at) conflict = true;
            else correct = at;
          }
        }
      }
      return {
        n,
        kind: "choice",
        text: head,
        points: points ?? "1",
        options,
        correct,
        accepted: [],
        review: conflict
          ? "More than one answer is marked correct — choose the right one again."
          : leftover.length > 0
            ? `A line was not understood: "${leftover[0]}"`
            : undefined,
      };
    }

    if (answerLine) {
      const accepted = ANSWER_LINE.exec(answerLine)![2]!
        .split(",")
        .map((a) => a.trim())
        .filter((a) => a !== "");
      return {
        n,
        kind: "short",
        text: head,
        points: points ?? "1",
        options: [],
        correct: null,
        accepted: accepted.length > 0 ? accepted : [""],
        review: leftover.length > 0 ? `A line was not understood: "${leftover[0]}"` : undefined,
      };
    }

    return {
      n,
      kind: "written",
      text: [head, ...body].filter((l) => l !== "").join(" "),
      points: points ?? "5",
      options: [],
      correct: null,
      accepted: [],
      review: "The kind could not be told — kept as Writing. Please check it.",
    };
  });
}
