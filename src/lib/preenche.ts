// Pré-preenchimento: traz respostas da Ficha de Observação e da Entrevista com a Família
// para o Estudo de Caso, e a proposta da síntese para o Documento Unificado.
// Nunca sobrescreve o que já está preenchido; só completa o que está vazio.
import type { Respostas, ValorPergunta, ValorVerificacao } from "@/formularios/tipos";
import { acharFormulario } from "@/formularios";

const txt = (v: ValorPergunta | undefined) => (typeof v === "string" ? v.trim() : "");
const arr = (v: ValorPergunta | undefined) => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []);
const ver = (v: ValorPergunta | undefined) => (v && typeof v === "object" && !Array.isArray(v) ? (v as ValorVerificacao) : {});
const juntar = (...xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).join("\n");
const temLinha = (v: ValorVerificacao, re: RegExp, opcoes = /^(Sim|Parcial)$/) =>
  Object.entries(v).some(([linha, x]) => re.test(linha) && opcoes.test(x?.opcao ?? ""));
const vazio = (v: ValorPergunta | undefined) =>
  v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);

export interface Origem {
  campos: number;
  de: string[];
}

/** Estudo de Caso (v3) a partir da Ficha (v2+) e da Entrevista (v2+). */
export function preencherEstudoDeCaso(ficha: Respostas | null, entrevista: Respostas | null, atual: Respostas): { respostas: Respostas; origem: Origem } {
  const form = acharFormulario("estudo-de-caso")!;
  const op = (id: string, re: RegExp) => form.secoes.flatMap((s) => s.perguntas).find((p) => p.id === id)?.opcoes?.find((o) => re.test(o));
  const F = ficha ?? {}, E = entrevista ?? {};
  const r: Respostas = {};
  const de = new Set<string>();
  const marca = (id: string, ...ops: (string | undefined)[]) => {
    const lista = ops.filter((x): x is string => !!x);
    if (lista.length) { r[id] = [...new Set([...(r[id] as string[] | undefined) ?? [], ...lista])]; }
  };
  const vF = ver(F.verificacoes);
  const escala = (F.nivel_apoio && typeof F.nivel_apoio === "object" && !Array.isArray(F.nivel_apoio) ? (F.nivel_apoio as Record<string, string>) : {});
  const apoioForte = (re: RegExp) => Object.entries(escala).some(([l, v]) => re.test(l) && /permanente|frequente/i.test(v));

  if (ficha) de.add("Ficha de Observação");
  if (entrevista) de.add("Entrevista com a Família");

  // Etapa 1
  if (apoioForte(/Participa das atividades|Realiza as tarefas/)) marca("participacao", op("participacao", /^Exige mediação individual/));
  else if (temLinha(vF, /mediação para participar/)) marca("participacao", op("participacao", /^Precisa de apoio visual/));
  if (apoioForte(/Interage com os colegas|brincadeiras/)) marca("participacao", op("participacao", /^Prefere brincar sozinho/));
  r.participacao_obs = juntar(txt(F.relacao_colegas), txt(F.apoio_pares), txt(F.relacao_adultos), txt(E.relacoes));
  if (temLinha(vF, /recursos concretos, visuais/)) marca("desempenho", op("desempenho", /^Acompanha com suporte/));
  r.desempenho_obs = juntar(txt(F.ja_aprendeu) && "Já sabe: " + txt(F.ja_aprendeu), txt(F.prioridades) && "Precisa aprender: " + txt(F.prioridades));
  if (/prancha|comunicação alternativa|CAA/i.test(juntar(txt(F.facilitadores), arr(E.formas_comunicacao).join(" "), arr(E.recursos).join(" ")))) marca("registro", op("registro", /^Comunicação Alternativa/));
  if (/computador|tablet|digita/i.test(juntar(txt(F.facilitadores), txt(F.interesses), arr(E.recursos).join(" ")))) marca("registro", op("registro", /^Digitação/));
  if (/engrossa|lápis|tesoura adaptada/i.test(juntar(txt(F.facilitadores), arr(E.recursos).join(" ")))) marca("registro", op("registro", /^Uso de apoio físico/));
  r.registro_obs = juntar(txt(F.facilitadores));
  if (!temLinha(vF, /apoio para alimentar/)) marca("autonomia", op("autonomia", /^Alimentação autônoma/)); else marca("autonomia", op("autonomia", /^Precisa de auxílio na alimentação/));
  if (!temLinha(vF, /cuidados pessoais/)) marca("autonomia", op("autonomia", /^Higiene autônoma/)); else marca("autonomia", op("autonomia", /^Precisa de auxílio na higiene/));
  if (!temLinha(vF, /apoio para locomover/)) marca("autonomia", op("autonomia", /^Locomoção independente/));
  if (/medica|remédio/i.test(juntar(arr(E.cuidados).join(" "), txt(E.cuidados_detalhe)))) marca("autonomia", op("autonomia", /medicação/));
  if (txt(E.terapias) && !/sem acompanhamento|não faz/i.test(txt(E.terapias))) marca("autonomia", op("autonomia", /^Terapias externas/));
  r.autonomia_obs = juntar(txt(E.rotina_casa), txt(E.faz_sozinho) && "Faz sozinho: " + txt(E.faz_sozinho), txt(E.precisa_ajuda) && "Precisa de ajuda: " + txt(E.precisa_ajuda), txt(E.cuidados_detalhe), txt(E.terapias) && "Acompanhamentos: " + txt(E.terapias));

  // Etapa 2: barreiras da Ficha → barreiras do Estudo de Caso
  const bF = arr(F.barreiras);
  const mapa: [RegExp, RegExp, string][] = [
    [/^Comunicacionais/, /^Comunicação/, "b_comunicacao"],
    [/^Metodológicas/, /^Pedagógica/, "b_pedagogica"],
    [/^Tecnológicas/, /^Tecnológica/, "b_tecnologica"],
    [/^Atitudinais/, /^Atitudinal/, "b_atitudinal"],
    [/^Arquitetônicas/, /^Arquitetônica/, "b_arquitetonica"],
  ];
  for (const [reF, reC, campo] of mapa) {
    if (bF.some((b) => reF.test(b))) {
      marca("barreiras", op("barreiras", reC));
      r[campo] = juntar(txt(F.barreiras_descricao), txt(F.impede_participacao));
    }
  }
  if (txt(E.sintese_barreiras)) r.b_atitudinal = juntar(txt(r.b_atitudinal), "Família relata: " + txt(E.sintese_barreiras));

  // Etapa 3
  r.hiperfocos = juntar(txt(F.interesses), txt(E.interesses)).replace(/\n/g, "; ");
  r.habilidades = juntar(txt(F.pontos_fortes), txt(E.pontos_fortes)).replace(/\n/g, "; ");
  if (/profissional de apoio/i.test(juntar(txt(F.sintese_apoios), txt(E.apoios_essenciais)))) marca("apoio_humano", op("apoio_humano", /^Profissional de apoio/));
  if (arr(E.formas_comunicacao).some((x) => /Libras/.test(x))) marca("apoio_humano", op("apoio_humano", /Libras/));
  if (/prancha|CAA|comunicação alternativa/i.test(juntar(txt(F.sintese_apoios), arr(E.recursos).join(" "), arr(E.formas_comunicacao).join(" ")))) marca("apoio_comunicacao", op("apoio_comunicacao", /^Pictogramas/));
  if (/rotina visual|imagens|apoio visual|cartões/i.test(juntar(txt(F.facilitadores), txt(E.estrategias_anteriores)))) marca("apoio_comunicacao", op("apoio_comunicacao", /^Apoios visuais/), op("apoio_comunicacao", /^Cartões de rotina/));
  if (/engrossa|lápis/i.test(juntar(txt(F.facilitadores), arr(E.recursos).join(" ")))) marca("apoio_material", op("apoio_material", /^Adaptadores de escrita/));
  if (/tesoura/i.test(juntar(txt(F.facilitadores), arr(E.recursos).join(" ")))) marca("apoio_material", op("apoio_material", /^Tesouras/));
  if (/fonte ampliada|letras grandes|ampliad/i.test(juntar(txt(F.facilitadores), txt(F.sintese_apoios)))) marca("apoio_material", op("apoio_material", /^Fontes ampliadas/));
  if (/pausa/i.test(juntar(txt(F.facilitadores), txt(E.estrategias_anteriores)))) marca("apoio_tempo", op("apoio_tempo", /^Pausas programadas/));
  if (/barulho|ruído|sensorial/i.test(juntar(txt(F.impede_participacao), txt(E.sintese_barreiras)))) marca("apoio_tempo", op("apoio_tempo", /^Canto de autorregulação/));

  // Validação: encaminhamentos marcados na Ficha e na Entrevista
  marca("encaminhamentos_tipos", ...arr(F.encaminhamentos), ...arr(E.encaminhamentos));
  r.encaminhamentos = juntar(txt(F.proximas_acoes), txt(E.proximas_acoes));

  return aplicar(r, atual, [...de]);
}

/** Documento Unificado (v1) a partir dos campos propostos pela síntese. */
export function preencherDocumentoUnificado(campos: Record<string, unknown>, atual: Respostas, sinteseId: string): { respostas: Respostas; origem: Origem } {
  const r: Respostas = {};
  for (const [k, v] of Object.entries(campos)) r[k] = v as ValorPergunta;
  const out = aplicar(r, atual, ["Síntese do sistema"]);
  out.respostas._origem = `sintese:${sinteseId}`;
  return out;
}

function aplicar(novo: Respostas, atual: Respostas, de: string[]) {
  const respostas: Respostas = { ...atual };
  let campos = 0;
  for (const [k, v] of Object.entries(novo)) {
    if (vazio(v) || !vazio(atual[k])) continue;
    respostas[k] = v;
    campos++;
  }
  return { respostas, origem: { campos, de } };
}
