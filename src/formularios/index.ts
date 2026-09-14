import type { Formulario } from "./tipos";
import ficha from "./ficha-observacao.v1.json";
import entrevista from "./entrevista-familia.v1.json";

export const FORMULARIOS: Formulario[] = [ficha as Formulario, entrevista as Formulario];

export function acharFormulario(id: string, versao?: number): Formulario | undefined {
  const doId = FORMULARIOS.filter((f) => f.id === id);
  if (versao != null) return doId.find((f) => f.versao === versao);
  return [...doId].sort((a, b) => b.versao - a.versao)[0];
}
