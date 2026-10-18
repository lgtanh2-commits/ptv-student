"""Writes every text of the app to a workbook for the owner to edit (English, Vietnamese, more languages).

    python3 scripts/i18n/export_text.py tutorio-ui-text.xlsx

The texts come from `node scripts/i18n/messages.mjs rows`: the web catalog (en.ts, vi.ts) and the server table
(server-text.ts), plus any server text found in the code that is not in the table yet (listed when this runs).
Send the file back with import_text.py.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

ROOT = Path(__file__).resolve().parents[2]

# Order follows a person's path through the app: welcome, sign in, then the features.
SECTIONS = [
    ("landing", "01 Trang chào (Welcome)"),
    ("home", "01 Trang chào (Welcome)"),
    ("signUp", "02 Đăng ký"),
    ("signIn", "03 Đăng nhập"),
    ("google", "03 Đăng nhập"),
    ("emailLink", "03 Đăng nhập"),
    ("verify", "04 Xác nhận email"),
    ("invite", "05 Học sinh nhận lời mời"),
    ("app", "06 Khung app & menu"),
    ("nav", "06 Khung app & menu"),
    ("notifications", "06 Khung app & menu"),
    ("common", "07 Dùng chung nhiều màn"),
    ("glossary", "07 Dùng chung nhiều màn"),
    ("dashboard", "08 Trang chủ giáo viên"),
    ("queue", "08 Trang chủ giáo viên"),
    ("invites", "08 Trang chủ giáo viên"),
    ("courses", "09 Khóa học"),
    ("courseForm", "09 Khóa học"),
    ("roster", "10 Khóa học - tab Students"),
    ("lessons", "11 Buổi học"),
    ("schedule", "12 Lịch (Schedule)"),
    ("attendance", "13 Điểm danh"),
    ("homework", "14 Bài tập (Homework)"),
    ("grading", "15 Chấm bài"),
    ("links", "16 Khóa học - tab Links"),
    ("students", "17 Học sinh"),
    ("studentDetail", "17 Học sinh"),
    ("studentCourses", "17 Học sinh"),
    ("studentAttendance", "17 Học sinh"),
    ("importStudents", "18 Nhập học sinh từ file"),
    ("invoices", "19 Phiếu thu học phí"),
    ("my", "20 Màn của học sinh"),
    ("devices", "21 Thiết bị & Telegram"),
    ("telegram", "21 Thiết bị & Telegram"),
    ("devGoogle", "99 Chỉ máy dev (không ra người dùng)"),
    ("devOutbox", "99 Chỉ máy dev (không ra người dùng)"),
]
OTHER_SECTION = "22 Màn khác"
WEB_WHERE = "apps/web/src/messages/en.ts"

NOTE_N = "{n} là số câu hỏi, vd 'Question 2: ' (xem dòng 'Question {i + 1}: ')"
NOTE_PREFIX = "Tiền tố đứng trước lỗi của từng câu hỏi"
NOTE_RANGE = "Chỉ hiện khi web gửi khoảng ngày sai, người dùng gần như không gặp"
NOTE_NEW = "Mới: chưa dịch"

GUIDE = [
    ("Tutorio - toàn bộ chữ trên giao diện web", True),
    ("", False),
    ("Sửa ở đâu", True),
    ("• Chỉ sửa các ô nền vàng: cột 'en' (tiếng Anh) và cột 'vi' (tiếng Việt).", False),
    ("• Thêm ngôn ngữ khác: thêm 1 cột mới bên phải, dòng tiêu đề ghi mã ngôn ngữ (vd: ja, ko, zh).", False),
    ("• KHÔNG sửa, xóa hay đổi thứ tự cột 'key'. Đó là mã để ghép chữ vào đúng chỗ trên web.", False),
    ("• Không thêm hay xóa dòng. Ô ngôn ngữ để trống = dùng tạm tiếng Anh.", False),
    ("", False),
    ("Chỗ giữ chỗ {...}", True),
    (
        "• Chữ trong ngoặc nhọn như {name}, {n}, {total} sẽ được thay bằng dữ liệu thật. Giữ nguyên đúng chữ đó trong bản dịch,",
        False,
    ),
    ("  được phép đổi vị trí. Cột 'giữ chỗ' liệt kê sẵn những chỗ phải có.", False),
    ("", False),
    ("Ví dụ 1 dòng đã dịch", True),
    ("key: roster.removeText", False),
    ("en: {name} will not see this course any more. You can add them back later.", False),
    ("vi: {name} sẽ không thấy khóa học này nữa. Bạn có thể thêm lại sau.", False),
    ("", False),
    ("Cột 'màn hình' và 'dùng ở' chỉ để tham khảo, sửa cũng không ảnh hưởng.", False),
    ("Nhóm 99 chỉ hiện trên máy lập trình, người dùng thật không thấy; không cần dịch.", False),
    ("", False),
    (
        "Nhóm 01-21: chữ trên các màn hình web. Nhóm 30-34: thông báo lỗi từ máy chủ, lỗi khi điền form, email,",
        False,
    ),
    ("thông báo chuông & Telegram. Câu giống nhau ở nhiều nơi chỉ có 1 dòng, sửa 1 lần là đổi mọi nơi.", False),
    ("", False),
    ("Không sửa sheet ẩn '_map' (dùng để ghép chữ về đúng chỗ khi bạn gửi file lại).", False),
]


def load_rows():
    out = subprocess.run(
        ["node", str(ROOT / "scripts/i18n/messages.mjs"), "rows"],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(out.stdout)


def note_of(server_row):
    text = server_row["id"]
    if server_row["new"]:
        return NOTE_NEW
    if text.startswith("Question {i + 1}: ") and text.strip().endswith(":"):
        return NOTE_PREFIX
    if text.startswith("{n}"):
        return NOTE_N
    if text == "range too long":
        return NOTE_RANGE
    return ""


def table_of(data):
    """(key, screen, en, vi, note, source, where) for every row: web first, then server texts, by group."""
    order = {s: i for i, (s, _) in enumerate(SECTIONS)}
    screen = dict(SECTIONS)
    web = sorted(data["web"], key=lambda r: order.get(r["key"].split(".")[0], len(order)))
    other = sorted({r["key"].split(".")[0] for r in web} - set(order))
    if other:
        print(f"Sections without a screen name (shown as '{OTHER_SECTION}'): {', '.join(other)}")
    table = [
        (r["key"], screen.get(r["key"].split(".")[0], OTHER_SECTION), r["en"], r["vi"], "", r["en"], WEB_WHERE)
        for r in web
    ]
    for s in data["server"]:
        table.append((s["key"], s["group"], s["en"], s["vi"], note_of(s), s["id"], ", ".join(s["where"])))
    table.sort(key=lambda row: row[1][:2])  # stable: group number first, original order inside
    return table


def build(table, out):
    arial = "Arial"
    head_fill = PatternFill("solid", fgColor="1F2A44")
    key_fill = PatternFill("solid", fgColor="EDEFF3")
    edit_fill = PatternFill("solid", fgColor="FFF8DC")
    thin = Side(style="thin", color="D0D4DC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    wrap = Alignment(wrap_text=True, vertical="top")

    wb = Workbook()
    guide = wb.active
    guide.title = "Hướng dẫn"
    for i, (text, bold) in enumerate(GUIDE, start=1):
        c = guide.cell(row=i, column=1, value=text or None)
        c.font = Font(name=arial, bold=bold, size=14 if i == 1 else 11)
    guide.column_dimensions["A"].width = 120

    ws = wb.create_sheet("Text")
    headers = ["key", "màn hình", "giữ chỗ (phải giữ)", "ghi chú", "en", "vi"]
    widths = [30, 30, 20, 28, 70, 70]
    edit_from = 5
    for col, (h, w) in enumerate(zip(headers, widths), start=1):
        c = ws.cell(row=1, column=col, value=h)
        c.font = Font(name=arial, bold=True, color="FFFFFF")
        c.fill = head_fill
        c.alignment = Alignment(vertical="center")
        c.border = border
        ws.column_dimensions[c.column_letter].width = w
    ws.row_dimensions[1].height = 22

    for r, (key, scr, en, vi, note, source, _) in enumerate(table, start=2):
        holders = " ".join(dict.fromkeys(re.findall(r"\{[^{}]+\}", source)))
        for col, v in enumerate([key, scr, holders or None, note or None, en, vi], start=1):
            # A cell value starting with "=" would be read as a formula: openpyxl keeps it as text only when the
            # type is set explicitly.
            c = ws.cell(row=r, column=col)
            c.value = v
            if isinstance(v, str) and v.startswith("="):
                c.data_type = "s"
            c.font = Font(name=arial, size=10, color="5A6170" if col < edit_from else "000000")
            c.alignment = wrap
            c.border = border
            c.fill = key_fill if col < edit_from else edit_fill
            if col >= edit_from:
                c.number_format = "@"
    ws.freeze_panes = "E2"
    ws.auto_filter.ref = f"A1:F{len(table) + 1}"

    hidden = wb.create_sheet("_map")
    hidden.append(["key", "en (gốc)", "nơi trong code"])
    for key, _, _, _, _, source, where in table:
        hidden.append([key, source, where])
        if source.startswith("="):
            hidden.cell(row=hidden.max_row, column=2).data_type = "s"
    hidden.sheet_state = "hidden"
    wb.save(out)


def main():
    if len(sys.argv) != 2:
        sys.exit("Usage: python3 scripts/i18n/export_text.py <out.xlsx>")
    data = load_rows()
    table = table_of(data)
    build(table, sys.argv[1])
    new = [s for s in data["server"] if s["new"]]
    print(f"{len(table)} rows ({len(data['web'])} web, {len(data['server'])} server) -> {sys.argv[1]}")
    if new:
        print(f"{len(new)} server texts in the code are not in the table yet (rows marked '{NOTE_NEW}'):")
        for s in new:
            print(f"  {s['key']}  {s['id']!r}  ({', '.join(s['where'])})")


if __name__ == "__main__":
    main()
