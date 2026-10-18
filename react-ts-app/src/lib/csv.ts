export type CsvCell = string | number;

/** RFC 4180 CSV: every value quoted, a quote inside one doubled, rows
 *  joined by CRLF. Quoting everything keeps commas and line breaks safe. */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

/** Hands `csv` to the browser as a file download, then frees the URL a tick
 *  later, once the browser has picked the download up. */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
