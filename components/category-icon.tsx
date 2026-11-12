import { EntityTile } from "@/components/entity-tile";
import { cn } from "@/lib/utils";

type CategoryIconProps = {
  id?: string | null;
  icon: string | null | undefined;
  color?: string | null;
  className?: string;
  iconClassName?: string;
};

export function CategoryIcon({
  id,
  icon,
  color,
  className,
  iconClassName,
}: CategoryIconProps) {
  return (
    <EntityTile
      kind="categoria"
      entity={{ id, icone: icon, cor: color }}
      className={cn(className)}
      iconClassName={iconClassName}
    />
  );
}
