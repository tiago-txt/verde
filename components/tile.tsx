import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TileSize, TileVariant } from "@/lib/design/tile-types";

const MOTIFS = [
  // 0 — círculo com quatro pontos
  <>
    <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <circle cx="7" cy="7" r="2" fill="currentColor" />
    <circle cx="33" cy="7" r="2" fill="currentColor" />
    <circle cx="7" cy="33" r="2" fill="currentColor" />
    <circle cx="33" cy="33" r="2" fill="currentColor" />
  </>,
  // 1 — cruz com anel
  <>
    <path d="M20 3v34M3 20h34" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="20" cy="20" r="8" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="20" cy="20" r="2.5" fill="currentColor" />
  </>,
  // 2 — estrela de 8 pontas (transferência)
  <>
    <polygon
      points="20,1 24,15 38,9 32,23 39,35 25,32 20,39 15,32 1,35 8,23 2,9 16,15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <circle cx="20" cy="20" r="4" fill="currentColor" />
  </>,
  // 3 — alvo concêntrico (orçamento)
  <>
    <circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="20" cy="20" r="9" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="20" cy="20" r="3" fill="currentColor" />
  </>,
  // 4 — losango + quadrado rotacionado
  <>
    <path d="M20 2 38 20 20 38 2 20Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="14" y="14" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2" transform="rotate(45 20 20)" />
    <circle cx="20" cy="20" r="2" fill="currentColor" />
  </>,
  // 5 — trevo de quatro pétalas
  <>
    <path d="M20 20C8 18 8 6 20 4c12 2 12 14 0 16Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M20 20c2 12 14 12 16 0-2-12-14-12-16 0Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M20 20c-12 2-12 14 0 16 12-2 12-14 0-16Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <path d="M20 20c-2-12-14-12-16 0 2 12 14 12 16 0Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
  </>,
  // 6 — raios de canto + quadrado
  <>
    <path d="M2 2 14 14M38 2 26 14M38 38 26 26M2 38 14 26" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <rect x="12" y="12" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" transform="rotate(45 20 20)" />
    <circle cx="20" cy="20" r="3" fill="currentColor" />
  </>,
  // 7 — faixa de azulejo (fatura/cartão)
  <>
    <path d="M4 10h32M4 20h32M4 30h32" fill="none" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="10" cy="10" r="2" fill="currentColor" />
    <circle cx="30" cy="10" r="2" fill="currentColor" />
    <circle cx="10" cy="30" r="2" fill="currentColor" />
    <circle cx="30" cy="30" r="2" fill="currentColor" />
    <rect x="15" y="15" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.2" transform="rotate(45 20 20)" />
  </>,
];

const DIMENSIONS: Record<TileSize, { box: string; icon: string }> = {
  xs: { box: "h-8 w-8", icon: "h-3.5 w-3.5" },
  sm: { box: "h-10 w-10", icon: "h-4 w-4" },
  md: { box: "h-12 w-12", icon: "h-5 w-5" },
  lg: { box: "h-14 w-14", icon: "h-6 w-6" },
};

/**
 * Pastilha cerâmica. Import interno: use `EntityTile`/`tileSpec` para escolher
 * cor, ícone, motivo e variação por entidade.
 */
export function Tile({
  icon: Icon,
  motif,
  variant = "neutral",
  color,
  size = "md",
  dashed = false,
  className,
  iconClassName,
}: {
  icon: LucideIcon;
  motif: number;
  variant?: TileVariant;
  color?: string | null;
  size?: TileSize;
  dashed?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const dimension = DIMENSIONS[size];
  return (
    <span
      className={cn(
        "tile tile-entity relative grid shrink-0 place-items-center overflow-hidden rounded-[12px] border border-grout",
        dimension.box,
        variant === "gold" && "ring-1 ring-amber/45",
        variant === "band" && "border-info/35",
        variant === "target" && "border-amber/25",
        dashed && "border-dashed opacity-75",
        className,
      )}
      style={{ color: color ?? undefined }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 40"
        className="tile-emblem pointer-events-none absolute inset-0 h-full w-full"
        fill="none"
      >
        {MOTIFS[motif % MOTIFS.length]}
      </svg>
      <Icon className={cn("tile-icon relative z-10", dimension.icon, iconClassName)} />
    </span>
  );
}
