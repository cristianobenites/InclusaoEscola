import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Users, Sparkles, Blend, Check } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { acharFormulario } from "@/formularios";
import type { Resposta } from "@/lib/tipos";
import { valorEmTexto, type Sintese } from "@/components/SinteseIA";
import { formatarDataHora } from "@/pages/Estudante";
import { useAuth } from "@/contexts/Auth";
import { registrar } from "@/lib/auditoria";

type Situacao = "igual" | "parcial" | "difere" | "so_equipe" | "so_sistema" | "vazio";
const ROTULO: Record<Situacao, string> = { igual: "Coincide", parcial: "Coincide em parte", difere: "Difere", so_equipe: "Só a equipe", so_sistema: "Só o sistema", vazio: "Ambos vazios" };
const COR: Record<Situacao, string> = { igual: "bg-verde-suave text-tinta", parcial: "bg-sol-fundo text-sol", difere: "bg-rosa-suave text-rosa", so_equipe: "bg-marca-suave text-marca", so_sistema: "bg-sol-fundo text-sol", vazio: "bg-papel text-tinta-fraca" };

type Decisao = "equipe" | "sistema" | "combinar";
const ROTULO_DECISAO: Record<Decisao, string> = { equipe: "Fica o da equipe", sistema: "Fica o do sistema", combinar: "Combinar os dois" };
const ICONE_DECISAO: Record<Decisao, typeof Users> = { equipe: Users, sistema: Sparkles, combinar: Blend };

interface DecisaoRegistro {
  id: string;
  campo: string;
  decisao: Decisao;
  comentario: string | null;
  decidido_por: string | null;
  decidido_em: string;
  perfis?: { nome: string } | null;
}

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
  const qc = useQueryClient();
  const { perfil } = useAuth();
  const [erro, setErro] = useState<string | null>(null);

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
  const decisoes = useQuery({
    queryKey: ["decisoes", sinteseId, respostaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("decisoes_comparacao").select("id, campo, decisao, comentario, decidido_por, decidido_em, perfis:decidido_por(nome)").eq("sintese_id", sinteseId!).eq("resposta_id", respostaId!);
      if (error) throw error;
      return (data ?? []) as unknown as DecisaoRegistro[];
    },
  });

  useEffect(() => {
    if (sinteseId && respostaId) registrar("tela.abriu_comparacao", "sinteses_ia:" + sinteseId, { resposta_id: respostaId });
  }, [sinteseId, respostaId]);

  async function decidir(campo: string, decisao: Decisao | null, comentario?: string) {
    const atual = decisoes.data?.find((d) => d.campo === campo);
    try {
      if (!decisao) {
        if (atual) {
          const { error } = await supabase.from("decisoes_comparacao").delete().eq("id", atual.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("decisoes_comparacao").upsert(
          { sintese_id: sinteseId, resposta_id: respostaId, estudante_id: id, campo, decisao, comentario: comentario ?? atual?.comentario ?? null, decidido_por: perfil?.id ?? null, decidido_em: new Date().toISOString() },
          { onConflict: "sintese_id,resposta_id,campo" },
        );
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["decisoes", sinteseId, respostaId] });
    } catch (e) {
      setErro("Não foi possível gravar a decisão: " + (e as Error).message);
    }
  }

  if (sintese.isLoading || resposta.isLoading) return <p className="text-sm text-tinta-fraca">Carregando…</p>;
  if (!sintese.data || !resposta.data) return <p className="text-sm text-erro">Não encontrei a síntese ou o documento da equipe.</p>;
  const S = sintese.data.saida.campos, Q = resposta.data.dados as Record<string, unknown>, J = sintese.data.saida.justificativas;
  const porCampo = new Map((decisoes.data ?? []).map((d) => [d.campo, d]));

  const linhas = form.secoes.flatMap((sec) => sec.perguntas.filter((p) => p.tipo !== "data" && !["professor_aee", "professores_regentes", "assinaturas", "data_aprovacao"].includes(p.id)).map((p) => ({ sec: sec.titulo, p, sit: comparar(Q[p.id], S[p.id], p.tipo) })));
  const contagem = linhas.reduce((acc, l) => ({ ...acc, [l.sit]: (acc[l.sit] ?? 0) + 1 }), {} as Record<Situacao, number>);
  const divergentes = linhas.filter((l) => l.sit !== "igual" && l.sit !== "vazio");
  const decididas = divergentes.filter((l) => porCampo.has(l.p.id)).length;
  const contagemDecisao = (decisoes.data ?? []).reduce((acc, d) => ({ ...acc, [d.decisao]: (acc[d.decisao] ?? 0) + 1 }), {} as Record<Decisao, number>);

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-3 mb-5">
        <Link to={`/estudantes/${id}`} className="btn-fantasma !px-2 -ml-2 text-sm">
          <ArrowLeft size={16} /> {estudante.data?.estudantes_identidade?.nome ?? "Estudante"}
        </Link>
        <span className="chip bg-papel font-mono">{estudante.data?.codigo}</span>
        <button className="btn-secundario ml-auto" onClick={() => { registrar("tela.imprimiu", "sinteses_ia:" + sinteseId); window.print(); }}>
          <Printer size={16} /> Imprimir
        </button>
      </div>
      <h1 className="text-2xl sm:text-3xl">Documento Unificado: equipe e sistema lado a lado</h1>
      <p className="text-sm text-tinta-suave mt-2 max-w-3xl">
        À esquerda, o que a equipe preencheu ({formatarDataHora(resposta.data.atualizado_em)}). À direita, a proposta do sistema ({formatarDataHora(sintese.data.criado_em)},{" "}
        {sintese.data.prompt_versao === "ia" ? "redação por IA" : "modo regras"}). A comparação é por campo; onde houver diferença, a equipe decide e anota o porquê. A decisão fica gravada.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(ROTULO) as Situacao[]).map((k) => (
          <span key={k} className={clsx("chip", COR[k])}>{ROTULO[k]}: {contagem[k] ?? 0}</span>
        ))}
      </div>

      <div className="mt-4 card p-4 sm:p-5 flex flex-wrap items-center gap-3 text-sm">
        <div className="flex-1 min-w-[220px]">
          <div className="font-medium">Decisões da equipe: {decididas} de {divergentes.length} campos com diferença</div>
          <div className="text-xs text-tinta-fraca mt-0.5">
            {(Object.keys(ROTULO_DECISAO) as Decisao[]).map((d) => `${ROTULO_DECISAO[d]}: ${contagemDecisao[d] ?? 0}`).join(" · ")}
          </div>
        </div>
        <div className="h-2 w-full sm:w-56 rounded-full bg-papel overflow-hidden">
          <div className="h-full bg-verde rounded-full transition-all" style={{ width: `${divergentes.length ? Math.round((decididas / divergentes.length) * 100) : 100}%` }} />
        </div>
      </div>
      {erro && <p className="mt-3 text-sm text-erro">{erro}</p>}

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
                      <th className="text-left px-4 py-2 w-[18%]">Campo</th>
                      <th className="text-left px-4 py-2 w-[27%]">Equipe</th>
                      <th className="text-left px-4 py-2 w-[27%]">Sistema</th>
                      <th className="text-left px-4 py-2">Situação e decisão</th>
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
                        <td className="px-4 py-3 min-w-[220px]">
                          <span className={clsx("chip whitespace-nowrap", COR[sit])}>{ROTULO[sit]}</span>
                          {sit !== "igual" && sit !== "vazio" && (
                            <DecisaoCampo registro={porCampo.get(p.id)} aoDecidir={(d, c) => decidir(p.id, d, c)} />
                          )}
                        </td>
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

function DecisaoCampo({ registro, aoDecidir }: { registro?: DecisaoRegistro; aoDecidir: (d: Decisao | null, comentario?: string) => void }) {
  const [comentario, setComentario] = useState(registro?.comentario ?? "");
  const [salvo, setSalvo] = useState(false);
  const ultimo = useRef(registro?.comentario ?? "");
  useEffect(() => {
    setComentario(registro?.comentario ?? "");
    ultimo.current = registro?.comentario ?? "";
  }, [registro?.id, registro?.comentario]);

  function gravarComentario() {
    if (!registro || comentario === ultimo.current) return;
    ultimo.current = comentario;
    aoDecidir(registro.decisao, comentario);
    setSalvo(true);
    setTimeout(() => setSalvo(false), 1500);
  }

  return (
    <div className="mt-2">
      <div className="no-print flex flex-wrap gap-1.5">
        {(Object.keys(ROTULO_DECISAO) as Decisao[]).map((d) => {
          const Icone = ICONE_DECISAO[d];
          const ativa = registro?.decisao === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => aoDecidir(ativa ? null : d, comentario || undefined)}
              className={clsx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition", ativa ? "bg-marca text-white border-marca" : "bg-white border-papel-borda text-tinta hover:bg-papel")}
            >
              <Icone size={13} /> {ROTULO_DECISAO[d]}
            </button>
          );
        })}
      </div>
      {registro && (
        <>
          <div className="print-only text-xs font-medium mt-1">Decisão: {ROTULO_DECISAO[registro.decisao]}</div>
          <textarea
            className="no-print mt-2 w-full rounded-2xl border border-papel-borda bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-marca/30"
            rows={2}
            placeholder="Por quê? (ex.: a equipe conhece a rotina; o sistema trouxe uma fonte que não conhecíamos)"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            onBlur={gravarComentario}
          />
          {registro.comentario && <div className="print-only text-xs whitespace-pre-line">{registro.comentario}</div>}
          <div className="text-[11px] text-tinta-fraca mt-1 flex items-center gap-1">
            {salvo && <Check size={12} className="text-verde" />}
            {registro.perfis?.nome ?? "Equipe"} · {formatarDataHora(registro.decidido_em)}
          </div>
        </>
      )}
    </div>
  );
}
