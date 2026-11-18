import { useState } from "react";
import { Sparkles, Check, X, Lightbulb, AlertTriangle, HelpCircle, ThumbsUp, HeartPulse, Scale, ChevronDown, ChevronUp } from "lucide-react";
import { formatarDataHora } from "@/pages/Estudante";
import { valorEmTexto } from "@/components/SinteseIA";
import type { Respostas, ValorPergunta, LinhaTabela } from "@/formularios/tipos";

export interface SugestaoEstudo {
  id: string;
  criado_em: string;
  modelo: string | null;
  prompt_versao: string | null;
  saida: {
    insights: { resumo: string; potencialidades: string[]; barreiras: string[]; divergencias: string[]; perguntas: string[]; cuidados: string[] };
    aviso?: string | null;
    campos: Record<string, ValorPergunta>;
    justificativas: Record<string, { porque: string; fonte?: { titulo: string; pagina: number | null } }>;
  };
}

/* ---------- regras de "usar" e de "já está no formulário" ---------- */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const chaveLinha = (l: LinhaTabela) => norm(l.acao ?? Object.values(l).join(" "));

export function jaContem(atual: ValorPergunta, sug: ValorPergunta): boolean {
  if (sug == null) return true;
  if (typeof sug === "string") return typeof atual === "string" && norm(atual).includes(norm(sug));
  if (Array.isArray(sug)) {
    if (!Array.isArray(atual)) return sug.length === 0;
    if (sug.length && typeof sug[0] === "object") {
      const tem = new Set((atual as LinhaTabela[]).map(chaveLinha));
      return (sug as LinhaTabela[]).every((l) => tem.has(chaveLinha(l)));
    }
    return (sug as string[]).every((x) => (atual as string[]).includes(x));
  }
  return false;
}

export function aplicar(atual: ValorPergunta, sug: ValorPergunta): ValorPergunta {
  if (typeof sug === "string") {
    const a = typeof atual === "string" ? atual.trim() : "";
    return a ? a + "\n" + sug : sug;
  }
  if (Array.isArray(sug)) {
    if (sug.length && typeof sug[0] === "object") {
      const linhas = Array.isArray(atual) ? (atual as LinhaTabela[]) : [];
      const tem = new Set(linhas.map(chaveLinha));
      return [...linhas, ...(sug as LinhaTabela[]).filter((l) => !tem.has(chaveLinha(l)))];
    }
    const lista = Array.isArray(atual) ? (atual as string[]) : [];
    const semOutro = (sug as string[]).some((x) => x.startsWith("Outro: ")) ? lista.filter((x) => !x.startsWith("Outro: ")) : lista;
    return [...new Set([...semOutro, ...(sug as string[])])];
  }
  return sug;
}

/** Sugestões que ainda fazem sentido mostrar: não dispensadas e ainda não incorporadas. */
export function pendentes(s: SugestaoEstudo | null | undefined, valores: Respostas): Record<string, ValorPergunta> {
  if (!s) return {};
  const dispensadas = new Set(Array.isArray(valores._dispensadas) ? (valores._dispensadas as string[]) : []);
  const out: Record<string, ValorPergunta> = {};
  for (const [id, v] of Object.entries(s.saida.campos ?? {})) {
    if (dispensadas.has(id) || jaContem(valores[id], v)) continue;
    out[id] = v;
  }
  return out;
}

/* ---------- caixa de sugestão embaixo de um campo ---------- */

export function CaixaSugestao({ valor, porque, fonte, aoUsar, aoDispensar }: { valor: ValorPergunta; porque?: string; fonte?: { titulo: string; pagina: number | null }; aoUsar: () => void; aoDispensar: () => void }) {
  const itens = Array.isArray(valor) ? (valor as unknown[]).map((x) => (typeof x === "string" ? x : valorEmTexto([x]))) : null;
  return (
    <div className="no-print mt-2 rounded-2xl border border-sol/40 bg-sol-fundo/50 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-sol">
        <Sparkles size={13} /> Sugestão para a equipe avaliar
      </div>
      {itens ? (
        <ul className="mt-1.5 list-disc pl-5 text-sm space-y-0.5">
          {itens.map((x, i) => <li key={i}>{x}</li>)}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm whitespace-pre-line">{String(valor ?? "")}</p>
      )}
      {(porque || fonte?.titulo) && (
        <p className="mt-1.5 text-xs text-tinta-suave">
          {porque}
          {fonte?.titulo ? ` Fonte: ${fonte.titulo}${fonte.pagina ? ", página " + fonte.pagina : ""}.` : ""}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-1 rounded-full bg-marca px-3 py-1 text-xs font-medium text-white hover:bg-marca-forte" onClick={aoUsar}>
          <Check size={13} /> Usar
        </button>
        <button type="button" className="inline-flex items-center gap-1 rounded-full border border-papel-borda bg-white px-3 py-1 text-xs font-medium text-tinta-suave hover:bg-papel" onClick={aoDispensar}>
          <X size={13} /> Dispensar
        </button>
      </div>
    </div>
  );
}

/* ---------- cartão no topo do Estudo de Caso ---------- */

export default function PreparaEstudo({
  temFicha, temEntrevista, sugestao, ocupado, qtdPendentes, aoGerar, aoUsarTodas,
}: {
  temFicha: boolean;
  temEntrevista: boolean;
  sugestao: SugestaoEstudo | null;
  ocupado: boolean;
  qtdPendentes: number;
  aoGerar: () => void;
  aoUsarTodas: () => void;
}) {
  const [aberto, setAberto] = useState(true);
  const pode = temFicha || temEntrevista;
  const i = sugestao?.saida.insights;
  return (
    <section className="card p-5 sm:p-6 mb-6">
      <div className="flex flex-wrap items-start gap-3">
        <span className="no-print grid place-items-center w-10 h-10 rounded-2xl bg-sol-fundo text-sol shrink-0">
          <Sparkles size={20} />
        </span>
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-base sm:text-lg">Preparar a reunião do Estudo de Caso</h2>
          <p className="text-sm text-tinta-suave mt-1">
            O sistema lê a Ficha de Observação e a Entrevista com a Família e prepara a conversa da equipe: o que as respostas
            mostram, o que falta, perguntas para discutir e uma sugestão para cada campo. A equipe usa ou dispensa cada uma.
          </p>
          <p className="text-xs text-tinta-fraca mt-1.5">
            {pode
              ? `Disponível: ${[temFicha && "Ficha de Observação", temEntrevista && "Entrevista com a Família"].filter(Boolean).join(" e ")}.`
              : "Conclua a Ficha de Observação ou a Entrevista com a Família para usar este recurso."}
          </p>
        </div>
        <button className="no-print btn-primario shrink-0" disabled={!pode || ocupado} onClick={aoGerar}>
          <Sparkles size={16} /> {ocupado ? "Preparando…" : sugestao ? "Gerar de novo" : "Gerar insights e sugestões"}
        </button>
      </div>

      {sugestao && i && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-fraca">
            <span>
              Gerado em {formatarDataHora(sugestao.criado_em)} · {sugestao.prompt_versao === "ia" ? `redação por IA (${sugestao.modelo})` : "a partir das respostas, sem redação por IA"}
            </span>
            <button type="button" className="no-print btn-fantasma !px-2 !py-1 text-xs" onClick={() => setAberto(!aberto)}>
              {aberto ? "Recolher" : "Mostrar insights"} {aberto ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          {sugestao.saida.aviso && <p className="mt-2 text-xs rounded-2xl bg-sol-fundo text-sol px-3.5 py-2">{sugestao.saida.aviso}</p>}
          {aberto && (
            <>
              <p className="mt-3 text-sm leading-relaxed">{i.resumo}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Bloco icone={<ThumbsUp size={15} />} cor="bg-verde-suave" titulo="Potencialidades para usar como ponto de partida" itens={i.potencialidades} />
                <Bloco icone={<AlertTriangle size={15} />} cor="bg-rosa-suave" titulo="Barreiras do contexto escolar" itens={i.barreiras} />
                <Bloco icone={<HelpCircle size={15} />} cor="bg-marca-suave" titulo="Perguntas para a equipe discutir" itens={i.perguntas} numerada />
                <Bloco icone={<Scale size={15} />} cor="bg-sol-fundo" titulo="Onde escola e família divergem, ou o que falta saber" itens={i.divergencias} />
                <Bloco icone={<HeartPulse size={15} />} cor="bg-papel" titulo="Cuidados que a equipe precisa conhecer" itens={i.cuidados} />
              </div>
            </>
          )}
          <div className="no-print mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-papel-borda bg-white px-4 py-3">
            <Lightbulb size={18} className="text-sol shrink-0" />
            <div className="flex-1 min-w-[200px] text-sm">
              {qtdPendentes > 0 ? (
                <>
                  <span className="font-medium">{qtdPendentes} sugestão(ões) esperando a equipe</span>
                  <span className="text-tinta-suave"> nos campos abaixo. Use ou dispense uma a uma, ou aceite todas e ajuste depois.</span>
                </>
              ) : (
                <span className="text-tinta-suave">Todas as sugestões já foram usadas ou dispensadas.</span>
              )}
            </div>
            {qtdPendentes > 0 && (
              <button type="button" className="btn-secundario !py-1.5 text-sm" onClick={aoUsarTodas}>
                <Check size={14} /> Usar todas
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Bloco({ icone, cor, titulo, itens, numerada }: { icone: React.ReactNode; cor: string; titulo: string; itens: string[]; numerada?: boolean }) {
  if (!itens?.length) return null;
  const Lista = numerada ? "ol" : "ul";
  return (
    <div className={`rounded-2xl ${cor} px-4 py-3`}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-tinta-suave">
        {icone} {titulo}
      </div>
      <Lista className={`mt-2 space-y-1.5 text-sm pl-5 ${numerada ? "list-decimal" : "list-disc"}`}>
        {itens.map((x, k) => <li key={k}>{x}</li>)}
      </Lista>
    </div>
  );
}
