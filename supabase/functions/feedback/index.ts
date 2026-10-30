// Feedback ao professor sobre um formulário preenchido, fundamentado nos Cadernos do MEC,
// nos guias do Instituto e nos exemplos. Roda com o JWT de quem pediu (RLS vale).
// Sem GEMINI_API_KEY: devolve os trechos mais relevantes por seção (modo "busca").
// Com a chave: o modelo escreve o feedback citando fonte e página (modo "ia").
import { createClient } from "npm:@supabase/supabase-js@2";

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

    const { resposta_id } = await req.json();
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

    const chave = Deno.env.get("GEMINI_API_KEY");
    let saida: Record<string, unknown>;
    let modo = "busca";
    let modelo: string | null = null;
    if (chave) {
      modo = "ia";
      modelo = Deno.env.get("GEMINI_MODELO") ?? "gemini-2.5-flash";
      saida = await gerarComGemini(chave, modelo, esquema.titulo, secoes, lista, regras ?? "");
    } else {
      saida = feedbackPorBusca(esquema.titulo, secoes, lista);
    }
    saida.trechos = lista.map((t) => ({ grupo: t.grupo, titulo: t.titulo, pagina: t.pagina, secao: t.secao, texto: t.texto }));

    const { data: salvo, error: e2 } = await sb.from("feedbacks").insert({
      resposta_id, estudante_id: r.estudante_id, modo, modelo, saida, pedido_por: quem.user.id,
    }).select("id, criado_em").single();
    if (e2) return json({ erro: e2.message }, 500);
    await sb.from("auditoria").insert({ quem: quem.user.id, acao: "feedback.gerou", alvo: "respostas:" + resposta_id, detalhe: { modo, modelo, trechos: lista.length } });
    return json({ id: salvo.id, modo, modelo, criado_em: salvo.criado_em, saida });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});

/* ---------- respostas → texto ---------- */

type Pergunta = { id: string; rotulo: string; tipo: string; linhas?: string[] };
type Esquema = { titulo: string; secoes: { id: string; titulo: string; perguntas: Pergunta[] }[] };

function resumirRespostas(esquema: Esquema, dados: Record<string, unknown>, nome: string | null) {
  const anon = (s: string) => (nome && nome.length > 2 ? s.replaceAll(new RegExp(escapar(nome), "gi"), "o estudante") : s);
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
        partes.push(`${p.rotulo}: ${v.map((x) => anon(String(x))).join("; ")}`);
        if (buscavel) for (const x of v) itens.push(anon(String(x)));
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
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

async function gerarComGemini(chave: string, modelo: string, titulo: string, secoes: { titulo: string; texto: string; itens: string[] }[], trechos: (Trecho & { secao: string })[], regras: string) {
  const sistema = `Você apoia professores da rede pública brasileira na educação especial inclusiva, dentro do Programa Decola AEE do Instituto Inclusão na Escola.
Você recebe um formulário preenchido por um professor sobre um estudante (sem nome) e devolve um FEEDBACK em português do Brasil, em Linguagem Simples (frases curtas, sem jargão), acolhedor e prático.
REGRAS OBRIGATÓRIAS:
1. Baseie-se SOMENTE nas REGRAS DO INSTITUTO e nos TRECHOS fornecidos. Cite a fonte e a página em cada alerta e sugestão. Se não houver trecho que sustente algo, não afirme.
2. Barreira é do contexto escolar, nunca característica do estudante. Se o professor descreveu a barreira como déficit do aluno ("não compreende", "é agitado", "TDAH"), reoriente para o que na escola impede a participação e explique por quê, citando a fonte.
3. Nunca use linguagem clínica, diagnóstica ou rótulos. Nunca sugira diagnóstico ou medicação.
4. Objetivos e indicadores devem ser observáveis e mensuráveis; quando estiverem vagos, proponha a reescrita.
5. Elogie o que está bem feito antes de apontar o que falta. Nada aqui é decisão: a equipe decide.
6. Responda APENAS com JSON no formato: {"resumo": string, "pontos_fortes": string[], "alertas": [{"secao": string, "campo": string, "observacao": string, "fonte": {"titulo": string, "pagina": number|null}}], "sugestoes": [{"acao": string, "porque": string, "fonte": {"titulo": string, "pagina": number|null}}], "perguntas_para_completar": string[]}.`;

  const usuario = `FORMULÁRIO: ${titulo}

RESPOSTAS DO PROFESSOR (por seção):
${secoes.map((s) => `## ${s.titulo}\n${s.texto.trim() || "(sem registro)"}`).join("\n\n")}

REGRAS DO INSTITUTO (guias passo a passo, prioridade máxima):
${regras.slice(0, 40000)}

TRECHOS DA BASE DE CONHECIMENTO (cite "titulo" e "pagina"):
${trechos.map((t, i) => `[${i + 1}] ${t.titulo}${t.pagina ? ", página " + t.pagina : ""} (${t.grupo}):\n${t.texto}`).join("\n\n")}`;

  const corpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: "user", parts: [{ text: usuario }] }],
    generationConfig: { temperature: 0.3, responseMimeType: "application/json", maxOutputTokens: 4096 },
  };
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${chave}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  if (!resp.ok) throw new Error(`Gemini ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const j = await resp.json();
  const texto = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  try {
    return JSON.parse(texto);
  } catch {
    return { resumo: texto.slice(0, 2000), pontos_fortes: [], alertas: [], sugestoes: [], perguntas_para_completar: [] };
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
