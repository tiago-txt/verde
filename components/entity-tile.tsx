import { Tile } from "@/components/tile";
import type { TileSize } from "@/lib/design/tile-types";
import {
  tileSpec,
  type TileEntity,
  type TileEntityKind,
} from "@/lib/design/tile-spec";
import { cn } from "@/lib/utils";

export function EntityTile({
  kind,
  entity,
  size = "md",
  dashed = false,
  className,
  iconClassName,
}: {
  kind: TileEntityKind;
  entity?: TileEntity;
  size?: TileSize;
  dashed?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const spec = tileSpec(kind, entity);
  return (
    <Tile
      icon={spec.icon}
      bank={spec.bank}
      motif={spec.motif}
      variant={spec.variant}
      color={spec.color}
      size={size}
      dashed={dashed}
      className={cn(className)}
      iconClassName={iconClassName}
    />
  );
}
