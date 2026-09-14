export type Papel = "superadmin" | "gestao" | "coordenacao" | "professor_aee" | "professor_regente";

export const NOME_PAPEL: Record<Papel, string> = {
  superadmin: "Administrador da plataforma",
  gestao: "Gestão municipal",
  coordenacao: "Coordenação pedagógica",
  professor_aee: "Professor(a) de AEE",
  professor_regente: "Professor(a) regente",
};

// papéis que uma pessoa pode escolher ao criar conta (superadmin só por convite)
export const PAPEIS_ABERTOS: Papel[] = ["gestao", "coordenacao", "professor_aee", "professor_regente"];

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  municipio_id: string | null;
  escola_id: string | null;
}

export interface Escola {
  id: string;
  nome: string;
  municipio_id: string;
}

export interface Turma {
  id: string;
  escola_id: string;
  nome: string;
  ano_letivo: number;
}

export interface Estudante {
  id: string;
  escola_id: string;
  turma_id: string | null;
  codigo: string;
  ano_turma: string | null;
  arquivado: boolean;
  criado_em: string;
  estudantes_identidade?: { nome: string; data_nascimento: string | null; responsavel_nome: string | null } | null;
  turmas?: { nome: string } | null;
}

export interface Resposta {
  id: string;
  estudante_id: string;
  formulario_id: string;
  formulario_versao: number;
  respondido_por: string | null;
  status: "rascunho" | "concluido";
  dados: Record<string, unknown>;
  criado_em: string;
  atualizado_em: string;
}
