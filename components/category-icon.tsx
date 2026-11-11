import { getIcon } from "@/lib/icons";
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
    <span
      className={cn(
        "tile grid h-10 w-10 shrink-0 place-items-center rounded-xl",
        className,
      )}
      style={{
        backgroundColor: color ? `${color}1f` : undefined,
        color: color ?? undefined,
      }}
      aria-hidden="true"
    >
      <Icon className={cn("h-5 w-5", iconClassName)} />
    </span>
  );
}
