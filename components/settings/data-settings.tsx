"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Upload,
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
import { DatePicker } from "@/components/calendar/date-picker";
import { FormError } from "@/components/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toast";
import {
  importJsonAction,
  importTransactionsAction,
  previewImportAction,
  undoLastImportAction,
  type ImportPreview,
} from "@/lib/actions/data";
import {
  assertImportSize,
  MAX_IMPORT_BYTES,
  parseCsv,
  type CsvMapping,
} from "@/lib/finance/csv-import";
import { currentMonth, todayISO } from "@/lib/dates";
import { monthRange } from "@/lib/dates";
import { formatDateTime } from "@/lib/format";

type LatestImport = {
  batchId: string;
  createdAt: Date | number;
  count: number;
};

type DataSettingsProps = {
  latestImport: LatestImport | null;
};

const MAPPING_FIELDS: {
  key: keyof CsvMapping;
  label: string;
  required?: boolean;
  hints: string[];
}[] = [
  { key: "data", label: "Data", required: true, hints: ["data", "date"] },
  { key: "descricao", label: "Descrição", required: true, hints: ["descri", "histórico", "historico", "lançamento"] },
  { key: "valor", label: "Valor", required: true, hints: ["valor", "amount"] },
  { key: "tipo", label: "Tipo", required: true, hints: ["tipo", "type"] },
  { key: "conta", label: "Conta", hints: ["conta", "account"] },
  { key: "categoria", label: "Categoria", hints: ["categoria", "category"] },
  { key: "pago", label: "Pago", hints: ["pago", "paid"] },
];

function guessHeader(headers: string[], hints: string[]): string {
  return (
    headers.find((header) =>
      hints.some((hint) => header.toLowerCase().includes(hint)),
    ) ?? ""
  );
}

export function DataSettings({ latestImport }: DataSettingsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const month = currentMonth();
  const bounds = monthRange(month);
  const [de, setDe] = useState(bounds.start);
  const [ate, setAte] = useState(todayISO());

  const [fileName, setFileName] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CsvMapping>({
    data: "",
    descricao: "",
    valor: "",
    tipo: "",
    conta: "",
    categoria: "",
    pago: "",
  });
  const [ignoreDuplicates, setIgnoreDuplicates] = useState(true);
  const [createMissing, setCreateMissing] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonResult, setJsonResult] = useState<string | null>(null);
  const [jsonPending, startJsonTransition] = useTransition();

  const csvHref = useMemo(() => {
    if (!de || !ate || de > ate) return null;
    return `/api/export/transactions-range?de=${de}&ate=${ate}`;
  }, [de, ate]);

  async function handleFile(file: File | null) {
    setPreview(null);
    setResult(null);
    setError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Envie um arquivo .csv.");
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setError("Arquivo acima do limite de 5 MB.");
      return;
    }
    const text = await file.text();
    const sizeError = assertImportSize(text);
    if (sizeError) {
      setError(sizeError);
      return;
    }
    const table = parseCsv(text);
    if (table.headers.length === 0) {
      setError("CSV vazio ou sem cabeçalho.");
      return;
    }
    setFileName(file.name);
    setCsv(text);
    setHeaders(table.headers);
    setMapping({
      data: guessHeader(table.headers, ["data", "date"]),
      descricao: guessHeader(table.headers, ["descri", "histórico", "historico", "lançamento"]),
      valor: guessHeader(table.headers, ["valor", "amount"]),
      tipo: guessHeader(table.headers, ["tipo", "type"]),
      conta: guessHeader(table.headers, ["conta", "account"]),
      categoria: guessHeader(table.headers, ["categoria", "category"]),
      pago: guessHeader(table.headers, ["pago", "paid"]),
    });
  }

  function payload() {
    return {
      csv,
      mapping,
      options: { ignoreDuplicates, createMissing },
    };
  }

  function runPreview() {
    setError(null);
    setPreview(null);
    setResult(null);
    startTransition(async () => {
      const response = await previewImportAction(payload());
      setPreview(response);
      if (!response.ok) setError(response.error);
    });
  }

  function runImport() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const response = await importTransactionsAction(payload());
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(
        `${response.imported} lançamento(s) importado(s). ${response.skippedInvalid} inválido(s), ${response.skippedDuplicates} duplicado(s).`,
      );
      setPreview(null);
      toast({ description: "Importação concluída.", tone: "success" });
      router.refresh();
    });
  }

  function undoImport() {
    setError(null);
    startTransition(async () => {
      const response = await undoLastImportAction();
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setConfirmUndo(false);
      toast({
        description: `${response.count ?? 0} lançamento(s) da última importação removido(s).`,
        tone: "success",
      });
      router.refresh();
    });
  }

  const requiredReady =
    Boolean(csv) &&
    Boolean(mapping.data) &&
    Boolean(mapping.descricao) &&
    Boolean(mapping.valor) &&
    Boolean(mapping.tipo);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Dados</h1>
        <p className="text-xs text-muted-foreground">
          Exporte um backup completo, baixe lançamentos em CSV ou importe um
          arquivo de lançamentos.
        </p>
      </div>

      <FormError message={error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Exportar tudo (JSON)</CardTitle>
            <CardDescription>
              Contas, cartões, categorias, tags, lançamentos, recorrências,
              orçamentos e overrides. Sem senhas ou segredos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/api/export/json" download>
                <Download className="h-4 w-4" />
                Exportar JSON
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Exportar lançamentos (CSV)</CardTitle>
            <CardDescription>
              Separador `;`, vírgula decimal e UTF-8 com BOM para abrir no Excel
              brasileiro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">De</span>
                <DatePicker value={de} onChange={setDe} className="w-40" />
              </div>
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">Até</span>
                <DatePicker value={ate} onChange={setAte} className="w-40" />
              </div>
            </div>
            <Button asChild disabled={!csvHref}>
              {csvHref ? (
                <a href={csvHref} download>
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </a>
              ) : (
                <span>
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </span>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
            Restaurar backup (JSON)
          </CardTitle>
          <CardDescription>
            Recria contas, cartões, categorias, tags, lançamentos, recorrências e
            orçamentos dentro do seu workspace, remapeando os IDs. Útil para
            restaurar a conta de um único usuário.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="file"
            accept=".json,application/json"
            disabled={jsonPending}
            onChange={(event) => {
              setJsonFile(event.target.files?.[0] ?? null);
              setJsonError(null);
              setJsonResult(null);
            }}
            className="h-11 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs"
          />
          {jsonError && <FormError message={jsonError} />}
          {jsonResult && (
            <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
              {jsonResult}
            </p>
          )}
          <Button
            type="button"
            className="h-11"
            disabled={!jsonFile || jsonPending}
            onClick={() => {
              if (!jsonFile) return;
              startJsonTransition(async () => {
                const content = await jsonFile.text();
                const response = await importJsonAction({ json: content });
                if (!response.ok) {
                  setJsonError(response.error);
                  return;
                }
                const c = response.counts;
                setJsonResult(
                  `Backup restaurado: ${c.accounts} conta(s), ${c.creditCards} cartão(ões), ${c.categories} categoria(s), ${c.tags} tag(s), ${c.transactions} lançamento(s), ${c.recurrences} recorrência(s) e ${c.budgets} orçamento(s).`,
                );
                setJsonFile(null);
                router.refresh();
              });
            }}
          >
            {jsonPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Restaurar JSON
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" aria-hidden="true" />
            Importar lançamentos (CSV)
          </CardTitle>
          <CardDescription>
            Até {MAX_IMPORT_BYTES / (1024 * 1024)} MB. Datas em dd/MM/yyyy ou
            ISO e valores como 1.234,56. A importação roda em uma única
            transação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-file" className="text-xs text-muted-foreground">
              Arquivo CSV
            </Label>
            <Input
              id="import-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
              className="h-11 file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs"
            />
            {fileName && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                {fileName} · {headers.length} coluna(s)
              </p>
            )}
          </div>

          {headers.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {MAPPING_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    {field.label}
                    {field.required ? " *" : ""}
                  </Label>
                  <NativeSelect
                    value={mapping[field.key] ?? ""}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    aria-label={`Coluna de ${field.label}`}
                  >
                    <option value="">{field.required ? "Selecione" : "Nenhuma"}</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={ignoreDuplicates}
                onCheckedChange={(checked) =>
                  setIgnoreDuplicates(checked === true)
                }
              />
              Ignorar duplicados
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={createMissing}
                onCheckedChange={(checked) => setCreateMissing(checked === true)}
              />
              Criar contas/categorias inexistentes
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={runPreview}
              disabled={!requiredReady || isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Pré-visualizar
            </Button>
            <Button
              type="button"
              onClick={runImport}
              disabled={
                !requiredReady ||
                isPending ||
                !preview?.ok ||
                !preview.canImport
              }
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Importar
            </Button>
          </div>

          {result && (
            <p className="rounded-md border border-success/40 bg-success/10 p-2 text-sm text-success">
              {result}
            </p>
          )}

          {preview?.ok && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary">{preview.total} linha(s)</Badge>
                <Badge variant="success">{preview.valid} válida(s)</Badge>
                <Badge variant="warning">{preview.duplicates} duplicada(s)</Badge>
                <Badge variant="destructive">{preview.invalid} inválida(s)</Badge>
              </div>
              {preview.issues.length > 0 && (
                <div className="max-h-40 overflow-y-auto text-xs">
                  <p className="font-medium text-destructive">Linhas inválidas</p>
                  <ul className="mt-1 space-y-0.5">
                    {preview.issues.map((issue) => (
                      <li key={`invalid-${issue.line}`}>
                        Linha {issue.line}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.duplicateIssues.length > 0 && (
                <div className="max-h-32 overflow-y-auto text-xs text-warning">
                  <p className="font-medium">Duplicadas</p>
                  <ul className="mt-1 space-y-0.5">
                    {preview.duplicateIssues.map((issue) => (
                      <li key={`dup-${issue.line}`}>
                        Linha {issue.line}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Valores importados entram como lançamentos comuns (sem cartão). O
            campo Pago, se mapeado, é respeitado; sem ele, assume pago.
          </p>
        </CardContent>
      </Card>

      {latestImport && (
        <Card>
          <CardHeader>
            <CardTitle>Última importação</CardTitle>
            <CardDescription>
              {latestImport.count} lançamento(s) ·{" "}
              {formatDateTime(latestImport.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!confirmUndo ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmUndo(true)}
                disabled={isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Desfazer última importação
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Remover os lançamentos desta importação?
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-11 sm:h-9"
                  onClick={undoImport}
                  disabled={isPending}
                >
                  Confirmar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 sm:h-9"
                  onClick={() => setConfirmUndo(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Contas e categorias criadas pela importação são mantidas; apenas os
              lançamentos do lote são removidos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
