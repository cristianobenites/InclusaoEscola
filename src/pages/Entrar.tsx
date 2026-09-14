import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { School } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import { NOME_PAPEL, type Papel } from "@/lib/tipos";
import Aviso from "@/components/Aviso";
import clsx from "clsx";

export default function Entrar() {
  const { sessao, carregando } = useAuth();
  const navegar = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<Papel>("professor_regente");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!carregando && sessao) return <Navigate to="/estudantes" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return setAviso("Informe e-mail e senha.");
    if (modo === "criar" && !nome.trim()) return setAviso("Informe o seu nome.");
    setOcupado(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: senha,
          options: { data: { nome: nome.trim(), papel } },
        });
        if (error) throw error;
        if (!data.session) {
          setAviso("Conta criada. Confirme o e-mail que enviamos para entrar.");
          setModo("entrar");
          return;
        }
      }
      navegar("/estudantes", { replace: true });
    } catch (err) {
      setAviso(traduzErro((err as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <aside className="hidden lg:flex flex-col justify-between bg-marca-forte text-white p-12">
        <div className="flex items-center gap-3 font-extrabold text-lg">
          <span className="grid place-items-center w-10 h-10 rounded-xl bg-white/15">
            <School size={20} />
          </span>
          Inclusão na Escola
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl leading-tight">Do registro em sala ao Estudo de Caso, com a equipe no comando.</h1>
          <p className="mt-4 text-white/80 text-sm leading-relaxed">
            Ficha de Observação, Conversa com a Família e síntese com apoio de IA, seguindo os Cadernos Pedagógicos da
            Política Nacional de Educação Especial Inclusiva.
          </p>
        </div>
        <p className="text-xs text-white/60">Programa Decola AEE · protótipo</p>
      </aside>

      <main className="grid place-items-center p-6">
        <form onSubmit={enviar} className="card w-full max-w-md p-7 sm:p-9">
          <div className="lg:hidden flex items-center gap-2 font-extrabold mb-6">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-marca text-white">
              <School size={18} />
            </span>
            Inclusão na Escola
          </div>
          <div className="flex rounded-xl bg-papel p-1 mb-6">
            {(["entrar", "criar"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModo(m)}
                className={clsx(
                  "flex-1 rounded-lg py-2 text-sm font-semibold transition-colors",
                  modo === m ? "bg-white shadow-card text-tinta" : "text-tinta-fraca",
                )}
              >
                {m === "entrar" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {modo === "criar" && (
            <>
              <label className="rotulo">Seu nome</label>
              <input className="campo mb-4" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />
              <label className="rotulo">Seu papel na rede</label>
              <select className="campo mb-4" value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                {(Object.keys(NOME_PAPEL) as Papel[]).map((p) => (
                  <option key={p} value={p}>
                    {NOME_PAPEL[p]}
                  </option>
                ))}
              </select>
            </>
          )}
          <label className="rotulo">E-mail</label>
          <input
            className="campo mb-4"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
          />
          <label className="rotulo">Senha</label>
          <input
            className="campo mb-6"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
          />
          <button className="btn-primario w-full" disabled={ocupado}>
            {ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
          <p className="ajuda mt-4 text-center">
            Dados de estudantes são sensíveis. Use apenas a conta institucional e não compartilhe a senha.
          </p>
        </form>
      </main>
      <Aviso mensagem={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}

function traduzErro(m: string) {
  if (/invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/at least 6/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/already registered/i.test(m)) return "Já existe uma conta com este e-mail.";
  if (/rate limit/i.test(m)) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  return m;
}
