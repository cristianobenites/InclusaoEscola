import { useState } from "react";
import { ClipboardPaste } from "lucide-react";
import { importarGuiaPratico, type ResultadoImportacao } from "@/lib/importaGuiaPratico";
import type { Respostas } from "@/formularios/tipos";

export default function ImportarGuia({ aoImportar, aoErro }: { aoImportar: (r: Respostas) => void; aoErro: (m: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<ResultadoImportacao | null>(null);

  function analisar() {
    if (!texto.trim()) return aoErro("Cole o texto gerado pelo Guia Prático.");
    const r = importarGuiaPratico(texto);
    if (r.reconhecidos === 0) return aoErro("Não reconheci o formato. Use o botão \"Copiar texto\" do Guia Prático e cole aqui o texto inteiro.");
    setPrevia(r);
  }

  return (
    <>
      <button type="button" className="btn-secundario" onClick={() => setAberto(true)} title="Trazer o que foi preenchido no Guia Prático do Instituto">
        <ClipboardPaste size={16} /> <span className="hidden sm:inline">Colar do Guia Prático</span>
      </button>
      {aberto && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-tinta/40 p-4">
          <div className="card w-full max-w-2xl p-6 sm:p-8 max-h-[90vh] overflow-auto">
            <h2 className="text-xl">Colar o texto do Guia Prático</h2>
            <p className="text-sm text-tinta-suave mt-1 mb-4">
              No guia "Estudo de Caso na Prática", clique em <b>Copiar texto</b> e cole aqui. As marcações entram nos
              campos deste formulário. Antes de salvar, confira e complete.
            </p>
            <textarea
              className="campo min-h-[220px] font-mono text-xs"
              value={texto}
              onChange={(e) => { setTexto(e.target.value); setPrevia(null); }}
              placeholder={"ESTUDO DE CASO — A.B.\nTurma: 5º ano | Profissional: ... | Data: ...\n\nINTERAÇÃO E PARTICIPAÇÃO\n• ..."}
            />
            {previa && (
              <div className="mt-4 rounded-2xl bg-papel p-4 text-sm">
                <div className="font-medium">
                  {previa.reconhecidos} item(ns) reconhecido(s)
                  {previa.cabecalho.estudante ? ` · estudante no guia: ${previa.cabecalho.estudante}` : ""}
                </div>
                {previa.naoReconhecidos.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-tinta-suave">{previa.naoReconhecidos.length} linha(s) não reconhecida(s)</summary>
                    <ul className="mt-1 list-disc pl-5 text-xs text-tinta-fraca">
                      {previa.naoReconhecidos.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secundario" onClick={() => { setAberto(false); setPrevia(null); }}>
                Cancelar
              </button>
              {!previa ? (
                <button type="button" className="btn-primario" onClick={analisar}>
                  Analisar texto
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primario"
                  onClick={() => { aoImportar(previa.respostas); setAberto(false); setPrevia(null); setTexto(""); }}
                >
                  Preencher o formulário
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
