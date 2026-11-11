import type { CategoryType } from "@/lib/db/schema";

export type SeedCategory = {
  nome: string;
  tipo: CategoryType;
  icone: string;
  cor: string;
  isSystem?: boolean;
  filhos?: Array<
    Pick<SeedCategory, "nome" | "icone" | "cor" | "isSystem">
  >;
};

/**
 * Categorias padrão em pt-BR. Semeadas apenas quando a tabela está vazia,
 * então edições do usuário nunca são sobrescritas.
 */
export const DEFAULT_CATEGORIES: SeedCategory[] = [
  {
    nome: "Moradia",
    tipo: "despesa",
    icone: "House",
    cor: "#f97316",
    filhos: [
      { nome: "Aluguel", icone: "KeyRound", cor: "#f97316" },
      { nome: "Condomínio", icone: "Building2", cor: "#fb923c" },
      { nome: "Energia", icone: "Zap", cor: "#facc15" },
      { nome: "Água", icone: "Droplets", cor: "#38bdf8" },
      { nome: "Internet", icone: "Wifi", cor: "#818cf8" },
      { nome: "Gás", icone: "Flame", cor: "#ef4444" },
    ],
  },
  { nome: "Mercado", tipo: "despesa", icone: "ShoppingCart", cor: "#84cc16" },
  {
    nome: "Transporte",
    tipo: "despesa",
    icone: "Car",
    cor: "#38bdf8",
    filhos: [
      { nome: "Combustível", icone: "Fuel", cor: "#38bdf8" },
      { nome: "Transporte público", icone: "Bus", cor: "#0ea5e9" },
      { nome: "Manutenção", icone: "Wrench", cor: "#64748b" },
    ],
  },
  {
    nome: "Saúde",
    tipo: "despesa",
    icone: "HeartPulse",
    cor: "#f43f5e",
    filhos: [
      { nome: "Farmácia", icone: "Pill", cor: "#f43f5e" },
      { nome: "Consultas", icone: "Stethoscope", cor: "#fb7185" },
    ],
  },
  { nome: "Educação", tipo: "despesa", icone: "GraduationCap", cor: "#a78bfa" },
  { nome: "Lazer", tipo: "despesa", icone: "Gamepad2", cor: "#eab308" },
  { nome: "Vestuário", tipo: "despesa", icone: "Shirt", cor: "#ec4899" },
  { nome: "Assinaturas", tipo: "despesa", icone: "Tv", cor: "#8b5cf6" },
  { nome: "Investimentos", tipo: "despesa", icone: "TrendingUp", cor: "#10b981" },
  {
    nome: "Outros",
    tipo: "despesa",
    icone: "CircleEllipsis",
    cor: "#94a3b8",
    isSystem: true,
  },
  { nome: "Salário", tipo: "receita", icone: "Wallet", cor: "#22c55e" },
  { nome: "Freelance", tipo: "receita", icone: "Briefcase", cor: "#14b8a6" },
  { nome: "Rendimentos", tipo: "receita", icone: "PiggyBank", cor: "#0ea5e9" },
  {
    nome: "Outros",
    tipo: "receita",
    icone: "CirclePlus",
    cor: "#94a3b8",
    isSystem: true,
  },
];

/** Tags iniciais (opcional, útil para começar). */
export const DEFAULT_TAGS = ["Fixo", "Variável", "Trabalho", "Família"];
