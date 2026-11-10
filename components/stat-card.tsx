import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "positive" | "negative" | "warning" | "info";

const toneStyles: Record<Tone, { icon: string; value: string }> = {
  neutral: { icon: "bg-muted text-muted-foreground", value: "text-foreground" },
  positive: { icon: "bg-success/15 text-success", value: "text-success" },
  negative: { icon: "bg-destructive/15 text-destructive", value: "text-destructive" },
  warning: { icon: "bg-warning/15 text-warning", value: "text-warning" },
  info: { icon: "bg-primary/15 text-primary", value: "text-foreground" },
};

type StatCardProps = {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
  className?: string;
};

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  className,
}: StatCardProps) {
  const styles = toneStyles[tone];

  return (
    <Card className={className}>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn("tabular truncate text-2xl font-semibold tracking-tight", styles.value)}>
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
            styles.icon,
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}
