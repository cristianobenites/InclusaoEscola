import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, CheckCircle2, Printer } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import { acharFormulario } from "@/formularios";
import type { Respostas } from "@/formularios/tipos";
import type { Resposta } from "@/lib/tipos";
import FormularioGuiado, { preenchida } from "@/components/FormularioGuiado";
import Aviso from "@/components/Aviso";

export default function Preencher() {
  const { id: estudanteId, formularioId, respostaId } = useParams();
  const navegar = useNavigate();
  const qc = useQueryClient();
  const { perfil } = useAuth();
  const [valores, setValores] = useState<Respostas>({});
  const [sujo, setSujo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [idAtual, setIdAtual] = useState<string | undefined>(respostaId);

  const equipe = perfil?.papel !== "professor_regente";

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
      else setAviso("Rascunho salvo.");
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
          <button className="btn-secundario" onClick={() => window.print()} title="Imprimir ou salvar em PDF">
            <Printer size={16} /> <span className="hidden sm:inline">Imprimir</span>
          </button>
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
          <summary className="cursor-pointer font-semibold text-marca-forte">Instruções rápidas de preenchimento</summary>
          <ul className="mt-2 list-disc pl-5 text-tinta-suave space-y-1">
            {formulario.instrucoes.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </details>
        {concluido && (
          <p className="mt-3 chip bg-marca-suave text-marca-forte">Concluído. Registro fechado para edição.</p>
        )}
      </header>

      <FormularioGuiado
        formulario={formulario}
        valores={valores}
        somenteLeitura={concluido}
        equipe={equipe}
        aoMudar={(k, v) => {
          setValores((atual) => ({ ...atual, [k]: v }));
          setSujo(true);
        }}
      />

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
    </div>
  );
}
