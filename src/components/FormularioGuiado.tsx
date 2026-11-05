import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Check, Lock, HelpCircle, Sparkles, Plus, Trash2, X } from "lucide-react";
import type { Formulario, LinhaTabela, Pergunta, Respostas, Secao, ValorEscala, ValorVerificacao } from "@/formularios/tipos";
import { supabase } from "@/lib/supabase";

interface Props {
  formulario: Formulario;
  valores: Respostas;
  aoMudar: (id: string, valor: Respostas[string]) => void;
  somenteLeitura?: boolean;
  equipe?: boolean; // pode preencher as seções "somente_equipe"
  extras?: Record<string, ReactNode>; // conteúdo extra no topo de uma seção (ex.: botão "Sugerir síntese")
}

const OUTRO = "Outro: ";

export default function FormularioGuiado({ formulario, valores, aoMudar, somenteLeitura, equipe, extras }: Props) {
  const [secaoAtiva, setSecaoAtiva] = useState(formulario.secoes[0]?.id);

  const progresso = useMemo(() => {
    const total = formulario.secoes.flatMap((s) => s.perguntas).length;
    const feitas = formulario.secoes.flatMap((s) => s.perguntas).filter((p) => preenchida(valores[p.id])).length;
    return { total, feitas };
  }, [formulario, valores]);

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="no-print lg:sticky lg:top-24 self-start min-w-0">
        <div className="card p-3">
          <div className="px-2 pb-2 text-xs font-medium text-tinta-fraca uppercase tracking-wide">Seções</div>
          <ol className="flex lg:flex-col gap-1 overflow-x-auto">
            {formulario.secoes.map((s, i) => {
              const bloqueada = s.somente_equipe && !equipe;
              const completa = s.perguntas.every((p) => preenchida(valores[p.id]));
              return (
                <li key={s.id} className="shrink-0">
                  <a
                    href={`#secao-${s.id}`}
                    onClick={() => setSecaoAtiva(s.id)}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                      secaoAtiva === s.id ? "bg-marca-fundo text-marca font-medium" : "text-tinta-suave hover:bg-papel",
                    )}
                  >
                    <span
                      className={clsx(
                        "grid place-items-center w-5 h-5 rounded-full text-[11px] font-bold shrink-0",
                        completa ? "bg-verde text-white" : "bg-papel-borda text-tinta-suave",
                      )}
                    >
                      {completa ? <Check size={12} /> : i + 1}
                    </span>
                    <span className="truncate max-w-[160px]">{s.titulo.replace(/^\d+\.\s*/, "")}</span>
                    {bloqueada && <Lock size={12} className="ml-auto text-tinta-fraca" />}
                  </a>
                </li>
              );
            })}
          </ol>
          <div className="mt-3 px-2">
            <div className="flex justify-between text-xs text-tinta-fraca mb-1">
              <span>Preenchido</span>
              <span>
                {progresso.feitas}/{progresso.total}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-papel-borda overflow-hidden">
              <div
                className="h-full bg-verde transition-all"
                style={{ width: `${progresso.total ? (100 * progresso.feitas) / progresso.total : 0}%` }}
              />
            </div>
          </div>
        </div>
      </aside>

      <div className="space-y-6 min-w-0">
        {formulario.secoes.map((s) => (
          <SecaoCard
            key={s.id}
            secao={s}
            formularioId={formulario.id}
            valores={valores}
            aoMudar={aoMudar}
            bloqueada={!!somenteLeitura || (!!s.somente_equipe && !equipe)}
            motivo={s.somente_equipe && !equipe ? "Esta seção é preenchida pela equipe pedagógica." : undefined}
            extra={extras?.[s.id]}
          />
        ))}
      </div>
    </div>
  );
}

function SecaoCard({
  secao,
  formularioId,
  valores,
  aoMudar,
  bloqueada,
  motivo,
  extra,
}: {
  secao: Secao;
  formularioId: string;
  valores: Respostas;
  aoMudar: Props["aoMudar"];
  bloqueada: boolean;
  motivo?: string;
  extra?: ReactNode;
}) {
  return (
    <section id={`secao-${secao.id}`} className="card p-5 sm:p-7 scroll-mt-24">
      <h2 className="text-lg sm:text-xl">{secao.titulo}</h2>
      {secao.descricao && <p className="text-sm text-tinta-suave mt-1">{secao.descricao}</p>}
      {motivo && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sol-suave text-sol px-3 py-1.5 text-xs font-medium">
          <Lock size={12} /> {motivo}
        </p>
      )}
      {!bloqueada && extra && <div className="no-print mt-3">{extra}</div>}
      <div className="mt-5 space-y-6">
        {secao.perguntas.map((p) => (
          <Campo key={p.id} pergunta={p} formularioId={formularioId} valor={valores[p.id]} aoMudar={(v) => aoMudar(p.id, v)} bloqueada={bloqueada} />
        ))}
      </div>
    </section>
  );
}

function Campo({
  pergunta: p,
  formularioId,
  valor,
  aoMudar,
  bloqueada,
}: {
  pergunta: Pergunta;
  formularioId: string;
  valor: Respostas[string];
  aoMudar: (v: Respostas[string]) => void;
  bloqueada: boolean;
}) {
  const rotulo = (
    <div className="flex items-start gap-2">
      <label className="rotulo flex-1">
        {p.rotulo}
        {p.obrigatoria && <span className="text-erro ml-1">*</span>}
      </label>
      {p.tipo !== "data" && <AjudaPergunta pergunta={p} formularioId={formularioId} />}
    </div>
  );
  const ajuda = p.ajuda ? <p className="ajuda">{p.ajuda}</p> : null;

  switch (p.tipo) {
    case "texto":
    case "data":
      return (
        <div>
          {rotulo}
          <input
            type={p.tipo === "data" ? "date" : "text"}
            className="campo max-w-xl"
            value={(valor as string) ?? ""}
            onChange={(e) => aoMudar(e.target.value)}
            disabled={bloqueada}
          />
          {ajuda}
        </div>
      );
    case "texto_longo":
      return (
        <div>
          {rotulo}
          <textarea
            className="campo min-h-[96px] resize-y"
            value={(valor as string) ?? ""}
            onChange={(e) => aoMudar(e.target.value)}
            disabled={bloqueada}
            placeholder="Descreva o que foi observado, com fatos e sem rótulos."
          />
          {ajuda}
        </div>
      );
    case "escolha_unica":
      return (
        <div>
          {rotulo}
          {ajuda}
          <div className="mt-2 flex flex-wrap gap-2">
            {p.opcoes?.map((o) => (
              <Pilula key={o} ativa={valor === o} onClick={() => aoMudar(valor === o ? undefined : o)} disabled={bloqueada}>
                {o}
              </Pilula>
            ))}
          </div>
        </div>
      );
    case "escolha_multipla": {
      const lista = (valor as string[]) ?? [];
      const outro = lista.find((v) => v.startsWith(OUTRO));
      const alternar = (o: string) => aoMudar(lista.includes(o) ? lista.filter((v) => v !== o) : [...lista, o]);
      const comDescricao = !!p.descricoes;
      return (
        <div>
          {rotulo}
          {ajuda}
          <div className={clsx("mt-2 grid gap-2", !comDescricao && "sm:grid-cols-2")}>
            {p.opcoes?.map((o) => (
              <label
                key={o}
                className={clsx(
                  "flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm cursor-pointer transition-colors",
                  lista.includes(o) ? "border-marca bg-marca-fundo" : "border-papel-borda bg-white hover:bg-papel",
                  bloqueada && "cursor-not-allowed opacity-70",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-marca"
                  checked={lista.includes(o)}
                  onChange={() => alternar(o)}
                  disabled={bloqueada}
                />
                <span>
                  <span className={clsx(comDescricao && "font-medium")}>{o}</span>
                  {p.descricoes?.[o] && <span className="block text-xs text-tinta-suave mt-1 leading-relaxed">{p.descricoes[o]}</span>}
                </span>
              </label>
            ))}
          </div>
          {p.permite_outro && (
            <input
              className="campo max-w-xl mt-2"
              placeholder="Outro (descreva)"
              value={outro ? outro.slice(OUTRO.length) : ""}
              onChange={(e) => {
                const sem = lista.filter((v) => !v.startsWith(OUTRO));
                aoMudar(e.target.value ? [...sem, OUTRO + e.target.value] : sem);
              }}
              disabled={bloqueada}
            />
          )}
        </div>
      );
    }
    case "escala": {
      const v = (valor as ValorEscala) ?? {};
      return (
        <div>
          {rotulo}
          {ajuda}
          <div className="mt-2 divide-y divide-papel-borda rounded-2xl border border-papel-borda overflow-hidden">
            {p.linhas?.map((linha) => (
              <div key={linha} className="grid gap-2 px-3.5 py-3 md:grid-cols-[minmax(240px,2fr)_3fr] md:items-center bg-white">
                <div className="text-sm font-medium">{linha}</div>
                <div className="flex flex-wrap gap-1.5">
                  {p.opcoes?.map((o) => (
                    <Pilula
                      key={o}
                      ativa={v[linha] === o}
                      pequena
                      disabled={bloqueada}
                      onClick={() => aoMudar({ ...v, [linha]: v[linha] === o ? "" : o })}
                    >
                      {o}
                    </Pilula>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "verificacao": {
      const v = (valor as ValorVerificacao) ?? {};
      return (
        <div>
          {rotulo}
          {ajuda}
          <div className="mt-2 divide-y divide-papel-borda rounded-2xl border border-papel-borda overflow-hidden">
            {p.linhas?.map((linha) => (
              <div key={linha} className="px-3.5 py-3 bg-white">
                <div className="grid gap-2 md:grid-cols-[minmax(240px,2fr)_3fr] md:items-center">
                  <div className="text-sm font-medium">{linha}</div>
                  <div className="flex gap-1.5">
                    {p.opcoes?.map((o) => (
                      <Pilula
                        key={o}
                        ativa={v[linha]?.opcao === o}
                        pequena
                        disabled={bloqueada}
                        onClick={() => aoMudar({ ...v, [linha]: { ...v[linha], opcao: v[linha]?.opcao === o ? undefined : o } })}
                      >
                        {o}
                      </Pilula>
                    ))}
                  </div>
                </div>
                {(v[linha]?.opcao === "Sim" || v[linha]?.opcao === "Parcial" || v[linha]?.detalhe) && (
                  <input
                    className="campo mt-2"
                    placeholder="Detalhes e observações"
                    value={v[linha]?.detalhe ?? ""}
                    onChange={(e) => aoMudar({ ...v, [linha]: { ...v[linha], detalhe: e.target.value } })}
                    disabled={bloqueada}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "tabela": {
      // respostas antigas (texto livre) viram a primeira linha, para não perder nada
      const linhas: LinhaTabela[] = Array.isArray(valor) ? (valor as LinhaTabela[]) : typeof valor === "string" && valor.trim() ? [{ [p.colunas?.[0]?.id ?? "acao"]: valor }] : [];
      const colunas = p.colunas ?? [];
      const mudarCelula = (i: number, col: string, texto: string) => aoMudar(linhas.map((l, j) => (j === i ? { ...l, [col]: texto } : l)));
      return (
        <div>
          {rotulo}
          {ajuda}
          <div className="mt-2 rounded-2xl border border-papel-borda overflow-hidden bg-white">
            <div className="tabela-linha !hidden md:!grid gap-2 px-3.5 py-2 bg-papel text-xs uppercase tracking-wide text-tinta-fraca" style={{ "--cols": `2fr repeat(${Math.max(colunas.length - 1, 1)}, 1fr) 32px` } as React.CSSProperties}>
              {colunas.map((c) => <span key={c.id}>{c.rotulo}</span>)}
              <span />
            </div>
            {linhas.length === 0 && <p className="px-3.5 py-3 text-sm text-tinta-fraca">Nenhuma ação ainda. Use "Adicionar linha".</p>}
            <div className="divide-y divide-papel-borda">
              {linhas.map((l, i) => (
                <div key={i} className="px-3.5 py-2.5">
                  <div className="tabela-linha gap-2 md:items-center" style={{ "--cols": `2fr repeat(${Math.max(colunas.length - 1, 1)}, 1fr) 32px` } as React.CSSProperties}>
                    {colunas.map((c) =>
                      c.tipo === "escolha" ? (
                        <select key={c.id} className="campo !py-1.5 text-sm" value={l[c.id] ?? ""} onChange={(e) => mudarCelula(i, c.id, e.target.value)} disabled={bloqueada} aria-label={c.rotulo}>
                          <option value="">{c.rotulo}</option>
                          {c.opcoes?.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input key={c.id} type={c.tipo === "data" ? "date" : "text"} className="campo !py-1.5 text-sm" placeholder={c.rotulo} value={l[c.id] ?? ""} onChange={(e) => mudarCelula(i, c.id, e.target.value)} disabled={bloqueada} aria-label={c.rotulo} />
                      ),
                    )}
                    <button type="button" className="btn-fantasma !px-1.5 !py-1 text-tinta-fraca hover:text-erro justify-self-end" title="Remover linha" disabled={bloqueada} onClick={() => aoMudar(linhas.filter((_, j) => j !== i))}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {!bloqueada && (
            <button type="button" className="btn-secundario !py-1.5 text-sm mt-2" onClick={() => aoMudar([...linhas, {}])}>
              <Plus size={14} /> Adicionar linha
            </button>
          )}
        </div>
      );
    }
  }
}

/* "Entender a pergunta": explicação do guia + exemplos; com um clique a mais, a IA explica em Linguagem Simples. */
function AjudaPergunta({ pergunta: p, formularioId }: { pergunta: Pergunta; formularioId: string }) {
  const [aberta, setAberta] = useState(false);
  const [ia, setIa] = useState<{ explicacao: string; exemplos: string[]; modo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function perguntarIa() {
    setOcupado(true);
    setErro(null);
    try {
      const { data, error } = await supabase.functions.invoke("feedback", {
        body: { acao: "explica_pergunta", formulario_id: formularioId, pergunta_id: p.id, rotulo: p.rotulo, ajuda: p.ajuda ?? "", opcoes: p.opcoes ?? [] },
      });
      if (error) throw new Error(error.message);
      if (data?.erro) throw new Error(data.erro);
      setIa({ explicacao: data.explicacao, exemplos: data.exemplos ?? [], modo: data.modo });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span className="no-print relative shrink-0">
      <button
        type="button"
        onClick={() => setAberta(!aberta)}
        className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition", aberta ? "bg-marca text-white" : "text-marca hover:bg-marca-fundo")}
        title="Entender a pergunta"
      >
        <HelpCircle size={14} /> <span className="hidden sm:inline">Entender a pergunta</span>
      </button>
      {aberta && (
        <div className="absolute right-0 z-20 mt-1 w-[min(92vw,420px)] rounded-2xl border border-papel-borda bg-white p-4 shadow-card text-left">
          <div className="flex items-start gap-2">
            <div className="flex-1 text-sm">
              <div className="font-medium">{p.rotulo}</div>
              <p className="text-tinta-suave mt-1 text-xs leading-relaxed">{p.ajuda || "Responda com fatos observados, sem rótulos. Se não souber, deixe em branco e volte depois."}</p>
            </div>
            <button type="button" className="text-tinta-fraca hover:text-tinta" onClick={() => setAberta(false)} aria-label="Fechar"><X size={16} /></button>
          </div>
          {ia && ia.modo !== "ia" ? (
            <p className="mt-3 text-xs text-tinta-fraca">A IA não está disponível agora. Use a orientação do guia acima; se ainda tiver dúvida, anote o que observou com suas palavras e a equipe revisa junto.</p>
          ) : ia ? (
            <div className="mt-3 rounded-xl bg-sol-fundo/60 p-3 text-xs leading-relaxed">
              <p>{ia.explicacao}</p>
              {ia.exemplos.length > 0 && (
                <ul className="mt-2 list-disc pl-4 space-y-1">
                  {ia.exemplos.map((ex, i) => <li key={i}>{ex}</li>)}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-tinta-fraca">{ia.modo === "ia" ? "Explicação da IA a partir dos guias do Instituto. É apoio, não decisão." : "Explicação dos guias do Instituto (IA indisponível no momento)."}</p>
            </div>
          ) : (
            <button type="button" className="btn-secundario !py-1.5 text-xs mt-3" onClick={perguntarIa} disabled={ocupado}>
              <Sparkles size={13} /> {ocupado ? "Pensando…" : "Pedir uma explicação à IA, com exemplos"}
            </button>
          )}
          {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
        </div>
      )}
    </span>
  );
}

function Pilula({
  ativa,
  pequena,
  disabled,
  onClick,
  children,
}: {
  ativa: boolean;
  pequena?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativa}
      className={clsx(
        "rounded-full border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70",
        pequena ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
        ativa ? "border-marca bg-marca text-white" : "border-papel-borda bg-white text-tinta-suave hover:border-marca hover:text-marca",
      )}
    >
      {children}
    </button>
  );
}

export function preenchida(v: Respostas[string]): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return (v as unknown[]).some((x) => (typeof x === "string" ? x.trim().length > 0 : !!x && Object.values(x as Record<string, string>).some((c) => (c ?? "").trim().length > 0)));
  return Object.values(v).some((x) => (typeof x === "string" ? x.trim().length > 0 : !!x && !!(x as { opcao?: string }).opcao));
}
