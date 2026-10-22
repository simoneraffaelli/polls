import { CollectionError } from "./errors";

/** Strict CSV for controlled local imports: quotes, escaped quotes and embedded newlines. */
export function parseCsv(
  content: string,
  limits: { maxRows: number; maxColumns: number; maxCellChars: number },
): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  const input = content.startsWith("\uFEFF") ? content.slice(1) : content;

  function addField() {
    if (field.length > limits.maxCellChars || row.length >= limits.maxColumns) {
      throw new CollectionError("budget", "CSV cell or column limit exceeded");
    }
    row.push(field);
    field = "";
    afterQuote = false;
  }
  function addRow() {
    addField();
    if (row.length === 1 && row[0] === "" && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    if (rows.length > limits.maxRows + 1)
      throw new CollectionError("budget", "CSV row limit exceeded");
    row = [];
  }

  function readQuotedCharacter(
    char: string,
    next: string | undefined,
  ): boolean {
    const escapedQuote = char === '"' && next === '"';
    if (escapedQuote) {
      field += '"';
    } else if (char === '"') {
      quoted = false;
      afterQuote = true;
    } else {
      field += char;
    }
    if (field.length > limits.maxCellChars)
      throw new CollectionError("budget", "CSV cell limit exceeded");
    return escapedQuote;
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (readQuotedCharacter(char, input[index + 1])) index += 1;
      continue;
    }
    if (char === '"') {
      if (field || afterQuote)
        throw new CollectionError("schema", "Malformed CSV quoting");
      quoted = true;
    } else if (char === ",") {
      addField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      addRow();
    } else {
      if (afterQuote)
        throw new CollectionError("schema", "Malformed CSV quoting");
      field += char;
      if (field.length > limits.maxCellChars)
        throw new CollectionError("budget", "CSV cell limit exceeded");
    }
  }
  if (quoted) throw new CollectionError("schema", "Unclosed CSV quote");
  if (field || row.length || afterQuote) addRow();
  return recordsFromRows(rows);
}

function recordsFromRows(rows: string[][]): Record<string, string>[] {
  const [headers, ...values] = rows;
  if (
    !headers ||
    headers.some((header) => !header) ||
    new Set(headers).size !== headers.length
  ) {
    throw new CollectionError("schema", "CSV headers are missing or repeated");
  }
  return values.map((cells) => {
    if (cells.length !== headers.length)
      throw new CollectionError("schema", "CSV row has wrong column count");
    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index]]),
    );
  });
}
