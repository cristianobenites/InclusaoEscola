import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, KeyRound, Ban, CircleCheck, Pencil, RefreshCw, ChevronDown, ChevronUp, Building2 } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import { NOME_PAPEL, type Escola, type Papel, type Turma } from "@/lib/tipos";
import { rotuloAcao } from "@/lib/auditoria";
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

  const usuarios = useQuery({
    queryKey: ["admin-usuarios"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_usuarios");
      if (error) throw error;
      return data as Usuario[];
    },
  });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["admin-usuarios"] });

  async function redefinirSenha(u: Usuario) {
    const senha = gerarSenha();
    const { error } = await supabase.rpc("admin_redefine_senha", { p_id: u.id, p_senha: senha });
    if (error) return aoErro(traduz(error.message));
    aoErro(`Nova senha de ${u.nome}:\n\n${senha}\n\nAnote e envie por um canal seguro. Ela não será mostrada de novo.`);
  }
  async function bloquear(u: Usuario, bloquear: boolean) {
    const { error } = await supabase.rpc("admin_bloqueia", { p_id: u.id, p_bloquear: bloquear });
    if (error) return aoErro(traduz(error.message));
    aoOk(bloquear ? "Usuário bloqueado" : "Usuário desbloqueado");
    recarregar();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-tinta-suave">
          {usuarios.data?.length ?? 0} usuário(s). O cadastro aberto continua existindo; aqui você cria contas com papel e
          escola já definidos.
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

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-papel text-xs uppercase tracking-wide text-tinta-fraca">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Papel</th>
              <th className="text-left px-4 py-3 hidden lg:table-cell">Escola</th>
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
            {(usuarios.data ?? []).map((u) => (
              <UsuarioLinha
                key={u.id}
                u={u}
                eu={u.id === perfil?.id}
                aberto={aberto === u.id}
                alternar={() => setAberto(aberto === u.id ? null : u.id)}
                municipios={municipios}
                escolas={escolas}
                superadmin={superadmin}
                aoRedefinir={() => redefinirSenha(u)}
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
  const [escolaId, setEscolaId] = useState(u.escola_id ?? "");
  const [ocupado, setOcupado] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setOcupado(true);
    const { error } = await supabase.rpc("admin_atualiza_usuario", {
      p_id: u.id,
      p_nome: nome.trim(),
      p_papel: papel,
      p_municipio: municipioId || null,
      p_escola: escolaId || null,
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
          </div>
          <div className="text-xs text-tinta-fraca">{u.email}</div>
        </td>
        <td className="px-4 py-3 hidden md:table-cell">{NOME_PAPEL[u.papel]}</td>
        <td className="px-4 py-3 hidden lg:table-cell text-tinta-suave">{u.escola ?? u.municipio ?? "—"}</td>
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
                    setEscolaId("");
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
              <div>
                <label className="rotulo">Escola</label>
                <select className="campo" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
                  <option value="">Todas do município</option>
                  {escolas
                    .filter((s) => s.municipio_id === municipioId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                </select>
              </div>
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
  const [escolaId, setEscolaId] = useState("");
  const [senha, setSenha] = useState(gerarSenha());
  const [ocupado, setOcupado] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !email.trim()) return aoErro("Informe nome e e-mail.");
    if (!municipioId) return aoErro("Escolha o município.");
    if (senha.length < 8) return aoErro("A senha precisa ter pelo menos 8 caracteres.");
    setOcupado(true);
    const { error } = await supabase.rpc("admin_cria_usuario", {
      p_email: email.trim(),
      p_senha: senha,
      p_nome: nome.trim(),
      p_papel: papel,
      p_municipio: municipioId,
      p_escola: escolaId || null,
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
                setEscolaId("");
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
            <label className="rotulo">Escola</label>
            <select className="campo" value={escolaId} onChange={(e) => setEscolaId(e.target.value)}>
              <option value="">Todas do município</option>
              {escolas
                .filter((s) => s.municipio_id === municipioId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="rotulo">Senha inicial</label>
            <div className="flex gap-2">
              <input className="campo font-mono" value={senha} onChange={(e) => setSenha(e.target.value)} />
              <button type="button" className="btn-secundario shrink-0" onClick={() => setSenha(gerarSenha())}>
                Gerar
              </button>
            </div>
            <p className="ajuda">Envie por um canal seguro. Depois a pessoa pode trocar.</p>
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
              <th className="text-left px-4 py-3">Quando</th>
              <th className="text-left px-4 py-3">Quem</th>
              <th className="text-left px-4 py-3">O que fez</th>
              <th className="text-left px-4 py-3 hidden md:table-cell">Detalhe</th>
              <th className="px-2 py-3" />
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
              <AtividadeLinha key={i} a={a} aberto={aberto === i} alternar={() => setAberto(aberto === i ? null : i)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AtividadeLinha({ a, aberto, alternar }: { a: Atividade; aberto: boolean; alternar: () => void }) {
  const temDetalhe = !!a.detalhe && Object.keys(a.detalhe).length > 0;
  return (
    <>
      <tr className="hover:bg-papel/60 cursor-pointer" onClick={temDetalhe ? alternar : undefined}>
        <td className="px-4 py-2.5 whitespace-nowrap text-tinta-suave">{formatarDataHora(a.quando)}</td>
        <td className="px-4 py-2.5">
          <div className="font-medium">{a.quem_nome ?? a.quem_email ?? "sistema"}</div>
        </td>
        <td className="px-4 py-2.5">
          <span
            className={clsx(
              "chip",
              a.origem === "auth" ? "bg-sol-fundo text-sol" : a.acao.endsWith(".delete") ? "bg-erro-suave text-erro" : "bg-marca-fundo text-marca",
            )}
          >
            {rotuloAcao(a.acao)}
          </span>
        </td>
        <td className="px-4 py-2.5 hidden md:table-cell text-xs text-tinta-fraca">{resumoDetalhe(a)}</td>
        <td className="px-2 py-2.5 text-tinta-fraca">{temDetalhe && (aberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}</td>
      </tr>
      {aberto && temDetalhe && (
        <tr className="bg-papel/50">
          <td colSpan={5} className="px-4 py-3">
            <pre className="text-xs whitespace-pre-wrap break-all max-h-80 overflow-auto">{JSON.stringify(a.detalhe, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  );
}

function resumoDetalhe(a: Atividade): string {
  const d = a.detalhe ?? {};
  if (a.origem === "auth") return (d.ip as string) ?? "";
  const depois = (d.depois ?? d.antes) as Record<string, unknown> | undefined;
  if (!depois) return a.alvo ?? "";
  const partes: string[] = [];
  if (typeof depois.codigo === "string") partes.push(depois.codigo);
  if (typeof depois.nome === "string") partes.push(depois.nome);
  if (typeof depois.formulario_id === "string") partes.push(depois.formulario_id);
  if (typeof depois.status === "string") partes.push(depois.status);
  if (typeof depois.email === "string") partes.push(depois.email);
  return partes.join(" · ") || (a.alvo ?? "");
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
  if (/row-level security/i.test(m)) return "Você não tem permissão para esta ação.";
  return m;
}
