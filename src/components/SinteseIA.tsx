import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, FileSignature, Columns2, BookOpen, ChevronDown, ChevronUp, History } from "lucide-react";
import clsx from "clsx";
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
  criado_por?: string | null;
  perfis?: { nome: string } | null;
  saida: {
    resumo: string;
    aviso?: string | null;
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

export function descricaoModo(s: Sintese) {
  return s.prompt_versao === "ia" ? `redação por IA (${s.modelo})` : "modo regras, sem redação por IA";
}

export default function SinteseIA({ estudanteId, respostas, aoErro, aoOk }: { estudanteId: string; respostas: Resposta[]; aoErro: (m: string) => void; aoOk: (m: string) => void }) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const { perfil } = useAuth();
  const [ocupado, setOcupado] = useState(false);
  const [mostrarTrechos, setMostrarTrechos] = useState(false);
  const [mostrarVersoes, setMostrarVersoes] = useState(false);
  const [secaoAberta, setSecaoAberta] = useState<string | null>("sintese");
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const concluidas = respostas.filter((r) => r.status === "concluido");
  const temFicha = concluidas.some((r) => r.formulario_id === "ficha-observacao");
  const temFamilia = concluidas.some((r) => r.formulario_id === "entrevista-familia");
  const temEstudo = concluidas.some((r) => r.formulario_id === "estudo-de-caso");
  const docEquipe = respostas.find((r) => r.formulario_id === "documento-unificado" && r.status === "concluido") ?? respostas.find((r) => r.formulario_id === "documento-unificado");
  const form = acharFormulario("documento-unificado", 1)!;

  const sinteses = useQuery({
    queryKey: ["sinteses", estudanteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sinteses_ia").select("*, perfis:criado_por(nome)").eq("estudante_id", estudanteId).order("criado_em", { ascending: false });
      if (error) throw error;
      return data as unknown as Sintese[];
    },
  });
  const lista = sinteses.data ?? [];
  const s = lista.find((x) => x.id === selecionada) ?? lista[0];
  const eUltima = !!s && s.id === lista[0]?.id;

  useEffect(() => {
    // ao gerar uma nova, volta para a mais recente
    if (lista.length && selecionada && !lista.some((x) => x.id === selecionada)) setSelecionada(null);
  }, [lista, selecionada]);

  async function gerar() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.functions.invoke("sintese", { body: { estudante_id: estudanteId } });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      setSelecionada(null);
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
          <Sparkles size={16} /> {ocupado ? "Gerando…" : lista.length ? "Gerar de novo" : "Gerar síntese"}
        </button>
      </div>

      {s && (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-fraca">
            <span>
              {eUltima ? "Versão mais recente" : "Versão anterior"}, gerada em {formatarDataHora(s.criado_em)}
              {s.perfis?.nome ? ` por ${s.perfis.nome}` : ""} · {descricaoModo(s)}
            </span>
            {lista.length > 1 && (
              <button className="btn-fantasma !px-2 !py-1 text-xs" onClick={() => setMostrarVersoes(!mostrarVersoes)}>
                <History size={14} /> {lista.length} versões {mostrarVersoes ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>
          {mostrarVersoes && lista.length > 1 && (
            <ol className="rounded-2xl border border-papel-borda bg-white divide-y divide-papel-borda text-sm">
              {lista.map((v, i) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => { setSelecionada(v.id); setMostrarVersoes(false); }}
                    className={clsx("w-full text-left px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 hover:bg-papel", v.id === s.id && "bg-marca-fundo")}
                  >
                    <span className="font-medium">Versão {lista.length - i}</span>
                    <span className="text-tinta-suave">{formatarDataHora(v.criado_em)}{v.perfis?.nome ? ` · ${v.perfis.nome}` : ""}</span>
                    <span className={clsx("chip", v.prompt_versao === "ia" ? "bg-sol-fundo text-sol" : "bg-papel text-tinta-fraca")}>{v.prompt_versao === "ia" ? `IA · ${v.modelo}` : "regras"}</span>
                    <span className="text-xs text-tinta-fraca ml-auto">{Object.values(v.saida.campos).filter((x) => valorEmTexto(x)).length} campos</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          {s.saida.aviso && <p className="text-xs rounded-2xl bg-sol-fundo text-sol px-3.5 py-2">{s.saida.aviso}</p>}
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
