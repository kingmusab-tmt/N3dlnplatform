// CSV for downloads that open cleanly in Excel / Google Sheets.

type Cell = string | number | boolean | null | undefined;

/**
 * One CSV field. Quotes when needed, and neutralises spreadsheet formulas
 * (=, +, -, @ at the start) so visitor-supplied text can't run in Excel.
 */
export function csvCell(value: Cell) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows to CSV text, with a byte-order mark so Excel reads it as UTF-8. */
export function toCsv(rows: Cell[][]) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csvResponse(csv: string, filename: string) {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
    },
  });
}
