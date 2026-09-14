// Aviso central com OK (regra do projeto: erro nunca em toast no canto).
interface Props {
  titulo?: string;
  mensagem: string | null;
  aoFechar: () => void;
}

export default function Aviso({ titulo = "Atenção", mensagem, aoFechar }: Props) {
  if (!mensagem) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-tinta/40 p-4" role="alertdialog" aria-modal="true">
      <div className="card max-w-sm w-full p-6">
        <h3 className="text-lg font-bold mb-2">{titulo}</h3>
        <p className="text-sm text-tinta-suave whitespace-pre-line">{mensagem}</p>
        <div className="mt-5 flex justify-end">
          <button className="btn-primario" onClick={aoFechar} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
