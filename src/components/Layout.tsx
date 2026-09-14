import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Users, FileText, LogOut, Settings, UserRound } from "lucide-react";
import { useAuth } from "@/contexts/Auth";
import { NOME_PAPEL } from "@/lib/tipos";
import { registrar } from "@/lib/auditoria";
import clsx from "clsx";

const itens = [
  { para: "/estudantes", rotulo: "Estudantes", Icone: Users },
  { para: "/formularios", rotulo: "Formulários", Icone: FileText },
  { para: "/admin", rotulo: "Administração", Icone: Settings, soAdmin: true },
];

export default function Layout() {
  const { perfil, sair } = useAuth();
  const navegar = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-papel-borda">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
          <NavLink to="/estudantes" className="flex items-center shrink-0" aria-label="Início">
            <img src="/logo-instituto.svg" alt="Instituto Inclusão na Escola" className="h-9 hidden sm:block" />
            <img src="/marca-instituto.svg" alt="Instituto Inclusão na Escola" className="h-9 sm:hidden" />
          </NavLink>
          <nav className="flex items-center gap-1 ml-2">
            {itens.filter((i) => !i.soAdmin || perfil?.papel === "superadmin" || perfil?.papel === "gestao").map(({ para, rotulo, Icone }) => (
              <NavLink
                key={para}
                to={para}
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-marca-fundo text-marca" : "text-tinta hover:bg-papel",
                  )
                }
              >
                <Icone size={16} />
                <span className="hidden sm:inline">{rotulo}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {perfil && (
              <NavLink
                to="/perfil"
                title="Meu perfil"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3 transition-colors",
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
              className="btn-secundario !px-3"
              title="Sair"
              onClick={async () => {
                await registrar("acesso.logout");
                navegar("/entrar", { replace: true });
                await sair();
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8 flex-1">
        <Outlet />
      </main>
      <footer className="no-print text-center text-xs text-tinta-fraca py-6">
        Programa Decola AEE · Instituto Inclusão na Escola · protótipo
      </footer>
    </div>
  );
}
