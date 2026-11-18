import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Mic, Square } from "lucide-react";

// Ditado por voz nas respostas abertas: usa o reconhecimento de fala do próprio navegador
// (Chrome no Android e no computador, Safari no iPhone). Onde o navegador não oferece o recurso,
// mostramos só a dica do microfone do teclado.
/* eslint-disable @typescript-eslint/no-explicit-any */
const Reconhecedor: any = typeof window !== "undefined" ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

export default function Ditado({ valor, aoMudar, disabled }: { valor: string; aoMudar: (v: string) => void; disabled?: boolean }) {
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const rec = useRef<any>(null);
  const ativo = useRef(false);
  const semFala = useRef(0);
  const valorRef = useRef(valor);
  useEffect(() => {
    valorRef.current = valor;
  }, [valor]);
  useEffect(
    () => () => {
      ativo.current = false;
      try {
        rec.current?.abort();
      } catch {
        /* nada */
      }
    },
    [],
  );

  function acrescentar(fala: string) {
    let t = fala.trim();
    if (!t) return;
    const base = valorRef.current.replace(/\s+$/, "");
    if (!base || /[.!?\n]$/.test(base)) t = t.charAt(0).toUpperCase() + t.slice(1);
    const novo = base ? base + " " + t : t;
    valorRef.current = novo;
    aoMudar(novo);
  }

  function escutar() {
    const r = new Reconhecedor();
    rec.current = r;
    r.lang = "pt-BR";
    r.continuous = false; // modo contínuo duplica frases no Chrome do Android; reiniciamos a cada pausa
    r.interimResults = true;
    r.maxAlternatives = 1;
    let ouviu = false;
    r.onresult = (e: any) => {
      let provisorio = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          ouviu = true;
          acrescentar(res[0].transcript);
        } else provisorio += res[0].transcript;
      }
      setParcial(provisorio);
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        ativo.current = false;
        setErro("O navegador não tem permissão para usar o microfone. Toque no cadeado ao lado do endereço do site e permita o microfone.");
      } else if (e.error === "audio-capture") {
        ativo.current = false;
        setErro("Não encontrei um microfone neste aparelho.");
      } else if (e.error === "network") {
        ativo.current = false;
        setErro("Sem conexão para converter a fala em texto. Confira a internet e tente de novo.");
      }
    };
    r.onend = () => {
      setParcial("");
      semFala.current = ouviu ? 0 : semFala.current + 1;
      if (ativo.current && semFala.current < 3) {
        try {
          escutar();
          return;
        } catch {
          /* cai para parar */
        }
      }
      ativo.current = false;
      setOuvindo(false);
    };
    r.start();
  }

  function alternar() {
    setErro(null);
    if (ouvindo) {
      ativo.current = false;
      try {
        rec.current?.stop();
      } catch {
        /* nada */
      }
      setOuvindo(false);
      return;
    }
    try {
      ativo.current = true;
      semFala.current = 0;
      escutar();
      setOuvindo(true);
    } catch (e) {
      ativo.current = false;
      setErro("Não foi possível iniciar o ditado: " + (e as Error).message);
    }
  }

  if (!Reconhecedor) {
    return <p className="no-print mt-1.5 text-xs text-tinta-fraca">Para ditar em vez de digitar, toque no microfone do teclado do celular.</p>;
  }

  return (
    <div className="no-print mt-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={alternar}
          disabled={disabled}
          aria-pressed={ouvindo}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60",
            ouvindo ? "border-rosa bg-rosa-suave text-rosa" : "border-papel-borda bg-white text-marca hover:bg-marca-fundo",
          )}
        >
          {ouvindo ? <Square size={13} /> : <Mic size={14} />}
          {ouvindo ? "Parar" : "Ditar resposta"}
        </button>
        {ouvindo && (
          <span className="inline-flex items-center gap-1.5 text-xs text-rosa">
            <span className="h-2 w-2 rounded-full bg-rosa animate-pulse" /> Ouvindo… fale normalmente.
          </span>
        )}
      </div>
      {ouvindo && parcial && <p className="mt-1 text-xs italic text-tinta-fraca">{parcial}</p>}
      {ouvindo && !parcial && <p className="mt-1 text-xs text-tinta-fraca">A fala vira texto no fim de cada frase. Evite dizer o nome completo do estudante.</p>}
      {erro && <p className="mt-1 text-xs text-erro">{erro}</p>}
    </div>
  );
}
