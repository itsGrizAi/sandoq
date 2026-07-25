#!/usr/bin/env python3
"""Build docs/user-feedback.xlsx, the user record Level 5 asks to be attached.

Run `node scripts/export-users.mjs` first: this reads the CSV it writes from
chain and turns it into a workbook, so the on-chain sheet is never hand-typed.

    pip install openpyxl
    node scripts/export-users.mjs
    python scripts/build-workbook.py

Three sheets:
  Summary          - the headline numbers and where they come from
  On-chain activity- one row per wallet, straight from testnet
  Form responses   - the Google Form's columns, filled from its Excel export

Rebuilding is safe: anything already pasted into 'Form responses' is carried
over, so refreshing the on-chain half never eats the survey data.
"""

import csv
import io
import os
import sys

try:
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
except ImportError:  # pragma: no cover - a helpful message beats a traceback
    sys.exit("openpyxl is required: pip install openpyxl")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(REPO, "docs", "user-activity.csv")
OUT_PATH = os.path.join(REPO, "docs", "user-feedback.xlsx")

FORM_URL = (
    "https://docs.google.com/forms/d/e/"
    "1FAIpQLSd-xWgr5Y-mCbFkxkCJxT8Jq3lwpHHj1JbRVZPpLPmY-POSng/viewform"
)

HEAD_FILL = PatternFill("solid", fgColor="1F2937")
HEAD_FONT = Font(color="FFFFFF", bold=True)


def read_rows():
    if not os.path.exists(CSV_PATH):
        sys.exit("docs/user-activity.csv missing - run: node scripts/export-users.mjs")
    with io.open(CSV_PATH, encoding="utf-8", newline="") as handle:
        return list(csv.reader(handle))


def existing_form_rows():
    """Survey rows already pasted into a previous build, so a rebuild keeps them."""
    if not os.path.exists(OUT_PATH):
        return []
    try:
        book = load_workbook(OUT_PATH)
    except Exception:
        return []
    if "Form responses" not in book.sheetnames:
        return []
    sheet = book["Form responses"]
    rows = [list(r) for r in sheet.iter_rows(min_row=2, values_only=True)]
    return [r for r in rows if any(cell not in (None, "") for cell in r)]


def style_header(sheet, widths):
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    for cell in sheet[1]:
        cell.fill = HEAD_FILL
        cell.font = HEAD_FONT
        cell.alignment = Alignment(vertical="center")
    sheet.freeze_panes = "A2"


def main():
    rows = read_rows()
    header, body = rows[0], rows[1:]
    carried = existing_form_rows()

    ratings = [int(r[4]) for r in body if r[4]]
    joined = [r for r in body if r[1]]
    gave_feedback = [r for r in body if r[3] == "yes"]

    book = Workbook()

    summary = book.active
    summary.title = "Summary"
    summary.append(["Metric", "Value", "Where it comes from"])
    for metric, value, source in [
        ("Distinct wallets touched on-chain", len(body), "factory listing + members() + feedback registry"),
        ("Wallets holding a circle seat", len(joined), "circle members() on testnet"),
        ("Wallets that left on-chain feedback", len(gave_feedback), "feedback registry list()"),
        (
            "Average rating (1-5)",
            round(sum(ratings) / len(ratings), 2) if ratings else "-",
            "feedback registry summary()",
        ),
        ("Google Form", FORM_URL, "responses paste into the 'Form responses' sheet"),
        ("Regenerate", "node scripts/export-users.mjs && python scripts/build-workbook.py", "reads live testnet state"),
    ]:
        summary.append([metric, value, source])
    style_header(summary, [36, 62, 52])

    activity = book.create_sheet("On-chain activity")
    activity.append(header)
    for row in body:
        activity.append(row)
    style_header(activity, [58, 30, 30, 14, 12, 18, 60, 24, 66])
    for row in activity.iter_rows(min_row=2):
        row[6].alignment = Alignment(wrap_text=True, vertical="top")

    form = book.create_sheet("Form responses")
    form.append(
        [
            "Timestamp",
            "Email",
            "Name",
            "Stellar testnet wallet (G...)",
            "Rating (1-5)",
            "What did you do?",
            "What would make it better?",
            "Can we contact you?",
        ]
    )
    for row in carried:
        form.append(row)
    style_header(form, [22, 30, 24, 58, 13, 26, 52, 20])

    book.save(OUT_PATH)
    print(
        "wrote docs/user-feedback.xlsx  (%d on-chain rows, %d form responses kept)"
        % (len(body), len(carried))
    )


if __name__ == "__main__":
    main()
