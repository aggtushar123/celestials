// A small, dependency-free RFC 4180-ish CSV parser — good enough for
// what Settings > Entity Uploads needs (EntityUploadsPage.tsx): quoted
// fields, commas/newlines inside quotes, and "" as an escaped quote.
// Not a full RFC 4180 implementation (no configurable delimiter, no
// byte-order-mark handling beyond stripping a leading one) — this
// isn't meant to replace a real CSV library for a general-purpose
// import tool, just to read files a spreadsheet app actually exports.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a leading UTF-8 BOM, which Excel loves to add.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // \r\n — swallow the \n right after a \r rather than emitting a
      // blank row for it.
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      // A blank line (no fields typed at all) doesn't become an empty
      // row — trailing newlines in a file are common and shouldn't
      // show up as ghost rows in the preview.
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  // Last field/row, if the file doesn't end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
