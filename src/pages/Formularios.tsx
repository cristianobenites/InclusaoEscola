import { useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, Users } from "lucide-react";
import { FORMULARIOS } from "@/formularios";
import FormularioGuiado from "@/components/FormularioGuiado";
import clsx from "clsx";

// Vitrine: mostra as perguntas de cada documento, mas NADA aqui é preenchido.
// Em 24/11, numa formação, várias pessoas vieram para cá pelo menu e acharam que o celular
// "não deixava digitar". Por isso a página avisa em cima, embaixo (barra fixa) e a cada toque num campo.
export default function Formularios() {
  const [ativo, setAtivo] = useState(FORMULARIOS[0].id);
  const [chamou, setChamou] = useState(false);
  const relogio = useRef<number>();
  const f = FORMULARIOS.find((x) => x.id === ativo)!;
  const perguntas = f.secoes.reduce((n, s) => n + s.perguntas.length, 0);

  // Campo travado não recebe toque (pointer-events: none), então o toque chega aqui:
  // se caiu em cima de um campo, a barra de baixo chama a atenção.
  function aoTocar(e: MouseEvent<HTMLDivElement>) {
    const travados = e.currentTarget.querySelectorAll<HTMLElement>("input:disabled, textarea:disabled, select:disabled, button:disabled");
    for (const el of travados) {
      const r = (el.closest("label") ?? el).getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        setChamou(true);
        window.clearTimeout(relogio.current);
        relogio.current = window.setTimeout(() => setChamou(false), 1600);
        return;
      }
    }
  }

  return (
    <div className="pb-28">
      <h1 className="text-2xl sm:text-3xl">Modelos dos documentos</h1>

      <div className="mt-4 mb-6 rounded-3xl border border-sol/50 bg-sol-fundo px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Eye size={22} className="text-sol shrink-0" />
        <div className="flex-1 min-w-[14rem]">
          <p className="font-medium">Esta página é só para conhecer as perguntas. Aqui não dá para responder.</p>
          <p className="text-sm text-tinta-suave mt-0.5">
            Para preencher: abra Estudantes, toque no estudante (ou cadastre um) e escolha o documento.
          </p>
        </div>
        <Link to="/estudantes" className="btn-primario">
          <Users size={16} /> Ir para Estudantes
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FORMULARIOS.map((x) => (
          <button
            key={x.id}
            onClick={() => setAtivo(x.id)}
            className={clsx(
              "rounded-full border px-4 py-2 text-sm font-medium",
              ativo === x.id ? "border-marca bg-marca-fundo text-marca" : "border-papel-borda bg-white text-tinta-suave",
            )}
          >
            {x.titulo} <span className="text-xs font-normal opacity-70">v{x.versao}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-fraca mb-4">
        {f.secoes.length} seções · {perguntas} perguntas · fonte: Caderno Pedagógico 3 do MEC e guias passo a passo do Instituto, em Linguagem Simples (ISO
        24495-1)
      </p>

      <div onClick={aoTocar} className="[&_:disabled]:pointer-events-none">
        <FormularioGuiado formulario={f} valores={{}} aoMudar={() => {}} somenteLeitura equipe />
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 px-3 pb-3 pointer-events-none">
        <div
          role="status"
          className={clsx(
            "pointer-events-auto mx-auto max-w-2xl flex items-center gap-3 rounded-3xl border bg-white px-4 py-3 shadow-card transition-all duration-200",
            chamou ? "border-sol-vivo ring-4 ring-sol-vivo/60 -translate-y-1.5" : "border-papel-borda",
          )}
        >
          <Eye size={18} className="text-sol shrink-0" />
          <p className="flex-1 text-sm leading-snug">
            <span className="font-medium">Só para conhecer.</span> Para responder, vá em Estudantes.
          </p>
          <Link to="/estudantes" className="btn-primario !py-2 text-sm shrink-0">
            Estudantes
          </Link>
        </div>
      </div>
    </div>
  );
}
