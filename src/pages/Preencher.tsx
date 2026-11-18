import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, CheckCircle2, Printer, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import { acharFormulario } from "@/formularios";
import type { Respostas } from "@/formularios/tipos";
import type { Resposta } from "@/lib/tipos";
import FormularioGuiado, { preenchida } from "@/components/FormularioGuiado";
import Aviso from "@/components/Aviso";
import Toast from "@/components/Toast";
import { registrar } from "@/lib/auditoria";
import PainelFeedback from "@/components/PainelFeedback";
import ImportarGuia from "@/components/ImportarGuia";
import { preencherEstudoDeCaso, preencherDocumentoUnificado } from "@/lib/preenche";
import type { Sintese } from "@/components/SinteseIA";
import PreparaEstudo, { CaixaSugestao, LIMITE_OUTRA_SUGESTAO, aplicar, pendentes, type SugestaoEstudo } from "@/components/PreparaEstudo";

export default function Preencher() {
  const { id: estudanteId, formularioId, respostaId } = useParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { perfil } = useAuth();
  const [valores, setValores] = useState<Respostas>({});
  const [sujo, setSujo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [idAtual, setIdAtual] = useState<string | undefined>(respostaId);

  const equipe = perfil?.papel !== "professor_regente";
  const [sugerindo, setSugerindo] = useState<string | null>(null);

  // Fontes para o pré-preenchimento (Ficha e Entrevista concluídas; última síntese)
  const fontes = useQuery({
    queryKey: ["fontes-prefill", estudanteId, formularioId],
    enabled: formularioId === "estudo-de-caso" || formularioId === "documento-unificado",
    queryFn: async () => {
      const { data } = await supabase.from("respostas").select("*").eq("estudante_id", estudanteId!).eq("status", "concluido").in("formulario_id", ["ficha-observacao", "entrevista-familia"]).order("atualizado_em", { ascending: false });
      const lista = (data ?? []) as Resposta[];
      const { data: sint } = await supabase.from("sinteses_ia").select("*").eq("estudante_id", estudanteId!).eq("tipo", "documento").order("criado_em", { ascending: false }).limit(1);
      return { ficha: lista.find((r) => r.formulario_id === "ficha-observacao") ?? null, entrevista: lista.find((r) => r.formulario_id === "entrevista-familia") ?? null, sintese: ((sint ?? []) as Sintese[])[0] ?? null };
    },
  });

  // Insights e sugestões para a reunião do Estudo de Caso (última geração deste estudante)
  const [preparando, setPreparando] = useState(false);
  const sugestaoEstudo = useQuery({
    queryKey: ["sugestao-estudo", estudanteId],
    enabled: formularioId === "estudo-de-caso",
    queryFn: async () => {
      const { data } = await supabase.from("sinteses_ia").select("*").eq("estudante_id", estudanteId!).eq("tipo", "estudo-de-caso").order("criado_em", { ascending: false }).limit(1);
      return ((data ?? []) as unknown as SugestaoEstudo[])[0] ?? null;
    },
  });
  const sugPendentes = pendentes(formularioId === "estudo-de-caso" ? sugestaoEstudo.data : null, valores);

  async function gerarSugestoesEstudo() {
    setPreparando(true);
    try {
      const f = fontes.data;
      const base = preencherEstudoDeCaso((f?.ficha?.dados as Respostas) ?? null, (f?.entrevista?.dados as Respostas) ?? null, {}).respostas;
      const { data, error } = await supabase.functions.invoke("sintese", { body: { acao: "estudo_de_caso", estudante_id: estudanteId, base } });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      // nova geração: as dispensas antigas deixam de valer
      setValores((atual) => {
        const { _dispensadas: _fora, ...resto } = atual;
        void _fora;
        return resto;
      });
      await qc.invalidateQueries({ queryKey: ["sugestao-estudo", estudanteId] });
      setToast(data.modo === "ia" ? "Insights e sugestões prontos. A equipe decide o que usar." : "Sugestões montadas a partir das respostas (sem redação por IA). A equipe decide o que usar.");
    } catch (err) {
      setAviso("Não foi possível preparar a reunião: " + (err as Error).message);
    } finally {
      setPreparando(false);
    }
  }
  function usarSugestao(ids: string[]) {
    const s = sugestaoEstudo.data;
    if (!s || !ids.length) return;
    setValores((atual) => {
      const novo: Respostas = { ...atual, _sugestao: s.id };
      for (const id of ids) novo[id] = aplicar(atual[id], s.saida.campos[id]);
      return novo;
    });
    setSujo(true);
    registrar("estudo.usou_sugestao", `sinteses_ia:${s.id}`, { campos: ids });
  }
  // Outra sugestão só para um campo (com orientação opcional da equipe) e volta à anterior
  async function outraSugestao(campo: string, orientacao: string, voltar = false) {
    const sg = sugestaoEstudo.data;
    if (!sg) return;
    try {
      const { data, error } = await supabase.functions.invoke("sintese", { body: { acao: "estudo_campo", sugestao_id: sg.id, campo, orientacao, voltar } });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      await qc.invalidateQueries({ queryKey: ["sugestao-estudo", estudanteId] });
      setToast(voltar ? "Voltamos à sugestão anterior." : "Nova sugestão pronta para este campo.");
    } catch (err) {
      setAviso((voltar ? "Não foi possível voltar à sugestão anterior: " : "Não foi possível gerar outra sugestão: ") + (err as Error).message);
    }
  }
  function dispensarSugestao(id: string) {
    setValores((atual) => ({ ...atual, _dispensadas: [...new Set([...(Array.isArray(atual._dispensadas) ? (atual._dispensadas as string[]) : []), id])] }));
    setSujo(true);
  }

  function trazerRespostas() {
    const f = fontes.data;
    if (!f) return;
    if (formularioId === "estudo-de-caso") {
      const { respostas, origem } = preencherEstudoDeCaso((f.ficha?.dados as Respostas) ?? null, (f.entrevista?.dados as Respostas) ?? null, valores);
      setValores(respostas);
      setSujo(origem.campos > 0);
      setToast(origem.campos ? `${origem.campos} campo(s) preenchidos a partir de: ${origem.de.join(" e ")}. Confira e ajuste.` : "Nada novo para trazer: os campos já estão preenchidos.");
    } else if (formularioId === "documento-unificado" && f.sintese) {
      const { respostas, origem } = preencherDocumentoUnificado(f.sintese.saida.campos, valores, f.sintese.id);
      setValores(respostas);
      setSujo(origem.campos > 0);
      setToast(origem.campos ? `${origem.campos} campo(s) preenchidos com a proposta da síntese. Confira e ajuste: a decisão é da equipe.` : "Nada novo para trazer: os campos já estão preenchidos.");
    }
  }

  async function sugerirSintese(secaoId: string) {
    setSugerindo(secaoId);
    try {
      const { data, error } = await supabase.functions.invoke("feedback", {
        body: { acao: "sintese_secao", formulario_id: formulario!.id, formulario_versao: formulario!.versao, estudante_id: estudanteId, dados: valores, secao_id: secaoId },
      });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      const campos = (data?.campos ?? {}) as Record<string, string>;
      let n = 0;
      const novo = { ...valores };
      for (const [k, v] of Object.entries(campos)) {
        if (typeof novo[k] === "string" && (novo[k] as string).trim()) continue; // não sobrescreve o que a equipe já escreveu
        novo[k] = v;
        n++;
      }
      setValores(novo);
      if (n) setSujo(true);
      setToast(n ? `Síntese sugerida em ${n} campo(s) (${data.modo === "ia" ? "redação por IA" : "montada a partir das respostas"}). Confira e ajuste antes de concluir.` : "Os campos da síntese já estão preenchidos; apague o que quiser refazer e peça de novo.");
      if (data?.aviso) setAviso(data.aviso);
    } catch (err) {
      setAviso("Não foi possível sugerir a síntese: " + (err as Error).message);
    } finally {
      setSugerindo(null);
    }
  }

  const existente = useQuery({
    queryKey: ["resposta", respostaId],
    enabled: !!respostaId,
    queryFn: async () => {
      const { data, error } = await supabase.from("respostas").select("*").eq("id", respostaId!).single();
      if (error) throw error;
      return data as Resposta;
    },
  });

  const estudante = useQuery({
    queryKey: ["estudante-cab", estudanteId],
    queryFn: async () =>
      (await supabase.from("estudantes").select("codigo, estudantes_identidade(nome)").eq("id", estudanteId!).single())
        .data as { codigo: string; estudantes_identidade: { nome: string } | null } | null,
  });

  const formulario = useMemo(
    () => acharFormulario(formularioId!, existente.data?.formulario_versao),
    [formularioId, existente.data?.formulario_versao],
  );

  useEffect(() => {
    registrar("tela.abriu_formulario", `respostas:${respostaId ?? "nova"}`, { formulario: formularioId, estudante: estudanteId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respostaId, formularioId]);

  useEffect(() => {
    if (existente.data) {
      setValores((existente.data.dados as Respostas) ?? {});
      setIdAtual(existente.data.id);
    }
  }, [existente.data]);

  useEffect(() => {
    if (!sujo) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", f);
    return () => window.removeEventListener("beforeunload", f);
  }, [sujo]);

  if (!formulario) return <p className="text-sm text-erro">Formulário não encontrado.</p>;
  if (respostaId && existente.isLoading) return <p className="text-sm text-tinta-fraca">Carregando…</p>;

  const concluido = existente.data?.status === "concluido";

  async function salvar(status: "rascunho" | "concluido") {
    if (status === "concluido") {
      const faltando = formulario!.secoes
        .filter((s) => !s.somente_equipe || equipe)
        .flatMap((s) => s.perguntas)
        .filter((p) => p.obrigatoria && !preenchida(valores[p.id]));
      if (faltando.length) {
        return setAviso("Faltam campos obrigatórios:\n• " + faltando.map((p) => p.rotulo).join("\n• "));
      }
    }
    setOcupado(true);
    try {
      const linha = {
        estudante_id: estudanteId,
        formulario_id: formulario!.id,
        formulario_versao: formulario!.versao,
        respondido_por: perfil?.id,
        status,
        dados: valores,
      };
      if (idAtual) {
        const { error } = await supabase.from("respostas").update(linha).eq("id", idAtual);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("respostas").insert(linha).select("id").single();
        if (error) throw error;
        setIdAtual(data.id);
      }
      setSujo(false);
      qc.invalidateQueries({ queryKey: ["respostas", estudanteId] });
      if (status === "concluido") navegar(`/estudantes/${estudanteId}`);
      else setToast("Rascunho salvo");
    } catch (err) {
      setAviso("Não foi possível salvar: " + (err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-center gap-3 mb-5">
        <Link to={`/estudantes/${estudanteId}`} className="btn-fantasma !px-2 -ml-2 text-sm">
          <ArrowLeft size={16} /> {estudante.data?.estudantes_identidade?.nome ?? "Estudante"}
        </Link>
        <span className="chip bg-papel font-mono">{estudante.data?.codigo}</span>
        <div className="ml-auto flex gap-2">
          <button
            className="btn-secundario"
            onClick={() => {
              registrar("tela.imprimiu", `respostas:${idAtual ?? "nova"}`, { formulario: formulario.id, estudante: estudanteId });
              window.print();
            }}
            title="Imprimir ou salvar em PDF"
          >
            <Printer size={16} /> <span className="hidden sm:inline">Imprimir</span>
          </button>
          {!concluido && formulario.id === "estudo-de-caso" && formulario.versao >= 2 && (
            <ImportarGuia
              aoImportar={(r) => {
                setValores((atual) => ({ ...atual, ...r }));
                setSujo(true);
                setToast("Formulário preenchido com o texto do guia. Confira e salve.");
              }}
              aoErro={setAviso}
            />
          )}
          {!concluido && (
            <>
              <button className="btn-secundario" disabled={ocupado} onClick={() => salvar("rascunho")}>
                <Save size={16} /> <span className="hidden sm:inline">Salvar rascunho</span>
              </button>
              <button className="btn-primario" disabled={ocupado} onClick={() => salvar("concluido")}>
                <CheckCircle2 size={16} /> Concluir
              </button>
            </>
          )}
        </div>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl">{formulario.titulo}</h1>
        <p className="text-sm text-tinta-suave mt-2 max-w-3xl">{formulario.finalidade}</p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-marca">Instruções rápidas de preenchimento</summary>
          <ul className="mt-2 list-disc pl-5 text-tinta-suave space-y-1">
            {formulario.instrucoes.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </details>
        {concluido && (
          <p className="mt-3 chip bg-verde-suave text-tinta">Concluído. Registro fechado para edição.</p>
        )}
      </header>

      {!concluido && formulario.id === "estudo-de-caso" && (
        <PreparaEstudo
          temFicha={!!fontes.data?.ficha}
          temEntrevista={!!fontes.data?.entrevista}
          sugestao={sugestaoEstudo.data ?? null}
          ocupado={preparando}
          qtdPendentes={Object.keys(sugPendentes).length}
          aoGerar={gerarSugestoesEstudo}
          aoUsarTodas={() => usarSugestao(Object.keys(sugPendentes))}
        />
      )}
      {!concluido && formulario.id === "documento-unificado" && (
        <div className="no-print card p-4 sm:p-5 mb-6 flex flex-wrap items-center gap-3 bg-sol-fundo/50">
          <Sparkles size={20} className="text-sol shrink-0" />
          <div className="flex-1 min-w-[240px] text-sm">
            <div className="font-medium">Começar pela proposta da síntese</div>
            <div className="text-xs text-tinta-suave mt-0.5">
              {fontes.data?.sintese
                ? `Última síntese de ${new Date(fontes.data.sintese.criado_em).toLocaleDateString("pt-BR")} (${fontes.data.sintese.prompt_versao === "ia" ? "redação por IA" : "modo regras"}). Preenche só os campos vazios; a decisão é da equipe.`
                : "Gere a síntese na página do estudante (com a Ficha e a Entrevista concluídas) para usar este atalho."}
            </div>
          </div>
          <button className="btn-primario !py-2" disabled={!fontes.data?.sintese} onClick={trazerRespostas}>
            <Sparkles size={16} /> Trazer a proposta
          </button>
        </div>
      )}

      <FormularioGuiado
        formulario={formulario}
        valores={valores}
        somenteLeitura={concluido}
        equipe={equipe}
        extras={
          formulario.id === "ficha-observacao" || formulario.id === "entrevista-familia"
            ? Object.fromEntries(
                formulario.secoes
                  .filter((sec) => sec.perguntas.some((p) => p.id.startsWith("sintese_")))
                  .map((sec) => [
                    sec.id,
                    <button key={sec.id} type="button" className="btn-secundario !py-1.5 text-sm" disabled={!!sugerindo} onClick={() => sugerirSintese(sec.id)}>
                      <Sparkles size={14} /> {sugerindo === sec.id ? "Montando a síntese…" : "Sugerir síntese a partir das respostas"}
                    </button>,
                  ]),
              )
            : undefined
        }
        rodapeCampo={(p) =>
          p.id in sugPendentes ? (
            <CaixaSugestao
              valor={sugPendentes[p.id]}
              porque={sugestaoEstudo.data?.saida.justificativas?.[p.id]?.porque}
              fonte={sugestaoEstudo.data?.saida.justificativas?.[p.id]?.fonte}
              aoUsar={() => usarSugestao([p.id])}
              aoDispensar={() => dispensarSugestao(p.id)}
              aoOutra={sugestaoEstudo.data?.prompt_versao === "ia" ? (o) => outraSugestao(p.id, o) : undefined}
              aoVoltar={() => outraSugestao(p.id, "", true)}
              restantes={LIMITE_OUTRA_SUGESTAO - (sugestaoEstudo.data?.saida.regeracoes?.[p.id] ?? 0)}
              temAnterior={(sugestaoEstudo.data?.saida.historico?.[p.id]?.length ?? 0) > 0}
            />
          ) : null
        }
        aoMudar={(k, v) => {
          setValores((atual) => ({ ...atual, [k]: v }));
          setSujo(true);
        }}
      />

      {idAtual && !sujo && <PainelFeedback respostaId={idAtual} aoErro={setAviso} />}
      {idAtual && sujo && (
        <p className="no-print mt-6 text-sm text-tinta-fraca">Salve o rascunho para pedir o feedback sobre o que preencheu.</p>
      )}

      {!concluido && (
        <div className="no-print mt-6 flex justify-end gap-2">
          <button className="btn-secundario" disabled={ocupado} onClick={() => salvar("rascunho")}>
            <Save size={16} /> Salvar rascunho
          </button>
          <button className="btn-primario" disabled={ocupado} onClick={() => salvar("concluido")}>
            <CheckCircle2 size={16} /> Concluir
          </button>
        </div>
      )}
      <Aviso mensagem={aviso} aoFechar={() => setAviso(null)} />
      <Toast mensagem={toast} aoSumir={() => setToast(null)} />
    </div>
  );
}
