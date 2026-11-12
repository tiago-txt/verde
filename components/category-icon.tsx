import { getIcon } from "@/lib/icons";
import { Tile } from "@/components/tile";
import { cn } from "@/lib/utils";

type CategoryIconProps = {
  icon: string | null | undefined;
  color?: string | null;
  className?: string;
  iconClassName?: string;
};

export function CategoryIcon({
  icon,
  color,
  className,
  iconClassName,
}: CategoryIconProps) {
  const Icon = getIcon(icon);

  return (
    <Tile
      icon={Icon}
      seed={`${icon ?? "outros"}:${color ?? ""}`}
      color={color}
      className={cn(className)}
      iconClassName={iconClassName}
    />
  );
}
