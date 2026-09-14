import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/tipos";

interface Auth {
  sessao: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  sair: () => Promise<void>;
  recarregarPerfil: () => Promise<void>;
}

const Ctx = createContext<Auth>({
  sessao: null,
  perfil: null,
  carregando: true,
  sair: async () => {},
  recarregarPerfil: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregarPerfil(userId: string | undefined) {
    if (!userId) {
      setPerfil(null);
      return;
    }
    const { data } = await supabase.from("perfis").select("*").eq("id", userId).maybeSingle();
    setPerfil((data as Perfil) ?? null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSessao(data.session);
      await carregarPerfil(data.session?.user.id);
      setCarregando(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s);
      // sem await aqui: o supabase-js trava se a callback chamar a API de forma síncrona
      setTimeout(() => carregarPerfil(s?.user.id), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider
      value={{
        sessao,
        perfil,
        carregando,
        sair: async () => {
          await supabase.auth.signOut();
        },
        recarregarPerfil: () => carregarPerfil(sessao?.user.id),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
