import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, FileSignature, Columns2, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import { acharFormulario } from "@/formularios";
import { formatarDataHora } from "@/pages/Estudante";
import type { Resposta } from "@/lib/tipos";

export interface Sintese {
  id: string;
  modelo: string | null;
  prompt_versao: string | null;
  criado_em: string;
  saida: {
    resumo: string;
    campos: Record<string, unknown>;
    justificativas: Record<string, { porque: string; fonte?: { titulo: string; pagina: number | null } }>;
    base: { ficha: string; entrevista: string; estudo: string | null };
    trechos: { grupo: string; titulo: string; pagina: number | null; texto: string }[];
  };
}

export function valorEmTexto(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(String).join("; ");
  if (typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => (typeof x === "string" ? `${k}: ${x}` : x && typeof x === "object" ? `${k}: ${(x as { opcao?: string }).opcao ?? ""}${(x as { detalhe?: string }).detalhe ? " (" + (x as { detalhe: string }).detalhe + ")" : ""}` : ""))
      .filter(Boolean)
      .join("; ");
  }
  return String(v);
}

export default function SinteseIA({ estudanteId, respostas, aoErro, aoOk }: { estudanteId: string; respostas: Resposta[]; aoErro: (m: string) => void; aoOk: (m: string) => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const { perfil } = useAuth();
  const [ocupado, setOcupado] = useState(false);
  const [mostrarTrechos, setMostrarTrechos] = useState(false);
  const [secaoAberta, setSecaoAberta] = useState<string | null>("sintese");

  const concluidas = respostas.filter((r) => r.status === "concluido");
  const temFicha = concluidas.some((r) => r.formulario_id === "ficha-observacao");
  const temFamilia = concluidas.some((r) => r.formulario_id === "entrevista-familia");
  const temEstudo = concluidas.some((r) => r.formulario_id === "estudo-de-caso");
  const docEquipe = respostas.find((r) => r.formulario_id === "documento-unificado" && r.status === "concluido") ?? respostas.find((r) => r.formulario_id === "documento-unificado");
  const form = acharFormulario("documento-unificado", 1)!;

  const sinteses = useQuery({
    queryKey: ["sinteses", estudanteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sinteses_ia").select("*").eq("estudante_id", estudanteId).order("criado_em", { ascending: false }).limit(1);
      if (error) throw error;
      return data as Sintese[];
    },
  });
  const s = sinteses.data?.[0];

  async function gerar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.functions.invoke("sintese", { body: { estudante_id: estudanteId } });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      qc.invalidateQueries({ queryKey: ["sinteses", estudanteId] });
      aoOk("Síntese gerada");
    } catch (err) {
      aoErro("Não foi possível gerar a síntese: " + (err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function criarRascunho() {
    if (!s) return;
    setOcupado(true);
    try {
      const { data, error } = await supabase.from("respostas").insert({
        estudante_id: estudanteId, formulario_id: "documento-unificado", formulario_versao: 1, respondido_por: perfil?.id, status: "rascunho",
        dados: { ...s.saida.campos, _origem: `sintese:${s.id}` },
      }).select("id").single();
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["respostas", estudanteId] });
      navegar(`/estudantes/${estudanteId}/preencher/documento-unificado/${data.id}`);
    } catch (err) {
      aoErro("Não foi possível criar o rascunho: " + (err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card p-5 sm:p-6 lg:col-span-2">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-2xl bg-sol-fundo text-sol shrink-0">
          <Sparkles size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base sm:text-lg">Síntese: proposta de PAEE e PEI</h2>
          <p className="text-sm text-tinta-suave mt-1">
            Cruza a Ficha de Observação, a Entrevista com a Família e o Estudo de Caso e propõe o Documento Unificado campo a
            campo, com o porquê e a fonte. A equipe compara, ajusta e decide. Nada é decidido pelo sistema.
          </p>
          <ul className="mt-3 text-sm space-y-1">
            <Requisito ok={temFicha} texto="Ficha de Observação concluída" />
            <Requisito ok={temFamilia} texto="Entrevista com a Família concluída" />
            <Requisito ok={temEstudo} texto="Estudo de Caso concluído (opcional, melhora a proposta)" />
          </ul>
        </div>
        <button className="btn-primario shrink-0" onClick={gerar} disabled={ocupado || !temFicha || !temFamilia}>
          <Sparkles size={16} /> {ocupado ? "Gerando…" : s ? "Gerar de novo" : "Gerar síntese"}
        </button>
      </div>

      {s && (
        <div className="mt-5 space-y-4">
          <div className="text-xs text-tinta-fraca">
            Gerada em {formatarDataHora(s.criado_em)} · {s.prompt_versao === "ia" ? `redação por IA (${s.modelo})` : "modo regras: mapeamento dos guias do Instituto, sem redação por IA"}
          </div>
          <p className="text-sm leading-relaxed">{s.saida.resumo}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primario" onClick={criarRascunho} disabled={ocupado}>
              <FileSignature size={16} /> Criar rascunho do Documento Unificado com esta proposta
            </button>
            {docEquipe ? (
              <Link to={`/estudantes/${estudanteId}/comparar/${s.id}/${docEquipe.id}`} className="btn-secundario">
                <Columns2 size={16} /> Comparar com o preenchido pela equipe
              </Link>
            ) : (
              <span className="text-xs text-tinta-fraca self-center">Quando a equipe preencher o Documento Unificado, dá para comparar lado a lado.</span>
            )}
          </div>

          <div className="divide-y divide-papel-borda rounded-2xl border border-papel-borda overflow-hidden">
            {form.secoes.map((sec) => {
              const aberta = secaoAberta === sec.id;
              const preenchidos = sec.perguntas.filter((p) => valorEmTexto(s.saida.campos[p.id])).length;
              return (
                <div key={sec.id} className="bg-white">
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setSecaoAberta(aberta ? null : sec.id)}>
                    <span className="font-medium text-sm flex-1">{sec.titulo}</span>
                    <span className="text-xs text-tinta-fraca">{preenchidos}/{sec.perguntas.length} campos</span>
                    {aberta ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {aberta && (
                    <ul className="px-4 pb-4 space-y-3">
                      {sec.perguntas.map((p) => {
                        const v = valorEmTexto(s.saida.campos[p.id]);
                        const j = s.saida.justificativas[p.id];
                        return (
                          <li key={p.id} className="text-sm">
                            <div className="font-medium">{p.rotulo}</div>
                            <div className={v ? "whitespace-pre-line" : "text-tinta-fraca italic"}>{v || "sem proposta"}</div>
                            {j && (
                              <div className="text-xs text-tinta-fraca mt-0.5">
                                {j.porque}
                                {j.fonte?.titulo ? ` Fonte: ${j.fonte.titulo}${j.fonte.pagina ? ", página " + j.fonte.pagina : ""}.` : ""}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {s.saida.trechos?.length > 0 && (
            <div>
              <button className="btn-fantasma !px-2 text-sm" onClick={() => setMostrarTrechos(!mostrarTrechos)}>
                <BookOpen size={16} /> {s.saida.trechos.length} trecho(s) dos Cadernos consultados {mostrarTrechos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {mostrarTrechos && (
                <ul className="mt-2 space-y-2">
                  {s.saida.trechos.map((t, i) => (
                    <li key={i} className="rounded-2xl border border-papel-borda bg-white px-3.5 py-2.5 text-sm">
                      <div className="text-xs font-medium text-tinta-suave mb-1">{t.titulo}{t.pagina ? `, página ${t.pagina}` : ""}</div>
                      <div className="text-tinta-suave">{t.texto}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Requisito({ ok, texto }: { ok: boolean; texto: string }) {
  return <li className={ok ? "text-verde" : "text-tinta-fraca"}>{ok ? "✓" : "○"} {texto}</li>;
}
