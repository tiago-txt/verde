/**
 * Fontes arquivadas não são oferecidas para novos lançamentos, mas a fonte já
 * selecionada permanece visível ao editar um lançamento antigo.
 */
export function isSourceVisible(
  arquivado: boolean,
  optionValue: string,
  selectedValue: string,
): boolean {
  return !arquivado || optionValue === selectedValue;
}
