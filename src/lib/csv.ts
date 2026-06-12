/**
 * Minimal client-side CSV export. Builds a CSV string from rows + column
 * definitions and triggers a browser download. Used by the analytics tables
 * (Revenue, Call Analytics, Health, Dunning) so operators can pull numbers
 * for a specific customer or period.
 */

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

const escapeCell = (raw: unknown): string => {
  const s = raw === null || raw === undefined ? '' : String(raw);
  // Quote fields containing commas, quotes, or newlines; double up inner quotes.
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function exportToCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const header = columns.map((c) => escapeCell(c.header)).join(',');
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(','))
    .join('\n');
  const csv = `${header}\n${body}`;

  // Prepend BOM so Excel reads UTF-8 correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
