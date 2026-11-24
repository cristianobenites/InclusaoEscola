import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Users, FileText, LogOut, Settings, UserRound, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/Auth";
import { NOME_PAPEL } from "@/lib/tipos";
import { registrar } from "@/lib/auditoria";
import clsx from "clsx";

const itens = [
  { para: "/estudantes", rotulo: "Estudantes", curto: "Estudantes", Icone: Users },
  { para: "/formularios", rotulo: "Modelos", curto: "Modelos", Icone: FileText },
  { para: "/admin", rotulo: "Administração", curto: "Admin", Icone: Settings, soAdmin: true },
];

export default function Layout() {
  const { perfil, sair } = useAuth();
  const navegar = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-papel-borda">
        <div className="mx-auto max-w-6xl px-3 sm:px-4 h-16 flex items-center gap-2 sm:gap-4">
          <NavLink to="/estudantes" className="flex items-center shrink-0" aria-label="Início">
            <img src="/logo-instituto.svg" alt="Instituto Inclusão na Escola" className="h-9 hidden sm:block" />
            <img src="/marca-instituto.svg" alt="Instituto Inclusão na Escola" className="h-9 sm:hidden" />
          </NavLink>
          <nav className="flex items-center gap-0.5 sm:gap-1 sm:ml-2">
            {itens.filter((i) => !i.soAdmin || perfil?.papel === "superadmin" || perfil?.papel === "gestao").map(({ para, rotulo, curto, Icone }) => (
              <NavLink
                key={para}
                to={para}
                className={({ isActive }) =>
                  clsx(
                    // no celular o nome vai embaixo do ícone: só o ícone não dizia onde se preenche
                    "flex flex-col sm:flex-row items-center gap-0.5 sm:gap-2 rounded-2xl sm:rounded-full px-1.5 sm:px-3.5 py-1 sm:py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-marca-fundo text-marca" : "text-tinta hover:bg-papel",
                  )
                }
              >
                <Icone size={16} />
                <span className="hidden sm:inline">{rotulo}</span>
                <span className="sm:hidden text-[10px] leading-none">{curto}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            {perfil && (
              <NavLink
                to="/perfil"
                title="Meu perfil"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-1.5 sm:pr-3 transition-colors",
                    isActive ? "bg-marca-fundo" : "hover:bg-papel",
                  )
                }
              >
                <span className="grid place-items-center w-8 h-8 rounded-full bg-marca-suave text-marca">
                  <UserRound size={16} />
                </span>
                <span className="text-right leading-tight hidden sm:block">
                  <span className="block text-sm font-medium">{perfil.nome}</span>
                  <span className="block text-xs text-tinta-fraca">{NOME_PAPEL[perfil.papel]}</span>
                </span>
              </NavLink>
            )}
            <button
              className="btn-secundario !px-3 sm:!px-4 shrink-0"
              title="Sair do sistema"
              onClick={async () => {
                await registrar("acesso.logout");
                navegar("/entrar", { replace: true });
                await sair();
              }}
            >
              <LogOut size={16} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8 flex-1">
        {perfil?.trocar_senha && (
          <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-sol/50 bg-sol-fundo/50 px-4 py-3">
            <ShieldAlert size={18} className="text-sol shrink-0" />
            <p className="text-sm flex-1 min-w-[14rem]">
              Você ainda usa a senha inicial. Para proteger os dados dos estudantes, crie uma senha só sua.
            </p>
            <NavLink to="/perfil" className="btn-secundario !py-1.5 text-sm">
              Trocar senha
            </NavLink>
          </div>
        )}
        <Outlet />
      </main>
      <footer className="no-print text-center text-xs text-tinta-fraca py-6">
        Programa Decola AEE · Instituto Inclusão na Escola · protótipo
      </footer>
    </div>
  );
}
