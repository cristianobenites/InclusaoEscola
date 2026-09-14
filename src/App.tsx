import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/contexts/Auth";
import Layout from "@/components/Layout";
import Entrar from "@/pages/Entrar";
import Estudantes from "@/pages/Estudantes";
import Estudante from "@/pages/Estudante";
import Preencher from "@/pages/Preencher";
import Formularios from "@/pages/Formularios";
import Admin from "@/pages/Admin";
import Perfil from "@/pages/Perfil";

function Protegida({ children }: { children: JSX.Element }) {
  const { sessao, carregando } = useAuth();
  if (carregando) {
    return (
      <div className="min-h-screen grid place-items-center text-tinta-fraca text-sm">Carregando…</div>
    );
  }
  if (!sessao) return <Navigate to="/entrar" replace />;
  return children;
}

function SoAdmin({ children }: { children: JSX.Element }) {
  const { perfil, carregando } = useAuth();
  if (carregando || !perfil) return null;
  if (perfil.papel !== "superadmin" && perfil.papel !== "gestao") return <Navigate to="/estudantes" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/entrar" element={<Entrar />} />
      <Route
        path="/"
        element={
          <Protegida>
            <Layout />
          </Protegida>
        }
      >
        <Route index element={<Navigate to="/estudantes" replace />} />
        <Route path="estudantes" element={<Estudantes />} />
        <Route path="estudantes/:id" element={<Estudante />} />
        <Route path="estudantes/:id/preencher/:formularioId" element={<Preencher />} />
        <Route path="estudantes/:id/preencher/:formularioId/:respostaId" element={<Preencher />} />
        <Route path="formularios" element={<Formularios />} />
        <Route path="admin" element={<SoAdmin><Admin /></SoAdmin>} />
        <Route path="perfil" element={<Perfil />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
