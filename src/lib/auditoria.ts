import { supabase } from "./supabase";

// Registro de ações do lado do app (o banco já registra sozinho inserts/updates/deletes).
// Use para "abriu", "imprimiu", "exportou" e afins. Nunca bloqueia a interface.
export async function registrar(acao: string, alvo?: string, detalhe?: Record<string, unknown>) {
  try {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from("auditoria").insert({ quem: data.user.id, acao, alvo: alvo ?? null, detalhe: detalhe ?? null });
  } catch {
    /* auditoria nunca derruba a tela */
  }
}

// Rótulos em pt-BR para as ações (banco e app)
export function rotuloAcao(acao: string): string {
  const fixos: Record<string, string> = {
    "acesso.login": "Entrou no sistema",
    "acesso.logout": "Saiu do sistema",
    "acesso.user_signedup": "Criou a própria conta",
    "acesso.user_recovery_requested": "Pediu recuperação de senha",
    "acesso.user_updated_password": "Trocou a própria senha",
    "acesso.token_revoked": "Sessão encerrada",
    "usuario.criou": "Criou usuário",
    "usuario.redefiniu_senha": "Redefiniu senha de usuário",
    "usuario.bloqueou": "Bloqueou usuário",
    "usuario.desbloqueou": "Desbloqueou usuário",
    "tela.abriu_estudante": "Abriu a página do estudante",
    "tela.imprimiu": "Imprimiu ou salvou em PDF",
    "tela.abriu_formulario": "Abriu um formulário",
  };
  if (fixos[acao]) return fixos[acao];
  const [tabela, op] = acao.split(".");
  const nomes: Record<string, string> = {
    estudantes: "estudante",
    estudantes_identidade: "identificação do estudante",
    respostas: "resposta de formulário",
    sinteses_ia: "síntese da IA",
    estudos_caso: "Estudo de Caso",
    perfis: "perfil de usuário",
    escolas: "escola",
    turmas: "turma",
    municipios: "município",
  };
  const verbo: Record<string, string> = { insert: "Cadastrou", update: "Alterou", delete: "Excluiu" };
  if (nomes[tabela] && verbo[op]) return `${verbo[op]} ${nomes[tabela]}`;
  return acao;
}
