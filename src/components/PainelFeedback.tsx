import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, BookOpen, AlertCircle, Lightbulb, ThumbsUp, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { formatarDataHora } from "@/pages/Estudante";

interface Fonte {
  titulo: string;
  pagina: number | null;
}
interface Saida {
  resumo: string;
  aviso?: string | null;
  pontos_fortes: string[];
  alertas: { secao?: string; campo?: string; observacao: string; fonte: Fonte | null }[];
  sugestoes: { acao: string; porque: string; fonte: Fonte | null }[];
  perguntas_para_completar: string[];
  trechos: { grupo: string; titulo: string; pagina: number | null; secao: string; texto: string }[];
}
interface Feedback {
  id: string;
  modo: "busca" | "ia";
  modelo: string | null;
  criado_em: string;
  saida: Saida;
}

export default function PainelFeedback({ respostaId, aoErro }: { respostaId: string; aoErro: (m: string) => void }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [mostrarTrechos, setMostrarTrechos] = useState(false);

  const feedbacks = useQuery({
    queryKey: ["feedbacks", respostaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("feedbacks").select("*").eq("resposta_id", respostaId).order("criado_em", { ascending: false }).limit(1);
      if (error) throw error;
      return data as Feedback[];
    },
  });
  const f = feedbacks.data?.[0];

  async function pedir() {
    setOcupado(true);
    try {
      const { data, error } = await supabase.functions.invoke("feedback", { body: { resposta_id: respostaId } });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      qc.invalidateQueries({ queryKey: ["feedbacks", respostaId] });
    } catch (err) {
      aoErro("Não foi possível gerar o feedback: " + (err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card p-5 sm:p-7 mt-6 no-print">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-2xl bg-sol-fundo text-sol shrink-0">
          <Sparkles size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg">Feedback com base nos Cadernos e nos guias</h2>
          <p className="text-sm text-tinta-suave mt-1">
            O sistema lê o que você preencheu, busca o que os Cadernos Pedagógicos do MEC, os guias do Instituto e os
            exemplos dizem sobre cada parte, e devolve observações com a fonte e a página. É apoio, não decisão.
          </p>
        </div>
        <button className="btn-primario shrink-0" onClick={pedir} disabled={ocupado}>
          <Sparkles size={16} /> {ocupado ? "Lendo os materiais…" : f ? "Gerar de novo" : "Receber feedback"}
        </button>
      </div>

      {f && (
        <div className="mt-5 space-y-5">
          <div className="text-xs text-tinta-fraca">
            Gerado em {formatarDataHora(f.criado_em)} · {f.modo === "ia" ? `redação por IA (${f.modelo})` : "modo busca: trechos relevantes, sem redação por IA"}
          </div>
          {f.saida.aviso && <p className="text-xs rounded-2xl bg-sol-fundo text-sol px-3.5 py-2 mb-2">{f.saida.aviso}</p>}
          <p className="text-sm leading-relaxed">{f.saida.resumo}</p>

          {f.saida.pontos_fortes?.length > 0 && (
            <Bloco icone={<ThumbsUp size={16} />} cor="text-verde" titulo="O que está bem">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {f.saida.pontos_fortes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Bloco>
          )}

          {f.saida.alertas?.length > 0 && (
            <Bloco icone={<AlertCircle size={16} />} cor="text-sol" titulo="Atenção">
              <ul className="space-y-2 text-sm">
                {f.saida.alertas.map((a, i) => (
                  <li key={i} className="rounded-2xl bg-sol-fundo/60 px-3.5 py-2.5">
                    {(a.secao || a.campo) && <div className="text-xs font-medium text-tinta-suave mb-0.5">{[a.secao, a.campo].filter(Boolean).join(" · ")}</div>}
                    <div>{a.observacao}</div>
                    <Citacao fonte={a.fonte} />
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          {f.saida.sugestoes?.length > 0 && (
            <Bloco icone={<Lightbulb size={16} />} cor="text-marca" titulo="Sugestões">
              <ul className="space-y-2 text-sm">
                {f.saida.sugestoes.map((s, i) => (
                  <li key={i} className="rounded-2xl bg-marca-fundo px-3.5 py-2.5">
                    <div className="font-medium">{s.acao}</div>
                    <div className="text-tinta-suave mt-0.5">{s.porque}</div>
                    <Citacao fonte={s.fonte} />
                  </li>
                ))}
              </ul>
            </Bloco>
          )}

          {f.saida.perguntas_para_completar?.length > 0 && (
            <Bloco icone={<HelpCircle size={16} />} cor="text-rosa" titulo="Para completar o registro">
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {f.saida.perguntas_para_completar.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Bloco>
          )}

          {f.saida.trechos?.length > 0 && (
            <div>
              <button className="btn-fantasma !px-2 text-sm" onClick={() => setMostrarTrechos(!mostrarTrechos)}>
                <BookOpen size={16} /> {f.saida.trechos.length} trecho(s) dos materiais usados {mostrarTrechos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {mostrarTrechos && (
                <ul className="mt-2 space-y-2">
                  {f.saida.trechos.map((t, i) => (
                    <li key={i} className="rounded-2xl border border-papel-borda bg-white px-3.5 py-2.5 text-sm">
                      <div className="text-xs font-medium text-tinta-suave mb-1">
                        <span className={clsx("chip mr-1", t.grupo === "caderno" ? "bg-marca-suave text-marca" : t.grupo === "exemplo" ? "bg-verde-suave text-tinta" : "bg-papel text-tinta-suave")}>{t.grupo}</span>
                        {t.titulo}
                        {t.pagina ? `, página ${t.pagina}` : ""} · sobre "{t.secao.replace(/^\d+\.\s*/, "")}"
                      </div>
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

function Bloco({ icone, cor, titulo, children }: { icone: React.ReactNode; cor: string; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className={clsx("flex items-center gap-2 text-sm font-medium mb-2", cor)}>
        {icone} {titulo}
      </h3>
      {children}
    </div>
  );
}

function Citacao({ fonte }: { fonte: Fonte | null }) {
  if (!fonte?.titulo) return null;
  return (
    <div className="text-xs text-tinta-fraca mt-1">
      Fonte: {fonte.titulo}
      {fonte.pagina ? `, página ${fonte.pagina}` : ""}
    </div>
  );
}
