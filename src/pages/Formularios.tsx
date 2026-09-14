import { useState } from "react";
import { FORMULARIOS } from "@/formularios";
import FormularioGuiado from "@/components/FormularioGuiado";
import clsx from "clsx";

export default function Formularios() {
  const [ativo, setAtivo] = useState(FORMULARIOS[0].id);
  const f = FORMULARIOS.find((x) => x.id === ativo)!;
  const perguntas = f.secoes.reduce((n, s) => n + s.perguntas.length, 0);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">Formulários</h1>
      <p className="text-sm text-tinta-suave mt-1 mb-5 max-w-3xl">
        Os formulários são arquivos de dados versionados, não código. Quando a equipe pedagógica mudar uma pergunta, entra
        uma versão nova e as respostas antigas continuam ligadas à versão em que foram feitas.
      </p>
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
        {f.secoes.length} seções · {perguntas} perguntas · fonte: Caderno Pedagógico 3, reescrito em Linguagem Simples (ISO
        24495-1)
      </p>
      <FormularioGuiado formulario={f} valores={{}} aoMudar={() => {}} somenteLeitura equipe />
    </div>
  );
}
