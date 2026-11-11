export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type CsvDelimiter = ";" | ",";

export type CsvTable = {
  headers: string[];
  rows: string[][];
  delimiter: CsvDelimiter;
};

export type CsvMapping = {
  data: string;
  descricao: string;
  valor: string;
  tipo: string;
  conta?: string;
  categoria?: string;
  pago?: string;
};

export type NormalizedImportRow = {
  line: number;
  data: string;
  descricao: string;
  valor: number;
  tipo: "despesa" | "receita";
  contaNome: string | null;
  categoriaNome: string | null;
  pago: boolean;
  duplicateKey: string;
};

export type InvalidImportRow = {
  line: number;
  message: string;
  raw: string[];
};

export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semicolons >= commas ? ";" : ",";
}

export function parseCsv(text: string, delimiter?: CsvDelimiter): CsvTable {
  const cleaned = text.replace(/^\uFEFF/, "");
  const separator = delimiter ?? detectDelimiter(cleaned);
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    const next = cleaned[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      current.push(field);
      field = "";
    } else if (char === "\n") {
      current.push(field.replace(/\r$/, ""));
      rows.push(current);
      current = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field.replace(/\r$/, ""));
    rows.push(current);
  }

  const nonEmpty = rows.filter(
    (row) => row.some((cell) => cell.trim().length > 0),
  );
  const headers = (nonEmpty[0] ?? []).map((header) => header.trim());
  return {
    headers,
    rows: headers.length > 0 ? nonEmpty.slice(1) : [],
    delimiter: separator,
  };
}

export function parseImportDate(value: string): string | null {
  const text = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === text
      ? text
      : null;
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year =
    Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}

export function parseImportValue(value: string): number | null {
  let text = value
    .trim()
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "");
  if (!text) return null;
  if (text.startsWith("-")) text = text.slice(1);
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if (text.includes(".")) {
    const parts = text.split(".");
    if (parts.at(-1)?.length === 3) text = parts.join("");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return cents > 0 ? cents : null;
}

export function parseImportType(
  value: string,
): "despesa" | "receita" | null {
  const text = value.trim().toLowerCase();
  if (["despesa", "d", "saida", "saída", "gasto"].includes(text)) {
    return "despesa";
  }
  if (["receita", "r", "entrada", "credito", "crédito"].includes(text)) {
    return "receita";
  }
  return null;
}

function parsePaid(value: string | undefined): boolean {
  if (!value) return true;
  const text = value.trim().toLowerCase();
  return ["sim", "s", "true", "1", "pago", "paga"].includes(text);
}

export function importDuplicateKey(input: {
  data: string;
  valor: number;
  descricao: string;
  contaNome: string | null;
}): string {
  return [
    input.data,
    input.valor,
    input.descricao.trim().toLowerCase(),
    (input.contaNome ?? "").trim().toLowerCase(),
  ].join("|");
}

export type ImportParseResult = {
  table: CsvTable;
  valid: NormalizedImportRow[];
  invalid: InvalidImportRow[];
};

export function mapImportRows(
  text: string,
  mapping: CsvMapping,
  delimiter?: CsvDelimiter,
): ImportParseResult {
  const table = parseCsv(text, delimiter);
  const indexByName = new Map(
    table.headers.map((header, index) => [header.trim().toLowerCase(), index]),
  );
  const required = [mapping.data, mapping.descricao, mapping.valor, mapping.tipo];
  const missing = required.filter(
    (header) => !header || !indexByName.has(header.trim().toLowerCase()),
  );
  if (missing.length > 0) {
    return {
      table,
      valid: [],
      invalid: [
        {
          line: 1,
          message: `Colunas obrigatórias não encontradas: ${missing.join(", ")}`,
          raw: [],
        },
      ],
    };
  }

  const columnIndex = (header: string | undefined): number | null => {
    if (!header) return null;
    const index = indexByName.get(header.trim().toLowerCase());
    return index === undefined ? null : index;
  };

  const dataIndex = columnIndex(mapping.data) as number;
  const descriptionIndex = columnIndex(mapping.descricao) as number;
  const valueIndex = columnIndex(mapping.valor) as number;
  const typeIndex = columnIndex(mapping.tipo) as number;
  const accountIndex = columnIndex(mapping.conta);
  const categoryIndex = columnIndex(mapping.categoria);
  const paidIndex = columnIndex(mapping.pago);

  const valid: NormalizedImportRow[] = [];
  const invalid: InvalidImportRow[] = [];

  table.rows.forEach((row, index) => {
    const line = index + 2;
    const raw = (column: number | null) =>
      column === null ? "" : (row[column] ?? "").trim();
    const data = parseImportDate(raw(dataIndex));
    const descricao = raw(descriptionIndex);
    const valor = parseImportValue(raw(valueIndex));
    const tipo = parseImportType(raw(typeIndex));

    const errors: string[] = [];
    if (!data) errors.push("data inválida");
    if (!descricao) errors.push("descrição vazia");
    if (!valor) errors.push("valor inválido ou zero");
    if (!tipo) errors.push("tipo deve ser despesa ou receita");

    if (errors.length > 0) {
      invalid.push({ line, message: errors.join("; "), raw: row });
      return;
    }

    const contaNome = raw(accountIndex) || null;
    const categoriaNome = raw(categoryIndex) || null;
    valid.push({
      line,
      data: data as string,
      descricao,
      valor: valor as number,
      tipo: tipo as "despesa" | "receita",
      contaNome,
      categoriaNome,
      pago: parsePaid(raw(paidIndex) || undefined),
      duplicateKey: importDuplicateKey({
        data: data as string,
        valor: valor as number,
        descricao,
        contaNome,
      }),
    });
  });

  return { table, valid, invalid };
}

export function assertImportSize(text: string): string | null {
  const bytes = new TextEncoder().encode(text).length;
  return bytes > MAX_IMPORT_BYTES
    ? `Arquivo acima do limite de ${MAX_IMPORT_BYTES / (1024 * 1024)} MB.`
    : null;
}
