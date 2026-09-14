import { useEffect } from "react";
import { CheckCircle2 } from "lucide-react";

// Toast só para SUCESSO (regra do projeto). Erro e campo vazio usam o Aviso central.
export default function Toast({ mensagem, aoSumir }: { mensagem: string | null; aoSumir: () => void }) {
  useEffect(() => {
    if (!mensagem) return;
    const t = setTimeout(aoSumir, 2500);
    return () => clearTimeout(t);
  }, [mensagem, aoSumir]);
  if (!mensagem) return null;
  return (
    <div className="no-print fixed bottom-5 left-1/2 -translate-x-1/2 z-50" role="status" aria-live="polite">
      <div className="flex items-center gap-2 rounded-xl bg-tinta text-white px-4 py-2.5 text-sm font-medium shadow-card">
        <CheckCircle2 size={16} className="text-marca-suave" /> {mensagem}
      </div>
    </div>
  );
}
