import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { acharFormulario } from "@/formularios";
import type { Resposta } from "@/lib/tipos";
import { valorEmTexto, type Sintese } from "@/components/SinteseIA";
import { formatarDataHora } from "@/pages/Estudante";

type Situacao = "igual" | "parcial" | "difere" | "so_equipe" | "so_sistema" | "vazio";
const ROTULO: Record<Situacao, string> = { igual: "Coincide", parcial: "Coincide em parte", difere: "Difere", so_equipe: "Só a equipe", so_sistema: "Só o sistema", vazio: "Ambos vazios" };
const COR: Record<Situacao, string> = { igual: "bg-verde-suave text-tinta", parcial: "bg-sol-fundo text-sol", difere: "bg-rosa-suave text-rosa", so_equipe: "bg-marca-suave text-marca", so_sistema: "bg-sol-fundo text-sol", vazio: "bg-papel text-tinta-fraca" };

function itens(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "object") return valorEmTexto(v).split("; ").filter(Boolean);
  return [String(v)];
}
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/^outro:\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();

function comparar(equipe: unknown, sistema: unknown, tipo: string): Situacao {
  const a = itens(equipe), b = itens(sistema);
  if (!a.length && !b.length) return "vazio";
  if (!a.length) return "so_sistema";
  if (!b.length) return "so_equipe";
  if (tipo === "texto" || tipo === "texto_longo" || tipo === "data") {
    const na = norm(a.join(" ")), nb = norm(b.join(" "));
    if (na === nb) return "igual";
    const ta = new Set(na.split(" ").filter((w) => w.length > 3)), tb = new Set(nb.split(" ").filter((w) => w.length > 3));
    const comuns = [...ta].filter((w) => tb.has(w)).length;
    return comuns / Math.max(1, Math.min(ta.size, tb.size)) >= 0.4 ? "parcial" : "difere";
  }
  const sa = new Set(a.map(norm)), sb = new Set(b.map(norm));
  const comuns = [...sa].filter((x) => sb.has(x)).length;
  if (comuns === sa.size && comuns === sb.size) return "igual";
  return comuns > 0 ? "parcial" : "difere";
}

export default function Comparar() {
  const { id, sinteseId, respostaId } = useParams();
  const form = acharFormulario("documento-unificado", 1)!;

  const sintese = useQuery({
    queryKey: ["sintese", sinteseId],
    queryFn: async () => (await supabase.from("sinteses_ia").select("*").eq("id", sinteseId!).single()).data as Sintese,
  });
  const resposta = useQuery({
    queryKey: ["resposta", respostaId],
    queryFn: async () => (await supabase.from("respostas").select("*").eq("id", respostaId!).single()).data as Resposta,
  });
  const estudante = useQuery({
    queryKey: ["estudante-cab", id],
    queryFn: async () => (await supabase.from("estudantes").select("codigo, estudantes_identidade(nome)").eq("id", id!).single()).data as { codigo: string; estudantes_identidade: { nome: string } | null } | null,
  });

  if (sintese.isLoading || resposta.isLoading) return <p className="text-sm text-tinta-fraca">Carregando…</p>;
  if (!sintese.data || !resposta.data) return <p className="text-sm text-erro">Não encontrei a síntese ou o documento da equipe.</p>;
  const S = sintese.data.saida.campos, Q = resposta.data.dados as Record<string, unknown>, J = sintese.data.saida.justificativas;

  const linhas = form.secoes.flatMap((sec) => sec.perguntas.filter((p) => p.tipo !== "data" && !["professor_aee", "professores_regentes", "assinaturas", "data_aprovacao"].includes(p.id)).map((p) => ({ sec: sec.titulo, p, sit: comparar(Q[p.id], S[p.id], p.tipo) })));
  const contagem = linhas.reduce((acc, l) => ({ ...acc, [l.sit]: (acc[l.sit] ?? 0) + 1 }), {} as Record<Situacao, number>);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-3 mb-5">
        <Link to={`/estudantes/${id}`} className="btn-fantasma !px-2 -ml-2 text-sm">
          <ArrowLeft size={16} /> {estudante.data?.estudantes_identidade?.nome ?? "Estudante"}
        </Link>
        <span className="chip bg-papel font-mono">{estudante.data?.codigo}</span>
        <button className="btn-secundario ml-auto" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir
        </button>
      </div>
      <h1 className="text-2xl sm:text-3xl">Documento Unificado: equipe e sistema lado a lado</h1>
      <p className="text-sm text-tinta-suave mt-2 max-w-3xl">
        À esquerda, o que a equipe preencheu ({formatarDataHora(resposta.data.atualizado_em)}). À direita, a proposta do sistema ({formatarDataHora(sintese.data.criado_em)},{" "}
        {sintese.data.prompt_versao === "ia" ? "redação por IA" : "modo regras"}). A comparação é por campo; onde houver diferença, a decisão é da equipe.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(ROTULO) as Situacao[]).map((k) => (
          <span key={k} className={clsx("chip", COR[k])}>{ROTULO[k]}: {contagem[k] ?? 0}</span>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {form.secoes.map((sec) => {
          const doSec = linhas.filter((l) => l.sec === sec.titulo);
          if (!doSec.length) return null;
          return (
            <section key={sec.id} className="card overflow-hidden">
              <h2 className="text-base sm:text-lg px-5 py-4 border-b border-papel-borda">{sec.titulo}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-papel text-xs uppercase tracking-wide text-tinta-fraca">
                    <tr>
                      <th className="text-left px-4 py-2 w-[22%]">Campo</th>
                      <th className="text-left px-4 py-2 w-[32%]">Equipe</th>
                      <th className="text-left px-4 py-2 w-[32%]">Sistema</th>
                      <th className="text-left px-4 py-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-papel-borda">
                    {doSec.map(({ p, sit }) => (
                      <tr key={p.id} className="align-top">
                        <td className="px-4 py-3 font-medium">{p.rotulo}</td>
                        <td className="px-4 py-3 whitespace-pre-line">{valorEmTexto(Q[p.id]) || <span className="text-tinta-fraca italic">vazio</span>}</td>
                        <td className="px-4 py-3 whitespace-pre-line">
                          {valorEmTexto(S[p.id]) || <span className="text-tinta-fraca italic">sem proposta</span>}
                          {J[p.id] && <div className="text-xs text-tinta-fraca mt-1">{J[p.id].porque}{J[p.id].fonte?.titulo ? ` Fonte: ${J[p.id].fonte!.titulo}${J[p.id].fonte!.pagina ? ", p. " + J[p.id].fonte!.pagina : ""}.` : ""}</div>}
                        </td>
                        <td className="px-4 py-3"><span className={clsx("chip whitespace-nowrap", COR[sit])}>{ROTULO[sit]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
