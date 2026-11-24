import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Ban, CircleCheck, Pencil, RefreshCw, ChevronDown, ChevronUp, Building2, History } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import { ALCANCE_PAPEL, NOME_PAPEL, PAPEL_PRECISA_ESCOLA, type Escola, type Papel, type Turma } from "@/lib/tipos";
import { rotuloAcao } from "@/lib/auditoria";
import { TODAS_VERSOES } from "@/formularios";
import Aviso from "@/components/Aviso";
import Toast from "@/components/Toast";
import { formatarDataHora } from "@/pages/Estudante";

type Aba = "usuarios" | "atividade" | "estrutura";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  municipio_id: string | null;
  municipio: string | null;
  escola_id: string | null;
  escola: string | null;
  ultimo_acesso: string | null;
  criado_em: string;
  bloqueado: boolean;
  escolas_ids: string[] | null;
  escolas_nomes: string[] | null;
  trocar_senha: boolean | null;
}

interface Atividade {
  quando: string;
  quem: string | null;
  quem_nome: string | null;
  quem_email: string | null;
  acao: string;
  alvo: string | null;
  detalhe: Record<string, unknown> | null;
  origem: "app" | "auth";
}

interface Municipio {
  id: string;
  nome: string;
  uf: string;
}

export default function Admin() {
  const { perfil } = useAuth();
  const [aba, setAba] = useState<Aba>("usuarios");
  const [aviso, setAviso] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const superadmin = perfil?.papel === "superadmin";

  const municipios = useQuery({
    queryKey: ["municipios"],
    queryFn: async () => (await supabase.from("municipios").select("*").order("nome")).data as Municipio[],
  });
  const escolas = useQuery({
    queryKey: ["escolas"],
    queryFn: async () => (await supabase.from("escolas").select("*").order("nome")).data as Escola[],
  });
  const turmas = useQuery({
    queryKey: ["turmas"],
    queryFn: async () => (await supabase.from("turmas").select("*").order("nome")).data as Turma[],
  });

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">Administração</h1>
      <p className="text-sm text-tinta-suave mt-1 mb-5">
        {superadmin ? "Você enxerga todos os municípios, usuários e ações." : "Usuários e atividade do seu município."}
      </p>
      <div className="flex flex-wrap gap-2 mb-6">
        {(
          [
            ["usuarios", "Usuários"],
            ["atividade", "Atividade"],
            ["estrutura", "Municípios e escolas"],
          ] as [Aba, string][]
        ).map(([k, r]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={clsx(
              "rounded-full border px-4 py-2 text-sm font-medium",
              aba === k ? "border-marca bg-marca-fundo text-marca" : "border-papel-borda bg-white text-tinta-suave",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {aba === "usuarios" && (
        <Usuarios
          municipios={municipios.data ?? []}
          escolas={escolas.data ?? []}
          superadmin={superadmin}
          aoErro={setAviso}
          aoOk={setToast}
        />
      )}
      {aba === "atividade" && <AtividadeLista aoErro={setAviso} />}
      {aba === "estrutura" && (
        <Estrutura
          municipios={municipios.data ?? []}
          escolas={escolas.data ?? []}
          turmas={turmas.data ?? []}
          superadmin={superadmin}
          aoErro={setAviso}
          aoOk={setToast}
        />
      )}
      <Aviso mensagem={aviso} aoFechar={() => setAviso(null)} />
      <Toast mensagem={toast} aoSumir={() => setToast(null)} />
    </div>
  );
}

/* ---------------- Usuários ---------------- */

function Usuarios({
  municipios,
  escolas,
  superadmin,
  aoErro,
  aoOk,
}: {
  municipios: Municipio[];
  escolas: Escola[];
  superadmin: boolean;
  aoErro: (m: string) => void;
  aoOk: (m: string) => void;
}) {
  const qc = useQueryClient();
  const { perfil } = useAuth();
  const [abrirNovo, setAbrirNovo] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtroMunicipio, setFiltroMunicipio] = useState("");
  const [filtroEscola, setFiltroEscola] = useState("");

  const usuarios = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_usuarios");
      if (error) throw error;
      return data as Usuario[];
    },
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["admin-usuarios"] });

  // quem administra escolhe a nova senha (o padrão combinado é o próprio e-mail da pessoa)
  const [redefinindo, setRedefinindo] = useState<Usuario | null>(null);
  async function bloquear(u: Usuario, bloquear: boolean) {
    const { error } = await supabase.rpc("admin_bloqueia", { p_id: u.id, p_bloquear: bloquear });
    if (error) return aoErro(traduz(error.message));
    aoOk(bloquear ? "Usuário bloqueado" : "Usuário desbloqueado");
    recarregar();
  }

  const termo = busca.trim().toLowerCase();
  const lista = (usuarios.data ?? []).filter(
    (u) =>
      (!termo || u.nome.toLowerCase().includes(termo) || (u.email ?? "").toLowerCase().includes(termo)) &&
      (!filtroMunicipio || u.municipio_id === filtroMunicipio) &&
      (!filtroEscola || (u.escolas_ids ?? []).includes(filtroEscola)),
  );
  const escolasDoFiltro = escolas.filter((s) => !filtroMunicipio || s.municipio_id === filtroMunicipio);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-tinta-suave">
          {lista.length === (usuarios.data?.length ?? 0) ? lista.length : `${lista.length} de ${usuarios.data?.length ?? 0}`} usuário(s).
          Cada pessoa enxerga só o que o papel e as escolas dela permitem.
        </p>
        <div className="flex gap-2">
          <button className="btn-secundario" onClick={recarregar} title="Atualizar">
            <RefreshCw size={16} />
          </button>
          <button className="btn-primario" onClick={() => setAbrirNovo(true)}>
            <Plus size={16} /> Novo usuário
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 mb-4">
        <input className="campo" placeholder="Buscar por nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {superadmin && (
          <select
            className="campo"
            value={filtroMunicipio}
            onChange={(e) => {
              setFiltroMunicipio(e.target.value);
              setFiltroEscola("");
            }}
            aria-label="Filtrar por município"
          >
            <option value="">Todos os municípios</option>
            {municipios.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        )}
        <select className="campo" value={filtroEscola} onChange={(e) => setFiltroEscola(e.target.value)} aria-label="Filtrar por escola">
          <option value="">Todas as escolas</option>
          {escolasDoFiltro.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-papel text-xs uppercase tracking-wide text-tinta-fraca">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Papel</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Onde atua</th>
              <th className="text-left px-4 py-3 hidden sm:table-cell">Último acesso</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-papel-borda">
            {usuarios.isLoading && (
              <tr>
                <td className="px-4 py-4 text-tinta-fraca" colSpan={5}>
                  Carregando…
                </td>
              </tr>
            )}
            {lista.map((u) => (
              <UsuarioLinha
                key={u.id}
                u={u}
                eu={u.id === perfil?.id}
                aberto={aberto === u.id}
                alternar={() => setAberto(aberto === u.id ? null : u.id)}
                municipios={municipios}
                escolas={escolas}
                superadmin={superadmin}
                aoRedefinir={() => setRedefinindo(u)}
                aoBloquear={(b) => bloquear(u, b)}
                aoSalvo={() => {
                  aoOk("Usuário atualizado");
                  recarregar();
                }}
                aoErro={aoErro}
              />
            ))}
          </tbody>
        </table>
      </div>

      {redefinindo && (
        <RedefinirSenha
          u={redefinindo}
          aoFechar={() => setRedefinindo(null)}
          aoFeito={(senha, eEmail) => {
            const u = redefinindo;
            setRedefinindo(null);
            recarregar();
            aoErro(
              eEmail
                ? `Senha de ${u.nome} redefinida.\n\nA nova senha é o próprio e-mail da pessoa:\n${senha}\n\nEla será lembrada de trocar em "Meu perfil".`
                : `Senha de ${u.nome} redefinida.\n\nNova senha:\n${senha}\n\nAnote e envie por um canal seguro. Ela não será mostrada de novo.`,
            );
          }}
          aoErro={aoErro}
        />
      )}

      {abrirNovo && (
        <NovoUsuario
          municipios={municipios}
          escolas={escolas}
          superadmin={superadmin}
          municipioPadrao={perfil?.municipio_id ?? municipios[0]?.id ?? ""}
          aoFechar={() => setAbrirNovo(false)}
          aoCriado={(senha, nome) => {
            setAbrirNovo(false);
            recarregar();
            aoErro(`Usuário ${nome} criado.\n\nSenha inicial:\n${senha}\n\nAnote e envie por um canal seguro. Ela não será mostrada de novo.`);
          }}
          aoErro={aoErro}
        />
      )}
    </div>
  );
}

function UsuarioLinha({
  u,
  eu,
  aberto,
  alternar,
  municipios,
  escolas,
  superadmin,
  aoRedefinir,
  aoBloquear,
  aoSalvo,
  aoErro,
}: {
  u: Usuario;
  eu: boolean;
  aberto: boolean;
  alternar: () => void;
  municipios: Municipio[];
  escolas: Escola[];
  superadmin: boolean;
  aoRedefinir: () => void;
  aoBloquear: (b: boolean) => void;
  aoSalvo: () => void;
  aoErro: (m: string) => void;
}) {
  const [nome, setNome] = useState(u.nome);
  const [papel, setPapel] = useState<Papel>(u.papel);
  const [municipioId, setMunicipioId] = useState(u.municipio_id ?? "");
  const [escolasIds, setEscolasIds] = useState<string[]>(u.escolas_ids ?? (u.escola_id ? [u.escola_id] : []));
  const [ocupado, setOcupado] = useState(false);
  const precisaEscola = PAPEL_PRECISA_ESCOLA.includes(u.papel);
  const semEscola = precisaEscola && (u.escolas_nomes?.length ?? 0) === 0;

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const { error } = await supabase.rpc("admin_atualiza_usuario", {
      p_id: u.id,
      p_nome: nome.trim(),
      p_papel: papel,
      p_municipio: municipioId || null,
      p_escolas: PAPEL_PRECISA_ESCOLA.includes(papel) ? escolasIds : [],
    });
    setOcupado(false);
    if (error) return aoErro(traduz(error.message));
    aoSalvo();
  }

  return (
    <>
      <tr className={clsx("hover:bg-papel/60", u.bloqueado && "opacity-60")}>
        <td className="px-4 py-3">
          <div className="font-medium">
            {u.nome} {eu && <span className="chip bg-marca-suave text-marca ml-1">você</span>}
            {u.bloqueado && <span className="chip bg-erro-suave text-erro ml-1">bloqueado</span>}
            {u.trocar_senha && <span className="chip bg-sol-fundo text-sol ml-1">senha inicial</span>}
          </div>
          <div className="text-xs text-tinta-fraca">{u.email}</div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">{NOME_PAPEL[u.papel]}</td>
        <td className="px-4 py-3 hidden lg:table-cell text-tinta-suave">
          {semEscola ? (
            <span className="chip bg-erro-suave text-erro">sem escola: não enxerga nada</span>
          ) : precisaEscola ? (
            u.escolas_nomes!.join(", ")
          ) : u.papel === "superadmin" ? (
            "Todos os municípios"
          ) : (
            `Todas as escolas de ${u.municipio ?? "(sem município)"}`
          )}
        </td>
        <td className="px-4 py-3 hidden sm:table-cell text-tinta-suave">
          {u.ultimo_acesso ? formatarDataHora(u.ultimo_acesso) : "nunca entrou"}
        </td>
        <td className="px-4 py-3 text-right">
          <button className="btn-fantasma !py-1.5 !px-2.5" onClick={alternar} aria-expanded={aberto}>
            <Pencil size={14} /> {aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </td>
      </tr>
      {aberto && (
        <tr className="bg-papel/50">
          <td colSpan={5} className="px-4 py-4">
            <form onSubmit={salvar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="rotulo">Nome</label>
                <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} />
              </div>
              <div>
                <label className="rotulo">Papel</label>
                <select className="campo" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                  {(Object.keys(NOME_PAPEL) as Papel[])
                    .filter((p) => superadmin || p !== "superadmin")
                    .map((p) => (
                      <option key={p} value={p}>
                        {NOME_PAPEL[p]}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="rotulo">Município</label>
                <select
                  className="campo"
                  value={municipioId}
                  onChange={(e) => {
                    setMunicipioId(e.target.value);
                    setEscolasIds([]);
                  }}
                  disabled={!superadmin}
                >
                  {!municipioId && <option value="">Escolha…</option>}
                  {municipios.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rotulo">Escolas em que atua</label>
                <EscolhaEscolas
                  papel={papel}
                  escolas={escolas.filter((s) => s.municipio_id === municipioId)}
                  marcadas={escolasIds}
                  aoMudar={setEscolasIds}
                />
              </div>
              <p className="ajuda !mt-0 sm:col-span-2 lg:col-span-4">{ALCANCE_PAPEL[papel]}</p>
              <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2 justify-end">
                <button type="button" className="btn-secundario" onClick={aoRedefinir}>
                  <KeyRound size={16} /> Redefinir senha
                </button>
                {!eu && (
                  <button type="button" className="btn-secundario" onClick={() => aoBloquear(!u.bloqueado)}>
                    {u.bloqueado ? <CircleCheck size={16} /> : <Ban size={16} />}
                    {u.bloqueado ? "Desbloquear" : "Bloquear"}
                  </button>
                )}
                <button className="btn-primario" disabled={ocupado}>
                  {ocupado ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </form>
            <HistoricoDoUsuario id={u.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function NovoUsuario({
  municipios,
  escolas,
  superadmin,
  municipioPadrao,
  aoFechar,
  aoCriado,
  aoErro,
}: {
  municipios: Municipio[];
  escolas: Escola[];
  superadmin: boolean;
  municipioPadrao: string;
  aoFechar: () => void;
  aoCriado: (senha: string, nome: string) => void;
  aoErro: (m: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<Papel>("professor_regente");
  const [municipioId, setMunicipioId] = useState(municipioPadrao);
  const [escolasIds, setEscolasIds] = useState<string[]>([]);
  const [senha, setSenha] = useState(gerarSenha());
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.trim()) return aoErro("Informe nome e e-mail.");
    if (!municipioId) return aoErro("Escolha o município.");
    if (senha.length < 8) return aoErro("A senha precisa ter pelo menos 8 caracteres.");
    const precisa = PAPEL_PRECISA_ESCOLA.includes(papel);
    if (precisa && escolasIds.length === 0) return aoErro("Marque pelo menos uma escola. Sem escola, esta pessoa não enxerga nenhum estudante.");
    setOcupado(true);
    const { error } = await supabase.rpc("admin_cria_usuario", {
      p_email: email.trim(),
      p_senha: senha,
      p_nome: nome.trim(),
      p_papel: papel,
      p_municipio: municipioId,
      p_escolas: precisa ? escolasIds : [],
    });
    setOcupado(false);
    if (error) return aoErro(traduz(error.message));
    aoCriado(senha, nome.trim());
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-tinta/40 p-4">
      <form onSubmit={criar} className="card w-full max-w-lg p-6 sm:p-8">
        <h2 className="text-xl">Novo usuário</h2>
        <p className="text-sm text-tinta-suave mt-1 mb-5">A pessoa entra com o e-mail e a senha inicial, sem confirmação por e-mail.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="rotulo">Nome</label>
            <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo">E-mail</label>
            <input className="campo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="rotulo">Papel</label>
            <select className="campo" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              {(Object.keys(NOME_PAPEL) as Papel[])
                .filter((p) => superadmin || p !== "superadmin")
                .map((p) => (
                  <option key={p} value={p}>
                    {NOME_PAPEL[p]}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="rotulo">Município</label>
            <select
              className="campo"
              value={municipioId}
              onChange={(e) => {
                setMunicipioId(e.target.value);
                setEscolasIds([]);
              }}
              disabled={!superadmin}
            >
              {municipios.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo">Escolas em que atua</label>
            <EscolhaEscolas
              papel={papel}
              escolas={escolas.filter((s) => s.municipio_id === municipioId)}
              marcadas={escolasIds}
              aoMudar={setEscolasIds}
            />
            <p className="ajuda">{ALCANCE_PAPEL[papel]}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo">Senha inicial</label>
            <div className="flex gap-2">
              <input className="campo font-mono" value={senha} onChange={(e) => setSenha(e.target.value)} />
              <button type="button" className="btn-secundario shrink-0" onClick={() => setSenha(gerarSenha())}>
                Gerar
              </button>
            </div>
            <p className="ajuda">Envie por um canal seguro. A pessoa é lembrada de trocar em "Meu perfil".</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={ocupado}>
            {ocupado ? "Criando…" : "Criar usuário"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Redefinir a senha de uma pessoa ---------------- */

function RedefinirSenha({
  u,
  aoFechar,
  aoFeito,
  aoErro,
}: {
  u: Usuario;
  aoFechar: () => void;
  aoFeito: (senha: string, eEmail: boolean) => void;
  aoErro: (m: string) => void;
}) {
  const email = (u.email ?? "").trim().toLowerCase();
  // já vem com o e-mail, que é a senha inicial combinada; dá para digitar outra ou gerar uma aleatória
  const [senha, setSenha] = useState(email);
  const [ocupado, setOcupado] = useState(false);
  const curta = senha.length < 8;

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (curta) return aoErro("A senha precisa ter pelo menos 8 caracteres.");
    setOcupado(true);
    const { error } = await supabase.rpc("admin_redefine_senha", { p_id: u.id, p_senha: senha });
    setOcupado(false);
    if (error) return aoErro(traduz(error.message));
    aoFeito(senha, senha === email);
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-tinta/40 p-4">
      <form onSubmit={confirmar} className="card w-full max-w-lg p-6 sm:p-8">
        <h2 className="text-xl">Redefinir senha</h2>
        <p className="text-sm text-tinta-suave mt-1 mb-5 break-words">
          {u.nome} · {u.email}
        </p>
        <label className="rotulo" htmlFor="nova-senha">
          Nova senha
        </label>
        <input
          id="nova-senha"
          className="campo font-mono"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoFocus
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-secundario !py-1.5 text-sm" onClick={() => setSenha(email)}>
            Usar o e-mail da pessoa
          </button>
          <button type="button" className="btn-secundario !py-1.5 text-sm" onClick={() => setSenha(gerarSenha())}>
            Gerar uma aleatória
          </button>
        </div>
        <p className="ajuda">
          {curta
            ? "A senha precisa ter pelo menos 8 caracteres."
            : senha === email
              ? 'A senha será o próprio e-mail, em letras minúsculas. A pessoa é lembrada de trocar em "Meu perfil".'
              : 'A senha antiga deixa de valer na hora. A pessoa é lembrada de trocar em "Meu perfil".'}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button className="btn-primario" disabled={ocupado || curta}>
            <KeyRound size={16} /> {ocupado ? "Redefinindo…" : "Redefinir senha"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Escolas em que a pessoa atua ---------------- */

function EscolhaEscolas({
  papel,
  escolas,
  marcadas,
  aoMudar,
}: {
  papel: Papel;
  escolas: Escola[];
  marcadas: string[];
  aoMudar: (ids: string[]) => void;
}) {
  if (!PAPEL_PRECISA_ESCOLA.includes(papel)) {
    return (
      <p className="campo bg-papel text-sm text-tinta-suave">
        {papel === "superadmin" ? "Todos os municípios" : "Todas as escolas do município"}
      </p>
    );
  }
  if (escolas.length === 0) return <p className="campo bg-papel text-sm text-tinta-suave">Este município ainda não tem escolas.</p>;
  return (
    <div className="rounded-2xl border border-papel-borda bg-white px-3 py-2 max-h-44 overflow-auto space-y-1">
      {escolas.map((s) => (
        <label key={s.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
          <input
            type="checkbox"
            className="accent-marca w-4 h-4 shrink-0"
            checked={marcadas.includes(s.id)}
            onChange={(e) => aoMudar(e.target.checked ? [...marcadas, s.id] : marcadas.filter((x) => x !== s.id))}
          />
          {s.nome}
        </label>
      ))}
    </div>
  );
}

/* ---------------- Histórico de uma pessoa (dentro do usuário aberto) ---------------- */

function HistoricoDoUsuario({ id }: { id: string }) {
  const [dias, setDias] = useState(30);
  const [aberto, setAberto] = useState<number | null>(null);
  const historico = useQuery({
    queryKey: ["admin-historico", id, dias],
    queryFn: async () => {
      const desde = new Date(Date.now() - dias * 864e5).toISOString();
      const { data, error } = await supabase.rpc("admin_atividade", { p_desde: desde, p_quem: id, p_limite: 300 });
      if (error) throw error;
      return data as Atividade[];
    },
  });
  const lista = historico.data ?? [];
  const rotulos = useRotulos();
  const entradas = lista.filter((a) => a.acao === "acesso.login" || a.acao === "acesso.sessao");
  const acoes = lista.filter((a) => !a.acao.startsWith("acesso."));

  return (
    <div className="mt-5 border-t border-papel-borda pt-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h4 className="font-medium flex items-center gap-2">
          <History size={16} className="text-marca" /> Histórico desta pessoa
        </h4>
        <select className="campo !w-auto !py-1.5 text-xs" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={365}>Último ano</option>
        </select>
        <span className="text-xs text-tinta-fraca ml-auto">
          {entradas.length} entrada(s) · {acoes.length} ação(ões)
          {entradas[0] && <> · último acesso {formatarDataHora(entradas[0].quando)}</>}
        </span>
      </div>
      {historico.isLoading && <p className="text-sm text-tinta-fraca">Carregando…</p>}
      {!historico.isLoading && lista.length === 0 && <p className="text-sm text-tinta-fraca">Nada registrado neste período.</p>}
      {lista.length > 0 && (
        <div className="rounded-2xl border border-papel-borda bg-white overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-papel-borda">
              {lista.map((a, i) => (
                <AtividadeLinha key={i} a={a} aberto={aberto === i} alternar={() => setAberto(aberto === i ? null : i)} rotulos={rotulos} semQuem />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Atividade ---------------- */

function AtividadeLista({ aoErro }: { aoErro: (m: string) => void }) {
  const [dias, setDias] = useState(7);
  const [quem, setQuem] = useState("");
  const [aberto, setAberto] = useState<number | null>(null);

  const usuarios = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: async () => (await supabase.rpc("admin_usuarios")).data as Usuario[],
  });

  const atividade = useQuery({
    queryKey: ["admin-atividade", dias, quem],
    queryFn: async () => {
      const desde = new Date(Date.now() - dias * 864e5).toISOString();
      const { data, error } = await supabase.rpc("admin_atividade", { p_desde: desde, p_quem: quem || null, p_limite: 500 });
      if (error) {
        aoErro(error.message);
        throw error;
      }
      return data as Atividade[];
    },
  });

  const lista = atividade.data ?? [];
  const rotulos = useRotulos();
  const resumo = useMemo(() => {
    const porPessoa = new Map<string, number>();
    lista.forEach((a) => porPessoa.set(a.quem_nome ?? a.quem_email ?? "sistema", (porPessoa.get(a.quem_nome ?? a.quem_email ?? "sistema") ?? 0) + 1));
    return [...porPessoa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [lista]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="rotulo">Período</label>
          <select className="campo" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={1}>Hoje</option>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={365}>Último ano</option>
          </select>
        </div>
        <div>
          <label className="rotulo">Pessoa</label>
          <select className="campo" value={quem} onChange={(e) => setQuem(e.target.value)}>
            <option value="">Todas</option>
            {(usuarios.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secundario" onClick={() => atividade.refetch()}>
          <RefreshCw size={16} /> Atualizar
        </button>
        <p className="text-xs text-tinta-fraca ml-auto">
          {lista.length} registro(s){lista.length >= 500 ? " (mostrando os 500 mais recentes)" : ""}
        </p>
      </div>

      {resumo.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {resumo.map(([n, q]) => (
            <span key={n} className="chip bg-white border border-papel-borda">
              {n}: {q}
            </span>
          ))}
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-papel text-xs uppercase tracking-wide text-tinta-fraca">
            <tr>
              <th className="text-left px-3 sm:px-4 py-3">Quando</th>
              <th className="text-left px-3 sm:px-4 py-3">Quem</th>
              <th className="text-left px-3 sm:px-4 py-3">O que fez</th>
              <th className="text-left px-3 sm:px-4 py-3 hidden md:table-cell">Detalhe</th>
              <th className="px-1.5 sm:px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-papel-borda">
            {atividade.isLoading && (
              <tr>
                <td className="px-4 py-4 text-tinta-fraca" colSpan={5}>
                  Carregando…
                </td>
              </tr>
            )}
            {!atividade.isLoading && lista.length === 0 && (
              <tr>
                <td className="px-4 py-4 text-tinta-fraca" colSpan={5}>
                  Nada registrado neste período.
                </td>
              </tr>
            )}
            {lista.map((a, i) => (
              <AtividadeLinha key={i} a={a} aberto={aberto === i} alternar={() => setAberto(aberto === i ? null : i)} rotulos={rotulos} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AtividadeLinha({
  a,
  aberto,
  alternar,
  rotulos,
  semQuem,
}: {
  a: Atividade;
  aberto: boolean;
  alternar: () => void;
  rotulos: Rotulos;
  semQuem?: boolean;
}) {
  // abre quando há algo a contar: detalhe gravado ou um alvo que dá para situar (estudante, documento, usuário)
  const temDetalhe = (!!a.detalhe && Object.keys(a.detalhe).length > 0) || !!partesDoAlvo(a.alvo).id;
  return (
    <>
      <tr className="hover:bg-papel/60 cursor-pointer" onClick={temDetalhe ? alternar : undefined}>
        <td className="px-3 sm:px-4 py-2.5 sm:whitespace-nowrap text-tinta-suave">{formatarDataHora(a.quando)}</td>
        {!semQuem && (
          <td className="px-3 sm:px-4 py-2.5">
            <div className="font-medium">{a.quem_nome ?? a.quem_email ?? "sistema"}</div>
          </td>
        )}
        <td className="px-3 sm:px-4 py-2.5">
          <span
            className={clsx(
              "chip",
              a.origem === "auth" ? "bg-sol-fundo text-sol" : a.acao.endsWith(".delete") ? "bg-erro-suave text-erro" : "bg-marca-fundo text-marca",
            )}
          >
            {rotuloAcao(a.acao)}
          </span>
        </td>
        <td className="px-3 sm:px-4 py-2.5 hidden md:table-cell text-xs text-tinta-fraca">{resumoDetalhe(a, rotulos)}</td>
        <td className="px-1.5 sm:px-2 py-2.5 text-tinta-fraca">{temDetalhe && (aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</td>
      </tr>
      {aberto && temDetalhe && (
        <tr className="bg-papel/50">
          <td colSpan={semQuem ? 4 : 5} className="px-3 sm:px-4 py-3">
            <DetalheAmigavel a={a} rotulos={rotulos} />
          </td>
        </tr>
      )}
    </>
  );
}

const NOME_FORMULARIO: Record<string, string> = {
  "ficha-observacao": "Ficha de Observação",
  "entrevista-familia": "Conversa com a Família",
  "estudo-de-caso": "Estudo de Caso",
  "documento-unificado": "Documento Unificado (PAEE e PEI)",
};

function resumoDetalhe(a: Atividade, rotulos: Rotulos): string {
  const d = a.detalhe ?? {};
  const alvo = partesDoAlvo(a.alvo);
  if (a.origem === "auth") return typeof d.navegador === "string" ? aparelho(d.navegador) : "";
  if (a.acao.startsWith("tela.") || a.acao.startsWith("acesso.")) {
    const partes: string[] = [];
    if (typeof d.formulario === "string") partes.push(NOME_FORMULARIO[d.formulario] ?? d.formulario);
    const estudanteId = alvo.tabela === "estudantes" ? alvo.id : typeof d.estudante === "string" ? d.estudante : null;
    const estudante = estudanteId ? rotulos.nomes.get(estudanteId) : undefined;
    if (estudante) partes.push(estudante);
    else if (typeof d.codigo === "string") partes.push("estudante " + d.codigo);
    if (typeof d.navegador === "string") partes.push(d.navegador.includes("iPhone") ? "iPhone" : d.navegador.includes("Android") ? "Android" : "computador");
    return partes.join(" · ");
  }
  const depois = (d.depois ?? d.antes) as Record<string, unknown> | undefined;
  if (!depois) {
    // ações da IA e do painel: situa pelo alvo, nunca mostra o código interno
    const nome = alvo.id ? rotulos.nomes.get(alvo.id) : undefined;
    if (nome) return nome;
    if (typeof d.campo === "string") return ROTULO_PERGUNTA.get(d.campo) ?? "";
    if (Array.isArray(d.campos)) return `${d.campos.length} ${d.campos.length === 1 ? "campo" : "campos"}`;
    return typeof d.email === "string" ? d.email : "";
  }
  const partes: string[] = [];
  if (typeof depois.codigo === "string") partes.push(depois.codigo);
  if (typeof depois.nome === "string") partes.push(depois.nome);
  if (typeof depois.formulario_id === "string") partes.push(NOME_FORMULARIO[depois.formulario_id as string] ?? (depois.formulario_id as string));
  if (typeof depois.status === "string") partes.push(SITUACAO[depois.status] ?? depois.status);
  if (typeof depois.email === "string") partes.push(depois.email);
  return partes.join(" · ");
}

/* ---------------- Detalhe amigável ----------------
   Nada de JSON na tela (pedidos de 24/11: "parece um json solto, como um
   bug para usuário leigo"). Cada registro vira linhas em português.
   Registros do banco: contexto (estudante, escola, formulário, com o UUID
   trocado pelo nome) e "o que mudou / foi cadastrado / foi excluído".
   Ações de tela: o alvo ("estudantes:<id>", "respostas:<id>"...) é
   resolvido para estudante, escola, turma, documento e situação. */

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Campos que são encanamento do banco, não informação para quem lê
const CAMPOS_OCULTOS = new Set([
  "id", "quem", "criado_por", "respondido_por", "criado_em", "atualizado_em",
  "formulario_versao", "respostas_ids", "prompt_versao", "modelo", "esquema", "perfil_id",
  "tentativas", "resposta_id", "sintese_id", "tabela",
]);

// Chaves que situam o registro (aparecem sempre, mesmo sem mudança)
const CAMPOS_CONTEXTO = ["estudante", "estudante_id", "formulario", "formulario_id", "escola_id", "turma_id", "municipio_id"] as const;

const ROTULO_CAMPO: Record<string, string> = {
  nome: "Nome",
  codigo: "Código do estudante",
  ano_turma: "Ano da turma",
  email: "E-mail",
  papel: "Papel",
  status: "Situação",
  formulario: "Documento",
  formulario_id: "Documento",
  versao: "Versão",
  titulo: "Título",
  descricao: "Descrição",
  uf: "UF",
  ip: "Rede (IP)",
  navegador: "Aparelho",
  municipio_id: "Município",
  escola_id: "Escola",
  escolas: "Escolas",
  turma_id: "Turma",
  estudante: "Estudante",
  estudante_id: "Estudante",
  arquivado: "Arquivado",
  bloqueado: "Bloqueado",
  trocar_senha: "Precisa trocar a senha",
  data_nascimento: "Nascimento",
  responsavel_nome: "Responsável",
  responsavel_contato: "Contato do responsável",
  dados: "Respostas preenchidas",
  conteudo: "Conteúdo",
  saida: "Texto gerado pelo sistema",
  revisao: "Revisão da equipe",
  texto: "Texto",
  ativo: "Ativo",
  modo: "Como foi gerado",
  trechos: "Trechos dos materiais consultados",
  campo: "Campo do documento",
  campos: "Campos",
  com_orientacao: "Escreveu o que queria diferente",
  decisao: "Decisão da equipe",
  comentario: "Comentário",
  tipo: "Tipo",
};

const SITUACAO: Record<string, string> = {
  rascunho: "rascunho",
  concluido: "concluído",
  validado: "validado",
  gerada: "gerada",
  revisada: "revisada",
  descartada: "descartada",
};

const MODO: Record<string, string> = {
  ia: "com inteligência artificial",
  regras: "pelas regras do Instituto, sem inteligência artificial",
  busca: "busca nos materiais, sem inteligência artificial",
  guia: "orientação do guia, sem inteligência artificial",
};

const TIPO_SINTESE: Record<string, string> = {
  "estudo-de-caso": "sugestões para o Estudo de Caso",
  documento: "proposta de PAEE e PEI",
};

// id da pergunta → rótulo (as versões mais novas vencem)
const ROTULO_PERGUNTA: Map<string, string> = (() => {
  const mapa = new Map<string, string>();
  for (const f of [...TODAS_VERSOES].sort((a, b) => a.versao - b.versao)) {
    for (const s of f.secoes) for (const p of s.perguntas) mapa.set(p.id, p.rotulo);
  }
  return mapa;
})();

function rotuloCampo(chave: string): string {
  return ROTULO_CAMPO[chave] ?? chave.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Traduz o user agent para "computador · Chrome", "iPhone · Safari" etc. */
function aparelho(ua: string): string {
  const onde = ua.includes("iPhone") ? "iPhone" : ua.includes("iPad") ? "iPad" : ua.includes("Android") ? "celular Android" : "computador";
  const nav = ua.includes("Edg") ? "Edge" : ua.includes("OPR") || ua.includes("Opera") ? "Opera"
    : ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "";
  return nav ? `${onde} · ${nav}` : onde;
}

interface EstudanteRotulo {
  nome: string | null;
  codigo: string;
  escola_id: string;
  turma_id: string | null;
  ano_turma: string | null;
}
interface Rotulos {
  /** UUID → nome legível (estudantes, escolas, turmas, municípios, pessoas) */
  nomes: Map<string, string>;
  estudantes: Map<string, EstudanteRotulo>;
}

/** Nomes para trocar os códigos internos por gente, escola e turma. Chamar uma vez por lista. */
function useRotulos(): Rotulos {
  const estudantes = useQuery({
    queryKey: ["rotulos-estudantes-completo"],
    staleTime: 60_000,
    queryFn: async () =>
      (await supabase.from("estudantes").select("id, codigo, escola_id, turma_id, ano_turma, estudantes_identidade(nome)")).data as
        | { id: string; codigo: string; escola_id: string; turma_id: string | null; ano_turma: string | null; estudantes_identidade: { nome: string } | null }[]
        | null,
  });
  const municipios = useQuery({
    queryKey: ["municipios"],
    queryFn: async () => (await supabase.from("municipios").select("*").order("nome")).data as Municipio[],
  });
  const escolas = useQuery({
    queryKey: ["escolas"],
    queryFn: async () => (await supabase.from("escolas").select("*").order("nome")).data as Escola[],
  });
  const turmas = useQuery({
    queryKey: ["turmas"],
    queryFn: async () => (await supabase.from("turmas").select("*").order("nome")).data as Turma[],
  });
  const usuarios = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: async () => (await supabase.rpc("admin_usuarios")).data as Usuario[],
  });
  return useMemo(() => {
    const nomes = new Map<string, string>();
    const porEstudante = new Map<string, EstudanteRotulo>();
    for (const e of estudantes.data ?? []) {
      const nome = e.estudantes_identidade?.nome ?? null;
      nomes.set(e.id, nome ? `${nome} (${e.codigo})` : e.codigo);
      porEstudante.set(e.id, { nome, codigo: e.codigo, escola_id: e.escola_id, turma_id: e.turma_id, ano_turma: e.ano_turma });
    }
    for (const m of municipios.data ?? []) nomes.set(m.id, m.nome);
    for (const e of escolas.data ?? []) nomes.set(e.id, e.nome);
    for (const t of turmas.data ?? []) nomes.set(t.id, t.nome);
    for (const u of usuarios.data ?? []) nomes.set(u.id, u.nome);
    return { nomes, estudantes: porEstudante };
  }, [estudantes.data, municipios.data, escolas.data, turmas.data, usuarios.data]);
}

/** Separa "tabela:id" do alvo; id só vale se for um UUID. */
function partesDoAlvo(alvo: string | null): { tabela: string; id: string | null; novo: boolean } {
  const [tabela, resto = ""] = (alvo ?? "").split(":");
  return { tabela, id: UUID_RX.test(resto) ? resto : null, novo: resto === "nova" };
}

/** Valor legível para uma chave; null = não vale a pena mostrar. */
function valorAmigavel(chave: string, valor: unknown, nomes: Map<string, string>): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (chave === "navegador") return aparelho(String(valor));
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  if (chave === "status" && typeof valor === "string") return SITUACAO[valor] ?? valor;
  if (chave === "modo" && typeof valor === "string") return MODO[valor] ?? valor;
  if (chave === "papel" && typeof valor === "string") return (NOME_PAPEL as Record<string, string>)[valor] ?? valor;
  if ((chave === "formulario" || chave === "formulario_id") && typeof valor === "string") {
    return NOME_FORMULARIO[valor] ?? valor;
  }
  if (chave === "campo" && typeof valor === "string") return ROTULO_PERGUNTA.get(valor) ?? valor;
  if (chave === "tipo" && typeof valor === "string") return TIPO_SINTESE[valor] ?? valor;
  if (Array.isArray(valor)) {
    const itens = valor
      .filter((x): x is string => typeof x === "string")
      .map((x) => (UUID_RX.test(x) ? nomes.get(x) : chave === "campos" ? ROTULO_PERGUNTA.get(x) ?? x : x))
      .filter((x): x is string => !!x);
    if (!itens.length) return valor.length ? `${valor.length} ${valor.length === 1 ? "item" : "itens"}` : null;
    return itens.join("; ");
  }
  if (typeof valor === "object") {
    const n = Object.keys(valor as object).length;
    return n ? `${n} campo${n === 1 ? "" : "s"} preenchido${n === 1 ? "" : "s"}` : null;
  }
  const s = String(valor);
  if (UUID_RX.test(s)) return nomes.get(s) ?? null; // UUID sem nome conhecido só confunde
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return formatarDataHora(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`).toLocaleDateString("pt-BR");
  return s;
}

function LinhasDeDetalhe({ titulo, linhas }: { titulo?: string; linhas: [string, ReactNode][] }) {
  if (!linhas.length) return null;
  return (
    <div>
      {titulo && <p className="text-[11px] uppercase tracking-wide text-tinta-fraca mb-1">{titulo}</p>}
      <div className="space-y-0.5">
        {linhas.map(([rotulo, valor], i) => (
          <div key={i} className="flex flex-wrap gap-x-2 text-sm mb-1 sm:mb-0">
            <span className="w-full sm:w-44 shrink-0 font-medium text-tinta-suave">{rotulo}</span>
            <span className="min-w-0 break-words">{valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Estudante, escola e turma a partir do id do estudante. */
function linhasDoEstudante(id: string | null | undefined, rotulos: Rotulos): [string, ReactNode][] {
  const e = id ? rotulos.estudantes.get(id) : undefined;
  if (!e) return [];
  const linhas: [string, ReactNode][] = [["Estudante", e.nome ? `${e.nome} (${e.codigo})` : e.codigo]];
  const escola = rotulos.nomes.get(e.escola_id);
  if (escola) linhas.push(["Escola", escola]);
  const turma = (e.turma_id && rotulos.nomes.get(e.turma_id)) || e.ano_turma;
  if (turma) linhas.push(["Turma", turma]);
  return linhas;
}

interface DoAlvo {
  estudante_id: string;
  formulario_id?: string;
  status?: string;
  tipo?: string;
}

function DetalheAmigavel({ a, rotulos }: { a: Atividade; rotulos: Rotulos }) {
  const { nomes } = rotulos;
  const d = a.detalhe ?? {};
  const antes = (d.antes ?? null) as Record<string, unknown> | null;
  const depois = (d.depois ?? null) as Record<string, unknown> | null;
  const registro = depois ?? antes;
  const alvo = partesDoAlvo(a.alvo);

  // Ação de tela sobre um documento ou uma síntese: busca de qual estudante é
  const doAlvo = useQuery({
    queryKey: ["atividade-alvo", a.alvo],
    enabled: !registro && !!alvo.id && (alvo.tabela === "respostas" || alvo.tabela === "sinteses_ia"),
    staleTime: 60_000,
    queryFn: async (): Promise<DoAlvo | null> => {
      if (alvo.tabela === "respostas") {
        const { data } = await supabase.from("respostas").select("estudante_id, formulario_id, status").eq("id", alvo.id!).maybeSingle();
        return data as DoAlvo | null;
      }
      const { data } = await supabase.from("sinteses_ia").select("estudante_id, tipo").eq("id", alvo.id!).maybeSingle();
      return data as DoAlvo | null;
    },
  });

  const linha = (chave: string, bruto: unknown): [string, ReactNode] | null => {
    const v = valorAmigavel(chave, bruto, nomes);
    return v === null ? null : [rotuloCampo(chave), v];
  };

  let blocos: ReactNode;
  if (registro) {
    // Registro de banco (cadastro, alteração ou exclusão feita pelos gatilhos)
    const estudanteId = alvo.tabela === "estudantes" ? alvo.id : typeof registro.estudante_id === "string" ? registro.estudante_id : null;
    const doEstudante = linhasDoEstudante(estudanteId, rotulos);
    const jaSituado = doEstudante.length ? ["estudante", "estudante_id", "escola_id", "turma_id"] : [];
    const contexto = doEstudante.concat(
      CAMPOS_CONTEXTO
        .filter((c) => !jaSituado.includes(c))
        .map((c) => linha(c, registro[c]))
        .filter((x): x is [string, ReactNode] => x !== null),
    );

    const visiveis = (obj: Record<string, unknown>) =>
      Object.keys(obj).filter((c) => !CAMPOS_OCULTOS.has(c) && !(CAMPOS_CONTEXTO as readonly string[]).includes(c));

    if (antes && depois) {
      const mudadas = visiveis(depois)
        .concat(visiveis(antes))
        .filter((c, i, arr) => arr.indexOf(c) === i)
        .filter((c) => JSON.stringify(antes[c]) !== JSON.stringify(depois[c]));
      const linhas = mudadas
        .map((c): [string, ReactNode] => [
          rotuloCampo(c),
          <>
            <span className="text-tinta-fraca">{valorAmigavel(c, antes[c], nomes) ?? "vazio"}</span>
            <span className="mx-1.5 text-tinta-fraca">→</span>
            <span className="font-medium">{valorAmigavel(c, depois[c], nomes) ?? "vazio"}</span>
          </>,
        ]);
      blocos = (
        <>
          <LinhasDeDetalhe linhas={contexto} />
          <LinhasDeDetalhe titulo="O que mudou" linhas={linhas} />
          {!linhas.length && <p className="text-sm text-tinta-fraca">Só campos internos mudaram (nada visível).</p>}
        </>
      );
    } else {
      const titulo = depois ? "O que foi cadastrado" : "O que foi excluído";
      const linhas = visiveis(registro)
        .map((c) => linha(c, registro[c]))
        .filter((x): x is [string, ReactNode] => x !== null);
      blocos = (
        <>
          <LinhasDeDetalhe linhas={contexto} />
          <LinhasDeDetalhe titulo={titulo} linhas={linhas} />
          {!contexto.length && !linhas.length && <p className="text-sm text-tinta-fraca">Sem mais detalhes deste registro.</p>}
        </>
      );
    }
  } else {
    // Ação de tela, de acesso ou da IA: situa (estudante, escola, turma, documento) e traduz o resto
    const estudanteId =
      alvo.tabela === "estudantes" ? alvo.id : typeof d.estudante === "string" ? d.estudante : doAlvo.data?.estudante_id ?? null;
    const linhas = linhasDoEstudante(estudanteId, rotulos);
    const temEstudante = linhas.length > 0;

    if (alvo.tabela === "perfis" && alvo.id && nomes.get(alvo.id)) linhas.push(["Usuário", nomes.get(alvo.id)!]);

    const formulario = typeof d.formulario === "string" ? d.formulario : doAlvo.data?.formulario_id;
    if (formulario) linhas.push(["Documento", NOME_FORMULARIO[formulario] ?? formulario]);
    if (alvo.tabela === "respostas") {
      const situacao = alvo.novo ? "novo, ainda não salvo" : doAlvo.data?.status ? SITUACAO[doAlvo.data.status] ?? doAlvo.data.status : null;
      if (situacao) linhas.push(["Situação do documento", situacao]);
    }
    if (alvo.tabela === "sinteses_ia" && doAlvo.data?.tipo) {
      linhas.push(["Sobre", TIPO_SINTESE[doAlvo.data.tipo] ?? doAlvo.data.tipo]);
    }

    for (const c of Object.keys(d)) {
      if (CAMPOS_OCULTOS.has(c) || c === "estudante" || c === "formulario") continue;
      if (c === "codigo" && temEstudante) continue; // o código já aparece junto do nome
      if (c === "campos" && typeof d[c] === "number") {
        linhas.push(["Campos com sugestão", String(d[c])]);
        continue;
      }
      if (c === "campos" && Array.isArray(d[c])) {
        const usados = (d[c] as unknown[]).filter((x): x is string => typeof x === "string").map((x) => ROTULO_PERGUNTA.get(x) ?? x);
        linhas.push([
          "Sugestões usadas",
          <>
            {usados.length} {usados.length === 1 ? "campo" : "campos"}
            <ul className="mt-1 list-disc pl-5 text-tinta-suave">
              {usados.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          </>,
        ]);
        continue;
      }
      const l = linha(c, d[c]);
      if (l) linhas.push(l);
    }

    blocos = linhas.length ? (
      <LinhasDeDetalhe linhas={linhas} />
    ) : (
      <p className="text-sm text-tinta-fraca">{doAlvo.isLoading ? "Carregando…" : "Sem mais detalhes deste registro."}</p>
    );
  }

  return <div className="space-y-3">{blocos}</div>;
}

/* ---------------- Estrutura ---------------- */

function Estrutura({
  municipios,
  escolas,
  turmas,
  superadmin,
  aoErro,
  aoOk,
}: {
  municipios: Municipio[];
  escolas: Escola[];
  turmas: Turma[];
  superadmin: boolean;
  aoErro: (m: string) => void;
  aoOk: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [novoMunicipio, setNovoMunicipio] = useState({ nome: "", uf: "SP" });
  const [novaEscola, setNovaEscola] = useState({ nome: "", municipio_id: municipios[0]?.id ?? "" });
  const [novaTurma, setNovaTurma] = useState({ nome: "", escola_id: escolas[0]?.id ?? "" });
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["municipios"] });
    qc.invalidateQueries({ queryKey: ["escolas"] });
    qc.invalidateQueries({ queryKey: ["turmas"] });
  };

  async function criarMunicipio(e: FormEvent) {
    e.preventDefault();
    if (!novoMunicipio.nome.trim()) return aoErro("Informe o nome do município.");
    const { error } = await supabase.from("municipios").insert({ nome: novoMunicipio.nome.trim(), uf: novoMunicipio.uf });
    if (error) return aoErro(traduz(error.message));
    setNovoMunicipio({ nome: "", uf: "SP" });
    aoOk("Município criado");
    recarregar();
  }
  async function criarEscola(e: FormEvent) {
    e.preventDefault();
    if (!novaEscola.nome.trim() || !novaEscola.municipio_id) return aoErro("Informe o nome e o município da escola.");
    const { error } = await supabase.from("escolas").insert({ nome: novaEscola.nome.trim(), municipio_id: novaEscola.municipio_id });
    if (error) return aoErro(traduz(error.message));
    setNovaEscola({ ...novaEscola, nome: "" });
    aoOk("Escola criada");
    recarregar();
  }
  async function criarTurma(e: FormEvent) {
    e.preventDefault();
    if (!novaTurma.nome.trim() || !novaTurma.escola_id) return aoErro("Informe o nome e a escola da turma.");
    const { error } = await supabase.from("turmas").insert({ nome: novaTurma.nome.trim(), escola_id: novaTurma.escola_id });
    if (error) return aoErro(traduz(error.message));
    setNovaTurma({ ...novaTurma, nome: "" });
    aoOk("Turma criada");
    recarregar();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-5 lg:col-span-2">
        <h2 className="text-lg flex items-center gap-2">
          <Building2 size={18} className="text-marca" /> Como está hoje
        </h2>
        <ul className="mt-3 space-y-3">
          {municipios.map((m) => (
            <li key={m.id}>
              <div className="font-medium">
                {m.nome} <span className="text-tinta-fraca font-normal">({m.uf})</span>
              </div>
              <ul className="ml-4 mt-1 space-y-1 text-sm text-tinta-suave">
                {escolas
                  .filter((s) => s.municipio_id === m.id)
                  .map((s) => (
                    <li key={s.id}>
                      {s.nome}
                      <span className="text-tinta-fraca">
                        {" "}
                        · {turmas.filter((t) => t.escola_id === s.id).map((t) => t.nome).join(", ") || "sem turmas"}
                      </span>
                    </li>
                  ))}
                {escolas.filter((s) => s.municipio_id === m.id).length === 0 && <li className="text-tinta-fraca">sem escolas</li>}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {superadmin && (
        <form onSubmit={criarMunicipio} className="card p-5">
          <h3 className="font-medium mb-3">Novo município</h3>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <input className="campo" placeholder="Nome" value={novoMunicipio.nome} onChange={(e) => setNovoMunicipio({ ...novoMunicipio, nome: e.target.value })} />
            <input className="campo uppercase" maxLength={2} value={novoMunicipio.uf} onChange={(e) => setNovoMunicipio({ ...novoMunicipio, uf: e.target.value.toUpperCase() })} />
          </div>
          <button className="btn-primario mt-3">Criar município</button>
        </form>
      )}

      <form onSubmit={criarEscola} className="card p-5">
        <h3 className="font-medium mb-3">Nova escola</h3>
        <select className="campo mb-2" value={novaEscola.municipio_id} onChange={(e) => setNovaEscola({ ...novaEscola, municipio_id: e.target.value })}>
          <option value="">Município…</option>
          {municipios.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        <input className="campo" placeholder="Nome da escola" value={novaEscola.nome} onChange={(e) => setNovaEscola({ ...novaEscola, nome: e.target.value })} />
        <button className="btn-primario mt-3">Criar escola</button>
      </form>

      <form onSubmit={criarTurma} className="card p-5">
        <h3 className="font-medium mb-3">Nova turma</h3>
        <select className="campo mb-2" value={novaTurma.escola_id} onChange={(e) => setNovaTurma({ ...novaTurma, escola_id: e.target.value })}>
          <option value="">Escola…</option>
          {escolas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </select>
        <input className="campo" placeholder="Ex.: 3º ano A" value={novaTurma.nome} onChange={(e) => setNovaTurma({ ...novaTurma, nome: e.target.value })} />
        <button className="btn-primario mt-3">Criar turma</button>
      </form>
    </div>
  );
}

/* ---------------- utilitários ---------------- */

function gerarSenha() {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return [...a].map((n) => letras[n % letras.length]).join("");
}

function traduz(m: string) {
  if (/sem permissão/i.test(m)) return "Você não tem permissão para esta ação.";
  if (/já existe usuário/i.test(m)) return "Já existe um usuário com este e-mail.";
  if (/pelo menos 8/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/e-mail inválido/i.test(m)) return "O e-mail parece inválido.";
  if (/não pertence ao município/i.test(m)) return "Há escola marcada que não é do município escolhido.";
  if (/próprio papel/i.test(m)) return "Você não pode alterar o próprio papel.";
  if (/row-level security/i.test(m)) return "Você não tem permissão para esta ação.";
  return m;
}
