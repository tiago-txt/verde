import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { getIcon } from "@/lib/icons";
import { tileMotif } from "@/lib/design/tile-motif";
import type { TileVariant } from "@/lib/design/tile-types";
import {
  findBankIcon,
  type BankIconDefinition,
} from "@/lib/finance/bank-icons";

export type TileEntityKind =
  | "categoria"
  | "conta"
  | "cartao"
  | "orcamento"
  | "transferencia"
  | "fatura"
  | "tipo";

export type TileEntity = {
  id?: string | null;
  nome?: string | null;
  cor?: string | null;
  icone?: string | null;
  tipo?: "despesa" | "receita" | "transferencia" | null;
};

export type TileSpec = {
  color: string;
  icon: LucideIcon;
  bank?: BankIconDefinition | null;
  motif: number;
  variant: TileVariant;
  seed: string;
};

const AMBER = "hsl(var(--amber))";
const PRIMARY = "hsl(var(--primary))";
const INFO = "hsl(var(--info))";
const CLAY = "hsl(var(--clay))";

function seedFor(kind: TileEntityKind, entity: TileEntity): string {
  return (
    entity.id ??
    entity.nome ??
    entity.icone ??
    kind
  );
}

/**
 * Fonte única de verdade visual para pastilhas. Nenhuma tela escolhe cor,
 * ícone ou motivo por conta própria.
 */
export function tileSpec(
  kind: TileEntityKind,
  entity: TileEntity = {},
): TileSpec {
  switch (kind) {
    case "conta": {
      const bank = findBankIcon(entity.icone);
      const storedIcon = entity.icone?.startsWith("bank:") ? null : entity.icone;
      return {
        color: entity.cor || bank?.brandColor || PRIMARY,
        icon: getIcon(storedIcon || "Wallet"),
        bank,
        motif: tileMotif(seedFor(kind, entity)),
        variant: "gold",
        seed: seedFor(kind, entity),
      };
    }
    case "cartao": {
      const bank = findBankIcon(entity.icone);
      const storedIcon = entity.icone?.startsWith("bank:") ? null : entity.icone;
      return {
        color: entity.cor || bank?.brandColor || INFO,
        icon: getIcon(storedIcon || "CreditCard"),
        bank,
        motif: 7,
        variant: "band",
        seed: seedFor(kind, entity),
      };
    }
    case "orcamento":
      return {
        color: entity.cor || AMBER,
        icon: getIcon(entity.icone || "Target"),
        motif: 3,
        variant: "target",
        seed: seedFor(kind, entity),
      };
    case "transferencia":
      return {
        color: entity.cor ?? INFO,
        icon: ArrowLeftRight,
        motif: 2,
        variant: "star",
        seed: seedFor(kind, entity),
      };
    case "fatura":
      return {
        color: entity.cor ?? INFO,
        icon: getIcon("CreditCard"),
        motif: 7,
        variant: "band",
        seed: seedFor(kind, entity),
      };
    case "tipo":
      if (entity.tipo === "receita") {
        return {
          color: PRIMARY,
          icon: ArrowUpRight,
          motif: tileMotif("receita"),
          variant: "neutral",
          seed: "receita",
        };
      }
      if (entity.tipo === "transferencia") {
        return {
          color: INFO,
          icon: ArrowLeftRight,
          motif: 2,
          variant: "star",
          seed: "transferencia",
        };
      }
      return {
        color: CLAY,
        icon: ArrowDownLeft,
        motif: tileMotif("despesa"),
        variant: "neutral",
        seed: "despesa",
      };
    case "categoria":
    default:
      return {
        color: entity.cor || PRIMARY,
        icon: getIcon(entity.icone || "Circle"),
        motif: tileMotif(seedFor(kind, entity)),
        variant: "neutral",
        seed: seedFor(kind, entity),
      };
  }
}

