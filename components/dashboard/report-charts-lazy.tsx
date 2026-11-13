"use client";

import dynamic from "next/dynamic";

const chartFallback = (
  <div className="h-[220px] animate-pulse rounded-xl bg-muted/30" />
);

export const CategoryDonut = dynamic(
  () =>
    import("./report-charts").then((module) => module.CategoryDonut),
  { ssr: false, loading: () => chartFallback },
);

export const EvolutionChart = dynamic(
  () =>
    import("./report-charts").then((module) => module.EvolutionChart),
  { ssr: false, loading: () => chartFallback },
);
