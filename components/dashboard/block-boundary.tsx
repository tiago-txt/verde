"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

type BlockBoundaryProps = {
  children: ReactNode;
  label?: string;
};

type BlockBoundaryState = { hasError: boolean };

export class BlockBoundary extends Component<
  BlockBoundaryProps,
  BlockBoundaryState
> {
  state: BlockBoundaryState = { hasError: false };

  static getDerivedStateFromError(): BlockBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-4 text-center">
          <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
          <p className="text-sm font-medium">
            Não foi possível carregar {this.props.label ?? "este bloco"}.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
