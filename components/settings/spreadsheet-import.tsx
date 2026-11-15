"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "@/components/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toast";
import {
  importSpreadsheetImportAction,
  previewSpreadsheetImportAction,
  type SpreadsheetPreviewResult,
} from "@/lib/actions/spreadsheet-import";
import { undoLastImportAction } from "@/lib/actions/data";
import {
  analyzeSpreadsheet,
  buildSheetInvoiceTotals,
  findUniqueInvoiceMatch,
  MAX_SPREADSHEET_BYTES,
  MAX_SPREADSHEET_COLUMNS,
  MAX_SPREADSHEET_ROWS,
  MAX_SPREADSHEET_SHEETS,
  normalizeEntityName,
  type SpreadsheetAnalysis,
  type SpreadsheetCell,
  type SpreadsheetInvoiceTotal,
  type SpreadsheetPaymentGroup,
  type SpreadsheetSheet,
} from "@/lib/finance/spreadsheet-import";
import type { SpreadsheetImportRequestInput } from "@/lib/validation/import";
import { sha256Hex } from "@/lib/finance/sha256";
import { formatCurrency, formatDate } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import {
  detectRecurrencesFromSpreadsheet,
  type RecurrenceCandidate,
} from "@/lib/finance/recurrence-detection";

export type SpreadsheetImportOptions = {
  accounts: Array<{
    id: string;
    nome: string;
    arquivada: boolean;
    hasTransactions: boolean;
  }>;
  cards: Array<{
    id: string;
    nome: string;
    arquivado: boolean;
    diaFechamento: number;
    diaVencimento: number;
  }>;
  categories: Array<{
    id: string;
    nome: string;
    tipo: "despesa" | "receita";
  }>;
  tags: Array<{ id: string; nome: string }>;
};

type SheetKind = "conta" | "cartao";

type OriginState = {
  kind: SheetKind;
  mode: "existing" | "new";
  accountId: string;
  cardId: string;
  name: string;
  diaFechamento: number;
  diaVencimento: number;
};

type CategoryState = {
  action: "existente" | "criar" | "ignorar";
  categoryId: string;
};

type TagState = {
  action: "existente" | "criar" | "ignorar";
  tagId: string;
};

type PaymentState = {
  action: "transferencia" | "despesa" | "receita" | "ignorar";
  mode: "none" | "existing" | "sheet" | "create";
  cardId: string;
  cardName: string;
  faturaChave: string;
  diaFechamento: number;
  diaVencimento: number;
};

type InvestmentState = {
  action: "despesa" | "transferencia" | "ignorar";
  contaDestinoId: string;
};

type CarryState = {
  action: "compra" | "ignorar";
  cartaoId: string;
};

type TransferState = {
  action: "despesa" | "receita" | "transferencia" | "ignorar";
  contaDestinoId: string;
};

function toCell(value: unknown): SpreadsheetCell {
  if (value instanceof Date) return value;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatMonth(key: string): string {
  if (!/^\d{4}-\d{2}$/.test(key)) return key;
  const [year, month] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, 1));
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function cents(value: number): string {
  return formatCurrency(value);
}

function defaultOrigin(sheetName: string, kind: SheetKind): OriginState {
  return {
    kind,
    mode: "new",
    accountId: "",
    cardId: "",
    name: sheetName,
    diaFechamento: 1,
    diaVencimento: 10,
  };
}

function defaultSaldoAction(
  options: SpreadsheetImportOptions,
  origin: OriginState,
): "saldo_inicial" | "ajuste" {
  if (origin.mode === "new") return "saldo_inicial";
  const account = options.accounts.find((item) => item.id === origin.accountId);
  if (!account) return "ajuste";
  return account.hasTransactions ? "ajuste" : "saldo_inicial";
}

function defaultCategory(
  options: SpreadsheetImportOptions,
  category: SpreadsheetAnalysis["categories"][number],
): CategoryState {
  const existing = options.categories.find(
    (item) =>
      item.tipo === category.tipo &&
      normalizeEntityName(item.nome) === normalizeEntityName(category.nome),
  );
  return existing
    ? { action: "existente", categoryId: existing.id }
    : { action: "criar", categoryId: "" };
}

function defaultTag(
  options: SpreadsheetImportOptions,
  name: string,
): TagState {
  const existing = options.tags.find(
    (item) => normalizeEntityName(item.nome) === normalizeEntityName(name),
  );
  return existing
    ? { action: "existente", tagId: existing.id }
    : { action: "criar", tagId: "" };
}

function defaultPayment(
  options: SpreadsheetImportOptions,
  analysis: SpreadsheetAnalysis,
  group: SpreadsheetPaymentGroup,
  invoiceTotals: SpreadsheetInvoiceTotal[],
  originOf?: (sheetName: string) => OriginState,
): PaymentState {
  const normalized = normalizeEntityName(group.cardName ?? "");
  const existing = options.cards.find(
    (card) => normalizeEntityName(card.nome) === normalized,
  );
  const sheet = analysis.sheets.find(
    (item) =>
      item.kind === "cartao" &&
      normalizeEntityName(item.name) === normalized,
  );
  const base: PaymentState = {
    action: group.positive ? "receita" : "transferencia",
    mode: "none",
    cardId: "",
    cardName: group.cardName ?? "",
    faturaChave: group.faturaChave ?? group.dataMonth ?? "",
    diaFechamento: 1,
    diaVencimento: 10,
  };

  // Crédito/estorno positivo não precisa de cartão/fatura: entra como receita.
  if (group.positive) return base;

  if (sheet) {
    const origin = originOf?.(sheet.name);
    if (origin?.mode === "existing" && origin.cardId) {
      return { ...base, mode: "existing", cardId: origin.cardId };
    }
    if (existing) {
      return { ...base, mode: "existing", cardId: existing.id };
    }
    return { ...base, mode: "sheet", cardName: sheet.name };
  }
  if (existing) return { ...base, mode: "existing", cardId: existing.id };

  // Cartão citado na descrição e sem aba: cria arquivado automaticamente.
  if (group.cardName) {
    return { ...base, mode: "create", cardName: group.cardName };
  }

  // Pagamento genérico: tenta casar o valor exato da fatura do mesmo mês.
  const match = findUniqueInvoiceMatch(group, invoiceTotals);
  if (match) {
    const origin = originOf?.(match.sheetName);
    if (origin?.mode === "existing" && origin.cardId) {
      return {
        ...base,
        mode: "existing",
        cardId: origin.cardId,
        faturaChave: match.faturaChave,
      };
    }
    return {
      ...base,
      mode: "sheet",
      cardName: match.sheetName,
      faturaChave: match.faturaChave,
    };
  }

  return base;
}

export function SpreadsheetImport({
  options,
}: {
  options: SpreadsheetImportOptions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SpreadsheetSheet[]>([]);
  const [sheetKinds, setSheetKinds] = useState<Record<string, SheetKind>>({});
  const [analysis, setAnalysis] = useState<SpreadsheetAnalysis | null>(null);

  const [origins, setOrigins] = useState<Record<string, OriginState>>({});
  const [categoryState, setCategoryState] = useState<
    Record<string, CategoryState>
  >({});
  const [tagState, setTagState] = useState<Record<string, TagState>>({});
  const [paymentState, setPaymentState] = useState<
    Record<string, PaymentState>
  >({});
  const [showPaymentReview, setShowPaymentReview] = useState(false);
  const [investmentState, setInvestmentState] = useState<
    Record<string, InvestmentState>
  >({});
  const [saldoState, setSaldoState] = useState<
    Record<string, "saldo_inicial" | "ajuste" | "ignorar">
  >({});
  const [carryState, setCarryState] = useState<Record<string, CarryState>>({});
  const [transferState, setTransferState] = useState<
    Record<string, TransferState>
  >({});
  const [ignoreDuplicateRows, setIgnoreDuplicateRows] = useState(false);
  const [reimportarHash, setReimportarHash] = useState(false);
  const [considerHistoricalAsPaid, setConsiderHistoricalAsPaid] =
    useState(false);
  const [recurrenceCandidates, setRecurrenceCandidates] = useState<
    RecurrenceCandidate[]
  >([]);
  const [selectedRecurrenceKeys, setSelectedRecurrenceKeys] = useState<
    Set<string>
  >(new Set());

  const [preview, setPreview] = useState<SpreadsheetPreviewResult | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);

  const accountOptions = options.accounts.filter((item) => !item.arquivada);
  const cardOptions = options.cards;

  useEffect(() => {
    if (!analysis) {
      setRecurrenceCandidates([]);
      setSelectedRecurrenceKeys(new Set());
      return;
    }
    const candidates = detectRecurrencesFromSpreadsheet(analysis.rows);
    setRecurrenceCandidates(candidates);
    setSelectedRecurrenceKeys(new Set(candidates.map((item) => item.key)));
  }, [analysis]);

  const categoryMemo = useMemo(() => analysis?.categories ?? [], [analysis]);
  const invoiceTotals = useMemo(
    () => (analysis ? buildSheetInvoiceTotals(analysis.rows) : []),
    [analysis],
  );
  const paymentGroups = useMemo(
    () =>
      analysis
        ? [
            ...analysis.payments,
            ...analysis.genericPayments,
            ...analysis.divergentPayments,
          ]
        : [],
    [analysis],
  );
  const carryOverRows = useMemo(
    () =>
      analysis ? [...analysis.carryOver, ...analysis.cartaoAdicional] : [],
    [analysis],
  );

  function originFor(sheetName: string, kind: SheetKind): OriginState {
    return (
      origins[sheetName] ?? defaultOrigin(sheetName, kind)
    );
  }

  function categoryFor(
    category: SpreadsheetAnalysis["categories"][number],
  ): CategoryState {
    return categoryState[category.key] ?? defaultCategory(options, category);
  }

  function tagFor(name: string): TagState {
    return tagState[normalizeEntityName(name)] ?? defaultTag(options, name);
  }

  function paymentFor(group: SpreadsheetPaymentGroup): PaymentState {
    return (
      paymentState[group.id] ??
      (analysis
        ? defaultPayment(
            options,
            analysis,
            group,
            invoiceTotals,
            (sheetName) => originFor(sheetName, "cartao"),
          )
        : {
            action: "transferencia",
            mode: "none",
            cardId: "",
            cardName: "",
            faturaChave: "",
            diaFechamento: 1,
            diaVencimento: 10,
          })
    );
  }

  function paymentNeedsAttention(
    group: SpreadsheetPaymentGroup,
    decision: PaymentState,
  ): boolean {
    if (decision.action === "ignorar") return false;
    if (group.positive) return false;
    if (decision.action === "despesa" || decision.action === "receita") {
      return false;
    }
    if (decision.mode === "none") return true;
    if (decision.mode === "create" && !decision.cardName.trim()) return true;
    return !decision.faturaChave;
  }

  function investmentFor(key: string): InvestmentState {
    return investmentState[key] ?? { action: "despesa", contaDestinoId: "" };
  }

  function applyPaymentCardToAll(
    group: SpreadsheetPaymentGroup,
    patch: Pick<PaymentState, "mode" | "cardId" | "cardName">,
  ) {
    const key = normalizeEntityName(group.cardName ?? "");
    if (!key) return;
    setPaymentState((current) => {
      const next = { ...current };
      for (const item of paymentGroups) {
        if (normalizeEntityName(item.cardName ?? "") !== key) continue;
        const base =
          current[item.id] ??
          (analysis
            ? defaultPayment(
                options,
                analysis,
                item,
                invoiceTotals,
                (sheetName) => originFor(sheetName, "cartao"),
              )
            : null);
        if (!base) continue;
        next[item.id] = { ...base, ...patch };
      }
      return next;
    });
    toast({
      description: `Escolha de cartão aplicada aos pagamentos de "${group.cardName}".`,
      tone: "info",
    });
  }

  function renderPaymentTable(
    groups: SpreadsheetPaymentGroup[],
    advanced: boolean,
  ) {
    const sheetCardNames = (analysis?.sheets ?? [])
      .filter((sheet) => sheet.kind === "cartao")
      .map((sheet) => sheet.name);

    return (
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="p-2 font-medium">Cartão / mês</th>
              <th className="p-2 font-medium">Valor</th>
              <th className="p-2 font-medium">Linhas</th>
              <th className="p-2 font-medium">Ação</th>
              <th className="p-2 font-medium">Cartão</th>
              <th className="p-2 font-medium">Fatura</th>
              <th className="p-2 font-medium">Ignorar</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const decision = paymentFor(group);
              const isTransfer = decision.action === "transferencia";
              const sameCardGroups = group.cardName
                ? groups.filter(
                    (item) =>
                      normalizeEntityName(item.cardName ?? "") ===
                      normalizeEntityName(group.cardName ?? ""),
                  ).length
                : 0;
              return (
                <tr
                  key={`${advanced ? "review" : "attention"}-${group.id}`}
                  className="border-t border-border align-top"
                >
                  <td className="p-2">
                    <span className="font-medium">
                      {group.cardName ?? "Pagamento genérico"}
                    </span>
                    <span className="block text-muted-foreground">
                      {formatMonth(group.faturaChave ?? group.dataMonth)}
                    </span>
                    {group.descriptions[0] && (
                      <span className="block text-muted-foreground">
                        {group.descriptions[0]}
                      </span>
                    )}
                  </td>
                  <td className="p-2">{cents(group.totalCentavos)}</td>
                  <td className="p-2">{group.count}</td>
                  <td className="p-2">
                    {advanced ? (
                      <NativeSelect
                        value={decision.action}
                        onChange={(event) =>
                          setPaymentState((current) => ({
                            ...current,
                            [group.id]: {
                              ...decision,
                              action: event.target
                                .value as PaymentState["action"],
                            },
                          }))
                        }
                        aria-label={`Ação do pagamento ${group.cardName ?? group.id}`}
                      >
                        {!group.positive && (
                          <option value="transferencia">
                            Transferência
                          </option>
                        )}
                        <option value="despesa">Despesa</option>
                        <option value="receita">Receita/estorno</option>
                        <option value="ignorar">Ignorar</option>
                      </NativeSelect>
                    ) : group.positive ? (
                      <NativeSelect
                        value={
                          decision.action === "ignorar"
                            ? "ignorar"
                            : "receita"
                        }
                        onChange={(event) =>
                          setPaymentState((current) => ({
                            ...current,
                            [group.id]: {
                              ...decision,
                              action: event.target.value as
                                | "receita"
                                | "ignorar",
                            },
                          }))
                        }
                        aria-label={`Ação do pagamento positivo ${group.id}`}
                      >
                        <option value="receita">
                          Crédito/estorno (receita)
                        </option>
                        <option value="ignorar">Ignorar</option>
                      </NativeSelect>
                    ) : (
                      <Badge variant="secondary">Transferência</Badge>
                    )}
                  </td>
                  <td className="p-2">
                    {isTransfer ? (
                      <>
                        <NativeSelect
                          value={
                            decision.mode === "existing"
                              ? `existing:${decision.cardId}`
                              : decision.mode === "sheet"
                                ? `sheet:${decision.cardName}`
                                : decision.mode
                          }
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value.startsWith("existing:")) {
                              setPaymentState((current) => ({
                                ...current,
                                [group.id]: {
                                  ...decision,
                                  mode: "existing",
                                  cardId: value.slice(
                                    "existing:".length,
                                  ),
                                },
                              }));
                            } else if (value.startsWith("sheet:")) {
                              setPaymentState((current) => ({
                                ...current,
                                [group.id]: {
                                  ...decision,
                                  mode: "sheet",
                                  cardName: value.slice("sheet:".length),
                                },
                              }));
                            } else {
                              setPaymentState((current) => ({
                                ...current,
                                [group.id]: {
                                  ...decision,
                                  mode: value as PaymentState["mode"],
                                  cardId: "",
                                  cardName:
                                    value === "none"
                                      ? group.cardName ?? ""
                                      : decision.cardName,
                                },
                              }));
                            }
                          }}
                          aria-label={`Cartão do pagamento ${group.cardName ?? group.id}`}
                        >
                          <option value="none">Escolha…</option>
                          {cardOptions.map((card) => (
                            <option
                              key={card.id}
                              value={`existing:${card.id}`}
                            >
                              {card.nome}
                            </option>
                          ))}
                          {sheetCardNames.map((name) => (
                            <option key={`sheet-${name}`} value={`sheet:${name}`}>
                              Aba: {name}
                            </option>
                          ))}
                          <option value="create">
                            Criar cartão histórico
                          </option>
                        </NativeSelect>
                        {decision.mode === "create" && (
                          <div className="mt-1 space-y-1">
                            <Input
                              value={decision.cardName}
                              placeholder="Nome do cartão histórico"
                              onChange={(event) =>
                                setPaymentState((current) => ({
                                  ...current,
                                  [group.id]: {
                                    ...decision,
                                    cardName: event.target.value,
                                  },
                                }))
                              }
                              aria-label="Nome do cartão histórico"
                            />
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                min={1}
                                max={31}
                                value={decision.diaFechamento}
                                onChange={(event) =>
                                  setPaymentState((current) => ({
                                    ...current,
                                    [group.id]: {
                                      ...decision,
                                      diaFechamento: Math.min(
                                        31,
                                        Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      ),
                                    },
                                  }))
                                }
                                aria-label="Dia de fechamento do cartão histórico"
                                className="w-20"
                              />
                              <Input
                                type="number"
                                min={1}
                                max={31}
                                value={decision.diaVencimento}
                                onChange={(event) =>
                                  setPaymentState((current) => ({
                                    ...current,
                                    [group.id]: {
                                      ...decision,
                                      diaVencimento: Math.min(
                                        31,
                                        Math.max(
                                          1,
                                          Number(event.target.value) || 1,
                                        ),
                                      ),
                                    },
                                  }))
                                }
                                aria-label="Dia de vencimento do cartão histórico"
                                className="w-20"
                              />
                            </div>
                          </div>
                        )}
                        {group.cardName && sameCardGroups > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="mt-1 h-11 px-2 text-xs sm:h-9"
                            onClick={() =>
                              applyPaymentCardToAll(group, {
                                mode: decision.mode,
                                cardId: decision.cardId,
                                cardName:
                                  decision.cardName || group.cardName || "",
                              })
                            }
                            disabled={pending}
                          >
                            Aplicar a todos deste cartão
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    {isTransfer ? (
                      <Input
                        type="month"
                        value={decision.faturaChave}
                        onChange={(event) =>
                          setPaymentState((current) => ({
                            ...current,
                            [group.id]: {
                              ...decision,
                              faturaChave: event.target.value,
                            },
                          }))
                        }
                        aria-label={`Fatura do pagamento ${group.cardName ?? group.id}`}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2">
                    {!advanced && !group.positive ? (
                      <label className="flex min-h-11 cursor-pointer items-center gap-1 text-xs">
                        <Checkbox
                          checked={decision.action === "ignorar"}
                          onCheckedChange={(checked) =>
                            setPaymentState((current) => ({
                              ...current,
                              [group.id]: {
                                ...decision,
                                action: checked
                                  ? "ignorar"
                                  : "transferencia",
                              },
                            }))
                          }
                          aria-label={`Ignorar pagamento ${group.id}`}
                        />
                        Ignorar
                      </label>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function carryFor(rowId: string): CarryState {
    return carryState[rowId] ?? { action: "ignorar", cartaoId: "" };
  }

  function transferFor(rowId: string, receita: boolean): TransferState {
    return (
      transferState[rowId] ?? {
        action: receita ? "receita" : "despesa",
        contaDestinoId: "",
      }
    );
  }

  async function handleFile(file: File | null) {
    setPreview(null);
    setImported(null);
    setConfirmUndo(false);
    setError(null);
    setAnalysis(null);
    setSheets([]);
    setFileName(null);
    setFileHash(null);
    setStep(1);
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xls") && !lower.endsWith(".xlsx")) {
      setError("Envie um arquivo .xls ou .xlsx.");
      return;
    }
    if (file.size > MAX_SPREADSHEET_BYTES) {
      setError("Arquivo acima do limite de 5 MB.");
      return;
    }

    setReading(true);
    try {
      const buffer = await file.arrayBuffer();
      let hash: string;
      if (globalThis.crypto?.subtle) {
        try {
          const digest = await globalThis.crypto.subtle.digest(
            "SHA-256",
            buffer,
          );
          hash = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
        } catch {
          hash = sha256Hex(new Uint8Array(buffer));
        }
      } else {
        hash = sha256Hex(new Uint8Array(buffer));
      }

      const XLSX = await import("xlsx");
      const workbook = XLSX.read(new Uint8Array(buffer), {
        type: "array",
        cellDates: true,
      });
      if (workbook.SheetNames.length > MAX_SPREADSHEET_SHEETS) {
        setError(
          `A planilha excede o limite de ${MAX_SPREADSHEET_SHEETS} abas.`,
        );
        return;
      }
      const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
      const parsedSheets: SpreadsheetSheet[] = [];
      let totalRows = 0;
      let overflow = false;

      for (const name of workbook.SheetNames) {
        const worksheet = workbook.Sheets[name];
        if (!worksheet) continue;
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
          header: 1,
          raw: true,
          defval: "",
          blankrows: false,
        });
        const headerIndex = matrix.findIndex((row) =>
          row.some((cell) => String(cell ?? "").trim() !== ""),
        );
        if (headerIndex < 0) continue;

        const headerRow = (matrix[headerIndex] ?? [])
          .slice(0, MAX_SPREADSHEET_COLUMNS)
          .map((cell) => String(toCell(cell)).trim());
        const dataRows = matrix
          .slice(headerIndex + 1)
          .map((row) =>
            row
              .slice(0, MAX_SPREADSHEET_COLUMNS)
              .map((cell) => toCell(cell)),
          )
          .filter((row) =>
            row.some((cell) => String(cell ?? "").trim() !== ""),
          );
        if (dataRows.length === 0) continue;

        const remaining = Math.max(0, MAX_SPREADSHEET_ROWS - totalRows);
        if (remaining === 0) {
          overflow = true;
          break;
        }
        if (dataRows.length > remaining) overflow = true;
        const rows = dataRows.slice(0, remaining);
        totalRows += rows.length;
        parsedSheets.push({
          name,
          headers: headerRow,
          rows,
          date1904,
        });
      }

      if (overflow) {
        setError(
          `A planilha excede o limite de ${MAX_SPREADSHEET_ROWS.toLocaleString("pt-BR")} linhas.`,
        );
        return;
      }
      if (parsedSheets.length === 0) {
        setError("A planilha não tem abas com dados.");
        return;
      }

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const nextAnalysis = analyzeSpreadsheet(parsedSheets);
      setSheets(parsedSheets);
      setSheetKinds({});
      setAnalysis(nextAnalysis);
      setFileName(file.name);
      setFileHash(hash);
      setOrigins({});
      setCategoryState({});
      setTagState({});
      setPaymentState({});
      setInvestmentState({});
      setSaldoState({});
      setCarryState({});
      setTransferState({});
      setIgnoreDuplicateRows(false);
      setReimportarHash(false);
      setConsiderHistoricalAsPaid(false);
      setStep(2);
      setPreview(null);
    } catch (cause) {
      console.error("[verde] erro ao ler planilha:", cause);
      setError("Não foi possível ler a planilha. Verifique se o arquivo é válido.");
    } finally {
      setReading(false);
    }
  }

  function changeSheetKind(sheetName: string, kind: SheetKind) {
    const nextKinds = { ...sheetKinds, [sheetName]: kind };
    setSheetKinds(nextKinds);
    setOrigins((current) => ({
      ...current,
      [sheetName]: {
        ...(current[sheetName] ?? defaultOrigin(sheetName, kind)),
        kind,
      },
    }));
    if (sheets.length > 0) {
      setAnalysis(analyzeSpreadsheet(sheets, { sheetKinds: nextKinds }));
      setPreview(null);
    }
  }

  function buildRequest(): SpreadsheetImportRequestInput | null {
    if (!analysis || !fileName || !fileHash) return null;

    const decisions: SpreadsheetImportRequestInput["decisions"] = {
      origins: analysis.sheets.map((sheet) => {
        const kind: SheetKind =
          sheet.kind === "desconhecida" ? "conta" : sheet.kind;
        const origin = originFor(sheet.name, kind);
        if (origin.kind === "conta") {
          if (origin.mode === "existing") {
            if (origin.accountId) {
              return {
                sheetName: sheet.name,
                kind: "conta" as const,
                accountId: origin.accountId,
              };
            }
            return {
              sheetName: sheet.name,
              kind: "conta" as const,
            };
          }
          return {
            sheetName: sheet.name,
            kind: "conta" as const,
            accountName: origin.name || sheet.name,
            createAccount: true,
          };
        }
        if (origin.mode === "existing") {
          if (origin.cardId) {
            return {
              sheetName: sheet.name,
              kind: "cartao" as const,
              cardId: origin.cardId,
            };
          }
          return {
            sheetName: sheet.name,
            kind: "cartao" as const,
          };
        }
        return {
          sheetName: sheet.name,
          kind: "cartao" as const,
          cardName: origin.name || sheet.name,
          createCard: true,
          diaFechamento: origin.diaFechamento,
          diaVencimento: origin.diaVencimento,
        };
      }),
      categories: analysis.categories.map((category) => {
        const decision = categoryFor(category);
        if (decision.action === "existente") {
          const existing = decision.categoryId
            ? options.categories.find(
                (item) => item.id === decision.categoryId,
              )
            : options.categories.find(
                (item) =>
                  item.tipo === category.tipo &&
                  normalizeEntityName(item.nome) ===
                    normalizeEntityName(category.nome),
              );
          if (existing) {
            return {
              key: category.key,
              tipo: category.tipo,
              action: "existente" as const,
              categoryId: existing.id,
            };
          }
        }
        if (decision.action === "ignorar") {
          return {
            key: category.key,
            tipo: category.tipo,
            action: "ignorar" as const,
          };
        }
        return {
          key: category.key,
          tipo: category.tipo,
          action: "criar" as const,
          nome: category.nome,
        };
      }),
      tags: [...new Set(analysis.rows.flatMap((row) => row.tags))].map(
        (name) => {
          const decision = tagFor(name);
          if (decision.action === "existente") {
            const existing = decision.tagId
              ? options.tags.find((item) => item.id === decision.tagId)
              : options.tags.find(
                  (item) =>
                    normalizeEntityName(item.nome) ===
                    normalizeEntityName(name),
                );
            if (existing) {
              return {
                nome: name,
                action: "existente" as const,
                tagId: existing.id,
              };
            }
          }
          if (decision.action === "ignorar") {
            return { nome: name, action: "ignorar" as const };
          }
          return { nome: name, action: "criar" as const };
        },
      ),
      payments: paymentGroups.flatMap(
        (group): SpreadsheetImportRequestInput["decisions"]["payments"] => {
        const decision = paymentFor(group);
        const base = {
          rowId: "",
          action: decision.action,
          faturaChave: decision.faturaChave || group.faturaChave || null,
        };
        if (decision.action === "ignorar") {
          return group.rowIds.map((rowId) => ({
            ...base,
            rowId,
            action: "ignorar" as const,
          }));
        }
        if (group.positive || decision.action === "despesa" || decision.action === "receita") {
          return group.rowIds.map((rowId) => ({
            ...base,
            rowId,
            action:
              decision.action === "despesa"
                ? ("despesa" as const)
                : ("receita" as const),
          }));
        }
        if (decision.mode === "existing" && decision.cardId) {
          return group.rowIds.map((rowId) => ({
            ...base,
            rowId,
            action: "transferencia" as const,
            cardId: decision.cardId,
          }));
        }
        if (decision.mode === "sheet") {
          return group.rowIds.map((rowId) => ({
            ...base,
            rowId,
            action: "transferencia" as const,
            cardName: decision.cardName || group.cardName || null,
          }));
        }
        if (decision.mode === "create") {
          const cardName = decision.cardName || group.cardName || "";
          return group.rowIds.map((rowId) => ({
            ...base,
            rowId,
            action: "transferencia" as const,
            cardName: cardName || null,
            createCard: true,
            diaFechamento: decision.diaFechamento,
            diaVencimento: decision.diaVencimento,
          }));
        }
        return group.rowIds.map((rowId) => ({
          ...base,
          rowId,
          action: "transferencia" as const,
          cardName: decision.cardName || group.cardName || null,
          createCard: false,
        }));
        },
      ),
      investments: analysis.investments.map((group) => {
        const decision = investmentFor(group.key);
        return {
          groupKey: group.key,
          action: decision.action,
          contaDestinoId: decision.contaDestinoId || null,
        };
      }),
      saldosIniciais: analysis.saldosIniciais.map((group) => {
        const sheet = analysis.sheets.find(
          (item) => item.name === group.sheetName,
        );
        const kind: SheetKind =
          sheet?.kind === "cartao" ? "cartao" : "conta";
        const origin = originFor(group.sheetName, kind);
        const fallback = defaultSaldoAction(options, origin);
        return {
          sheetName: group.sheetName,
          action: saldoState[group.sheetName] ?? fallback,
        };
      }),
      carryOver: carryOverRows.map((row) => {
        const decision = carryFor(row.id);
        return {
          rowId: row.id,
          action: decision.action,
          cartaoId: decision.cartaoId || null,
        };
      }),
      transferencias: analysis.transferencias.map((row) => {
        const decision = transferFor(row.id, row.tipo === "receita");
        return {
          rowId: row.id,
          action: decision.action,
          contaDestinoId: decision.contaDestinoId || null,
        };
      }),
      ignoreRowIds: [],
      ignoreDuplicateRows,
      reimportarHash,
      considerarFaturasPagasAte: considerHistoricalAsPaid
        ? todayISO()
        : null,
      recurrences: recurrenceCandidates
        .filter((candidate) => selectedRecurrenceKeys.has(candidate.key))
        .map((candidate) => ({
          key: candidate.key,
          frequencia: candidate.frequencia,
          dataInicio: candidate.ultimaData,
          dataFim: null,
        })),
    };

    return {
      fileName,
      fileHash,
      rows: analysis.rows,
      decisions,
    };
  }

  function runPreview() {
    const request = buildRequest();
    if (!request) {
      setError("Selecione e analise uma planilha antes de continuar.");
      return;
    }
    const unresolved = analysis?.sheets.filter(
      (sheet) =>
        sheet.kind === "desconhecida" && !sheetKinds[sheet.name],
    );
    if (unresolved && unresolved.length > 0) {
      setError(
        `Escolha o tipo das abas: ${unresolved
          .map((sheet) => `"${sheet.name}"`)
          .join(", ")}.`,
      );
      setStep(1);
      return;
    }
    setError(null);
    setPreview(null);
    setImported(null);
    startTransition(async () => {
      const response = await previewSpreadsheetImportAction(request);
      setPreview(response);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setStep(3);
    });
  }

  function runImport() {
    const request = buildRequest();
    if (!request) {
      setError("Selecione uma planilha.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await importSpreadsheetImportAction(request);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setImported(
        `${response.imported} lançamento(s) importado(s). ${response.ignored} ignorado(s), ${response.duplicates} duplicado(s) detectado(s).`,
      );
      setConfirmUndo(false);
      setPreview(null);
      toast({ description: "Planilha importada.", tone: "success" });
      router.refresh();
    });
  }

  function runUndo() {
    setError(null);
    startTransition(async () => {
      const response = await undoLastImportAction();
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setConfirmUndo(false);
      setImported(null);
      toast({
        description: `${response.count ?? 0} lançamento(s) removido(s).`,
        tone: "success",
      });
      router.refresh();
    });
  }

  const canImport =
    preview?.ok === true &&
    !pending &&
    preview.pending.length === 0 &&
    preview.counts.importable > 0 &&
    (!preview.requiresReimport || reimportarHash);

  const attentionPaymentGroups = paymentGroups.filter((group) =>
    paymentNeedsAttention(group, paymentFor(group)),
  );
  const baseAttentionPaymentGroups = analysis
    ? paymentGroups.filter((group) =>
        paymentNeedsAttention(
          group,
          defaultPayment(
            options,
            analysis,
            group,
            invoiceTotals,
            (sheetName) => originFor(sheetName, "cartao"),
          ),
        ),
      )
    : [];
  const autoPaymentCount = paymentGroups.length - attentionPaymentGroups.length;
  const autoHistoricalCards = new Set(
    paymentGroups
      .filter((group) => paymentFor(group).mode === "create")
      .map((group) => normalizeEntityName(group.cardName ?? ""))
      .filter(Boolean),
  ).size;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" aria-hidden="true" />
          Importar planilha (XLS/XLSX)
        </CardTitle>
        <CardDescription>
          Lê várias abas, identifica contas e cartões, concilia faturas e
          preserva tags, observações e parcelas. O binário não sai do navegador:
          só o JSON normalizado é enviado ao servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormError message={error} />

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant={step === 1 ? "default" : "secondary"}>1. Arquivo</Badge>
          <Badge variant={step === 2 ? "default" : "secondary"}>
            2. Origens e regras
          </Badge>
          <Badge variant={step === 3 ? "default" : "secondary"}>
            3. Prévia
          </Badge>
        </div>

        <div className="space-y-2">
          <Label htmlFor="spreadsheet-file" className="text-xs text-muted-foreground">
            Arquivo da planilha
          </Label>
          <Input
            id="spreadsheet-file"
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={reading || pending}
            onChange={(event) =>
              void handleFile(event.target.files?.[0] ?? null)
            }
            className="h-11 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Até {MAX_SPREADSHEET_BYTES / (1024 * 1024)} MB,{" "}
            {MAX_SPREADSHEET_SHEETS} abas e{" "}
            {MAX_SPREADSHEET_ROWS.toLocaleString("pt-BR")} linhas.
          </p>
          {readings(fileName, reading)}
        </div>

        {analysis && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{analysis.sheets.length} aba(s)</Badge>
              <Badge variant="secondary">
                {analysis.sheets.filter((sheet) => sheet.kind === "conta").length}{" "}
                conta(s)
              </Badge>
              <Badge variant="secondary">
                {analysis.sheets.filter((sheet) => sheet.kind === "cartao").length}{" "}
                cartão(ões)
              </Badge>
              <Badge variant="secondary">{analysis.totals.rows} linha(s)</Badge>
              <Badge variant="secondary">
                {analysis.totals.byKind.conta} em contas
              </Badge>
              <Badge variant="secondary">
                {analysis.totals.byKind.cartao} em cartões
              </Badge>
              {analysis.totals.zeros > 0 && (
                <Badge variant="warning">
                  {analysis.totals.zeros} valor(es) zero
                </Badge>
              )}
              {analysis.totals.invalid > 0 && (
                <Badge variant="destructive">
                  {analysis.totals.invalid} inválida(s)
                </Badge>
              )}
              {analysis.carryOver.length > 0 && (
                <Badge variant="warning">
                  {analysis.carryOver.length} carry-over
                </Badge>
              )}
              {analysis.cartaoAdicional.length > 0 && (
                <Badge variant="warning">
                  {analysis.cartaoAdicional.length} cartão adicional
                </Badge>
              )}
              {analysis.rows.filter((row) => row.observacao).length > 0 && (
                <Badge variant="secondary">
                  {analysis.rows.filter((row) => row.observacao).length}{" "}
                  observação(ões)
                </Badge>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Aba</th>
                    <th className="p-2 font-medium">Tipo</th>
                    <th className="p-2 font-medium">Linhas</th>
                    <th className="p-2 font-medium">Período</th>
                    <th className="p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.sheets.map((sheet) => (
                    <tr key={sheet.name} className="border-t border-border">
                      <td className="p-2">{sheet.name}</td>
                      <td className="p-2">
                        <NativeSelect
                          value={
                            sheetKinds[sheet.name] ??
                            (sheet.kind === "desconhecida"
                              ? ""
                              : sheet.kind)
                          }
                          onChange={(event) =>
                            changeSheetKind(
                              sheet.name,
                              event.target.value as SheetKind,
                            )
                          }
                          aria-label={`Tipo da aba ${sheet.name}`}
                          className="min-w-28"
                        >
                          {sheet.kind === "desconhecida" &&
                            !sheetKinds[sheet.name] && (
                              <option value="" disabled>
                                Escolha…
                              </option>
                            )}
                          <option value="conta">Conta</option>
                          <option value="cartao">Cartão</option>
                        </NativeSelect>
                      </td>
                      <td className="p-2">
                        {sheet.rowCount}
                        {sheet.zeroRows > 0 ? ` (${sheet.zeroRows} zero)` : ""}
                      </td>
                      <td className="p-2">
                        {sheet.dateFrom ?? "—"} a {sheet.dateTo ?? "—"}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={
                            sheet.status === "ok"
                              ? "success"
                              : sheet.status === "vazia"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {sheet.status === "ok"
                            ? "ok"
                            : sheet.status === "vazia"
                              ? "vazia"
                              : "inválida"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(2)}
              disabled={pending}
            >
              Revisar origens e regras
            </Button>
          </div>
        )}

        {step >= 2 && analysis && (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Origens</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Aba</th>
                      <th className="p-2 font-medium">Destino</th>
                      <th className="p-2 font-medium">Conta/Cartão</th>
                      <th className="p-2 font-medium">Nome</th>
                      <th className="p-2 font-medium">Fech./Venc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.sheets.map((sheet) => {
                      const kind: SheetKind =
                        sheet.kind === "desconhecida"
                          ? "conta"
                          : sheet.kind;
                      const origin = originFor(sheet.name, kind);
                      return (
                        <tr key={sheet.name} className="border-t border-border align-top">
                          <td className="p-2">
                            <span className="font-medium">{sheet.name}</span>
                            <span className="block text-muted-foreground">
                              {sheet.rowCount} linha(s)
                            </span>
                          </td>
                          <td className="p-2">
                            <NativeSelect
                              value={origin.mode}
                              onChange={(event) =>
                                setOrigins((current) => ({
                                  ...current,
                                  [sheet.name]: {
                                    ...origin,
                                    mode: event.target.value as
                                      | "existing"
                                      | "new",
                                  },
                                }))
                              }
                              aria-label={`Destino da aba ${sheet.name}`}
                            >
                              <option value="new">Criar novo</option>
                              <option value="existing">Usar existente</option>
                            </NativeSelect>
                          </td>
                          <td className="p-2">
                            {origin.kind === "conta" ? (
                              <NativeSelect
                                value={
                                  origin.mode === "existing"
                                    ? origin.accountId
                                    : "new"
                                }
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setOrigins((current) => ({
                                    ...current,
                                    [sheet.name]: {
                                      ...origin,
                                      mode: value === "new" ? "new" : "existing",
                                      accountId: value === "new" ? "" : value,
                                    },
                                  }));
                                }}
                                aria-label={`Conta da aba ${sheet.name}`}
                              >
                                <option value="new">Criar nova conta</option>
                                {origin.mode === "existing" &&
                                  !origin.accountId && (
                                    <option value="">Selecione…</option>
                                  )}
                                {accountOptions.map((account) => (
                                  <option key={account.id} value={account.id}>
                                    {account.nome}
                                  </option>
                                ))}
                              </NativeSelect>
                            ) : (
                              <NativeSelect
                                value={
                                  origin.mode === "existing"
                                    ? origin.cardId
                                    : "new"
                                }
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setOrigins((current) => ({
                                    ...current,
                                    [sheet.name]: {
                                      ...origin,
                                      mode: value === "new" ? "new" : "existing",
                                      cardId: value === "new" ? "" : value,
                                    },
                                  }));
                                }}
                                aria-label={`Cartão da aba ${sheet.name}`}
                              >
                                <option value="new">Criar novo cartão</option>
                                {origin.mode === "existing" &&
                                  !origin.cardId && (
                                    <option value="">Selecione…</option>
                                  )}
                                {cardOptions.map((card) => (
                                  <option key={card.id} value={card.id}>
                                    {card.nome}
                                    {card.arquivado ? " (arquivado)" : ""}
                                  </option>
                                ))}
                              </NativeSelect>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              {origin.mode === "existing"
                                ? "Usando existente"
                                : "Criando novo"}
                            </p>
                          </td>
                          <td className="p-2">
                            {origin.mode === "new" && (
                              <Input
                                value={origin.name}
                                onChange={(event) =>
                                  setOrigins((current) => ({
                                    ...current,
                                    [sheet.name]: {
                                      ...origin,
                                      name: event.target.value,
                                    },
                                  }))
                                }
                                aria-label={`Nome do destino da aba ${sheet.name}`}
                              />
                            )}
                          </td>
                          <td className="p-2">
                            {origin.mode === "new" &&
                              origin.kind === "cartao" && (
                                <div className="flex gap-1">
                                  <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={origin.diaFechamento}
                                    onChange={(event) =>
                                      setOrigins((current) => ({
                                        ...current,
                                        [sheet.name]: {
                                          ...origin,
                                          diaFechamento: Math.min(
                                            31,
                                            Math.max(
                                              1,
                                              Number(event.target.value) || 1,
                                            ),
                                          ),
                                        },
                                      }))
                                    }
                                    aria-label={`Dia de fechamento do cartão ${origin.name}`}
                                    className="w-20"
                                  />
                                  <Input
                                    type="number"
                                    min={1}
                                    max={31}
                                    value={origin.diaVencimento}
                                    onChange={(event) =>
                                      setOrigins((current) => ({
                                        ...current,
                                        [sheet.name]: {
                                          ...origin,
                                          diaVencimento: Math.min(
                                            31,
                                            Math.max(
                                              1,
                                              Number(event.target.value) || 1,
                                            ),
                                          ),
                                        },
                                      }))
                                    }
                                    aria-label={`Dia de vencimento do cartão ${origin.name}`}
                                    className="w-20"
                                  />
                                </div>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                Para vincular a uma conta ou cartão já cadastrado, escolha-o
                diretamente na coluna <strong>Conta/Cartão</strong>. Se preferir
                criar um novo, mantenha a opção de criação e ajuste o nome e as
                datas.
              </p>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Categorias</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Categoria</th>
                      <th className="p-2 font-medium">Tipo</th>
                      <th className="p-2 font-medium">Linhas</th>
                      <th className="p-2 font-medium">Decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryMemo.map((category) => {
                      const decision = categoryFor(category);
                      const matching = options.categories.filter(
                        (item) => item.tipo === category.tipo,
                      );
                      return (
                        <tr
                          key={category.key}
                          className="border-t border-border"
                        >
                          <td className="p-2">{category.nome}</td>
                          <td className="p-2">{category.tipo}</td>
                          <td className="p-2">{category.count}</td>
                          <td className="p-2">
                            <NativeSelect
                              value={
                                decision.action === "existente"
                                  ? `existente:${decision.categoryId}`
                                  : decision.action
                              }
                              onChange={(event) => {
                                const value = event.target.value;
                                setCategoryState((current) => ({
                                  ...current,
                                  [category.key]: value.startsWith("existente:")
                                    ? {
                                        action: "existente",
                                        categoryId: value.slice(
                                          "existente:".length,
                                        ),
                                      }
                                    : {
                                        action: value as
                                          | "criar"
                                          | "ignorar",
                                        categoryId: "",
                                      },
                                }));
                              }}
                              aria-label={`Decisão da categoria ${category.nome}`}
                            >
                              <option value="criar">Criar categoria</option>
                              <option value="ignorar">Ignorar categoria</option>
                              {matching.map((item) => (
                                <option
                                  key={item.id}
                                  value={`existente:${item.id}`}
                                >
                                  Usar “{item.nome}”
                                </option>
                              ))}
                            </NativeSelect>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {[...new Set(analysis.rows.flatMap((row) => row.tags))].length >
              0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Tags</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="p-2 font-medium">Tag</th>
                        <th className="p-2 font-medium">Decisão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...new Set(analysis.rows.flatMap((row) => row.tags))].map(
                        (name) => {
                          const decision = tagFor(name);
                          return (
                            <tr key={name} className="border-t border-border">
                              <td className="p-2">{name}</td>
                              <td className="p-2">
                                <NativeSelect
                                  value={
                                    decision.action === "existente"
                                      ? `existente:${decision.tagId}`
                                      : decision.action
                                  }
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setTagState((current) => ({
                                      ...current,
                                      [normalizeEntityName(name)]:
                                        value.startsWith("existente:")
                                          ? {
                                              action: "existente",
                                              tagId: value.slice(
                                                "existente:".length,
                                              ),
                                            }
                                          : {
                                              action: value as
                                                | "criar"
                                                | "ignorar",
                                              tagId: "",
                                            },
                                    }));
                                  }}
                                  aria-label={`Decisão da tag ${name}`}
                                >
                                  <option value="criar">Criar tag</option>
                                  <option value="ignorar">Ignorar tag</option>
                                  {options.tags.map((tag) => (
                                    <option
                                      key={tag.id}
                                      value={`existente:${tag.id}`}
                                    >
                                      Usar “{tag.nome}”
                                    </option>
                                  ))}
                                </NativeSelect>
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {paymentGroups.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Pagamentos de fatura ({paymentGroups.length} grupo(s))
                </h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success">
                    {autoPaymentCount} resolvido(s) automaticamente
                  </Badge>
                  <Badge
                    variant={
                      attentionPaymentGroups.length > 0 ? "warning" : "success"
                    }
                  >
                    {attentionPaymentGroups.length} precisa(m) de atenção
                  </Badge>
                  <Badge variant="secondary">
                    {analysis.payments.reduce(
                      (sum, group) => sum + group.count,
                      0,
                    )}{" "}
                    com cartão e mês
                  </Badge>
                  <Badge variant="secondary">
                    {analysis.genericPayments.reduce(
                      (sum, group) => sum + group.count,
                      0,
                    )}{" "}
                    genérico(s)
                  </Badge>
                  {analysis.divergentPayments.length > 0 && (
                    <Badge variant="destructive">
                      {analysis.divergentPayments.reduce(
                        (sum, group) => sum + group.count,
                        0,
                      )}{" "}
                      com categoria divergente
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Pagamentos com cartão/mês na descrição e genéricos cujo valor
                  bate exatamente com a fatura do mês são conciliados
                  automaticamente como transferência. Você só precisa escolher
                  os casos abaixo.
                </p>
                {autoHistoricalCards > 0 && (
                  <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {autoHistoricalCards} cartão(ões) histórico(s) citado(s) nos
                    pagamentos serão criados arquivados automaticamente. Use
                    “Revisar todos” para trocar por um cartão existente.
                  </p>
                )}
                {attentionPaymentGroups.length > 0 ? (
                  <>
                    <p className="text-xs font-medium">
                      Faltam {attentionPaymentGroups.length} pagamento(s) para
                      conciliar:
                    </p>
                    {renderPaymentTable(baseAttentionPaymentGroups, false)}
                  </>
                ) : (
                  <p className="rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
                    Todos os pagamentos de fatura foram conciliados
                    automaticamente.
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setShowPaymentReview((current) => !current)
                  }
                  disabled={pending}
                >
                  {showPaymentReview
                    ? "Ocultar revisão avançada"
                    : `Revisar todos (${paymentGroups.length})`}
                </Button>
                {showPaymentReview && (
                  <div className="space-y-2 border-t border-border pt-2">
                    <p className="text-xs font-medium">
                      Revisão avançada: permite mudar a ação, o cartão e a
                      fatura de qualquer pagamento.
                    </p>
                    {renderPaymentTable(paymentGroups, true)}
                  </div>
                )}
              </section>
            )}

            {recurrenceCandidates.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Recorrências detectadas ({recurrenceCandidates.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Séries com mesma origem, descrição, categoria e valor em
                  intervalos regulares. Marque as que devem virar uma
                  recorrência editável em lote. As ocorrências importadas serão
                  vinculadas à série.
                </p>
                <div className="max-h-64 overflow-auto">
                  <table className="w-full min-w-[860px] text-left text-xs">
                    <thead className="sticky top-0 bg-card text-muted-foreground">
                      <tr>
                        <th className="p-2 font-medium">Usar</th>
                        <th className="p-2 font-medium">Descrição</th>
                        <th className="p-2 font-medium">Valor</th>
                        <th className="p-2 font-medium">Frequência</th>
                        <th className="p-2 font-medium">Ocorrências</th>
                        <th className="p-2 font-medium">Período</th>
                        <th className="p-2 font-medium">Próxima</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recurrenceCandidates.map((candidate) => (
                        <tr
                          key={candidate.key}
                          className="border-t border-border"
                        >
                          <td className="p-2">
                            <Checkbox
                              checked={selectedRecurrenceKeys.has(
                                candidate.key,
                              )}
                              onCheckedChange={(checked) =>
                                setSelectedRecurrenceKeys((current) => {
                                  const next = new Set(current);
                                  if (checked === true) {
                                    next.add(candidate.key);
                                  } else {
                                    next.delete(candidate.key);
                                  }
                                  return next;
                                })
                              }
                              aria-label={`Criar recorrência para ${candidate.descricao}`}
                            />
                          </td>
                          <td className="p-2">
                            <span className="font-medium">
                              {candidate.descricao}
                            </span>
                            <span className="block text-muted-foreground">
                              {candidate.origemNome}
                              {candidate.categoriaNome
                                ? ` · ${candidate.categoriaNome}`
                                : ""}
                            </span>
                          </td>
                          <td className="p-2">
                            {cents(candidate.valorCentavos)}
                          </td>
                          <td className="p-2">
                            <Badge variant="secondary">
                              {candidate.frequencia === "mensal"
                                ? "Mensal"
                                : candidate.frequencia === "semanal"
                                  ? "Semanal"
                                  : "Anual"}
                            </Badge>
                          </td>
                          <td className="p-2">{candidate.ocorrencias}</td>
                          <td className="p-2">
                            {formatDate(candidate.primeiraData)} a{" "}
                            {formatDate(candidate.ultimaData)}
                          </td>
                          <td className="p-2">
                            {formatDate(candidate.proximaData)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {(analysis.investments.length > 0 ||
              analysis.saldosIniciais.length > 0 ||
              carryOverRows.length > 0 ||
              analysis.transferencias.length > 0) && (
              <section className="space-y-4">
                <h3 className="text-sm font-semibold">Linhas especiais</h3>

                {analysis.investments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">
                      Investimentos e reservas
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-xs">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="p-2 font-medium">Grupo</th>
                            <th className="p-2 font-medium">Linhas</th>
                            <th className="p-2 font-medium">Total</th>
                            <th className="p-2 font-medium">Ação</th>
                            <th className="p-2 font-medium">Conta destino</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.investments.map((group) => {
                            const decision = investmentFor(group.key);
                            return (
                              <tr key={group.key} className="border-t border-border">
                                <td className="p-2">
                                  <span className="font-medium">
                                    {group.categoriaNome}
                                  </span>
                                  <span className="block text-muted-foreground">
                                    {group.descricaoBase} · {group.sheetName}
                                  </span>
                                </td>
                                <td className="p-2">{group.count}</td>
                                <td className="p-2">
                                  {cents(group.totalCentavos)}
                                </td>
                                <td className="p-2">
                                  <NativeSelect
                                    value={decision.action}
                                    onChange={(event) =>
                                      setInvestmentState((current) => ({
                                        ...current,
                                        [group.key]: {
                                          ...decision,
                                          action: event.target.value as InvestmentState["action"],
                                        },
                                      }))
                                    }
                                    aria-label={`Ação do investimento ${group.descricaoBase}`}
                                  >
                                    <option value="despesa">
                                      Despesa em Investimentos
                                    </option>
                                    {analysis.sheets.find(
                                      (item) => item.name === group.sheetName,
                                    )?.kind !== "cartao" && (
                                      <option value="transferencia">
                                        Transferência
                                      </option>
                                    )}
                                    <option value="ignorar">Ignorar</option>
                                  </NativeSelect>
                                </td>
                                <td className="p-2">
                                  {decision.action === "transferencia" && (
                                    <NativeSelect
                                      value={decision.contaDestinoId}
                                      onChange={(event) =>
                                        setInvestmentState((current) => ({
                                          ...current,
                                          [group.key]: {
                                            ...decision,
                                            contaDestinoId: event.target.value,
                                          },
                                        }))
                                      }
                                      aria-label={`Conta de destino do investimento ${group.descricaoBase}`}
                                    >
                                      <option value="">Selecione</option>
                                      {accountOptions
                                        .filter(
                                          (account) =>
                                            account.id !==
                                            originFor(
                                              group.sheetName,
                                              "conta",
                                            ).accountId,
                                        )
                                        .map((account) => (
                                          <option
                                            key={account.id}
                                            value={account.id}
                                          >
                                            {account.nome}
                                          </option>
                                        ))}
                                    </NativeSelect>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {analysis.saldosIniciais.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Saldo inicial</p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-xs">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="p-2 font-medium">Aba</th>
                            <th className="p-2 font-medium">Valor</th>
                            <th className="p-2 font-medium">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.saldosIniciais.map((group) => {
                            const kind: SheetKind =
                              originFor(group.sheetName, "conta").kind;
                            const fallback = defaultSaldoAction(
                              options,
                              originFor(group.sheetName, kind),
                            );
                            return (
                              <tr key={group.sheetName} className="border-t border-border">
                                <td className="p-2">{group.sheetName}</td>
                                <td className="p-2">
                                  {cents(group.totalCentavos)}
                                </td>
                                <td className="p-2">
                                  <NativeSelect
                                    value={
                                      saldoState[group.sheetName] ?? fallback
                                    }
                                    onChange={(event) =>
                                      setSaldoState((current) => ({
                                        ...current,
                                        [group.sheetName]: event.target
                                          .value as
                                          | "saldo_inicial"
                                          | "ajuste"
                                          | "ignorar",
                                      }))
                                    }
                                    aria-label={`Ação do saldo inicial da aba ${group.sheetName}`}
                                  >
                                    <option value="saldo_inicial">
                                      Usar como saldo inicial
                                    </option>
                                    <option value="ajuste">
                                      Criar lançamento de ajuste
                                    </option>
                                    <option value="ignorar">Ignorar</option>
                                  </NativeSelect>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {carryOverRows.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">
                      Carry-over / saldo anterior ({carryOverRows.length})
                    </p>
                    <div className="max-h-64 overflow-auto">
                      <table className="w-full min-w-[760px] text-left text-xs">
                        <thead className="sticky top-0 bg-card text-muted-foreground">
                          <tr>
                            <th className="p-2 font-medium">Aba/linha</th>
                            <th className="p-2 font-medium">Descrição</th>
                            <th className="p-2 font-medium">Valor</th>
                            <th className="p-2 font-medium">Ação</th>
                            <th className="p-2 font-medium">Cartão</th>
                          </tr>
                        </thead>
                        <tbody>
                          {carryOverRows.map((row) => {
                            const decision = carryFor(row.id);
                            return (
                              <tr key={row.id} className="border-t border-border">
                                <td className="p-2">
                                  {row.sheetName} · {row.sourceRow}
                                </td>
                                <td className="p-2">{row.descricao}</td>
                                <td className="p-2">
                                  {cents(row.valorCentavos)}
                                </td>
                                <td className="p-2">
                                  <NativeSelect
                                    value={decision.action}
                                    onChange={(event) =>
                                      setCarryState((current) => ({
                                        ...current,
                                        [row.id]: {
                                          ...decision,
                                          action: event.target.value as
                                            | "compra"
                                            | "ignorar",
                                        },
                                      }))
                                    }
                                    aria-label={`Ação do carry-over ${row.descricao}`}
                                  >
                                    <option value="ignorar">Ignorar</option>
                                    <option value="compra">
                                      Importar como compra
                                    </option>
                                  </NativeSelect>
                                </td>
                                <td className="p-2">
                                  {decision.action === "compra" && (
                                    <NativeSelect
                                      value={decision.cartaoId}
                                      onChange={(event) =>
                                        setCarryState((current) => ({
                                          ...current,
                                          [row.id]: {
                                            ...decision,
                                            cartaoId: event.target.value,
                                          },
                                        }))
                                      }
                                      aria-label={`Cartão do carry-over ${row.descricao}`}
                                    >
                                      <option value="">
                                        Cartão da aba
                                      </option>
                                      {cardOptions.map((card) => (
                                        <option key={card.id} value={card.id}>
                                          {card.nome}
                                        </option>
                                      ))}
                                    </NativeSelect>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {analysis.transferencias.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium">Transferências</p>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-xs">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="p-2 font-medium">Aba/linha</th>
                            <th className="p-2 font-medium">Descrição</th>
                            <th className="p-2 font-medium">Valor</th>
                            <th className="p-2 font-medium">Ação</th>
                            <th className="p-2 font-medium">Conta destino</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.transferencias.map((row) => {
                            const decision = transferFor(
                              row.id,
                              row.tipo === "receita",
                            );
                            return (
                              <tr key={row.id} className="border-t border-border">
                                <td className="p-2">
                                  {row.sheetName} · {row.sourceRow}
                                </td>
                                <td className="p-2">{row.descricao}</td>
                                <td className="p-2">
                                  {cents(row.valorCentavos)}
                                </td>
                                <td className="p-2">
                                  <NativeSelect
                                    value={decision.action}
                                    onChange={(event) =>
                                      setTransferState((current) => ({
                                        ...current,
                                        [row.id]: {
                                          ...decision,
                                          action: event.target.value as TransferState["action"],
                                        },
                                      }))
                                    }
                                    aria-label={`Ação da transferência ${row.descricao}`}
                                  >
                                    <option value="despesa">Despesa</option>
                                    <option value="receita">Receita</option>
                                    <option value="transferencia">
                                      Transferência entre contas
                                    </option>
                                    <option value="ignorar">Ignorar</option>
                                  </NativeSelect>
                                </td>
                                <td className="p-2">
                                  {decision.action === "transferencia" && (
                                    <NativeSelect
                                      value={decision.contaDestinoId}
                                      onChange={(event) =>
                                        setTransferState((current) => ({
                                          ...current,
                                          [row.id]: {
                                            ...decision,
                                            contaDestinoId: event.target.value,
                                          },
                                        }))
                                      }
                                      aria-label={`Conta de destino da transferência ${row.descricao}`}
                                    >
                                      <option value="">Selecione</option>
                                      {accountOptions.map((account) => (
                                        <option
                                          key={account.id}
                                          value={account.id}
                                        >
                                          {account.nome}
                                        </option>
                                      ))}
                                    </NativeSelect>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            )}

            {analysis.zeros.length > 0 && (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                {analysis.zeros.length} linha(s) com valor zero serão ignoradas.
              </p>
            )}
            {analysis.correcoes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {analysis.correcoes.length} linha(s) de correção de saldo entram
                como lançamento normal, conforme o sinal.
              </p>
            )}

            <div className="flex flex-wrap gap-4">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={ignoreDuplicateRows}
                  onCheckedChange={(checked) =>
                    setIgnoreDuplicateRows(checked === true)
                  }
                />
                Ignorar duplicados suspeitos
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={reimportarHash}
                  onCheckedChange={(checked) =>
                    setReimportarHash(checked === true)
                  }
                />
                Reimportar mesmo se o arquivo já foi importado
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={considerHistoricalAsPaid}
                  onCheckedChange={(checked) =>
                    setConsiderHistoricalAsPaid(checked === true)
                  }
                />
                Considerar faturas antigas como pagas (até hoje)
              </label>
            </div>
            {considerHistoricalAsPaid && (
              <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                As faturas importadas com vencimento até hoje serão consideradas
                pagas no limite e no histórico. Isso não cria pagamentos nem
                altera o saldo das contas.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={runPreview}
                disabled={pending || reading}
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4" />
                )}
                Pré-visualizar
              </Button>
              {step === 3 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={pending}
                >
                  Voltar
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && preview?.ok && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{preview.counts.rows} linha(s)</Badge>
              <Badge variant="success">
                {preview.counts.importable} importável(is)
              </Badge>
              <Badge variant="secondary">
                {preview.counts.ignored} ignorada(s)
              </Badge>
              <Badge variant="secondary">
                {preview.counts.byType.despesa} despesa(s)
              </Badge>
              <Badge variant="secondary">
                {preview.counts.byType.receita} receita(s)
              </Badge>
              <Badge variant="secondary">
                {preview.counts.byType.transferencia} transferência(s)
              </Badge>
              {preview.counts.zeros > 0 && (
                <Badge variant="warning">
                  {preview.counts.zeros} zero(s)
                </Badge>
              )}
              {preview.counts.duplicates > 0 && (
                <Badge variant="warning">
                  {preview.counts.duplicates} duplicada(s)
                </Badge>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Aba</th>
                    <th className="p-2 font-medium">Linhas</th>
                    <th className="p-2 font-medium">Importáveis</th>
                    <th className="p-2 font-medium">Ignoradas</th>
                    <th className="p-2 font-medium">Duplicadas</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.counts.bySheet.map((sheet) => (
                    <tr key={sheet.sheetName} className="border-t border-border">
                      <td className="p-2">{sheet.sheetName}</td>
                      <td className="p-2">{sheet.rows}</td>
                      <td className="p-2">{sheet.importable}</td>
                      <td className="p-2">{sheet.ignored}</td>
                      <td className="p-2">{sheet.duplicates}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analysis && analysis.issues.length > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs">
                <p className="font-medium text-destructive">
                  Problemas na leitura ({analysis.issues.length})
                </p>
                <ul className="mt-1 space-y-0.5">
                  {analysis.issues.slice(0, 100).map((issue) => (
                    <li
                      key={`${issue.sheetName}-${issue.sourceRow}-${issue.message}`}
                    >
                      {issue.sheetName} · linha {issue.sourceRow}:{" "}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.existingBatch && (
              <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Este arquivo já foi importado em{" "}
                {new Date(preview.existingBatch.createdAt).toLocaleString(
                  "pt-BR",
                )}{" "}
                ({preview.existingBatch.fileName}). Marque “Reimportar mesmo se o
                arquivo já foi importado” para continuar.
              </p>
            )}

            {preview.pending.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <p className="font-medium">Decisões obrigatórias pendentes</p>
                <p className="mt-1">
                  Resolva os pagamentos na etapa 2 e clique em
                  “Pré-visualizar” novamente.
                </p>
                <ul className="mt-1 space-y-0.5">
                  {preview.pending.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs text-warning">
                <p className="font-medium">Avisos</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.warnings.slice(0, 100).map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.issues.length > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs">
                <p className="font-medium text-destructive">Problemas</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.issues.slice(0, 100).map((issue) => (
                    <li key={`${issue.sheetName}-${issue.sourceRow}-${issue.message}`}>
                      {issue.sheetName} · linha {issue.sourceRow}:{" "}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.duplicates.length > 0 && (
              <div className="max-h-32 overflow-y-auto text-xs text-warning">
                <p className="font-medium">Duplicados suspeitos</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.duplicates.slice(0, 100).map((duplicate) => (
                    <li key={`${duplicate.rowId}-${duplicate.origin}`}>
                      {duplicate.sheetName} · linha {duplicate.sourceRow} ·{" "}
                      {duplicate.origin === "banco"
                        ? "já existe no banco"
                        : "repetida no arquivo"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.invoices.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Cartão</th>
                      <th className="p-2 font-medium">Fatura</th>
                      <th className="p-2 font-medium">Compras</th>
                      <th className="p-2 font-medium">Pagamentos</th>
                      <th className="p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.invoices.map((invoice) => (
                      <tr
                        key={`${invoice.cartaoNome}-${invoice.faturaChave}`}
                        className="border-t border-border"
                      >
                        <td className="p-2">{invoice.cartaoNome}</td>
                        <td className="p-2">
                          {formatMonth(invoice.faturaChave)}
                        </td>
                        <td className="p-2">
                          {cents(invoice.totalCentavos)}
                        </td>
                        <td className="p-2">{cents(invoice.pagoCentavos)}</td>
                        <td className="p-2">
                          <Badge
                            variant={
                              invoice.status === "confere"
                                ? "success"
                                : invoice.status === "divergente"
                                  ? "warning"
                                  : "secondary"
                            }
                          >
                            {invoice.status === "confere"
                              ? "confere"
                              : invoice.status === "divergente"
                                ? "divergente"
                                : "sem pagamento"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Button
              type="button"
              onClick={runImport}
              disabled={!canImport}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Importar planilha
            </Button>
          </div>
        )}

        {imported && (
          <div className="space-y-2 rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
            <p>{imported}</p>
            {!confirmUndo ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmUndo(true)}
                disabled={pending}
              >
                <RotateCcw className="h-4 w-4" />
                Desfazer esta importação
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm">Remover os lançamentos deste lote?</p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-11 sm:h-9"
                  onClick={runUndo}
                  disabled={pending}
                >
                  Confirmar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 sm:h-9"
                  onClick={() => setConfirmUndo(false)}
                  disabled={pending}
                >
                  Cancelar
                </Button>
              </div>
            )}
            <p className="text-xs">
              Contas, cartões, categorias e tags criados são mantidos; apenas os
              lançamentos do lote são removidos.
            </p>
            <p className="text-xs">
              Se faturas antigas ficaram em aberto, use “Cartões → Faturas
              antigas como pagas” para considerá-las quitadas sem alterar o
              saldo das contas.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function readings(fileName: string | null, reading: boolean) {
  if (reading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Lendo planilha…
      </p>
    );
  }
  if (!fileName) return null;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
      {fileName}
    </p>
  );
}
