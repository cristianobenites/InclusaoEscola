// Preparação da reunião do Estudo de Caso: a partir da Ficha de Observação e da Entrevista com a
// Família concluídas, devolve (1) insights para a equipe conversar e (2) sugestões campo a campo
// para o formulário do Estudo de Caso. Nada é gravado no formulário: a equipe decide o que usar.
// Sem IA (ou com o Google fora do ar): as sugestões são a base por regras enviada pelo app e os
// insights são montados a partir dos próprios campos.
import { anonimizador, chaveGemini, gerarTexto } from "../_shared/gemini.ts";

type Dados = Record<string, unknown>;
type Fonte = { titulo: string; pagina: number | null };
type Just = { porque: string; fonte?: Fonte };
type Trecho = { trecho_id: number; grupo: string; titulo: string; pagina: number | null; texto: string; relevancia: number };
type Coluna = { id: string; rotulo: string; tipo: string; opcoes?: string[] };
type Pergunta = { id: string; rotulo: string; tipo: string; opcoes?: string[]; permite_outro?: boolean; colunas?: Coluna[]; ajuda?: string };
type Esquema = { titulo: string; versao: number; secoes: { id: string; titulo: string; perguntas: Pergunta[] }[] };
export type Insights = {
  resumo: string;
  potencialidades: string[];
  barreiras: string[];
  divergencias: string[];
  perguntas: string[];
  cuidados: string[];
};

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown) => (Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : []);
const frases = (s: string) => s.split(/[\n;]+/).map((x) => x.trim()).filter((x) => x.length > 3);

// deno-lint-ignore no-explicit-any
export async function sugerirEstudoDeCaso(sb: any, quemId: string, corpo: { estudante_id: string; base?: Dados }) {
  const estudante_id = corpo.estudante_id;
  const { data: resps, error } = await sb.from("respostas").select("*").eq("estudante_id", estudante_id).eq("status", "concluido").order("atualizado_em", { ascending: false });
  if (error) return { erro: error.message };
  const ultima = (id: string) => (resps ?? []).find((r: { formulario_id: string }) => r.formulario_id === id);
  const ficha = ultima("ficha-observacao"), entrevista = ultima("entrevista-familia");
  if (!ficha && !entrevista) return { erro: "Conclua a Ficha de Observação ou a Entrevista com a Família para gerar as sugestões." };

  const { data: ident } = await sb.from("estudantes_identidade").select("nome").eq("estudante_id", estudante_id).maybeSingle();
  const anon = anonimizador(ident?.nome ?? null);
  const F = ficha ? (anon.fundo(ficha.dados) as Dados) : {};
  const E = entrevista ? (anon.fundo(entrevista.dados) as Dados) : {};

  const { data: forms } = await sb.from("formularios").select("versao, esquema").eq("id", "estudo-de-caso").order("versao", { ascending: false }).limit(1);
  const esquema = forms?.[0]?.esquema as Esquema | undefined;
  if (!esquema) return { erro: "formulário do Estudo de Caso não encontrado" };
  const perguntas = esquema.secoes.flatMap((s) => s.perguntas).filter((p) => p.tipo !== "data" && p.id !== "profissional" && p.id !== "checklist");

  // base por regras (calculada no app com o mesmo mapeamento do botão antigo "Trazer respostas")
  const base = validar(anon.fundo(corpo.base ?? {}) as Dados, perguntas);
  const justBase: Record<string, Just> = {};
  for (const id of Object.keys(base)) justBase[id] = { porque: "Trazido das respostas da Ficha de Observação e da Entrevista com a Família.", fonte: { titulo: "Guia do Instituto: Estudo de Caso", pagina: null } };

  // trechos da base de conhecimento para os temas do caso
  const temas = [
    "estudo de caso etapas identificação das barreiras análise do contexto escolar",
    txt(F.barreiras_descricao).slice(0, 220),
    txt(F.impede_participacao).slice(0, 220),
    txt(F.prioridades).slice(0, 220),
    txt(E.precisa_ajuda).slice(0, 220),
    arr(F.barreiras).join(" ").slice(0, 220),
  ].filter((t) => t.length >= 12);
  const mapa = new Map<number, Trecho>();
  for (const t of temas) {
    const { data } = await sb.rpc("busca_conhecimento", { p_consulta: t, p_limite: 3, p_grupos: ["regra", "curso", "caderno", "modelo"] });
    for (const x of (data ?? []) as Trecho[]) if (!mapa.has(x.trecho_id)) mapa.set(x.trecho_id, x);
  }
  const trechos = [...mapa.values()].sort((a, b) => b.relevancia - a.relevancia).slice(0, 10);

  let modo = "regras", modelo: string | null = null, aviso: string | null = null, tentativas: string[] = [];
  let campos = base, justificativas = justBase;
  let insights = insightsPorRegras(F, E, !!ficha, !!entrevista);

  const chave = await chaveGemini();
  if (chave) {
    try {
      const { data: regrasTxt } = await sb.rpc("regras_do_instituto");
      const r = await comGemini(chave, esquema, perguntas, { F, E }, base, regrasTxt ?? "", trechos);
      modelo = r.modelo; tentativas = r.tentativas;
      if (r.ok) {
        modo = "ia";
        campos = { ...base, ...validar(r.campos, perguntas) };
        justificativas = { ...justBase, ...r.justificativas };
        insights = r.insights;
      } else aviso = "A IA respondeu em um formato que não deu para ler; estas sugestões vieram direto das respostas da Ficha e da Entrevista.";
    } catch (e) {
      aviso = "A IA estava indisponível neste momento (" + (e as Error).message.slice(0, 140) + "). Estas sugestões vieram direto das respostas da Ficha e da Entrevista; gere de novo mais tarde.";
    }
  }

  const saida = {
    insights, aviso, campos, justificativas,
    base: { ficha: ficha?.id ?? null, entrevista: entrevista?.id ?? null },
    trechos: trechos.map((t) => ({ grupo: t.grupo, titulo: t.titulo, pagina: t.pagina, texto: t.texto })),
  };
  const { data: salvo, error: e2 } = await sb.from("sinteses_ia").insert({
    estudante_id, tipo: "estudo-de-caso", respostas_ids: [ficha?.id, entrevista?.id].filter(Boolean),
    modelo: modelo ?? "regras-v1", prompt_versao: modo, saida, criado_por: quemId,
  }).select("id, criado_em").single();
  if (e2) return { erro: e2.message };
  await sb.from("auditoria").insert({ quem: quemId, acao: "estudo.sugeriu", alvo: "estudantes:" + estudante_id, detalhe: { modo, modelo, campos: Object.keys(campos).length, tentativas } });
  return { id: salvo.id, criado_em: salvo.criado_em, modo, modelo, saida };
}

// Mantém só valores válidos para o formulário (opções exatas, "Outro: ..." quando permitido, linhas de tabela).
function validar(d: Dados, perguntas: Pergunta[]): Dados {
  const out: Dados = {};
  for (const p of perguntas) {
    const v = d[p.id];
    if (v == null || v === "") continue;
    if (p.tipo === "texto" || p.tipo === "texto_longo") {
      if (typeof v === "string" && v.trim()) out[p.id] = v.trim();
      else if (Array.isArray(v) && v.length) out[p.id] = arr(v).join("; ");
    } else if (p.tipo === "escolha_multipla") {
      const ok = arr(v).filter((x) => p.opcoes?.includes(x) || (p.permite_outro && x.startsWith("Outro: ") && x.length > 8));
      if (ok.length) out[p.id] = [...new Set(ok)];
    } else if (p.tipo === "escolha_unica") {
      if (typeof v === "string" && p.opcoes?.includes(v)) out[p.id] = v;
    } else if (p.tipo === "tabela" && Array.isArray(v)) {
      const cols = p.colunas ?? [];
      const linhas = v
        .filter((l) => l && typeof l === "object")
        .map((l) => {
          const o: Record<string, string> = {};
          for (const c of cols) {
            const x = (l as Record<string, unknown>)[c.id];
            if (typeof x !== "string" || !x.trim()) continue;
            if (c.tipo === "escolha" && !c.opcoes?.includes(x)) continue;
            if (c.tipo === "data" && !/^\d{4}-\d{2}-\d{2}$/.test(x)) continue;
            o[c.id] = x.trim();
          }
          return o;
        })
        .filter((l) => Object.keys(l).length > 0)
        .slice(0, 12);
      if (linhas.length) out[p.id] = linhas;
    }
  }
  return out;
}

function insightsPorRegras(F: Dados, E: Dados, temFicha: boolean, temEntrevista: boolean): Insights {
  const potencialidades = [...frases(txt(F.pontos_fortes)), ...frases(txt(E.pontos_fortes)), ...frases(txt(F.interesses)).map((x) => "Interesse: " + x)].slice(0, 6);
  const barreiras = [...arr(F.barreiras), ...frases(txt(F.barreiras_descricao)), ...frases(txt(E.sintese_barreiras)).map((x) => "Família relata: " + x)].slice(0, 6);
  const perguntas = [
    "O que, no contexto da escola, impede a participação do estudante? (olhar para a aula, o espaço, a comunicação e as atitudes, não para o estudante)",
    "Qual interesse ou ponto forte dele vamos usar como porta de entrada nas atividades?",
    "Que apoios são obrigatórios para ele participar das aulas, e quem garante cada um?",
    "Quem faz o quê, e até quando? Como vamos saber em 30, 60 e 90 dias se funcionou?",
  ];
  if (!temFicha) perguntas.unshift("A Ficha de Observação ainda não foi concluída: o que cada professor observa no dia a dia do estudante?");
  if (!temEntrevista) perguntas.unshift("A Entrevista com a Família ainda não foi concluída: o que a escola já sabe da rotina em casa e do que a família espera?");
  if (temFicha && !txt(F.barreiras_descricao)) perguntas.push("A Ficha não descreveu as barreiras: em que momento da rotina elas aparecem?");
  const cuidados = [...frases(txt(E.cuidados_detalhe)), ...arr(E.cuidados)].slice(0, 4);
  return {
    resumo: "Roteiro montado a partir do que foi registrado na Ficha de Observação e na Entrevista com a Família, sem redação por IA. Use os pontos abaixo para conduzir a conversa; as sugestões nos campos são um ponto de partida e a equipe decide o que usar.",
    potencialidades, barreiras, divergencias: [], perguntas, cuidados,
  };
}

async function comGemini(chave: string, esquema: Esquema, perguntas: Pergunta[], dados: { F: Dados; E: Dados }, base: Dados, regras: string, trechos: Trecho[]) {
  const sistema = `Você apoia equipes escolares da rede pública brasileira na REUNIÃO DO ESTUDO DE CASO de um estudante da educação especial, dentro do Programa Decola AEE do Instituto Inclusão na Escola. A equipe (professor do AEE, professor regente, profissional de apoio, coordenação) vai se reunir SEM um especialista ao lado. Seu papel é o de um consultor experiente que prepara a reunião: aponta o que as respostas mostram, o que falta e o que perguntar, e sugere como preencher cada campo do Estudo de Caso. A equipe decide o que usar.
Você recebe as respostas da Ficha de Observação (F) e da Entrevista com a Família (E), sem nome do estudante, e uma PROPOSTA BASE feita por regras.
Devolva APENAS JSON neste formato:
{"insights": {"resumo": string, "potencialidades": string[], "barreiras": string[], "divergencias": string[], "perguntas": string[], "cuidados": string[]}, "campos": {<id>: valor}, "justificativas": {<id>: {"porque": string, "fonte": {"titulo": string, "pagina": number|null}}}}
INSIGHTS: "resumo" em 3 a 5 frases; "potencialidades" e "barreiras" com 3 a 6 itens cada, cada barreira escrita como algo do CONTEXTO ESCOLAR com o tipo entre parênteses (comunicação, pedagógica, tecnológica, atitudinal, arquitetônica); "divergencias" = pontos em que a escola e a família descrevem coisas diferentes, ou informações que faltam (lista vazia se não houver); "perguntas" = 4 a 7 perguntas concretas para a equipe discutir na reunião, específicas deste caso; "cuidados" = o que a equipe precisa saber de saúde, rotina e segurança, só se constar nas respostas.
CAMPOS: use os ids e os valores válidos do ESQUEMA. Para escolha_multipla, um array com os textos EXATOS das opções e, se precisar e o campo permitir, um item "Outro: ...". Para texto e texto_longo, string curta em tópicos. Para o tipo tabela, um array de objetos com as colunas do esquema (prazo fica vazio; situacao "A fazer"). Não preencha data, profissional nem checklist.
REGRAS: 1) baseie-se só nas RESPOSTAS, nas REGRAS DO INSTITUTO e nos TRECHOS; não invente fatos sobre o estudante. 2) Barreira é do contexto escolar, nunca característica do estudante; se as respostas descreverem a barreira como déficit do aluno, reescreva como barreira do contexto. 3) Nunca use linguagem clínica, diagnóstico ou rótulos, nem sugira medicação. 4) Linguagem Simples, pt-BR, frases curtas. Nunca escreva nome de pessoa: diga "o estudante", "a família", "o professor". 5) Em cada justificativa diga em uma frase por que sugere aquilo e cite a fonte: o formulário ("Ficha de Observação" ou "Entrevista com a Família", pagina null) ou um TRECHO (titulo e pagina). 6) Melhore, corrija e complete a PROPOSTA BASE; mantenha o que estiver certo.`;
  const esq = perguntas.map((p) => ({ id: p.id, rotulo: p.rotulo, tipo: p.tipo, opcoes: p.opcoes, permite_outro: p.permite_outro, colunas: p.colunas }));
  const usuario = [
    "ESQUEMA DO ESTUDO DE CASO:", JSON.stringify(esq), "",
    "RESPOSTAS (Ficha F, Entrevista E):", JSON.stringify(dados), "",
    "PROPOSTA BASE POR REGRAS:", JSON.stringify(base), "",
    "REGRAS DO INSTITUTO:", regras.slice(0, 40000), "",
    "TRECHOS:", trechos.map((t, i) => `[${i + 1}] ${t.titulo}${t.pagina ? ", página " + t.pagina : ""}:` + "\n" + t.texto).join("\n\n"),
  ].join("\n");
  const { texto, modelo, tentativas } = await gerarTexto(chave, sistema, usuario, { maxOutputTokens: 8192 });
  const vazio: Insights = { resumo: "", potencialidades: [], barreiras: [], divergencias: [], perguntas: [], cuidados: [] };
  try {
    const r = JSON.parse(texto);
    const i = (r.insights ?? {}) as Record<string, unknown>;
    const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).filter((x) => x.trim()).slice(0, 8) : []);
    const insights: Insights = { resumo: String(i.resumo ?? ""), potencialidades: lista(i.potencialidades), barreiras: lista(i.barreiras), divergencias: lista(i.divergencias), perguntas: lista(i.perguntas), cuidados: lista(i.cuidados) };
    const just: Record<string, Just> = {};
    for (const [k, j] of Object.entries((r.justificativas ?? {}) as Record<string, unknown>)) {
      if (typeof j === "string") just[k] = { porque: j };
      else if (j && typeof j === "object") {
        const f = (j as { fonte?: { titulo?: unknown; pagina?: unknown } }).fonte;
        just[k] = { porque: String((j as { porque?: unknown }).porque ?? "") };
        if (f && typeof f === "object" && f.titulo) just[k].fonte = { titulo: String(f.titulo), pagina: typeof f.pagina === "number" ? f.pagina : null };
      }
    }
    return { ok: !!insights.resumo, modelo, tentativas, insights, campos: (r.campos ?? {}) as Dados, justificativas: just };
  } catch {
    return { ok: false, modelo, tentativas, insights: vazio, campos: {} as Dados, justificativas: {} as Record<string, Just> };
  }
}
