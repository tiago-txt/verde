import { faturaDaCompra, type CardCycleConfig } from "./cards";

/** Limites do importador de planilhas. */
export const MAX_SPREADSHEET_BYTES = 5 * 1024 * 1024;
export const MAX_SPREADSHEET_SHEETS = 50;
export const MAX_SPREADSHEET_ROWS = 50_000;
export const MAX_SPREADSHEET_COLUMNS = 20;

export type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export type SpreadsheetSheet = {
  name: string;
  headers: string[];
  rows: SpreadsheetCell[][];
  /** Planilha criada com a convenção de datas de 1904 (Mac). */
  date1904?: boolean;
};

export type SpreadsheetSheetKind = "conta" | "cartao" | "desconhecida";

export type SpreadsheetTransactionType = "despesa" | "receita" | "transferencia";

export type SpreadsheetSpecialKind =
  | "pagamento_fatura"
  | "pagamento_positivo"
  | "investimento"
  | "saldo_inicial"
  | "correcao_saldo"
  | "carry_over"
  | "cartao_adicional"
  | "transferencia"
  | "zero";

export type CanonicalSpreadsheetRow = {
  id: string;
  sheetName: string;
  sheetKind: Exclude<SpreadsheetSheetKind, "desconhecida">;
  sourceRow: number;
  data: string;
  descricao: string;
  /** Valor absoluto em centavos; o sinal original fica em `tipo`. */
  valorCentavos: number;
  tipo: SpreadsheetTransactionType;
  categoriaNome: string | null;
  pago: boolean;
  origemNome: string;
  faturaChave: string | null;
  /** Nome do cartão citado na descrição de pagamento/carry-over. */
  cartaoNome: string | null;
  tags: string[];
  observacao: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  parcelaGrupoId: string | null;
  specialKind: SpreadsheetSpecialKind | null;
  warnings: string[];
  duplicateKey: string;
};

export type SpreadsheetIssue = {
  sheetName: string;
  sourceRow: number;
  message: string;
  severity: "error" | "warning";
};

export type SpreadsheetSheetSummary = {
  name: string;
  kind: SpreadsheetSheetKind;
  headers: string[];
  /** Linhas de dados encontradas na aba (inclui inválidas e zeros). */
  rowCount: number;
  validRows: number;
  invalidRows: number;
  zeroRows: number;
  dateFrom: string | null;
  dateTo: string | null;
  status: "ok" | "vazia" | "invalida";
  issues: number;
};

export type SpreadsheetCategoryUsage = {
  key: string;
  nome: string;
  tipo: "despesa" | "receita";
  count: number;
  totalCentavos: number;
};

export type SpreadsheetPaymentGroup = {
  id: string;
  generic: boolean;
  positive: boolean;
  cardName: string | null;
  faturaChave: string | null;
  dataMonth: string;
  /** Valor unitário do grupo (para grupos genéricos repetidos). */
  valorCentavos: number;
  totalCentavos: number;
  count: number;
  rowIds: string[];
  descriptions: string[];
};

export type SpreadsheetInvestmentGroup = {
  key: string;
  sheetName: string;
  categoriaNome: string;
  descricaoBase: string;
  totalCentavos: number;
  count: number;
  rowIds: string[];
};

export type SpreadsheetSaldoInicialGroup = {
  sheetName: string;
  totalCentavos: number;
  count: number;
  rowIds: string[];
};

export type SpreadsheetInvoiceTotal = {
  sheetName: string;
  faturaChave: string;
  totalCentavos: number;
  count: number;
};

/** Total previsto de cada fatura por aba de cartão (sem carry-over/zeros). */
export function buildSheetInvoiceTotals(
  rows: CanonicalSpreadsheetRow[],
): SpreadsheetInvoiceTotal[] {
  const totals = new Map<string, SpreadsheetInvoiceTotal>();
  for (const row of rows) {
    if (row.sheetKind !== "cartao" || !row.faturaChave) continue;
    if (
      row.specialKind === "zero" ||
      row.specialKind === "carry_over" ||
      row.specialKind === "cartao_adicional" ||
      row.specialKind === "pagamento_fatura" ||
      row.specialKind === "pagamento_positivo"
    ) {
      continue;
    }
    const key = `${row.sheetName}|${row.faturaChave}`;
    const current = totals.get(key) ?? {
      sheetName: row.sheetName,
      faturaChave: row.faturaChave,
      totalCentavos: 0,
      count: 0,
    };
    current.totalCentavos +=
      row.tipo === "despesa" ? row.valorCentavos : -row.valorCentavos;
    current.count += 1;
    totals.set(key, current);
  }
  return [...totals.values()].sort(
    (a, b) =>
      a.faturaChave.localeCompare(b.faturaChave) ||
      a.sheetName.localeCompare(b.sheetName),
  );
}

/**
 * Tenta conciliar um pagamento genérico por valor exato da fatura no mesmo mês.
 * Só devolve quando existe exatamente uma fatura candidata.
 */
export function findUniqueInvoiceMatch(
  payment: Pick<
    SpreadsheetPaymentGroup,
    "faturaChave" | "dataMonth" | "totalCentavos"
  >,
  invoices: SpreadsheetInvoiceTotal[],
): SpreadsheetInvoiceTotal | null {
  const month = payment.faturaChave ?? payment.dataMonth;
  const candidates = invoices.filter(
    (invoice) =>
      invoice.faturaChave === month &&
      invoice.totalCentavos === payment.totalCentavos,
  );
  return candidates.length === 1 ? (candidates[0] ?? null) : null;
}

export type SpreadsheetDuplicateGroup = {
  key: string;
  sheetName: string;
  sourceRow: number;
  count: number;
  rowIds: string[];
};

export type SpreadsheetAnalysis = {
  sheets: SpreadsheetSheetSummary[];
  rows: CanonicalSpreadsheetRow[];
  issues: SpreadsheetIssue[];
  categories: SpreadsheetCategoryUsage[];
  payments: SpreadsheetPaymentGroup[];
  genericPayments: SpreadsheetPaymentGroup[];
  divergentPayments: SpreadsheetPaymentGroup[];
  investments: SpreadsheetInvestmentGroup[];
  saldosIniciais: SpreadsheetSaldoInicialGroup[];
  correcoes: CanonicalSpreadsheetRow[];
  carryOver: CanonicalSpreadsheetRow[];
  cartaoAdicional: CanonicalSpreadsheetRow[];
  zeros: CanonicalSpreadsheetRow[];
  transferencias: CanonicalSpreadsheetRow[];
  duplicates: SpreadsheetDuplicateGroup[];
  totals: {
    sourceRows: number;
    rows: number;
    invalid: number;
    zeros: number;
    byKind: { conta: number; cartao: number };
    byType: { despesa: number; receita: number; transferencia: number };
  };
};

const MONTHS: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

const INVESTMENT_CATEGORIES = new Set([
  "investimento",
  "investimentos",
  "reservado",
  "reserva",
  "reserva brl",
  "repor reserva",
  "resgate",
]);

function textValue(value: SpreadsheetCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Remove acentos preservando o restante do texto. */
export function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Nome comparável: sem acentos, minúsculo, espaços normalizados. */
export function normalizeEntityName(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cabeçalho comparável: sem acentos, sem pontuação e minúsculo. */
export function normalizeHeader(value: string): string {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function validISODate(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2200 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function serialToISO(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 0) return null;
  if (serial === 0) return date1904 ? "1904-01-01" : null;
  const whole = Math.trunc(serial);
  const base = date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 30);
  const date = new Date(base + whole * 86_400_000);
  if (Number.isNaN(date.getTime())) return null;
  return validISODate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/**
 * Normaliza datas de planilhas: `dd.mm.aaaa`, `dd/mm/aaaa`, ISO e serial do
 * Excel (1900 ou 1904). Retorna `YYYY-MM-DD` ou `null`.
 */
export function parseSpreadsheetDate(
  value: SpreadsheetCell,
  options: { date1904?: boolean } = {},
): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return validISODate(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate(),
    );
  }

  if (typeof value === "number") {
    return serialToISO(value, options.date1904 ?? false);
  }

  const text = String(value).trim();
  if (!text) return null;

  const isoWithTime = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (isoWithTime) {
    return validISODate(
      Number(isoWithTime[1]),
      Number(isoWithTime[2]),
      Number(isoWithTime[3]),
    );
  }

  const br = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const rawYear = Number(br[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return validISODate(year, month, day);
  }

  if (/^\d+(?:[.,]\d+)?$/.test(text)) {
    return serialToISO(Number(text.replace(",", ".")), options.date1904 ?? false);
  }

  return null;
}

/**
 * Converte valores de planilha em centavos com sinal.
 * Aceita números, `1.234,56`, `1234.56`, `R$ 1.234,56` e `-150,00`.
 * Retorna `null` apenas quando o conteúdo não é um valor.
 */
export function parseSpreadsheetValue(value: SpreadsheetCell): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return Math.round(value * 100);
  }
  if (typeof value === "boolean") return null;

  let text = String(value).trim();
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  text = text.replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith("+")) {
    text = text.slice(1);
  }
  if (text.endsWith("-")) {
    negative = !negative;
    text = text.slice(0, -1);
  }

  text = text.replace(/[^\d.,]/g, "");
  if (!text || !/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let decimalSeparator = "";
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSeparator = lastComma > lastDot ? "," : ".";
  } else if (lastComma >= 0) {
    decimalSeparator = text.length - lastComma - 1 <= 2 ? "," : "";
  } else if (lastDot >= 0) {
    decimalSeparator = text.length - lastDot - 1 <= 2 ? "." : "";
  }

  let integerPart = text;
  let decimalPart = "";
  if (decimalSeparator) {
    const index = text.lastIndexOf(decimalSeparator);
    integerPart = text.slice(0, index).replace(/[.,]/g, "");
    decimalPart = text.slice(index + 1).replace(/[.,]/g, "");
  } else {
    integerPart = text.replace(/[.,]/g, "");
  }

  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(decimalPart)) {
    return null;
  }
  if (!integerPart && !decimalPart) return null;

  const cents = Number(
    `${integerPart || "0"}.${(decimalPart || "0").padEnd(2, "0").slice(0, 2)}`,
  );
  if (!Number.isFinite(cents)) return null;
  const result = Math.round(cents * 100);
  return negative ? -result : result;
}

/** Converte `Mês/AAAA`, `Mês de AAAA` ou `Mês AAAA` em `YYYY-MM`. */
export function parseInvoiceMonth(value: SpreadsheetCell): string | null {
  const raw = textValue(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw)) {
    const month = Number(raw.slice(5, 7));
    return month >= 1 && month <= 12 ? raw : null;
  }

  const text = normalizeEntityName(raw);
  const match = text.match(/^([a-z]+)(?:\s*\/\s*|\s+de\s+|\s+)(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[1] ?? ""];
  const year = Number(match[2]);
  if (!month || year < 1900 || year > 2200) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export type ParsedPaymentDescription = {
  generic: boolean;
  cardName: string | null;
  faturaChave: string | null;
};

/** Interpreta `Pagamento de fatura - <Cartão> - <Mês> [de] <Ano>`. */
export function parsePaymentDescription(
  description: string,
): ParsedPaymentDescription {
  const trimmed = description.trim();
  const normalized = normalizeEntityName(trimmed);
  if (!normalized.startsWith("pagamento de fatura")) {
    return { generic: false, cardName: null, faturaChave: null };
  }

  const parts = trimmed.split(/\s+-\s+/).map((part) => part.trim());
  if (parts.length < 2) {
    return { generic: true, cardName: null, faturaChave: null };
  }

  const cardName = parts[1] || null;
  const monthText = parts.slice(2).join(" - ");
  const faturaChave = parseInvoiceMonth(monthText);
  return {
    generic: !cardName && !faturaChave,
    cardName: cardName || null,
    faturaChave,
  };
}

export type ParsedInstallment = {
  descricaoBase: string;
  parcelaAtual: number;
  parcelaTotal: number;
};

/**
 * Detecta o sufixo `n/total` no fim da descrição. Linhas de carry-over
 * (`FATURA ...`) não são parcelas comuns.
 */
export function parseInstallment(
  description: string,
): ParsedInstallment | null {
  const trimmed = description.trim();
  if (/^fatura\b/i.test(stripAccents(trimmed))) return null;
  const match = trimmed.match(/^(.*\S)\s+(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!match) return null;
  const base = (match[1] ?? "").trim();
  const current = Number(match[2]);
  const total = Number(match[3]);
  if (
    !base ||
    !Number.isInteger(current) ||
    !Number.isInteger(total) ||
    current < 1 ||
    total < 1 ||
    total > 60 ||
    current > total
  ) {
    return null;
  }
  return {
    descricaoBase: base,
    parcelaAtual: current,
    parcelaTotal: total,
  };
}

/** Detecta o layout da aba pelo cabeçalho. */
export function detectSheetKind(
  headers: string[],
): SpreadsheetSheetKind {
  const normalized = headers.map(normalizeHeader);
  const hasSituacao = normalized.some(
    (header) => header === "situacao" || header.includes("situacao"),
  );
  const hasFatura = normalized.some(
    (header) => header === "fatura" || header.includes("fatura"),
  );
  if (hasSituacao && !hasFatura) return "conta";
  if (hasFatura && !hasSituacao) return "cartao";
  return "desconhecida";
}

export type ClassifySpecialRowInput = {
  descricao: string;
  categoriaNome?: string | null;
  valorCentavos: number;
  sheetKind?: SpreadsheetSheetKind;
};

/** Classifica linhas especiais que exigem conciliação ou tratamento próprio. */
export function classifySpecialRow(
  input: ClassifySpecialRowInput,
): SpreadsheetSpecialKind | null {
  if (input.valorCentavos === 0) return "zero";

  const descricao = normalizeEntityName(input.descricao);
  const categoria = normalizeEntityName(input.categoriaNome ?? "");

  if (descricao.startsWith("saldo inicial")) return "saldo_inicial";

  if (
    descricao.startsWith("fatura ") ||
    descricao === "fatura" ||
    descricao.startsWith("cartao adicional") ||
    descricao.startsWith("saldo anterior")
  ) {
    return descricao.startsWith("cartao adicional")
      ? "cartao_adicional"
      : "carry_over";
  }

  if (
    categoria === "pagamento de fatura" ||
    descricao.startsWith("pagamento de fatura")
  ) {
    return input.valorCentavos > 0
      ? "pagamento_positivo"
      : "pagamento_fatura";
  }

  const investmentWords = [
    "investimento",
    "investimentos",
    "reservado",
    "reserva",
    "reserva brl",
    "repor reserva",
    "resgate",
  ];
  const investmentByCategory =
    INVESTMENT_CATEGORIES.has(categoria) ||
    categoria.startsWith("reserva ") ||
    categoria.startsWith("investimento ");
  const investmentByDescription = investmentWords.some(
    (word) => descricao === word || descricao.startsWith(`${word} `),
  );
  if (investmentByCategory || investmentByDescription) {
    return "investimento";
  }

  if (descricao.startsWith("correcao de saldo")) return "correcao_saldo";

  if (categoria === "transferencias" || descricao === "transferencia") {
    return "transferencia";
  }

  return null;
}

/** Chave de duplicidade: origem + data + valor + descrição + parcela. */
export function spreadsheetDuplicateKey(input: {
  origemNome: string;
  data: string;
  valorCentavos: number;
  descricao: string;
  parcelaAtual?: number | null;
  parcelaTotal?: number | null;
}): string {
  const parcela =
    input.parcelaAtual && input.parcelaTotal
      ? `${input.parcelaAtual}/${input.parcelaTotal}`
      : "";
  return [
    normalizeEntityName(input.origemNome),
    input.data,
    Math.abs(Math.trunc(input.valorCentavos)),
    normalizeEntityName(input.descricao),
    parcela,
  ].join("|");
}

/** Chave do grupo de investimento: aba + categoria + descrição-base. */
export function investmentGroupKey(
  row: Pick<
    CanonicalSpreadsheetRow,
    "sheetName" | "descricao" | "categoriaNome"
  >,
): string {
  const parcela = parseInstallment(row.descricao);
  return [
    "inv",
    normalizeEntityName(row.sheetName),
    normalizeEntityName(row.categoriaNome ?? "investimentos"),
    normalizeEntityName(parcela?.descricaoBase ?? row.descricao),
  ].join("|");
}

function monthDistance(a: string, b: string): number {
  const parse = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    return Number(year) * 12 + Number(month) - 1;
  };
  return Math.abs(parse(a) - parse(b));
}

function parsePaid(value: SpreadsheetCell): boolean {
  const text = normalizeEntityName(textValue(value));
  if (!text) return true;
  return !text.includes("nao pago") && !text.includes("pendente");
}

function splitTags(value: SpreadsheetCell): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const part of textValue(value).split(",")) {
    const name = part.trim();
    if (!name) continue;
    const key = normalizeEntityName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(name);
  }
  return tags;
}

function normalizeObservation(value: SpreadsheetCell): string | null {
  const text = textValue(value).replace(/\r\n?/g, "\n").trim();
  return text || null;
}

function headerIndex(
  headers: string[],
  candidates: string[],
  mode: "exact" | "includes" = "exact",
): number {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex((header) =>
    mode === "exact"
      ? candidates.includes(header)
      : candidates.some((candidate) => header.includes(candidate)),
  );
}

export type BuildCanonicalRowsOptions = {
  /** Correção manual do tipo da aba (nome da aba -> tipo). */
  sheetKinds?: Record<string, Exclude<SpreadsheetSheetKind, "desconhecida">>;
  /** Regras do cartão da aba, usadas só para avisos de divergência. */
  cardConfigs?: Record<string, CardCycleConfig>;
};

export type BuildCanonicalRowsResult = {
  rows: CanonicalSpreadsheetRow[];
  issues: SpreadsheetIssue[];
};

/**
 * Normaliza as abas para o modelo canônico do Verde. Função pura: toda a
 * leitura do binário acontece antes, no cliente.
 */
export function buildCanonicalRows(
  sheets: SpreadsheetSheet[],
  options: BuildCanonicalRowsOptions = {},
): BuildCanonicalRowsResult {
  const rows: CanonicalSpreadsheetRow[] = [];
  const issues: SpreadsheetIssue[] = [];

  for (const sheet of sheets.slice(0, MAX_SPREADSHEET_SHEETS)) {
    const sheetName = sheet.name.trim() || "Aba sem nome";
    const headers = sheet.headers
      .slice(0, MAX_SPREADSHEET_COLUMNS)
      .map((header) => textValue(header).trim());

    if (headers.length === 0) {
      issues.push({
        sheetName,
        sourceRow: 1,
        message: "Aba sem cabeçalho.",
        severity: "error",
      });
      continue;
    }

    if (sheet.headers.length > MAX_SPREADSHEET_COLUMNS) {
      issues.push({
        sheetName,
        sourceRow: 1,
        message: `Aba com mais de ${MAX_SPREADSHEET_COLUMNS} colunas; as excedentes foram ignoradas.`,
        severity: "warning",
      });
    }

    const detected = detectSheetKind(headers);
    const kind = options.sheetKinds?.[sheetName] ?? detected;
    if (kind === "desconhecida") {
      issues.push({
        sheetName,
        sourceRow: 1,
        message:
          "Tipo da aba não identificado. Escolha conta ou cartão antes de importar.",
        severity: "warning",
      });
    }
    const resolvedKind: Exclude<SpreadsheetSheetKind, "desconhecida"> =
      kind === "desconhecida" ? "conta" : kind;

    const dataIndex = headerIndex(headers, ["data"]);
    const descriptionIndex = headerIndex(headers, ["descricao"]);
    const valueIndex = headerIndex(headers, ["valor"]);
    const categoryIndex = headerIndex(headers, ["categoria"]);
    const paidIndex = headerIndex(headers, ["situacao"]);
    const invoiceIndex = headerIndex(headers, ["fatura"]);
    const tagsIndex = headerIndex(headers, ["tags"]);
    const observationIndex = headerIndex(
      headers,
      ["informacoes adicionais", "observacao", "observacoes", "informacoes"],
      "exact",
    );

    const missing = [
      dataIndex < 0 ? "Data" : null,
      descriptionIndex < 0 ? "Descrição" : null,
      valueIndex < 0 ? "Valor" : null,
    ].filter((item): item is string => Boolean(item));

    if (missing.length > 0) {
      issues.push({
        sheetName,
        sourceRow: 1,
        message: `Colunas obrigatórias não encontradas: ${missing.join(", ")}.`,
        severity: "error",
      });
      continue;
    }

    for (let index = 0; index < sheet.rows.length; index += 1) {
      const raw = sheet.rows[index] ?? [];
      if (!raw.some((cell) => textValue(cell).trim() !== "")) continue;
      const sourceRow = index + 2;

      const data = parseSpreadsheetDate(raw[dataIndex], {
        date1904: sheet.date1904,
      });
      const descricao = textValue(raw[descriptionIndex]).trim();
      const signedValue = parseSpreadsheetValue(raw[valueIndex]);

      if (!data) {
        issues.push({
          sheetName,
          sourceRow,
          message: "Data inválida.",
          severity: "error",
        });
        continue;
      }
      if (!descricao) {
        issues.push({
          sheetName,
          sourceRow,
          message: "Descrição vazia.",
          severity: "error",
        });
        continue;
      }
      if (signedValue === null) {
        issues.push({
          sheetName,
          sourceRow,
          message: "Valor inválido.",
          severity: "error",
        });
        continue;
      }

      const categoriaNome = categoryIndex >= 0
        ? textValue(raw[categoryIndex]).trim() || null
        : null;
      const rawInvoice = invoiceIndex >= 0
        ? textValue(raw[invoiceIndex]).trim()
        : "";
      const faturaChave = rawInvoice
        ? parseInvoiceMonth(rawInvoice)
        : null;
      const specialKind = classifySpecialRow({
        descricao,
        categoriaNome,
        valorCentavos: signedValue,
        sheetKind: resolvedKind,
      });
      const warning: string[] = [];

      if (rawInvoice && !faturaChave) {
        warning.push(`Fatura "${rawInvoice}" não reconhecida.`);
      }

      const credit = signedValue > 0;
      let tipo: SpreadsheetTransactionType = credit ? "receita" : "despesa";
      if (
        specialKind === "pagamento_fatura" ||
        specialKind === "pagamento_positivo"
      ) {
        tipo = credit ? "receita" : "transferencia";
      }
      if (specialKind === "zero") {
        tipo = "despesa";
        warning.push("Valor zero: linha ignorada na importação.");
      }

      const payment = specialKind === "pagamento_fatura" ||
        specialKind === "pagamento_positivo"
        ? parsePaymentDescription(descricao)
        : { cardName: null, faturaChave: null, generic: false };
      const parsedInstallment =
        specialKind === "carry_over" || specialKind === "cartao_adicional"
          ? null
          : parseInstallment(descricao);

      if (specialKind === "pagamento_positivo") {
        warning.push(
          "Pagamento positivo: escolha se é receita ou estorno de transferência.",
        );
      }
      if (
        specialKind === "carry_over" ||
        specialKind === "cartao_adicional"
      ) {
        warning.push("Linha de carry-over/saldo anterior precisa de decisão.");
      }
      if (payment.cardName && !payment.faturaChave) {
        warning.push(
          `Cartão "${payment.cardName}" reconhecido, mas o mês da fatura não.`,
        );
      }

      const cardConfig = options.cardConfigs?.[sheetName];
      const effectiveInvoice = faturaChave ?? payment.faturaChave;
      if (
        cardConfig &&
        effectiveInvoice &&
        resolvedKind === "cartao" &&
        monthDistance(
          effectiveInvoice,
          faturaDaCompra(data, cardConfig),
        ) > 2
      ) {
        warning.push(
          `Fatura ${effectiveInvoice} diverge em mais de 2 meses da fatura calculada.`,
        );
      }

      const parcelaGrupoId = parsedInstallment
        ? [
            "parcela",
            normalizeEntityName(sheetName),
            normalizeEntityName(parsedInstallment.descricaoBase),
            parsedInstallment.parcelaTotal,
          ].join(":")
        : null;

      const row: CanonicalSpreadsheetRow = {
        id: `${sheetName}::${sourceRow}`,
        sheetName,
        sheetKind: resolvedKind,
        sourceRow,
        data,
        descricao,
        valorCentavos: Math.abs(signedValue),
        tipo,
        categoriaNome,
        pago: resolvedKind === "cartao" ? true : parsePaid(raw[paidIndex]),
        origemNome: sheetName,
        faturaChave:
          resolvedKind === "cartao" ? faturaChave : null,
        cartaoNome: payment.cardName ?? null,
        tags: splitTags(raw[tagsIndex]),
        observacao: normalizeObservation(raw[observationIndex]),
        parcelaAtual: parsedInstallment?.parcelaAtual ?? null,
        parcelaTotal: parsedInstallment?.parcelaTotal ?? null,
        parcelaGrupoId,
        specialKind,
        warnings: warning,
        duplicateKey: "",
      };
      row.duplicateKey = spreadsheetDuplicateKey({
        origemNome: row.origemNome,
        data: row.data,
        valorCentavos: row.valorCentavos,
        descricao: row.descricao,
        parcelaAtual: row.parcelaAtual,
        parcelaTotal: row.parcelaTotal,
      });
      rows.push(row);
    }
  }

  return { rows, issues };
}

function pushMap<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

/** Analisa abas e devolve grupos de conciliação, contagens e avisos. */
export function analyzeSpreadsheet(
  sheets: SpreadsheetSheet[],
  options: BuildCanonicalRowsOptions = {},
): SpreadsheetAnalysis {
  const { rows, issues } = buildCanonicalRows(sheets, options);

  const rowsBySheet = new Map<string, CanonicalSpreadsheetRow[]>();
  for (const row of rows) {
    pushMap(rowsBySheet, row.sheetName, row);
  }

  const summaries: SpreadsheetSheetSummary[] = sheets.map((sheet) => {
    const name = sheet.name.trim() || "Aba sem nome";
    const sheetRows = rowsBySheet.get(name) ?? [];
    const sheetIssues = issues.filter((issue) => issue.sheetName === name);
    const invalidRows = sheetIssues.filter(
      (issue) => issue.severity === "error" && issue.sourceRow > 1,
    ).length;
    const dates = sheetRows
      .map((row) => row.data)
      .sort((a, b) => a.localeCompare(b));
    const kind =
      options.sheetKinds?.[name] ?? detectSheetKind(sheet.headers);
    const sourceRows = sheet.rows.filter((row) =>
      row.some((cell) => textValue(cell).trim() !== ""),
    ).length;
    const status: SpreadsheetSheetSummary["status"] =
      sourceRows === 0
        ? "vazia"
        : sheetRows.length === 0
          ? "invalida"
          : "ok";

    return {
      name,
      kind,
      headers: sheet.headers.map((header) => textValue(header).trim()),
      rowCount: sourceRows,
      validRows: sheetRows.length,
      invalidRows,
      zeroRows: sheetRows.filter((row) => row.specialKind === "zero").length,
      dateFrom: dates[0] ?? null,
      dateTo: dates.at(-1) ?? null,
      status,
      issues: sheetIssues.length,
    };
  });

  const categories = new Map<string, SpreadsheetCategoryUsage>();
  const payments = new Map<string, SpreadsheetPaymentGroup>();
  const genericPayments = new Map<string, SpreadsheetPaymentGroup>();
  const divergentPayments = new Map<string, SpreadsheetPaymentGroup>();
  const investments = new Map<string, SpreadsheetInvestmentGroup>();
  const saldosIniciais = new Map<string, SpreadsheetSaldoInicialGroup>();
  const duplicates = new Map<string, SpreadsheetDuplicateGroup>();

  const byType = { despesa: 0, receita: 0, transferencia: 0 };
  const byKind = { conta: 0, cartao: 0 };

  for (const row of rows) {
    byKind[row.sheetKind] += 1;
    byType[row.tipo] += 1;

    const duplicate = duplicates.get(row.duplicateKey);
    if (duplicate) {
      duplicate.count += 1;
      duplicate.rowIds.push(row.id);
    } else {
      duplicates.set(row.duplicateKey, {
        key: row.duplicateKey,
        sheetName: row.sheetName,
        sourceRow: row.sourceRow,
        count: 1,
        rowIds: [row.id],
      });
    }

    const isPayment =
      row.specialKind === "pagamento_fatura" ||
      row.specialKind === "pagamento_positivo";

    if (isPayment) {
      const parsed = parsePaymentDescription(row.descricao);
      const recognized = Boolean(parsed.cardName && parsed.faturaChave);
      const divergent =
        normalizeEntityName(row.categoriaNome ?? "") !==
        "pagamento de fatura";
      const positive =
        row.specialKind === "pagamento_positivo" || row.tipo === "receita";
      const dataMonth = row.faturaChave ?? row.data.slice(0, 7);
      const groupKey = recognized
        ? `pag:${normalizeEntityName(parsed.cardName ?? "")}:${parsed.faturaChave ?? ""}:${positive ? "pos" : "neg"}`
        : `pagg:${dataMonth}:${row.faturaChave ?? ""}:${row.valorCentavos}:${positive ? "pos" : "neg"}`;
      const target = divergent
        ? divergentPayments
        : recognized
          ? payments
          : genericPayments;
      const current = target.get(groupKey);
      if (current) {
        current.count += 1;
        current.totalCentavos += row.valorCentavos;
        current.rowIds.push(row.id);
        if (!current.descriptions.includes(row.descricao)) {
          current.descriptions.push(row.descricao);
        }
        current.positive = current.positive || positive;
      } else {
        target.set(groupKey, {
          id: groupKey,
          generic: !recognized,
          positive,
          cardName: parsed.cardName,
          faturaChave: parsed.faturaChave ?? row.faturaChave,
          dataMonth,
          valorCentavos: row.valorCentavos,
          totalCentavos: row.valorCentavos,
          count: 1,
          rowIds: [row.id],
          descriptions: [row.descricao],
        });
      }
      continue;
    }

    if (row.specialKind === "investimento") {
      const tipo: "despesa" | "receita" =
        row.tipo === "receita" ? "receita" : "despesa";
      const categoriaKey = `${tipo}:${normalizeEntityName("Investimentos")}`;
      const categoriaAtual = categories.get(categoriaKey);
      if (categoriaAtual) {
        categoriaAtual.count += 1;
        categoriaAtual.totalCentavos += row.valorCentavos;
      } else {
        categories.set(categoriaKey, {
          key: categoriaKey,
          nome: "Investimentos",
          tipo,
          count: 1,
          totalCentavos: row.valorCentavos,
        });
      }

      const key = investmentGroupKey(row);
      const parcela = parseInstallment(row.descricao);
      const current = investments.get(key);
      if (current) {
        current.count += 1;
        current.totalCentavos += row.tipo === "receita"
          ? row.valorCentavos
          : -row.valorCentavos;
        current.rowIds.push(row.id);
      } else {
        investments.set(key, {
          key,
          sheetName: row.sheetName,
          categoriaNome: row.categoriaNome ?? "Investimentos",
          descricaoBase: parcela?.descricaoBase ?? row.descricao,
          totalCentavos:
            row.tipo === "receita" ? row.valorCentavos : -row.valorCentavos,
          count: 1,
          rowIds: [row.id],
        });
      }
      continue;
    }

    if (row.specialKind === "saldo_inicial") {
      const tipo: "despesa" | "receita" =
        row.tipo === "receita" ? "receita" : "despesa";
      const saldoCategory = row.categoriaNome ?? "Outras receitas";
      const saldoKey = `${tipo}:${normalizeEntityName(saldoCategory)}`;
      const saldoCurrent = categories.get(saldoKey);
      if (saldoCurrent) {
        saldoCurrent.count += 1;
        saldoCurrent.totalCentavos += row.valorCentavos;
      } else {
        categories.set(saldoKey, {
          key: saldoKey,
          nome: saldoCategory,
          tipo,
          count: 1,
          totalCentavos: row.valorCentavos,
        });
      }

      const current = saldosIniciais.get(row.sheetName);
      if (current) {
        current.count += 1;
        current.totalCentavos +=
          row.tipo === "receita" ? row.valorCentavos : -row.valorCentavos;
        current.rowIds.push(row.id);
      } else {
        saldosIniciais.set(row.sheetName, {
          sheetName: row.sheetName,
          totalCentavos:
            row.tipo === "receita" ? row.valorCentavos : -row.valorCentavos,
          count: 1,
          rowIds: [row.id],
        });
      }
      continue;
    }

    if (row.specialKind === "transferencia") {
      const tipo: "despesa" | "receita" =
        row.tipo === "receita" ? "receita" : "despesa";
      const transferCategory = row.categoriaNome ?? "Transferências";
      const transferKey = `${tipo}:${normalizeEntityName(transferCategory)}`;
      const transferCurrent = categories.get(transferKey);
      if (transferCurrent) {
        transferCurrent.count += 1;
        transferCurrent.totalCentavos += row.valorCentavos;
      } else {
        categories.set(transferKey, {
          key: transferKey,
          nome: transferCategory,
          tipo,
          count: 1,
          totalCentavos: row.valorCentavos,
        });
      }
      continue;
    }

    if (row.specialKind === "zero" || row.tipo === "transferencia") continue;

    const nome = row.categoriaNome?.trim();
    if (!nome) continue;
    const tipo: "despesa" | "receita" =
      row.tipo === "receita" ? "receita" : "despesa";
    const key = `${tipo}:${normalizeEntityName(nome)}`;
    const current = categories.get(key);
    if (current) {
      current.count += 1;
      current.totalCentavos += row.valorCentavos;
    } else {
      categories.set(key, {
        key,
        nome,
        tipo,
        count: 1,
        totalCentavos: row.valorCentavos,
      });
    }
  }

  return {
    sheets: summaries,
    rows,
    issues,
    categories: [...categories.values()].sort(
      (a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome),
    ),
    payments: [...payments.values()].sort(
      (a, b) =>
        (a.faturaChave ?? "").localeCompare(b.faturaChave ?? "") ||
        (a.cardName ?? "").localeCompare(b.cardName ?? ""),
    ),
    genericPayments: [...genericPayments.values()].sort(
      (a, b) =>
        a.dataMonth.localeCompare(b.dataMonth) ||
        a.valorCentavos - b.valorCentavos,
    ),
    divergentPayments: [...divergentPayments.values()].sort(
      (a, b) =>
        (a.faturaChave ?? "").localeCompare(b.faturaChave ?? "") ||
        (a.cardName ?? "").localeCompare(b.cardName ?? ""),
    ),
    investments: [...investments.values()].sort(
      (a, b) => a.sheetName.localeCompare(b.sheetName),
    ),
    saldosIniciais: [...saldosIniciais.values()],
    correcoes: rows.filter((row) => row.specialKind === "correcao_saldo"),
    carryOver: rows.filter(
      (row) => row.specialKind === "carry_over",
    ),
    cartaoAdicional: rows.filter(
      (row) => row.specialKind === "cartao_adicional",
    ),
    zeros: rows.filter((row) => row.specialKind === "zero"),
    transferencias: rows.filter((row) => row.specialKind === "transferencia"),
    duplicates: [...duplicates.values()].filter((group) => group.count > 1),
    totals: {
      sourceRows: summaries.reduce((sum, sheet) => sum + sheet.rowCount, 0),
      rows: rows.length,
      invalid: issues.filter(
        (issue) => issue.severity === "error" && issue.sourceRow > 1,
      ).length,
      zeros: rows.filter((row) => row.specialKind === "zero").length,
      byKind,
      byType,
    },
  };
}
