// Formulários são DADOS (JSON versionado), nunca código. Mudou a pergunta, muda o JSON.

export type TipoPergunta =
  | "texto"
  | "texto_longo"
  | "data"
  | "escolha_unica"
  | "escolha_multipla"
  | "escala" // matriz: linhas x opcoes, uma opção por linha
  | "verificacao" // matriz: linhas x (Sim/Parcial/Não) + detalhe por linha
  | "tabela"; // linhas livres com colunas fixas (ex.: ação, responsável, prazo, situação)

export interface Coluna {
  id: string;
  rotulo: string;
  tipo: "texto" | "data" | "escolha";
  opcoes?: string[];
}

export interface Pergunta {
  id: string;
  rotulo: string;
  tipo: TipoPergunta;
  ajuda?: string;
  opcoes?: string[];
  linhas?: string[];
  permite_outro?: boolean;
  obrigatoria?: boolean;
  descricoes?: Record<string, string>; // texto explicativo por opção (escolha_multipla)
  colunas?: Coluna[]; // só para tipo "tabela"
}

export interface Secao {
  id: string;
  titulo: string;
  descricao?: string;
  somente_equipe?: boolean; // preenchido pela equipe pedagógica, não pelo entrevistado
  perguntas: Pergunta[];
}

export interface Formulario {
  id: string;
  versao: number;
  titulo: string;
  finalidade: string;
  instrucoes: string[];
  secoes: Secao[];
}

export type ValorEscala = Record<string, string>;
export type ValorVerificacao = Record<string, { opcao?: string; detalhe?: string }>;
export type LinhaTabela = Record<string, string>;
export type ValorPergunta = string | string[] | ValorEscala | ValorVerificacao | LinhaTabela[] | undefined;
export type Respostas = Record<string, ValorPergunta>;
