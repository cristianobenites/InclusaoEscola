import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, UserPlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NOME_PAPEL, type Papel } from "@/lib/tipos";

interface Membro {
  perfil_id: string;
  nome: string;
  papel: Papel;
  motivo: "cadastrou" | "equipe" | "funcao";
  pode_remover: boolean;
}
interface Colega {
  perfil_id: string;
  nome: string;
  papel: Papel;
}

const MOTIVO: Record<Membro["motivo"], string> = {
  cadastrou: "cadastrou o estudante",
  equipe: "incluído(a) na equipe",
  funcao: "pela função na escola",
};

// Quem enxerga os registros deste estudante, e a inclusão de colegas da mesma escola na equipe.
export default function EquipeEstudante({
  estudanteId,
  aoErro,
  aoOk,
}: {
  estudanteId: string;
  aoErro: (m: string) => void;
  aoOk: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [escolhido, setEscolhido] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const equipe = useQuery({
    queryKey: ["equipe", estudanteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("equipe_do_estudante", { p_estudante: estudanteId });
      if (error) throw error;
      return data as Membro[];
    },
  });
  const colegas = useQuery({
    queryKey: ["equipe-colegas", estudanteId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("colegas_para_equipe", { p_estudante: estudanteId });
      if (error) throw error;
      return data as Colega[];
    },
  });

  function recarregar() {
    qc.invalidateQueries({ queryKey: ["equipe", estudanteId] });
    qc.invalidateQueries({ queryKey: ["equipe-colegas", estudanteId] });
  }

  async function incluir() {
    if (!escolhido) return;
    setOcupado(true);
    const { error } = await supabase.rpc("equipe_adiciona", { p_estudante: estudanteId, p_perfil: escolhido });
    setOcupado(false);
    if (error) return aoErro("Não foi possível incluir: " + error.message);
    setEscolhido("");
    aoOk("Pessoa incluída na equipe do estudante");
    recarregar();
  }

  async function remover(m: Membro) {
    setOcupado(true);
    const { error } = await supabase.rpc("equipe_remove", { p_estudante: estudanteId, p_perfil: m.perfil_id });
    setOcupado(false);
    if (error) return aoErro("Não foi possível remover: " + error.message);
    aoOk(`${m.nome} não acompanha mais este estudante`);
    recarregar();
  }

  if (equipe.isError) return null;
  const membros = equipe.data ?? [];

  return (
    <section className="no-print card p-5 sm:p-6 mb-4">
      <h2 className="text-base sm:text-lg flex items-center gap-2">
        <ShieldCheck size={18} className="text-verde" /> Quem acompanha este estudante
      </h2>
      <p className="text-xs text-tinta-suave mt-1">
        Só estas pessoas enxergam os registros deste estudante, além da Secretaria de Educação do município.
      </p>

      {equipe.isLoading ? (
        <p className="text-sm text-tinta-fraca mt-3">Carregando…</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {membros.map((m) => (
            <li key={m.perfil_id} className="flex items-center gap-2 rounded-2xl border border-papel-borda bg-papel/60 py-1.5 pl-3 pr-2">
              <span className="leading-tight">
                <span className="block text-sm font-medium">{m.nome}</span>
                <span className="block text-[11px] text-tinta-fraca">
                  {NOME_PAPEL[m.papel] ?? m.papel} · {MOTIVO[m.motivo]}
                </span>
              </span>
              {m.pode_remover && (
                <button
                  type="button"
                  className="grid place-items-center w-6 h-6 rounded-full text-tinta-fraca hover:bg-white hover:text-erro disabled:opacity-60"
                  title={`Tirar ${m.nome} da equipe`}
                  aria-label={`Tirar ${m.nome} da equipe`}
                  onClick={() => remover(m)}
                  disabled={ocupado}
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
          {membros.length === 0 && <li className="text-sm text-tinta-fraca">Ninguém da escola ainda.</li>}
        </ul>
      )}

      {(colegas.data?.length ?? 0) > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label className="rotulo" htmlFor="equipe-incluir">
              Incluir colega da mesma escola
            </label>
            <select id="equipe-incluir" className="campo" value={escolhido} onChange={(e) => setEscolhido(e.target.value)}>
              <option value="">Escolha…</option>
              {colegas.data!.map((c) => (
                <option key={c.perfil_id} value={c.perfil_id}>
                  {c.nome} · {NOME_PAPEL[c.papel] ?? c.papel}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-secundario" onClick={incluir} disabled={!escolhido || ocupado}>
            <UserPlus size={16} /> Incluir
          </button>
        </div>
      )}
    </section>
  );
}
