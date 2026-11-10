import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

type PlaceholderPageProps = {
  title: string;
  description: string;
  stage: string;
  icon: LucideIcon;
  items: string[];
};

export function PlaceholderPage({
  title,
  description,
  stage,
  icon: Icon,
  items,
}: PlaceholderPageProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <Card>
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="space-y-4">
            <Badge variant="secondary">{stage}</Badge>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              A base de dados, autenticação e navegação já estão funcionando.
              Esta tela será preenchida nas próximas etapas.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
