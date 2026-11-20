export type Papel = "superadmin" | "gestao" | "direcao" | "coordenacao" | "professor_aee" | "professor_regente";

export const NOME_PAPEL: Record<Papel, string> = {
  superadmin: "Administrador da plataforma",
  gestao: "Secretaria de Educação",
  direcao: "Direção da escola",
  coordenacao: "Coordenação pedagógica",
  professor_aee: "Professor(a) de AEE",
  professor_regente: "Professor(a) regente",
};

// O que cada papel enxerga (a regra de verdade está no banco, migração 0013)
export const ALCANCE_PAPEL: Record<Papel, string> = {
  superadmin: "Enxerga todos os municípios.",
  gestao: "Enxerga todas as escolas do município e administra os usuários dele.",
  direcao: "Enxerga todos os estudantes das escolas marcadas.",
  coordenacao: "Enxerga todos os estudantes das escolas marcadas.",
  professor_aee: "Enxerga todos os estudantes das escolas marcadas.",
  professor_regente: "Enxerga só os estudantes que cadastrou ou em cuja equipe foi incluído, nas escolas marcadas.",
};

// papéis cujo alcance depende das escolas marcadas
export const PAPEL_PRECISA_ESCOLA: Papel[] = ["direcao", "coordenacao", "professor_aee", "professor_regente"];

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  municipio_id: string | null;
  escola_id: string | null;
  trocar_senha?: boolean;
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
