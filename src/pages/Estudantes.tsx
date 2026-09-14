import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import type { Escola, Estudante, Turma } from "@/lib/tipos";
import Aviso from "@/components/Aviso";

export default function Estudantes() {
  const { perfil } = useAuth();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [abrirNovo, setAbrirNovo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const estudantes = useQuery({
    queryKey: ["estudantes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estudantes")
        .select("*, estudantes_identidade(nome, data_nascimento, responsavel_nome), turmas(nome)")
        .eq("arquivado", false)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data as Estudante[];
    },
  });

  const escolas = useQuery({
    queryKey: ["escolas"],
    queryFn: async () => (await supabase.from("escolas").select("*").order("nome")).data as Escola[],
  });
  const turmas = useQuery({
    queryKey: ["turmas"],
    queryFn: async () => (await supabase.from("turmas").select("*").order("nome")).data as Turma[],
  });

  const lista = (estudantes.data ?? []).filter((e) => {
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return (e.estudantes_identidade?.nome ?? "").toLowerCase().includes(t) || e.codigo.toLowerCase().includes(t);
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl">Estudantes</h1>
          <p className="text-sm text-tinta-suave mt-1">
            Cada estudante recebe um código. O nome fica guardado à parte e nunca vai para a IA.
          </p>
        </div>
        <button className="btn-primario" onClick={() => setAbrirNovo(true)}>
          <Plus size={16} /> Novo estudante
        </button>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tinta-fraca" />
        <input
          className="campo !pl-10"
          placeholder="Buscar por nome ou código"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {estudantes.isLoading ? (
        <p className="text-sm text-tinta-fraca">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">Nenhum estudante ainda.</p>
          <p className="text-sm text-tinta-suave mt-1">Cadastre o primeiro para começar a Ficha de Observação.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((e) => (
            <li key={e.id}>
              <Link to={`/estudantes/${e.id}`} className="card block p-5 hover:border-marca transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{e.estudantes_identidade?.nome ?? "(sem nome)"}</div>
                    <div className="text-xs text-tinta-fraca mt-0.5">
                      {e.turmas?.nome ?? e.ano_turma ?? "Turma não informada"}
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-tinta-fraca shrink-0" />
                </div>
                <span className="chip bg-papel text-tinta-suave mt-3 font-mono">{e.codigo}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {abrirNovo && (
        <NovoEstudante
          escolas={escolas.data ?? []}
          turmas={turmas.data ?? []}
          escolaPadrao={perfil?.escola_id ?? escolas.data?.[0]?.id ?? ""}
          aoFechar={() => setAbrirNovo(false)}
          aoSalvar={() => {
            setAbrirNovo(false);
            qc.invalidateQueries({ queryKey: ["estudantes"] });
          }}
          aoErro={setAviso}
        />
      )}
      <Aviso mensagem={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}

function NovoEstudante({
  escolas,
  turmas,
  escolaPadrao,
  aoFechar,
  aoSalvar,
  aoErro,
}: {
  escolas: Escola[];
  turmas: Turma[];
  escolaPadrao: string;
  aoFechar: () => void;
  aoSalvar: () => void;
  aoErro: (m: string) => void;
}) {
  const { perfil } = useAuth();
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [escolaId, setEscolaId] = useState(escolaPadrao);
  const [turmaId, setTurmaId] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const turmasDaEscola = turmas.filter((t) => t.escola_id === escolaId);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return aoErro("Informe o nome do estudante.");
    if (!escolaId) return aoErro("Escolha a escola.");
    setOcupado(true);
    try {
      const { data, error } = await supabase
        .from("estudantes")
        .insert({ escola_id: escolaId, turma_id: turmaId || null, criado_por: perfil?.id })
        .select("id")
        .single();
      if (error) throw error;
      const { error: e2 } = await supabase.from("estudantes_identidade").insert({
        estudante_id: data.id,
        nome: nome.trim(),
        data_nascimento: nascimento || null,
        responsavel_nome: responsavel.trim() || null,
      });
      if (e2) throw e2;
      aoSalvar();
    } catch (err) {
      aoErro("Não foi possível salvar: " + (err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-tinta/40 p-4">
      <form onSubmit={salvar} className="card w-full max-w-lg p-6 sm:p-8">
        <h2 className="text-xl">Novo estudante</h2>
        <p className="text-sm text-tinta-suave mt-1 mb-5">Só o necessário para começar. Nada de laudo aqui.</p>
        <label className="rotulo">Nome completo</label>
        <input className="campo mb-4" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="rotulo">Data de nascimento</label>
            <input className="campo" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
          </div>
          <div>
            <label className="rotulo">Responsável</label>
            <input className="campo" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </div>
          <div>
            <label className="rotulo">Escola</label>
            <select
              className="campo"
              value={escolaId}
              onChange={(e) => {
                setEscolaId(e.target.value);
                setTurmaId("");
              }}
            >
              <option value="">Escolha…</option>
              {escolas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rotulo">Turma</label>
            <select className="campo" value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
              <option value="">Sem turma</option>
              {turmasDaEscola.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={ocupado}>
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
