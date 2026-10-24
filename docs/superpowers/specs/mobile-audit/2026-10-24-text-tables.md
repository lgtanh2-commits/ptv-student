# Mobile layout audit 2: text, badges, tables, tiles, cards (390×844)

Scope: every `vi-m-*.png` and `en-m-*.png` in `the screenshot sweep (scripts/i18n/screens.mjs) output` (68 files, desktop `*-d-*` used for comparison), checked against `apps/web/src` on `feat/mobile-buttons` @ 66cf573. Paths below are relative to `apps/web/src/`.

This audit does not repeat the button findings of `mobile-audit.md` (R1–R9, S1–S10). Where a fix here touches the same file or markup as an approved S-change, it says so. Findings marked **(source)** have no screenshot of that state and come from the template only.

Severity: **High** means text that is broken in a way every user sees (a number torn from its unit, a key column hidden, a label wrapping to 4 lines). **Medium** means layout that looks unbalanced or ragged, or a problem in a hidden state. **Low** means polish.

---

## 1. Proposed rules for text and layout on mobile (<640px)

These rules change layout and wrapping only. Colours, fonts, radii and component variants stay as they are.

| # | Element | Rule |
|---|---|---|
| **T1** | **Numbers with units, money, dates, times, durations** | Never break inside. Formatters return non-breaking spaces (U+00A0) inside a value: `250.000 VND`, `24 thg 10, 2026`, `18 Oct 2026`, `18:30 - 20:00`, `2 điểm`. A line may break only *between* two values (date and time), never inside one. This belongs in `features/format.ts` and `fill()`, so it holds everywhere without per-page classes. |
| **T2** | **Badges, chips, status pills, counts** | One line only (`whitespace-nowrap`, which AppBadge already has). A badge never starts a new row on its own. In a list row there is **at most one** badge on the right, top-aligned with the title. Any other badge or due text goes into the meta line under the title, inside the text column, never at the left edge of the row. If a badge's label is long, the row gives the text column priority: the badge gets `max-w-[45%] truncate`. |
| **T3** | **Headings** (page title, card title, empty-state title, hero) | `text-wrap: balance`, so a 2-line heading never leaves one orphan word ("…cho việc / dạy"). User-provided titles (course names, assignment titles, student names) also get `overflow-wrap: anywhere` so a long unbroken word cannot overflow. |
| **T4** | **Paragraphs, subtitles, descriptions, hints** | `text-wrap: pretty` (avoids a single last word: "…bạn thanh / toán."). |
| **T5** | **Truncate or wrap**, by content type | **Truncate (one line, ellipsis):** names and emails in list rows, link host names, file names, device names. The full value must be visible one tap away (detail page or `title`). **Clamp to 2 lines:** a list-row sub line that holds several facts (time · course · place), notification body. **Wrap fully:** page and card titles, alert text, instructions, question text, notes, anything the user must read to act. **Break anywhere:** raw URLs and long codes shown as values (`break-all` only for URLs). Never show a raw user-agent string. |
| **T6** | **Flex rows** | Every text column in a flex row is `min-w-0 flex-1`. Do not use `flex-wrap` + `basis-40/48/56` for list rows. That pattern is the root cause of most "badge on its own line" problems (11 call sites, list in S12). `truncate` goes on the text element, never on a flex container (it does not show an ellipsis there). |
| **T7** | **Tables** | Below `sm`, no table scrolls sideways with key data or actions off-screen. A list of records becomes **stacked rows**: line 1 is the main name plus one status badge on the right; line 2 is a short definition line of the other values ("Điểm 4/14 · Gia hạn đến 25/10"); the row action sits at the right. The `InvoiceSheet` already does this with a container query (`@2xl:hidden` list plus `hidden @2xl:block` table). Promote that pattern to `ui/` (S13). |
| **T8** | **Stat tiles** | Tiles in one group always have equal height (`h-full`) and equal width. The value never wraps (`whitespace-nowrap tabular-nums`). The label wraps to at most 2 lines (`line-clamp-2 text-pretty`). On mobile: count tiles use a compact tile (`p-3`, icon 36px) in `grid-cols-2` or `grid-cols-3`, with an odd last tile spanning the full row. Money totals are not tiles on mobile but one card of key-value rows (label left, amount right). No group may take more than about 200px of height before the first real content. |
| **T9** | **Key-value pairs** (`dl`) | Short values (course, place, phone, bank) use a two-column row on mobile, with the label left and muted and the value right-aligned (or a `grid-cols-2` grid of label-over-value). Long values (links, notes) span the full width. A right-aligned block that wraps under a title is switched to left alignment (no floating "Số" label). |
| **T10** | **Alerts and banners** | The icon is top-aligned with the first text line. The text column is `min-w-0 break-words`. Actions are never placed inline at the end of the text. They go on their own row under the text, right-aligned (an `#actions` slot in AppAlert). Alert text is one paragraph of 1–3 lines. |
| **T11** | **Gutters** | Page gutter 16px (`px-4`, already the case). Card inner padding 20px (`p-5` / `px-5`) everywhere, including the receipt, auth card and the hand-in confirmation, which use 24px today. Nested panels inside a card use 12px (`p-3`). Gap between cards 24px (`gap-6`, already the case), and gap between tiles 12px. |
| **T12** | **Empty states** | At page level (nothing on the page), use the full AppEmpty (icon, title, text, call to action). Inside a card or a tab section, use a compact empty state (no 56px circle, `py-6`, title `text-sm font-medium`) or one muted line. One pattern per level, not both. |
| **T13** | **Multi-line labels next to a control** (checkbox, radio, icon + hint) | The control aligns to the **first** line (`items-start` plus a small top offset), not to the middle of the text block. |
| **T14** | **Floating layers** (toast, bell popover, sheet) | They stay inside the 16px gutter (`inset-x-4` / `max-w-[calc(100vw-2rem)]`) and their height is capped to the dynamic viewport (`max-h-[min(32rem,calc(100dvh-5rem))]`). |

---

## 2. Findings

### 2.1 Shared (seen on many screens)

| # | Sev | What is wrong | Screenshots | Source | Fix |
|---|---|---|---|---|---|
| G1 | High | **Values break inside.** Money: "(250.000 / VND)" and "Course price: 250.000 / VND". Dates: "Sử dụng lần cuối: 17:40 24 thg 10, / 2026" (×10 rows), "Bạn đã nộp bài lúc 11:49 18 thg / 10, 2026", "You handed this in at 18 Oct / 2026, 11:49". Points: "Trắc nghiệm · 2 / điểm", "Multiple choice · / 2 points". English and Vietnamese break in different places, so neither language is safe. | en-m-teacher-home, en-m-teacher-student-detail, vi-m-teacher-settings, vi-m-student-my-work, en-m-student-my-work, vi-/en-m-teacher-assignment | `features/format.ts:5-7` (`formatVnd`), `:95-104` (`formatWhen`), `:47-54`, `:58-77`, `:84-92`; `features/text.ts:2-3` (`fill`); `messages/vi.ts:602` / en (`"{n} điểm"`) | **S11** |
| G2 | High | **Badges and due text drop onto their own row, starting at the left edge.** The row pattern is `flex flex-wrap` with a text column `basis-40/48/56`. On a 390px screen the basis plus avatar plus badge is too wide, so the badge wraps to a new line under the avatar or icon. Examples: the queue badge "Đang hoạt động" under the avatar, the lesson badge "Đã lên lịch" under the time, "Quá hạn từ hôm nay \| Đã nộp" under the homework icon, and "Thiết bị này" away from the device it labels. | vi-m-teacher-home, vi-m-teacher-schedule, vi-/en-m-student-my-course, vi-/en-m-teacher-settings | `components/TeacherDashboard.vue:153-163`, `pages/SchedulePage.vue:139-154`, `components/WorkRow.vue:35-55`, `components/DeviceSettings.vue:88-96`, plus the same pattern at `CourseHomework.vue:73`, `CourseLinks.vue:77`, `CourseLessons.vue:113`, `CourseRoster.vue:121`, `MyCoursePage.vue:70`, `AttendancePage.vue:121` (source for the course tabs) | **S12** |
| G3 | Medium | **Long badges squeeze the main text.** "Đang chờ phản hồi" (~150px) leaves ~110px for name and email: "Nguyen Van P…", "invite.sweep.1792…". Students list: "mai.student@…". This week: "18:30 - 20:00 · IEL…". Badge widths differ per row ("Chưa mời" / "Đã tham gia" / "Đã mời"), so the text column width jumps from row to row. In English the same rows are fine ("Waiting"), so Vietnamese is penalised. | vi-m-teacher-home, vi-m-teacher-students | `components/InvitePanel.vue:63-70`, `pages/StudentsPage.vue:100-110`, `components/TeacherDashboard.vue:193-199` | **S12** (email on its own full-width line; badge capped). Copy option in decision D3. |
| G4 | High | **Tables scroll sideways and hide the key columns.** Assignment students: "Điểm" and the "Gia hạn" action are off-screen. In English the badge "Waiting for your score" is cut by the card edge. Invoices: the student name wraps over 3 lines ("Tran / Minh / Anh") and the status column is off-screen. Import preview **(source)**: 4 columns plus an inline error message after the badge. | vi-/en-m-teacher-assignment, vi-/en-m-teacher-invoices | `pages/AssignmentPage.vue:220-272`, `pages/InvoicesPage.vue:105-131`, `pages/StudentImportPage.vue:102-124`, `ui/AppTable.vue:6-10` | **S13**. This replaces the first audit's one-off for T34. |
| G5 | High | **Stat tiles are unbalanced.** Student home: 5 tiles in 2 columns. Labels wrap to 2, 1 and 4 lines ("Phiếu thu / học phí / chưa thanh / toán"), so the rows have different heights and the 5th tile sits alone with an empty half. Teacher home, attendance and invoices: 1 tile per row, 2–3 tiles take 210–300px before any content. Invoices: "250.000 VND" tiles at `sm:grid-cols-3` (640–1023px, sidebar hidden) leave ~85px for a `text-2xl` amount, so a value such as "12.500.000 VND" would wrap (no `nowrap`). | vi-/en-m-student-home, vi-/en-m-teacher-home, vi-/en-m-teacher-attendance, vi-/en-m-teacher-invoices | `ui/AppStat.vue:12-26`; grids at `StudentDashboard.vue:67`, `TeacherDashboard.vue:102`, `AttendancePage.vue:98`, `InvoicesPage.vue:83`, `StudentDetailPage.vue:139` | **S14**. Decision D2. |
| G6 | Medium | **Orphan words in headings and subtitles.** The hero reads "Quản lý lớp học, dành / thời gian cho việc / dạy". Other examples: "Đầy đủ công cụ cho lớp học của / bạn", "…cần / tính phí.", "…bạn thanh / toán.", "…lớp học cho / bạn.", and the long feedback card title. | vi-m-public-home, vi-m-teacher-invoice-new, vi-m-student-my-invoices, vi-m-public-accept-invite, vi-m-teacher-feedback | `pages/HomePage.vue:40,52`, `ui/AppPage.vue:40-41`, `ui/AppAuthPage.vue:12-13`, `ui/AppEmpty.vue:11-12`, `components/FeedbackBoard.vue:72` | **S15** |
| G7 | Medium | **The weekday chip shows "CN,"** with a trailing comma. The code takes `formatDayShort(...).split(" ")[0]`, which keeps the locale's comma in Vietnamese. English shows "SUN" (no comma), so the two languages differ. | vi-m-teacher-home, vi-m-student-home | `components/TeacherDashboard.vue:190`, `components/StudentDashboard.vue:177-178`, `components/CourseLessons.vue:110` (source) | **S11** (new `formatWeekdayShort`) |
| G8 | Medium | **Inner gutters differ.** Cards use 20px. The hand-in confirmation, receipt and auth card use 24px. Schedule day cards use 16px. Feedback columns and their cards use 12px plus 12px. Side by side, the text edges do not line up from card to card. | vi-m-student-my-work, vi-m-teacher-invoice-detail, vi-m-public-sign-up, vi-m-teacher-schedule | `pages/MyWorkPage.vue:103`, `components/InvoiceSheet.vue:34`, `ui/AppAuthPage.vue:15`, `pages/SchedulePage.vue:123` | **S16** |
| G9 | Medium | **Two empty-state styles inside cards.** Student detail "Điểm danh" and My course "Liên kết" use the full AppEmpty (56px circle, `text-lg` title, `py-10`, ~200px). Student home and grading history use one muted line. | vi-m-teacher-student-detail, vi-m-student-my-course, vi-m-student-home | `ui/AppEmpty.vue:7-13`; uses at `StudentDetailPage.vue:133`, `MyCoursePage.vue:52,63,99`, `StudentCourses.vue:38`, `AttendancePage.vue:108`, `FeedbackBoard.vue:76` | **S17** (combine with S8) |
| G10 | Low | **The checkbox is centred against a 2-line label** instead of the first line ("Cho phép nộp muộn (bài nộp muộn sẽ / được đánh dấu)"). | vi-m-teacher-homework-new, vi-m-public-accept-invite | `ui/AppCheckbox.vue:10` | **S21** |
| G11 | Low | **(source)** The page title block has no `min-w-0` and no word breaking. A long unbroken course name or email used as a title (student detail falls back to the name) would overflow at `text-2xl`. | none | `ui/AppPage.vue:39-41`, `ui/AppCard.vue:11-13` | **S15** (with S1/S4) |
| G12 | Medium | **A long divider label squeezes the rules to stubs.** "— Hoặc tiếp tục bằng email nhận lời mời: —" leaves two 12px lines and looks broken. | vi-m-public-accept-invite | `ui/AppDivider.vue:2`, `pages/AcceptInvitePage.vue:47` | **S21** |
| G13 | Low | **The top-bar icons are not on the page gutter.** The header `px-3` plus the 48px square button puts the menu and bell glyphs 24px from the edges, while the page title starts at 16px. The brand and the title do not share a left edge. | all signed-in `*-m-*` | `ui/AppShell.vue:24-30` | **S22** |
| G14 | Medium | **(source)** The toast is a fixed `w-80` at top-end. On a phone it covers the bell and the top bar, its left edge is off the gutter, and long Vietnamese messages wrap into a narrow box. | none | `ui/AppToast.vue:11-15` | **S20** |
| G15 | Low | **(source)** In the bell popover the notification body is cut to 1 line, so the newly reworded bodies (commit 9952b2a) are mostly hidden. `max-h-[32rem]` is not capped to the viewport (landscape, or with the keyboard open). | none | `components/NotificationBell.vue:83,116` | One-off: `line-clamp-2` and a `dvh` cap (T14) |
| G16 | Low | **(source)** The AppAlert text column has no `min-w-0` or `break-words`, so a long URL or email in an alert can overflow. Alerts that carry actions (push hint, missing receipts, feedback "Thử lại") each build their own inner flex row. | vi-m-student-home | `ui/AppAlert.vue:24`, `components/PushHint.vue:18-22`, `pages/InvoicesPage.vue:89-96`, `components/FeedbackBoard.vue:47-52` | **S19** |
| G17 | Low | Once tabs scroll (S9), the first tab must sit on the 16px gutter and the cut-off last tab must show that the row scrolls. Today the tabs also wrap ("Liên kết" alone on line 2). | vi-/en-m-teacher-course-detail | `ui/AppTabs.vue:7` | Fold into **S9**: `-mx-4 px-4 scroll-px-4`, no wrap |

### 2.2 Teacher

**teacher-home** (also G1, G2, G3, G5, G7)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| TH1 | Medium | The "Bài cần chấm" row shows the badge "Đang hoạt động" / "Open". In Vietnamese it wraps under the avatar. In a "to score" list it repeats the assignment state and gives no new information. | vi-/en-m-teacher-home | `components/TeacherDashboard.vue:153-163` | S12 row. Show the hand-in time as the meta line instead, and keep only "Nộp muộn" as a badge. |
| TH2 | Medium | Invite rows: the name, email and long badge share one line, so both texts are truncated hard (G3). | vi-m-teacher-home | `components/InvitePanel.vue:60-70` | S12: line 1 is the name plus the badge, line 2 is the full-width email. Actions use S5. |
| TH3 | Low | In "Tuần này" rows the course name is cut to "IEL…" because the sub line is truncated to 1 line beside the badge. | vi-m-teacher-home | `components/TeacherDashboard.vue:193-199` | S12: clamp the sub line to 2 lines. |
| TH4 | Medium | The receipt line puts the amount in parentheses at the end of the sentence, so it is the part that wraps. | vi-/en-m-teacher-home | `components/TeacherDashboard.vue:139-141`, `:70-75` | Put the text on the left and the amount right-aligned and nowrap (S12 trailing slot), plus S11. |

**teacher-courses**

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| TC1 | Low | A course card without a description shows the price twice ("300.000 VND" grey, then "300.000 VND" bold). The icon sits on its own row with the badge, so each card is about 185px tall. | vi-m-teacher-courses | `pages/CoursesPage.vue:64-75` | Drop the price fallback at `:73`. Below `sm`, put the icon (size-9) inline before the title, with the badge on the right of that line. |
| TC2 | Low | "Từ ngày 08/10/2026 · Đến ngày 06/01/2027" is one string. On a 360px phone it breaks mid-phrase. | vi-m-teacher-courses | `pages/CoursesPage.vue:93-96` | Wrap each half in `whitespace-nowrap`. The break then falls at "·". |

**teacher-course-detail**: only G17 (tabs). The Overview form is fine.

**teacher-students** (also G3)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| TS1 | Medium | The email is truncated to 11–20 characters next to the badge, and the text column width varies with each badge label. | vi-/en-m-teacher-students | `pages/StudentsPage.vue:98-110` | S12: the name and badge on line 1, the email full width on line 2, the chevron in a fixed slot. |
| TS2 | Low | The search and status filters stack full width and cost about 190px before the list. | vi-m-teacher-students | `pages/StudentsPage.vue:66-78` | Below `sm`, use `grid grid-cols-[minmax(0,1fr)_9rem] gap-3` on one row. |

**teacher-student-detail** (also G1, G9)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| TSD1 | Low | The profile email line puts `truncate` on a flex container (`flex items-center gap-1 truncate`). A long email is clipped without an ellipsis. | vi-m-teacher-student-detail | `pages/StudentDetailPage.vue:100-102` | Wrap the email in `<span class="min-w-0 truncate">`, with the icon `shrink-0`. |
| TSD2 | Medium | **(source)** The attendance summary puts two full AppStat tiles (48px icon) in a 2-column grid inside a card. Each tile is ~135px wide: cramped, and a card inside a card. | none | `pages/StudentDetailPage.vue:139-147` | S14 compact (inline) variant, or one key-value line "Có mặt 12 · Vắng 2". |

**teacher-student-import** (also G4 for the preview)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| TSI1 | Medium | The step labels wrap unevenly: "Thêm danh / sách", "Kiểm tra các / dòng", and "Hoàn tất" on one line, vertically centred. The three captions do not share a baseline. English fits on one line. | vi-m-teacher-student-import vs en- | `pages/StudentImportPage.vue:57-61` (the same steps are in `AssignmentFormPage.vue:294-297`) | Align the steps to the top (`[&_.step]:content-start`), use `text-sm text-balance` for the captions, or use shorter labels ("Thêm", "Kiểm tra", "Xong"). |
| TSI2 | Low | The native file input shows the browser language ("Chọn tệp / Không có tệp nào được chọn") on the English page, and a long file name will be cut without an ellipsis. | en-m-teacher-student-import | `pages/StudentImportPage.vue:77-86` | A small `ui/AppFileInput` (hidden input, AppButton label from messages, truncated file name). |

**teacher-schedule** (also G1 for the week label, G2)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| SC1 | Medium | The "Hôm nay" / "Today" badge drops under the day name instead of sitting beside it. | vi-/en-m-teacher-schedule | `pages/SchedulePage.vue:126-129` | Below `sm`: `flex items-center justify-between` (day left, badge right). Keep the column at `sm`. |
| SC2 | Medium | The lesson row breaks into 3 ragged parts: time (`w-28`), title block, and the badge alone on a new line under the time. The details are cut ("IELTS Foundation · Do K…"). | vi-m-teacher-schedule | `pages/SchedulePage.vue:137-155` | S12: line 1 is the time plus the badge (between), line 2 the title, line 3 the details (2-line clamp). |
| SC3 | Medium | Six "Chưa có buổi học" day cards (~90px each) push the only lesson of the week below the fold (first audit, section 4.6). | vi-/en-m-teacher-schedule | `pages/SchedulePage.vue:119-131` | Below `sm`, merge runs of empty days into one muted line ("T2 – T6: chưa có buổi học"), and always show today. |

**teacher-attendance** (also G5)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| AT1 | Medium | The two stat tiles (~210px) repeat what the sticky bar already says ("1 có mặt, 5 vắng mặt"). | vi-/en-m-teacher-attendance | `pages/AttendancePage.vue:98-101` | Hide the tiles below `sm` (the bar is the summary), or use the S14 compact 2-column grid. Decision D2. |
| AT2 | Low | The details `dl` is one column on mobile: "Khóa học / IELTS Foundation / Địa điểm / Room 2" takes 140px for two short values. | vi-m-teacher-attendance | `pages/AttendancePage.vue:73` | `grid-cols-2` at all sizes. The online link keeps `col-span-2` (T9). |
| AT3 | Low | "Chưa lưu" / "Not saved yet" sits in the text line after "Tham gia sau buổi học này", inside a `<p>`. With both labels present it wraps under the text. | vi-/en-m-teacher-attendance | `pages/AttendancePage.vue:123-127` | S12 trailing badge on the name line. The meta stays text only. |

**teacher-assignment** (also G1, G4)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| AS1 | High | In every question box the meta "Trắc nghiệm · 2 / điểm" is squeezed beside the badge "Hệ thống chấm điểm", so the points wrap from their unit. The meta and the badge are a `justify-between` row against the question text. | vi-/en-m-teacher-assignment | `pages/AssignmentPage.vue:153-171` | Question text on its own line. Under it, one meta line: `<span class="whitespace-nowrap">kind · points</span>` followed by the badge, left-aligned and wrapping between items only. |
| AS2 | Low | Link rows are `inline-flex`, so a long title wraps as a block and the "(host)" floats as a separate column. The same happens on My work. | vi-m-teacher-assignment, vi-m-student-my-work | `pages/AssignmentPage.vue:196-204`, `pages/MyWorkPage.vue:154-162` | Make the link inline with a `shrink-0` icon, and put the host in a `whitespace-nowrap` span after it. |

**teacher-grading** (also G1)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| GR1 | Medium | The score input (`w-28`) sits beside the question, so the question wraps in ~190px ("She ___ to school / yesterday."). The label "Điểm (trên 2)" floats top-right (first audit, section 4.7). | vi-/en-m-teacher-grading | `pages/GradingPage.vue:108-124` | Below `sm`: question full width, then a row with the label left and the input (`w-24`) right. |
| GR2 | Low | While points are missing, the total shows a lone blue "–" at `text-3xl`. It reads as a stray mark. | vi-m-teacher-grading | `pages/GradingPage.vue:210-213` | Show "– / 14" muted, with the existing hint under it. |
| GR3 | Low | **(source)** History rows are `flex-wrap justify-between`. On a long entry the date drops to its own line on the left. | none | `pages/GradingPage.vue:194-201` | Text `min-w-0 flex-1`, date `shrink-0 whitespace-nowrap text-right` (or a muted second line). |

**teacher-homework-new / teacher-assignment-edit** (also G10)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| HW1 | Medium | "Đối tượng nhận bài": both segments wrap mid-phrase ("Tất cả học viên trong / khóa học" and "Học viên được / chọn") at unequal widths. | vi-m-teacher-homework-new | `pages/AssignmentFormPage.vue:261`, `ui/AppSegmented.vue:11-16` | **S18**: equal `flex-1` options, and a `stack` layout below `sm` (one option per row, left-aligned). |
| HW2 | Low | "Tổng: 5 điểm" is a hand-made pill (`rounded-full px-3 py-1 text-sm`), a different size from every AppBadge. | vi-m-teacher-homework-new | `pages/AssignmentFormPage.vue:104-106` | Use AppBadge `tone="info"` (placement is already covered by T37). |
| HW3 | Low | In answer rows the radio is aligned with `mb-2` to the input bottom and sits above the input's centre. The input is only ~160px wide because of the "Xóa" text button. | vi-/en-m-teacher-assignment-edit | `pages/AssignmentFormPage.vue:154-178` | Radio in a box of the same height as the input (`h-12 grid place-items-center self-end`). Delete becomes an icon button (S5 icon prop). |

**teacher-invoices** (also G4, G5)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| IN1 | Low | The month heading starts lowercase ("tháng 10 năm 2026"). The same label is the subtitle on invoice detail. | vi-m-teacher-invoices, vi-m-teacher-invoice-detail | `features/invoices/period.ts:15-18`, `pages/InvoicesPage.vue:70-72` | Capitalise the first letter for display (S11). |
| IN2 | Low | **(source)** Cancelled rows join "name · number · amount" in one string, which wraps inside the amount. | none | `pages/InvoicesPage.vue:138-146` | S12: name plus number as text, amount as a trailing nowrap value. |

**teacher-invoice-detail** (and student `/my/invoices/:id`, same sheet)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| ID1 | Medium | The header's right block ("Số" + number) wraps under the title but keeps `text-right`. The label "Số" / "No." floats at the right end of a left-starting number. | vi-/en-m-teacher-invoice-detail | `components/InvoiceSheet.vue:35-47` | Below `@md`, make it left-aligned, or a key-value row (label left, number right). Use `text-right` only from `@md`. |
| ID2 | Medium | The note (Ghi chú) is `text-lg`, the largest text on the receipt after the title. It outweighs the amounts and the total. | vi-/en-m-teacher-invoice-detail | `components/InvoiceSheet.vue:131-134` | `text-base` (like other values) or `text-sm`. |
| ID3 | Low | **(source)** "Cách thanh toán" is a one-column `dl` of 5 short pairs on mobile. | none | `components/InvoiceSheet.vue:169-190` | T9 rows: label left and muted, value right. |
| ID4 | Low | **(source)** The bank account is `text-2xl tracking-widest` inside two paddings (~294px). A 14–19 digit account overflows. | none | `components/InvoiceSheet.vue:154` | Below `sm`: `text-xl tracking-wider break-all`. |

**teacher-settings and student-settings** (also G1, G2)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| SE1 | High | Every device is named by its raw user agent ("Mozilla/5.0 (Macintosh; Intel M…", ×10 rows), so the rows cannot be told apart. | vi-/en-m-teacher-settings | `components/DeviceSettings.vue:93` | Show "Chrome · macOS" from a small parser in `features/auth`. The raw string goes in `title`. |
| SE2 | Medium | The "Thiết bị này" badge sits on the button row, away from the device name it labels. | vi-/en-m-teacher-settings | `components/DeviceSettings.vue:96` | S12: the badge is on line 1 after the name. The button follows S5. |
| SE3 | Low | The push card body is a plain base-size paragraph, while the Language card above it uses the muted `text-sm` card description, so the two adjacent cards have different hierarchy. In the on-state **(source)** "Đang bật" and the paragraph share a wrapping row. | vi-/en-m-student-settings, vi-m-teacher-settings | `components/PushCard.vue:15-31` | Pass the text as the AppCard `description`. The on-badge moves to the card header actions. |

**teacher-feedback / teacher-feedback-dialog** (also G6, G8)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| FB1 | Low | The column count is a hand-made pill next to an AppBadge, with a different height and padding. | vi-/en-m-teacher-feedback | `components/FeedbackBoard.vue:60-64` | AppBadge (neutral) with `tabular-nums`. |

The feedback dialog has no text findings beyond S3/S6 from the first audit.

### 2.3 Student

**student-home** (also G5, G7, G16)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| SH1 | Low | The lesson sub line truncates the place on every row ("18:30 - 20:00 · IELTS Foundation · …"). | vi-/en-m-student-home | `components/StudentDashboard.vue:182-188` | Clamp to 2 lines (T5). |
| SH2 | Medium | **(source)** Unpaid receipt rows are `flex-wrap justify-between`. The amount and badge wrap to the left under the period. | none | `components/StudentDashboard.vue:133-146` | S12: period plus amount on line 1 (amount right, nowrap), number plus badge on line 2. |
| SH3 | Low | In Vietnamese the card header link "Tất cả phiếu thu học phí" wraps under the long title on the left. In English it sits on the right. | vi-m-student-home vs en- | `components/StudentDashboard.vue:123-127` | S4 alignment plus a shorter link ("Xem tất cả"). |

**student-my-courses**

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| MCS1 | Low | The card's first row holds only the icon when there is no open-work badge (~60px of empty height). | vi-m-student-my-courses | `pages/MyCoursesPage.vue:31-36` | Same as TC1: icon inline with the title on mobile. |

**student-my-course** (also G2 for WorkRow, G9)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| MC1 | Low | In lesson rows the place sits on line 2 or line 3 depending on the width of the date ("Sun 4 Oct, 18:30 - 20:00 · Room 2" on one line, the next row on two), so row heights are uneven. | en-m-student-my-course | `pages/MyCoursePage.vue:77-90` | Below `sm`, put date-time and place on separate lines (`flex-col`). |

**student-my-invoices**

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| MI1 | Medium | **(source)** Rows are `flex-wrap justify-between`. The amount and badge wrap to the left under "INV-… · Từ Nguyen Thi Lan". | none (empty in the capture) | `pages/MyInvoicesPage.vue:36-49` | S12 (same shape as SH2). |

**student-my-work** (also G1, G8)

| # | Sev | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|
| MW1 | Medium | The hand-in confirmation indents all text behind a 48px icon inside 24px padding (~240px of text width). The English confirmation runs to 10 lines, and the heading wraps ("Your homework was / submitted"). | vi-/en-m-student-my-work | `pages/MyWorkPage.vue:101-147` | Below `sm`: a small icon (size-8) inline with the heading, the text below at full card width, `p-5` (T11). |

### 2.4 Public

| # | Sev | Screen | What is wrong | Screenshot | Source | Fix |
|---|---|---|---|---|---|---|
| PH1 | Low | public-home | The feature cards put the icon on its own row, so 4 cards take ~1,200px. | vi-m-public-home | `pages/HomePage.vue:54-64` | Below `sm`, put the icon inline left of the title. |
| AI1 | Low | public-accept-invite | The Vietnamese copy reads "…để thêm bạn vào lớp vào lớp." (duplicated words). This is visible, but it is copy, not layout. | vi-m-public-accept-invite | `messages/vi.ts:96` | Fix the string. |

public-sign-in, sign-up, magic-link, verify-email and not-found have no findings beyond G6 (subtitle orphans) and G12 (divider).

**Navigation, drawer, dialogs (source)**: the drawer (`ui/AppShell.vue:34-45`) truncates the name and role correctly, and nav items are 44px. No findings there beyond G13. Dialog text has no issues beyond the first audit's S3.

### 2.5 Count

| Severity | Shared (G) | Per screen | Total |
|---|---|---|---|
| High | 4 | 2 | **6** |
| Medium | 7 | 18 | **25** |
| Low | 6 | 25 | **31** |
| **Total** | 17 | 45 | **62** |

11 of the 62 are fully source-only (no screenshot of that state).

---

## 3. Shared changes, then one-off edits

Numbering continues from the first audit (S1–S10).

| ID | Change | Files | Fixes | Overlap with audit 1 |
|---|---|---|---|---|
| **S11** | **Non-breaking values.** `formatVnd` joins number and unit with U+00A0. `formatWhen`, `formatDayShort`, `formatDayLong`, `formatWeek`, `formatLocalDay` replace inner spaces with U+00A0 inside each date and inside each time, keeping one normal space or ", " *between* date and time. `fill()` binds a numeric placeholder to the next word (`"{n} điểm"` gives `2 điểm`). Add `formatWeekdayShort(date)` (`Intl` `{ weekday: "short" }`, punctuation stripped). `periodLabel` capitalises its first letter. Extend `format.test.ts` and `text.test.ts` (assert U+00A0). | `features/format.ts`, `features/text.ts`, `features/invoices/period.ts`, tests; weekday call sites `TeacherDashboard.vue:190`, `StudentDashboard.vue:178`, `CourseLessons.vue:110` | G1, G7, IN1, TC2 (partly), TH4 (partly); every screen with money or dates | None. This sits in `features/`, which is logic, so no visual rule moves out of `ui/`. |
| **S12** | **New `ui/AppListRow.vue`**: one list-row layout for the whole app. A grid of `[leading] [text minmax(0,1fr)] [trailing]`, gap 12px, `px-5 py-3`. Slots: `leading` (avatar, icon, date chip), `title` (truncate), `meta` (wrapping line of nowrap items, optional `clamp`), `trailing` (one badge or one value, `self-start shrink-0 max-w-[45%]`), `below` (spans text and trailing columns, so it is indented to the text, never to the left edge). It works as a link (`to`) or a plain `li`. Architecture test: no `basis-*` on list-row text columns outside `ui/`. | new `ui/AppListRow.vue`, `architecture.test.ts`; `WorkRow.vue:33-56`, `TeacherDashboard.vue:139-143,151-164,183-200`, `InvitePanel.vue:60-79`, `StudentsPage.vue:98-111`, `StudentCourses.vue:41-56`, `DeviceSettings.vue:88-100`, `SchedulePage.vue:132-180`, `AttendancePage.vue:115-135`, `MyCoursePage.vue:65-93`, `MyInvoicesPage.vue:36-50`, `StudentDashboard.vue:132-147,164-199`, `InvoicesPage.vue:137-147`, `GradingPage.vue:194-201`, `CourseRoster.vue:119-136`, `CourseLessons.vue:102-141`, `CourseHomework.vue:73-86`, `CourseLinks.vue:71-89` | G2, G3, TH1–TH4, TS1, SC2, AT3, SE2, SH1, SH2, MI1, MC1, IN2, GR3, TSD1 | **Combine with S5 (AppRowActions).** Row actions render in the `below` slot, right-aligned (`justify-end`), so S5 becomes a part of AppListRow rather than a second component. Also uses S6 (the attendance segmented control goes in `below`). |
| **S13** | **Responsive data list.** New `ui/AppDataList.vue`, which generalises the InvoiceSheet pattern. A container-query wrapper with a `#table` slot (shown `@2xl`, the existing AppTable markup) and a `#list` slot (shown below `@2xl`, made of AppListRow items: primary cell as title, status badge as trailing, secondary cells as a `meta` definition line "Điểm 4/14 · Nộp muộn", action in `below`). AppTable stays for desktop-only use. Architecture test: AppTable used outside AppDataList needs an explicit comment. | new `ui/AppDataList.vue`; `AssignmentPage.vue:218-274`, `InvoicesPage.vue:104-133`, `StudentImportPage.vue:95-125`; migrate `InvoiceSheet.vue:62-125` to it | G4 (assignment, invoices, import), TSI preview | **Replaces the one-off for T34** in the first audit's list ("AssignmentPage stacked list on mobile"). The row action ("Gia hạn") follows R5/S5 inside the row. |
| **S14** | **AppStat and new `ui/AppStatGroup.vue`.** AppStat: `h-full min-w-0`, value `whitespace-nowrap tabular-nums`, label `line-clamp-2 text-pretty leading-snug`. Below `sm`: `p-3 gap-3`, icon box size-9 (icon 18). A `layout="stack"` option (small icon above the value) for 3-column use. AppStatGroup: props `kind="count" \| "money"`. Count: `grid-cols-2` (2 or 4 items) or `grid-cols-3` (3 items) on mobile, an odd last item `col-span-2`, the existing `sm`/`lg` columns kept. Money: one AppCard of key-value rows below `sm` (label left, amount right), tiles from `md`. | `ui/AppStat.vue`, new `ui/AppStatGroup.vue`; `TeacherDashboard.vue:102-106`, `StudentDashboard.vue:67-77`, `AttendancePage.vue:98-101`, `InvoicesPage.vue:83-87`, `StudentDetailPage.vue:139-147` | G5, AT1, TSD2 | First audit, section 4.3 and 4.4 (not approved changes, just noted). No S-overlap. |
| **S15** | **Global text wrapping** in `styles/main.css`: `h1, h2, h3 { text-wrap: balance }`, `p, li, dd, figcaption { text-wrap: pretty }`, and a `.user-text { overflow-wrap: anywhere }` utility (or Tailwind `wrap-anywhere`) for user-provided titles and names. AppPage title block `min-w-0 flex-1` plus `wrap-anywhere`. AppCard title block `min-w-0 flex-1`. | `styles/main.css`, `ui/AppPage.vue:39-41`, `ui/AppCard.vue:11-13` | G6, G11, the subtitle orphans on all public and auth pages | **Must be done in the same edit as S1 (AppPage header) and S4 (AppCard header)**, since they rewrite the same `<header>` markup. Add `min-w-0 flex-1` to the title block while making the header `flex-col` on mobile. |
| **S16** | **Gutter rule (T11).** Card padding is 20px everywhere. `ui/AppAuthPage.vue:15` `p-6` becomes `p-5` (keep `md:p-8`). The receipt `InvoiceSheet.vue:34` `p-6` becomes `p-5` (keep `md:p-10`). The hand-in result `MyWorkPage.vue:103` `p-6` becomes `p-5`. Schedule day `SchedulePage.vue:123` `p-4` becomes `p-5`. Feedback columns keep `p-3` (nested). Document the scale in the main.css header comment. | `ui/AppAuthPage.vue`, `InvoiceSheet.vue`, `MyWorkPage.vue`, `SchedulePage.vue` | G8, MW1 (partly) | None |
| **S17** | **AppEmpty `compact` prop** (T12): no circle, `py-6`, title `text-sm font-medium`, optional text. Use it in every card or tab section. Replace the plain `<p>` empty lines in `StudentDashboard.vue:85,97,109,128,161` and `GradingPage.vue:192` with it. | `ui/AppEmpty.vue`; the uses listed in G9 | G9 | **Same file as S8** (full-width CTA). Do both in one edit. Compact mode keeps the S8 CTA rule. |
| **S18** | **AppSegmented equal options and `stack` mode**: options `flex-1 basis-0`. With `stack`, below `sm` the group is `join-vertical w-full` with left-aligned labels. | `ui/AppSegmented.vue`; `AssignmentFormPage.vue:261`, `FeedbackDialog.vue` (type), `AttendancePage.vue:129` | HW1 | **Same component as S6** (`block`, 44px). Merge: `block` gives full width, `stack` gives vertical. |
| **S19** | **AppAlert layout**: text column `min-w-0 break-words`, icon `mt-0.5`, new `#actions` slot rendered on its own row under the text, right-aligned (`col-span-full flex justify-end gap-2`). | `ui/AppAlert.vue`; `PushHint.vue:17-23`, `InvoicesPage.vue:89-96`, `FeedbackBoard.vue:47-52` | G16 | **Replaces the one-offs S1x (PushHint), T46 (missing-receipts "Tạo") and S-F3 (feedback "Thử lại")** in the first audit. The same right-aligned result, but owned by `ui/`. |
| **S20** | **AppToast on mobile**: `toast-top toast-center` (or bottom, above S10 bars) with `w-[calc(100vw-2rem)] sm:w-80`, and `sm:toast-end`. | `ui/AppToast.vue` | G14 | It should sit above `AppActionBar` (S10) when the toast is at the bottom: `bottom-[calc(theme(spacing.20)+env(safe-area-inset-bottom))]`. |
| **S21** | **AppCheckbox and AppDivider**: checkbox row `items-start` with the input `mt-0.5`. AppDivider: when the label is longer than ~24 characters, render a centred muted caption without the side rules (prop `plain`, or `whitespace-normal text-center` with `max-w-[70%]` on the text). | `ui/AppCheckbox.vue:10`, `ui/AppDivider.vue:2`, `AcceptInvitePage.vue:47` | G10, G12 | None |
| **S22** | **Top bar on the gutter**: header `px-1`, so the 48px menu button's glyph lands on the 16px page gutter and the bell glyph mirrors it on the right. | `ui/AppShell.vue:24` | G13 | Check against S7 (44px targets): unchanged, since buttons stay 48px. |

**One-off page edits** (not worth a component):
- `CoursesPage.vue:73` drop the duplicate price. `:64-71` and `MyCoursesPage.vue:31-38`: icon inline with the title on mobile (TC1, MCS1). `:93-96` nowrap halves (TC2).
- `StudentsPage.vue:66-78`: filters on one row (TS2).
- `StudentImportPage.vue:57-61` and `AssignmentFormPage.vue:294-297`: top-aligned steps with balanced captions (TSI1). `:77-86`: `AppFileInput` (TSI2, may become a small `ui/` piece).
- `SchedulePage.vue:126-129`: day header row (SC1). `:119-131`: collapse empty days (SC3).
- `AttendancePage.vue:73`: two-column `dl` (AT2).
- `AssignmentPage.vue:153-171`: question meta line (AS1). `:196-204` and `MyWorkPage.vue:154-162`: inline links (AS2).
- `GradingPage.vue:108-124`: score row under the question on mobile (GR1). `:210-213`: muted "– / 14" (GR2).
- `AssignmentFormPage.vue:104-106`: AppBadge for the total (HW2). `:154-178`: radio alignment (HW3).
- `InvoiceSheet.vue:35-47` (ID1), `:133` (ID2), `:169-190` (ID3), `:154` (ID4).
- `DeviceSettings.vue:93` plus a parser in `features/auth/` (SE1). `PushCard.vue:15-31` description (SE3).
- `FeedbackBoard.vue:62-64`: AppBadge count (FB1).
- `MyWorkPage.vue:101-147`: compact confirmation layout (MW1).
- `HomePage.vue:54-64`: inline feature icons (PH1).
- `NotificationBell.vue:83,116`: `dvh` cap and 2-line body (G15).
- `messages/vi.ts:96`: duplicated "vào lớp" (AI1).

**Order.** Do S11 first: it is pure logic with unit tests and fixes the 3 most visible High issues on its own. Next, S15 together with S1 and S4. Then S12 together with S5 and S6. Then S13, S14, and finally the small ui changes S16–S22.

---

## 4. Decisions for the owner

1. **Tables on mobile (S13).** *Stacked rows* (recommended) show every value and the row action with no sideways scroll, but people can no longer compare one column down the page, and each table has two templates to maintain (the InvoiceSheet already does this). *A table with a sticky first column and the minor columns hidden* keeps one template and column scanning, but the action column ("Gia hạn") and the status still need a sideways swipe.
2. **Stat tiles on small screens (S14).** Option A: keep tiles everywhere in a compact 2–3 column grid. This keeps the dashboard look and costs about 150–200px. Option B: replace the tiles with one summary card of key-value rows on mobile, and hide them on Attendance, where the sticky bar already gives the same numbers. Option B is denser and calmer but looks less like a dashboard. The money totals on Invoices need B in either case, because the amounts do not fit in tiles.
3. **Long Vietnamese status labels.** Layout alone (S12: badge capped at 45% and the email on its own line) fixes the squeeze, but labels such as "Đang chờ phản hồi", "Chờ chấm điểm" and "Đang hoạt động" (on the "to score" list, where it adds nothing) still dominate rows that English keeps short ("Waiting", "Open"). Shorter mobile-friendly copy ("Chờ phản hồi", "Chờ chấm", dropping the queue badge) gives a cleaner list, but it changes wording that was just approved in commit 9952b2a and has to be agreed in both languages.
