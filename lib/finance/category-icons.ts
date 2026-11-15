import type { IconName } from "@/lib/icon-names";
import { normalizeEntityName } from "./spreadsheet-import";

type CategoryIconRule = {
  icon: IconName;
  terms: string[];
};

/**
 * Regras semânticas para sugerir um ícone a partir do nome da categoria.
 * A ordem importa: termos mais específicos vêm primeiro.
 */
const CATEGORY_ICON_RULES: CategoryIconRule[] = [
  { icon: "Utensils", terms: ["alimentacao", "restaurante", "bares", "bar", "lanche", "pizza", "ifood", "padaria", "coffee", "cafe"] },
  { icon: "ShoppingCart", terms: ["mercado", "supermercado", "compras", "hortifruti", "mercearia"] },
  { icon: "Fuel", terms: ["combustivel", "gasolina", "etanol", "posto"] },
  { icon: "Car", terms: ["transporte", "veiculo", "veiculos", "carro", "uber", "taxi", "estacionamento", "pedagio"] },
  { icon: "Bus", terms: ["onibus", "metro", "metropolitano", "transporte publico"] },
  { icon: "House", terms: ["moradia", "casa", "condominio", "aluguel"] },
  { icon: "KeyRound", terms: ["aluguel", "chave"] },
  { icon: "Building2", terms: ["predio", "empresa", "condominio"] },
  { icon: "Zap", terms: ["energia", "luz", "eletricidade"] },
  { icon: "Droplets", terms: ["agua", "saneamento"] },
  { icon: "Wifi", terms: ["internet", "banda larga", "telefone", "celular", "movel"] },
  { icon: "Flame", terms: ["gas"] },
  { icon: "Pill", terms: ["farmacia", "remedio", "medicamento"] },
  { icon: "Stethoscope", terms: ["consulta", "medico", "dentista", "exame"] },
  { icon: "HeartPulse", terms: ["saude", "cuidados pessoais", "bem estar"] },
  { icon: "Dumbbell", terms: ["academia", "esporte", "fitness"] },
  { icon: "GraduationCap", terms: ["educacao", "escola", "faculdade", "curso", "mensalidade escolar"] },
  { icon: "BookOpen", terms: ["livro", "livros", "material escolar"] },
  { icon: "Gamepad2", terms: ["lazer", "jogos", "games", "hobbies", "hobby"] },
  { icon: "Music", terms: ["musica", "spotify", "deezer"] },
  { icon: "Tv", terms: ["assinaturas", "assinatura", "streaming", "netflix", "youtube", "disney", "prime video", "tv"] },
  { icon: "Plane", terms: ["viagem", "passagem", "hotel", "turismo"] },
  { icon: "Gift", terms: ["presente", "presentes", "doacao", "doacoes"] },
  { icon: "PawPrint", terms: ["pet", "pets", "veterinario", "racao"] },
  { icon: "Baby", terms: ["bebe", "bebes", "crianca", "infantil", "fralda"] },
  { icon: "Shirt", terms: ["roupa", "roupas", "vestuario", "moda", "calcado"] },
  { icon: "Smartphone", terms: ["eletronico", "eletronicos", "smartphone", "software", "app"] },
  { icon: "Wallet", terms: ["salario", "proventos", "pagamento"] },
  { icon: "Briefcase", terms: ["trabalho", "freelance", "freela", "pro labore"] },
  { icon: "TrendingUp", terms: ["investimento", "investimentos", "rendimento", "rendimentos", "dividendo", "dividendos"] },
  { icon: "PiggyBank", terms: ["poupanca", "reserva", "economia"] },
  { icon: "Receipt", terms: ["imposto", "impostos", "taxa", "taxas", "tarifa", "tarifas", "juros", "multa"] },
  { icon: "HandCoins", terms: ["emprestimo", "emprestimos", "financiamento"] },
  { icon: "Target", terms: ["meta", "metas", "objetivo"] },
  { icon: "Banknote", terms: ["dinheiro", "saque", "deposito"] },
  { icon: "CreditCard", terms: ["cartao", "fatura"] },
  { icon: "Landmark", terms: ["banco", "bancos", "tarifa bancaria"] },
];

function matchesTerm(value: string, term: string): boolean {
  const normalized = normalizeEntityName(term);
  if (!normalized) return false;
  // Termos curtos (nu, c6, tv, gas...) exigem token exato para não casar
  // com qualquer palavra que os contenha.
  if (normalized.length <= 3) {
    return value.split(/[^a-z0-9]+/).filter(Boolean).includes(normalized);
  }
  return value.includes(normalized);
}

/** Sugere um ícone semântico para uma categoria criada pela importação. */
export function suggestCategoryIcon(
  name: string,
  tipo: "despesa" | "receita",
): IconName {
  const value = normalizeEntityName(name);
  if (value) {
    for (const rule of CATEGORY_ICON_RULES) {
      if (rule.terms.some((term) => matchesTerm(value, term))) {
        return rule.icon;
      }
    }
  }
  return tipo === "receita" ? "CirclePlus" : "CircleEllipsis";
}
