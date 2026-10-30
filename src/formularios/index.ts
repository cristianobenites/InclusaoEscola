import type { Formulario } from "./tipos";
import fichaV1 from "./ficha-observacao.v1.json";
import fichaV2 from "./ficha-observacao.v2.json";
import entrevistaV1 from "./entrevista-familia.v1.json";
import entrevistaV2 from "./entrevista-familia.v2.json";
import estudoV1 from "./estudo-de-caso.v1.json";
import unificadoV1 from "./documento-unificado.v1.json";

// Todas as versões ficam disponíveis (respostas antigas abrem na versão em que foram feitas);
// a lista de preenchimento usa sempre a versão mais nova de cada formulário.
export const TODAS_VERSOES: Formulario[] = [
  fichaV1, fichaV2, entrevistaV1, entrevistaV2, estudoV1, unificadoV1,
] as Formulario[];

const ORDEM = ["ficha-observacao", "entrevista-familia", "estudo-de-caso", "documento-unificado"];

export const FORMULARIOS: Formulario[] = ORDEM.map((id) => acharFormulario(id)!).filter(Boolean);

export function acharFormulario(id: string, versao?: number): Formulario | undefined {
  const doId = TODAS_VERSOES.filter((f) => f.id === id);
  if (versao != null) return doId.find((f) => f.versao === versao);
  return [...doId].sort((a, b) => b.versao - a.versao)[0];
}
