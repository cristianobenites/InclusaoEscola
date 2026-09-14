import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, MessageCircleHeart, Sparkles, Plus, FileCheck2, PencilLine } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Estudante as TEstudante, Resposta } from "@/lib/tipos";
import { FORMULARIOS } from "@/formularios";

const ICONE: Record<string, typeof ClipboardList> = {
  "ficha-observacao": ClipboardList,
  "entrevista-familia": MessageCircleHeart,
};
const ROTULO_NOVO: Record<string, string> = {
  "ficha-observacao": "Nova observação",
  "entrevista-familia": "Nova conversa",
};

export default function Estudante() {
  const { id } = useParams();

  const estudante = useQuery({
    queryKey: ["estudante", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estudantes")
        .select("*, estudantes_identidade(nome, data_nascimento, responsavel_nome), turmas(nome)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as TEstudante;
    },
  });

  const respostas = useQuery({
    queryKey: ["respostas", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("respostas")
        .select("*")
        .eq("estudante_id", id!)
        .order("atualizado_em", { ascending: false });
      if (error) throw error;
      return data as Resposta[];
    },
  });

  if (estudante.isLoading) return <p className="text-sm text-tinta-fraca">Carregando…</p>;
  if (!estudante.data) return <p className="text-sm text-erro">Estudante não encontrado.</p>;
  const e = estudante.data;
  const concluidas = (respostas.data ?? []).filter((r) => r.status === "concluido");
  const temFicha = concluidas.some((r) => r.formulario_id === "ficha-observacao");
  const temFamilia = concluidas.some((r) => r.formulario_id === "entrevista-familia");

  return (
    <div>
      <Link to="/estudantes" className="btn-fantasma !px-2 -ml-2 mb-3 text-sm">
        <ArrowLeft size={16} /> Estudantes
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl">{e.estudantes_identidade?.nome}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-tinta-suave">
            <span className="chip bg-papel font-mono">{e.codigo}</span>
            {e.turmas?.nome && <span>{e.turmas.nome}</span>}
            {e.estudantes_identidade?.data_nascimento && (
              <span>· nascimento {formatarData(e.estudantes_identidade.data_nascimento)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {FORMULARIOS.map((f) => {
          const Icone = ICONE[f.id] ?? ClipboardList;
          const doForm = (respostas.data ?? []).filter((r) => r.formulario_id === f.id);
          return (
            <section key={f.id} className="card p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-xl bg-marca-fundo text-marca-forte shrink-0">
                  <Icone size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base sm:text-lg leading-tight">{f.titulo}</h2>
                  <p className="text-xs text-tinta-fraca mt-0.5">versão {f.versao}</p>
                </div>
                <Link to={`/estudantes/${e.id}/preencher/${f.id}`} className="btn-primario !py-2 shrink-0">
                  <Plus size={16} /> <span className="hidden sm:inline">{ROTULO_NOVO[f.id] ?? "Novo"}</span>
                </Link>
              </div>
              <ul className="mt-4 divide-y divide-papel-borda">
                {doForm.length === 0 && <li className="py-3 text-sm text-tinta-fraca">Nenhum registro ainda.</li>}
                {doForm.map((r) => (
                  <li key={r.id} className="py-3 flex items-center gap-3">
                    {r.status === "concluido" ? (
                      <FileCheck2 size={18} className="text-marca shrink-0" />
                    ) : (
                      <PencilLine size={18} className="text-sol shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {r.status === "concluido" ? "Concluído" : "Rascunho"}
                        <span className="text-tinta-fraca font-normal"> · {formatarDataHora(r.atualizado_em)}</span>
                      </div>
                      <div className="text-xs text-tinta-fraca">
                        {resumoResposta(r)}
                      </div>
                    </div>
                    <Link to={`/estudantes/${e.id}/preencher/${f.id}/${r.id}`} className="btn-secundario !py-1.5 text-xs">
                      {r.status === "concluido" ? "Ver" : "Continuar"}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="card p-5 sm:p-6 lg:col-span-2 border-dashed">
          <div className="flex items-start gap-3">
            <span className="grid place-items-center w-10 h-10 rounded-xl bg-sol-suave text-sol shrink-0">
              <Sparkles size={20} />
            </span>
            <div className="flex-1">
              <h2 className="text-base sm:text-lg">Síntese com apoio de IA</h2>
              <p className="text-sm text-tinta-suave mt-1">
                Cruza a observação da escola com a conversa da família e devolve, em rascunho, potencialidades, barreiras,
                lacunas e ações sugeridas para a equipe revisar. Nada é decidido pela IA.
              </p>
              <ul className="mt-3 text-sm space-y-1">
                <Requisito ok={temFicha} texto="Ficha de Observação concluída" />
                <Requisito ok={temFamilia} texto="Conversa com a Família concluída" />
              </ul>
              <button className="btn-primario mt-4" disabled title="Próxima etapa do protótipo">
                <Sparkles size={16} /> Gerar síntese (próxima etapa)
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Requisito({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li className={ok ? "text-marca-forte" : "text-tinta-fraca"}>
      {ok ? "✓" : "○"} {texto}
    </li>
  );
}

function resumoResposta(r: Resposta) {
  const d = r.dados as Record<string, unknown>;
  const partes: string[] = [];
  if (typeof d.data === "string" && d.data) partes.push("data " + formatarData(d.data));
  if (typeof d.profissional === "string" && d.profissional) partes.push(d.profissional);
  if (typeof d.familiar === "string" && d.familiar) partes.push("com " + d.familiar);
  if (Array.isArray(d.ambientes) && d.ambientes.length) partes.push(d.ambientes.length + " ambiente(s)");
  return partes.join(" · ") || "sem detalhes ainda";
}

export function formatarData(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
export function formatarDataHora(iso: string) {
  const dt = new Date(iso);
  return dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
