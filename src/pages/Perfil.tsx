import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, UserRound, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import { NOME_PAPEL } from "@/lib/tipos";
import { registrar } from "@/lib/auditoria";
import Aviso from "@/components/Aviso";
import Toast from "@/components/Toast";

export default function Perfil() {
  const { perfil, sessao, recarregarPerfil } = useAuth();
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirma, setSenhaConfirma] = useState("");
  const [ocupado, setOcupado] = useState<"nome" | "senha" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (perfil) setNome(perfil.nome);
  }, [perfil]);

  const lugar = useQuery({
    queryKey: ["meu-lugar", perfil?.municipio_id, perfil?.escola_id],
    enabled: !!perfil,
    queryFn: async () => {
      const [m, s] = await Promise.all([
        perfil?.municipio_id ? supabase.from("municipios").select("nome").eq("id", perfil.municipio_id).maybeSingle() : null,
        perfil?.escola_id ? supabase.from("escolas").select("nome").eq("id", perfil.escola_id).maybeSingle() : null,
      ]);
      return { municipio: m?.data?.nome ?? null, escola: s?.data?.nome ?? null };
    },
  });

  async function salvarNome(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return setAviso("Informe o seu nome.");
    if (!perfil) return;
    setOcupado("nome");
    const { error } = await supabase.from("perfis").update({ nome: nome.trim() }).eq("id", perfil.id);
    setOcupado(null);
    if (error) return setAviso("Não foi possível salvar: " + error.message);
    await recarregarPerfil();
    setToast("Nome atualizado");
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    const email = sessao?.user.email;
    if (!email) return;
    if (!senhaAtual) return setAviso("Informe a senha atual.");
    if (senhaNova.length < 8) return setAviso("A nova senha precisa ter pelo menos 8 caracteres.");
    if (senhaNova !== senhaConfirma) return setAviso("A confirmação não confere com a nova senha.");
    if (senhaNova === senhaAtual) return setAviso("A nova senha precisa ser diferente da atual.");
    setOcupado("senha");
    try {
      // confere a senha atual antes de trocar
      const conferencia = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
      if (conferencia.error) throw new Error("A senha atual está incorreta.");
      const { error } = await supabase.auth.updateUser({ password: senhaNova });
      if (error) throw error;
      await registrar("acesso.user_updated_password");
      setSenhaAtual("");
      setSenhaNova("");
      setSenhaConfirma("");
      setToast("Senha alterada");
    } catch (err) {
      setAviso((err as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  if (!perfil) return <p className="text-sm text-tinta-fraca">Carregando…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl sm:text-3xl">Meu perfil</h1>
      <p className="text-sm text-tinta-suave mt-1 mb-6">Seus dados na plataforma e a troca de senha.</p>

      <form onSubmit={salvarNome} className="card p-5 sm:p-7 mb-4">
        <h2 className="text-lg flex items-center gap-2">
          <UserRound size={18} className="text-marca" /> Dados
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="rotulo">Nome</label>
            <input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
          </div>
          <div>
            <label className="rotulo">E-mail</label>
            <input className="campo bg-papel" value={sessao?.user.email ?? ""} readOnly />
            <p className="ajuda">O e-mail é o seu acesso; para trocar, fale com a administração.</p>
          </div>
          <div>
            <label className="rotulo">Papel</label>
            <input className="campo bg-papel" value={NOME_PAPEL[perfil.papel]} readOnly />
          </div>
          <div>
            <label className="rotulo">Município</label>
            <input className="campo bg-papel" value={lugar.data?.municipio ?? "—"} readOnly />
          </div>
          <div>
            <label className="rotulo">Escola</label>
            <input className="campo bg-papel" value={lugar.data?.escola ?? "Todas do município"} readOnly />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn-primario" disabled={ocupado === "nome"}>
            <Save size={16} /> {ocupado === "nome" ? "Salvando…" : "Salvar nome"}
          </button>
        </div>
      </form>

      <form onSubmit={trocarSenha} className="card p-5 sm:p-7">
        <h2 className="text-lg flex items-center gap-2">
          <KeyRound size={18} className="text-marca" /> Trocar senha
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="rotulo">Senha atual</label>
            <input
              className="campo"
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="rotulo">Nova senha</label>
            <input
              className="campo"
              type="password"
              value={senhaNova}
              onChange={(e) => setSenhaNova(e.target.value)}
              autoComplete="new-password"
            />
            <p className="ajuda">Pelo menos 8 caracteres.</p>
          </div>
          <div>
            <label className="rotulo">Confirmar nova senha</label>
            <input
              className="campo"
              type="password"
              value={senhaConfirma}
              onChange={(e) => setSenhaConfirma(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button className="btn-primario" disabled={ocupado === "senha"}>
            <KeyRound size={16} /> {ocupado === "senha" ? "Trocando…" : "Trocar senha"}
          </button>
        </div>
      </form>

      <Aviso mensagem={aviso} aoFechar={() => setAviso(null)} />
      <Toast mensagem={toast} aoSumir={() => setToast(null)} />
    </div>
  );
}
