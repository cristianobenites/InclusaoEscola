import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/Auth";
import Aviso from "@/components/Aviso";
import { registrar } from "@/lib/auditoria";

export default function Entrar() {
  const { sessao, carregando } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!carregando && sessao) return <Navigate to="/estudantes" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return setAviso("Informe e-mail e senha.");
    setOcupado(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (error) throw error;
      await registrar("acesso.login", undefined, { navegador: navigator.userAgent.slice(0, 120) });
      navegar("/estudantes", { replace: true });
    } catch (err) {
      setAviso(traduzErro((err as Error).message));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* Painel no estilo do site do Instituto: fundo claro, bolinhas nos cantos, texto centralizado e livre */}
      <aside className="relative hidden lg:flex flex-col overflow-hidden bg-papel p-12">
        <span className="bolha w-48 h-48 bg-verde/80 -left-24 top-[42%]" />
        <span className="bolha w-24 h-24 bg-sol-vivo right-12 top-24" />
        <span className="bolha w-56 h-56 bg-rosa/70 -right-24 -bottom-20" />
        <span className="bolha w-16 h-16 bg-marca left-16 bottom-16" />
        <img src="/logo-instituto.svg" alt="Instituto Inclusão na Escola" className="relative h-12 self-start" />
        <div className="relative flex-1 flex flex-col items-center justify-center text-center px-10">
          <div className="max-w-md">
            <h1 className="text-4xl leading-tight">Ajudando escolas a incluir quem pensa e aprende diferente.</h1>
            <p className="mt-5 text-tinta-suave leading-relaxed">
              Ficha de Observação, Conversa com a Família e síntese com apoio de IA, seguindo os Cadernos Pedagógicos da
              Política Nacional de Educação Especial Inclusiva.
            </p>
          </div>
        </div>
        <p className="relative text-xs text-tinta-fraca text-center">Programa Decola AEE · protótipo</p>
      </aside>

      <main className="relative grid place-items-center p-6 overflow-hidden">
        {/* fundo da parte branca: padrão de rabiscos de inclusão cobrindo tudo + cena das pessoas com balões */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage: "url(/padrao-inclusao.svg)",
            backgroundSize: "480px 480px",
            maskImage: "linear-gradient(to bottom, black 0%, black 34%, transparent 50%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 34%, transparent 50%)",
          }}
        />
        <img
          src="/ilustracao-inclusao.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-x-0 bottom-0 max-h-[52%] w-full object-contain object-bottom opacity-[0.17]"
        />
        <form onSubmit={enviar} className="relative card w-full max-w-md p-7 sm:p-9 bg-white/95">
          <img src="/logo-instituto.svg" alt="Instituto Inclusão na Escola" className="h-10 mb-7 lg:hidden" />
          <h2 className="text-xl mb-1">Entrar</h2>
          <p className="text-sm text-tinta-suave mb-6">Use o e-mail e a senha que você recebeu.</p>
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
            autoComplete="current-password"
          />
          <button className="btn-primario w-full" disabled={ocupado}>
            {ocupado ? "Aguarde…" : "Entrar"}
          </button>
          <p className="ajuda mt-4 text-center">
            Ainda não tem acesso ou esqueceu a senha? Fale com a Secretaria de Educação do seu município.
          </p>
          <p className="ajuda mt-2 text-center">
            Dados de estudantes são sensíveis. O acesso é pessoal: não compartilhe a senha.
          </p>
        </form>
      </main>
      <Aviso mensagem={aviso} aoFechar={() => setAviso(null)} />
    </div>
  );
}

function traduzErro(m: string) {
  if (/invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/banned/i.test(m)) return "Este acesso está bloqueado. Fale com a Secretaria de Educação.";
  if (/rate limit/i.test(m)) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  return m;
}
