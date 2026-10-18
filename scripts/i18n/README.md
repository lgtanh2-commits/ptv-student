# Text spreadsheet

All text of the app (web screens, server errors, emails, notifications) in one Excel file, so the owner can
edit the English and the Vietnamese. Needs Python 3 with `openpyxl` (`pip install openpyxl`) and Node.

Export the current text to a new file (also lists server texts in the code that are not in the table yet):

```sh
python3 scripts/i18n/export_text.py tutorio-ui-text.xlsx
```

Import the edited file. It checks every row first (unknown, missing or repeated keys, placeholders like
`{name}` that must stay, spaces at the start or end) and writes nothing if a row is wrong:

```sh
python3 scripts/i18n/import_text.py tutorio-ui-text.xlsx
```

The import writes `apps/web/src/messages/vi.ts`, `packages/shared/src/i18n/server-text.ts`, and, when the
English of a web text was edited, that text in `apps/web/src/messages/en.ts` (or the glossary). Run
`pnpm test:scripts` and `pnpm typecheck` after it, and do not commit the `.xlsx` file.
