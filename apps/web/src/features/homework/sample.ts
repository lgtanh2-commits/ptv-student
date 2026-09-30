import { saveFile } from "@/features/download";

/** An example of every kind of question, in the format the import reads. */
export const SAMPLE_HOMEWORK_TEXT = [
  "1. What is the capital of Vietnam? (1 point)",
  "A. Ho Chi Minh City",
  "B. Hanoi *",
  "C. Da Nang",
  "D. Hue",
  "",
  "2. 5 + 3 = ? (1 point)",
  "Answer: 8, eight",
  "",
  "3. [Essay] Write 100 words about your family. (5 points)",
  "",
  "4. [Speaking] Describe your hobby in 1 minute. Add a video link. (5 points)",
].join("\r\n");

export const SAMPLE_HOMEWORK_FILE_NAME = "homework-sample.txt";

/** Saves the sample text as a file, ready to replace with real questions. */
export function downloadSampleHomework(): void {
  saveFile(
    new Blob(["﻿", SAMPLE_HOMEWORK_TEXT, "\r\n"], { type: "text/plain;charset=utf-8" }),
    SAMPLE_HOMEWORK_FILE_NAME,
  );
}
