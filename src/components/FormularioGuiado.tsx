import { useMemo, useState } from "react";
import clsx from "clsx";
import { Check, Lock } from "lucide-react";
import type { Formulario, Pergunta, Respostas, Secao, ValorEscala, ValorVerificacao } from "@/formularios/tipos";

interface Props {
  formulario: Formulario;
  valores: Respostas;
  aoMudar: (id: string, valor: Respostas[string]) => void;
  somenteLeitura?: boolean;
  equipe?: boolean; // pode preencher as seções "somente_equipe"
}

const OUTRO = "Outro: ";

export default function FormularioGuiado({ formulario, valores, aoMudar, somenteLeitura, equipe }: Props) {
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
            valores={valores}
            aoMudar={aoMudar}
            bloqueada={!!somenteLeitura || (!!s.somente_equipe && !equipe)}
            motivo={s.somente_equipe && !equipe ? "Esta seção é preenchida pela equipe pedagógica." : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function SecaoCard({
  secao,
  valores,
  aoMudar,
  bloqueada,
  motivo,
}: {
  secao: Secao;
  valores: Respostas;
  aoMudar: Props["aoMudar"];
  bloqueada: boolean;
  motivo?: string;
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
      <div className="mt-5 space-y-6">
        {secao.perguntas.map((p) => (
          <Campo key={p.id} pergunta={p} valor={valores[p.id]} aoMudar={(v) => aoMudar(p.id, v)} bloqueada={bloqueada} />
        ))}
      </div>
    </section>
  );
}

function Campo({
  pergunta: p,
  valor,
  aoMudar,
  bloqueada,
}: {
  pergunta: Pergunta;
  valor: Respostas[string];
  aoMudar: (v: Respostas[string]) => void;
  bloqueada: boolean;
}) {
  const rotulo = (
    <label className="rotulo">
      {p.rotulo}
      {p.obrigatoria && <span className="text-erro ml-1">*</span>}
    </label>
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
      return (
        <div>
          {rotulo}
          {ajuda}
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                <span>{o}</span>
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
  }
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
  if (Array.isArray(v)) return v.length > 0;
  return Object.values(v).some((x) => (typeof x === "string" ? x.trim().length > 0 : !!x && !!(x as { opcao?: string }).opcao));
}
