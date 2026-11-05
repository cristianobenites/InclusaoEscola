// Feedback ao professor sobre um formulário preenchido, fundamentado nos Cadernos do MEC,
// nos guias do Instituto e nos exemplos. Roda com o JWT de quem pediu (RLS vale).
// Sem GEMINI_API_KEY: devolve os trechos mais relevantes por seção (modo "busca").
// Com a chave: o modelo escreve o feedback citando fonte e página (modo "ia").
import { createClient } from "npm:@supabase/supabase-js@2";
import { anonimizador, chaveGemini, gerarTexto } from "../_shared/gemini.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Trecho = { trecho_id: number; grupo: string; titulo: string; pagina: number | null; texto: string; relevancia: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: quem } = await sb.auth.getUser();
    if (!quem.user) return json({ erro: "não autenticado" }, 401);

    const corpoPedido = await req.json();
    if (corpoPedido.acao === "explica_pergunta") return json(await explicarPergunta(corpoPedido));
    if (corpoPedido.acao === "sintese_secao") return json(await sintetizarSecao(sb, corpoPedido));
    const { resposta_id } = corpoPedido;
    const { data: r, error } = await sb.from("respostas").select("*").eq("id", resposta_id).single();
    if (error || !r) return json({ erro: "resposta não encontrada" }, 404);
    const { data: form } = await sb.from("formularios").select("esquema").eq("id", r.formulario_id).eq("versao", r.formulario_versao).single();
    const esquema = form?.esquema as Esquema;
    const { data: ident } = await sb.from("estudantes_identidade").select("nome").eq("estudante_id", r.estudante_id).maybeSingle();

    // 1. Respostas em texto, por seção, sem o nome do estudante (pseudonimização)
    const secoes = resumirRespostas(esquema, r.dados as Record<string, unknown>, ident?.nome ?? null);

    // 2. Busca dos trechos relevantes (cadernos, exemplos, artigos): uma consulta curta por item respondido
    //    (consultas longas com muitas palavras comuns trazem trechos genéricos)
    const trechos = new Map<number, Trecho & { secao: string }>();
    for (const s of secoes) {
      for (const item of s.itens.filter((i) => i.length >= 12).slice(0, 10)) {
        const { data } = await sb.rpc("busca_conhecimento", { p_consulta: item.slice(0, 300), p_limite: 2, p_grupos: ["caderno", "exemplo", "artigo"] });
        for (const t of (data ?? []) as Trecho[]) {
          const atual = trechos.get(t.trecho_id);
          if (!atual || atual.relevancia < t.relevancia) trechos.set(t.trecho_id, { ...t, secao: s.titulo });
        }
      }
    }
    const lista = [...trechos.values()].sort((a, b) => b.relevancia - a.relevancia).slice(0, 12);

    // 3. Regras do Instituto (inteiras)
    const { data: regras } = await sb.rpc("regras_do_instituto");

    const chave = await chaveGemini();
    let saida: Record<string, unknown>;
    let modo = "busca";
    let modelo: string | null = null;
    let tentativas: string[] = [];
    if (chave) {
      try {
        const r = await gerarComGemini(chave, esquema.titulo, secoes, lista, regras ?? "");
        saida = r.saida; modelo = r.modelo; tentativas = r.tentativas; modo = "ia";
      } catch (e) {
        // Google indisponível: entrega o modo busca em vez de falhar
        saida = feedbackPorBusca(esquema.titulo, secoes, lista);
        saida.aviso = "A IA estava indisponível neste momento (" + (e as Error).message.slice(0, 160) + "). Este feedback é o do modo busca; peça de novo mais tarde.";
      }
    } else {
      saida = feedbackPorBusca(esquema.titulo, secoes, lista);
    }
    saida.trechos = lista.map((t) => ({ grupo: t.grupo, titulo: t.titulo, pagina: t.pagina, secao: t.secao, texto: t.texto }));

    const { data: salvo, error: e2 } = await sb.from("feedbacks").insert({
      resposta_id, estudante_id: r.estudante_id, modo, modelo, saida, pedido_por: quem.user.id,
    }).select("id, criado_em").single();
    if (e2) return json({ erro: e2.message }, 500);
    await sb.from("auditoria").insert({ quem: quem.user.id, acao: "feedback.gerou", alvo: "respostas:" + resposta_id, detalhe: { modo, modelo, trechos: lista.length, tentativas } });
    return json({ id: salvo.id, modo, modelo, criado_em: salvo.criado_em, saida });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});

/* ---------- "Entender a pergunta": explicação em Linguagem Simples + exemplos ---------- */

async function explicarPergunta(c: { formulario_id?: string; rotulo?: string; ajuda?: string; opcoes?: string[] }) {
  const chave = await chaveGemini();
  const base = { explicacao: c.ajuda || "Responda com fatos observados no dia a dia, sem rótulos ou diagnóstico. Se não souber agora, deixe em branco e volte depois.", exemplos: [] as string[], modo: "guia" };
  if (!chave) return base;
  const sistema = `Você ajuda professores e famílias da rede pública brasileira a preencher formulários do Programa Decola AEE (educação inclusiva). Explique a pergunta em Linguagem Simples (frases curtas, sem jargão), diga o que a escola faz com essa informação e dê 2 ou 3 exemplos de resposta boa, concretos e sem nome de pessoa. Nunca use linguagem clínica nem rótulos; barreira é do contexto, não do estudante. Responda APENAS JSON: {"explicacao": string, "exemplos": string[]}.`;
  const usuario = `FORMULÁRIO: ${c.formulario_id ?? ""}\nPERGUNTA: ${c.rotulo ?? ""}\nORIENTAÇÃO DO GUIA: ${c.ajuda ?? "(nenhuma)"}\nOPÇÕES (se houver): ${(c.opcoes ?? []).join(" | ") || "(campo aberto)"}`;
  try {
    const { texto } = await gerarTexto(chave, sistema, usuario, { maxOutputTokens: 1024 });
    const j = JSON.parse(texto);
    return { explicacao: String(j.explicacao ?? base.explicacao), exemplos: Array.isArray(j.exemplos) ? j.exemplos.map(String).slice(0, 3) : [], modo: "ia" };
  } catch {
    return base;
  }
}

/* ---------- "Sugerir síntese": rascunho dos campos de síntese a partir das respostas ---------- */

// deno-lint-ignore no-explicit-any
async function sintetizarSecao(sb: any, c: { formulario_id: string; formulario_versao: number; estudante_id?: string; dados: Record<string, unknown>; secao_id: string }) {
  const { data: form } = await sb.from("formularios").select("esquema").eq("id", c.formulario_id).eq("versao", c.formulario_versao).single();
  const esquema = form?.esquema as Esquema | undefined;
  if (!esquema) return { erro: "formulário não encontrado" };
  let nome: string | null = null;
  if (c.estudante_id) {
    const { data: ident } = await sb.from("estudantes_identidade").select("nome").eq("estudante_id", c.estudante_id).maybeSingle();
    nome = ident?.nome ?? null;
  }
  const alvo = esquema.secoes.find((s) => s.id === c.secao_id);
  if (!alvo) return { erro: "seção não encontrada" };
  const secoes = resumirRespostas({ ...esquema, secoes: esquema.secoes.filter((s) => s.id !== c.secao_id) }, c.dados ?? {}, nome);
  const alvos = alvo.perguntas.filter((p) => p.tipo === "texto_longo" || p.tipo === "texto");
  const porRegras = sinteseSimples(c.formulario_id, c.dados ?? {}, alvos.map((p) => p.id));
  const chave = await chaveGemini();
  if (!chave) return { campos: porRegras, modo: "regras" };
  const sistema = `Você apoia equipes escolares do Programa Decola AEE (educação inclusiva, rede pública brasileira). Recebe as respostas de um formulário sobre um estudante (sem nome) e escreve a SÍNTESE pedida, campo a campo, em Linguagem Simples: tópicos curtos separados por ponto e vírgula, só com o que está nas respostas, sem inventar e sem linguagem clínica ou rótulos. Barreira é do contexto escolar, nunca característica do estudante. Nunca escreva nome de pessoa. Responda APENAS JSON com os ids dos campos como chaves e o texto como valor.`;
  const usuario = `FORMULÁRIO: ${esquema.titulo}\n\nRESPOSTAS:\n${secoes.map((s) => `## ${s.titulo}\n${s.texto.trim() || "(sem registro)"}`).join("\n\n")}\n\nCAMPOS DA SÍNTESE A ESCREVER (id: o que pede):\n${alvos.map((p) => `- ${p.id}: ${p.rotulo}${p.ajuda ? " (" + p.ajuda + ")" : ""}`).join("\n")}`;
  try {
    const { texto, modelo } = await gerarTexto(chave, sistema, usuario, { maxOutputTokens: 2048 });
    const j = JSON.parse(texto) as Record<string, unknown>;
    const campos: Record<string, string> = {};
    for (const p of alvos) if (typeof j[p.id] === "string" && (j[p.id] as string).trim()) campos[p.id] = (j[p.id] as string).trim();
    return { campos: Object.keys(campos).length ? campos : porRegras, modo: Object.keys(campos).length ? "ia" : "regras", modelo };
  } catch (e) {
    return { campos: porRegras, modo: "regras", aviso: "IA indisponível (" + (e as Error).message.slice(0, 120) + "); síntese montada a partir dos campos." };
  }
}

// Sem IA: junta os campos correspondentes do próprio formulário.
function sinteseSimples(formularioId: string, d: Record<string, unknown>, ids: string[]) {
  const t = (k: string) => (typeof d[k] === "string" ? (d[k] as string).trim() : "");
  const a = (k: string) => (Array.isArray(d[k]) ? (d[k] as unknown[]).filter((x) => typeof x === "string").join("; ") : "");
  const juntar = (...xs: string[]) => xs.filter(Boolean).join("; ");
  const mapa: Record<string, Record<string, () => string>> = {
    "ficha-observacao": {
      sintese_fortes: () => juntar(t("pontos_fortes"), t("ja_aprendeu"), t("interesses")),
      sintese_barreiras: () => juntar(a("barreiras"), t("barreiras_descricao"), t("impede_participacao")),
      sintese_apoios: () => juntar(t("facilitadores"), t("prioridades")),
      proximas_acoes: () => juntar(a("encaminhamentos")),
    },
    "entrevista-familia": {
      sintese_fortes: () => juntar(t("pontos_fortes"), t("faz_sozinho"), t("interesses")),
      sintese_apoios: () => juntar(t("precisa_ajuda"), t("apoios_essenciais"), t("cuidados_detalhe")),
      sintese_barreiras: () => juntar(t("participa_melhor"), t("sente_escola"), t("relacoes")),
      sintese_recursos: () => juntar(a("recursos"), t("estrategias_anteriores")),
      proximas_acoes: () => juntar(a("encaminhamentos"), t("terapias") && "Acompanhamentos externos: " + t("terapias")),
    },
  };
  const out: Record<string, string> = {};
  for (const id of ids) {
    const f = mapa[formularioId]?.[id];
    const v = f ? f() : "";
    if (v) out[id] = v;
  }
  return out;
}

/* ---------- respostas → texto ---------- */

type Pergunta = { id: string; rotulo: string; tipo: string; linhas?: string[]; ajuda?: string };
type Esquema = { titulo: string; secoes: { id: string; titulo: string; perguntas: Pergunta[] }[] };

function resumirRespostas(esquema: Esquema, dados: Record<string, unknown>, nome: string | null) {
  const anon = anonimizador(nome).texto;
  const ignorar = new Set(["data", "profissional", "cargo", "equipe", "familiar", "vinculo", "profissionais", "local", "professor_aee", "professores_regentes"]);
  return esquema.secoes.map((s) => {
    const partes: string[] = [];
    const itens: string[] = []; // cada resposta ou opção marcada, separada, para a busca
    for (const p of s.perguntas) {
      const v = dados[p.id];
      if (v == null || v === "" || p.tipo === "data") continue;
      const buscavel = !ignorar.has(p.id);
      if (typeof v === "string") {
        partes.push(`${p.rotulo}: ${anon(v)}`);
        if (buscavel) itens.push(anon(v));
      } else if (Array.isArray(v)) {
        const txts = v.map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? Object.values(x as Record<string, string>).filter(Boolean).join(" · ") : String(x)));
        partes.push(`${p.rotulo}: ${txts.map((x) => anon(x)).join("; ")}`);
        if (buscavel) for (const x of txts) itens.push(anon(x));
      } else if (typeof v === "object") {
        const ents = Object.entries(v as Record<string, unknown>)
          .map(([k, x]) => (typeof x === "string" ? `${k} = ${x}` : x && typeof x === "object" ? `${k} = ${(x as { opcao?: string }).opcao ?? ""}${(x as { detalhe?: string }).detalhe ? " (" + anon((x as { detalhe: string }).detalhe) + ")" : ""}` : ""))
          .filter((x) => x && !x.endsWith("= "));
        if (ents.length) {
          partes.push(`${p.rotulo}: ${ents.join("; ")}`);
          if (buscavel) for (const e of ents) if (!/= (Não|Sem apoio|Não observado)$/.test(e)) itens.push(e.replace(" = ", ": "));
        }
      }
    }
    return { id: s.id, titulo: s.titulo, texto: partes.join("\n"), itens };
  });
}

/* ---------- modo busca (sem IA) ---------- */

function feedbackPorBusca(titulo: string, secoes: { titulo: string; texto: string; itens: string[] }[], trechos: (Trecho & { secao: string })[]) {
  const vazias = secoes.filter((s) => !s.texto.trim()).map((s) => s.titulo);
  return {
    resumo: `Leitura automática de "${titulo}". Abaixo, o que os Cadernos do MEC, os exemplos e os artigos dizem sobre cada parte do que você preencheu. Quando a IA estiver ligada, este feedback vira um texto com sugestões por campo.`,
    pontos_fortes: secoes.filter((s) => s.texto.trim()).map((s) => `Seção "${s.titulo.replace(/^\d+\.\s*/, "")}" preenchida.`),
    alertas: vazias.map((t) => ({ secao: t, observacao: "Seção ainda sem registro. O Estudo de Caso fica mais completo com ela.", fonte: null })),
    sugestoes: trechos.slice(0, 6).map((t) => ({
      acao: `Leia sobre "${t.secao.replace(/^\d+\.\s*/, "")}" em ${t.titulo}${t.pagina ? ", página " + t.pagina : ""}.`,
      porque: t.texto.slice(0, 220).trim() + "…",
      fonte: { titulo: t.titulo, pagina: t.pagina },
    })),
    perguntas_para_completar: [],
  };
}

/* ---------- modo IA (Gemini) ---------- */

async function gerarComGemini(chave: string, titulo: string, secoes: { titulo: string; texto: string; itens: string[] }[], trechos: (Trecho & { secao: string })[], regras: string) {
  const sistema = `Você apoia professores da rede pública brasileira na educação especial inclusiva, dentro do Programa Decola AEE do Instituto Inclusão na Escola.
Você recebe um formulário preenchido por um professor sobre um estudante (sem nome) e devolve um FEEDBACK em português do Brasil, em Linguagem Simples (frases curtas, sem jargão), acolhedor e prático.
REGRAS OBRIGATÓRIAS:
1. Baseie-se SOMENTE nas REGRAS DO INSTITUTO e nos TRECHOS fornecidos. Cite a fonte e a página em cada alerta e sugestão. Se não houver trecho que sustente algo, não afirme.
2. Barreira é do contexto escolar, nunca característica do estudante. Se o professor descreveu a barreira como déficit do aluno ("não compreende", "é agitado", "TDAH"), reoriente para o que na escola impede a participação e explique por quê, citando a fonte.
3. Nunca use linguagem clínica, diagnóstica ou rótulos. Nunca sugira diagnóstico ou medicação.
4. Objetivos e indicadores devem ser observáveis e mensuráveis; quando estiverem vagos, proponha a reescrita.
5. Nunca escreva nome de pessoa: diga "o estudante", "a família", "o professor". Elogie o que está bem feito antes de apontar o que falta. Nada aqui é decisão: a equipe decide.
6. Responda APENAS com JSON no formato: {"resumo": string, "pontos_fortes": string[], "alertas": [{"secao": string, "campo": string, "observacao": string, "fonte": {"titulo": string, "pagina": number|null}}], "sugestoes": [{"acao": string, "porque": string, "fonte": {"titulo": string, "pagina": number|null}}], "perguntas_para_completar": string[]}.`;

  const usuario = `FORMULÁRIO: ${titulo}

RESPOSTAS DO PROFESSOR (por seção):
${secoes.map((s) => `## ${s.titulo}\n${s.texto.trim() || "(sem registro)"}`).join("\n\n")}

REGRAS DO INSTITUTO (guias passo a passo, prioridade máxima):
${regras.slice(0, 40000)}

TRECHOS DA BASE DE CONHECIMENTO (cite "titulo" e "pagina"):
${trechos.map((t, i) => `[${i + 1}] ${t.titulo}${t.pagina ? ", página " + t.pagina : ""} (${t.grupo}):\n${t.texto}`).join("\n\n")}`;

  const { texto, modelo, tentativas } = await gerarTexto(chave, sistema, usuario, { maxOutputTokens: 4096 });
  try {
    return { saida: JSON.parse(texto) as Record<string, unknown>, modelo, tentativas };
  } catch {
    return { saida: { resumo: texto.slice(0, 2000), pontos_fortes: [], alertas: [], sugestoes: [], perguntas_para_completar: [] }, modelo, tentativas };
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
