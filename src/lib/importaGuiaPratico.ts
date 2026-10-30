// Lê o texto gerado pelo "Guia Prático: Estudo de Caso na Prática" (botão "Copiar texto")
// e devolve as respostas do formulário estudo-de-caso v2.
import type { Respostas } from "@/formularios/tipos";
import { acharFormulario } from "@/formularios";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// grupos do guia → campo de múltipla escolha + campo de observação
const GRUPOS: Record<string, [string, string]> = {
  "interacao e participacao": ["participacao", "participacao_obs"],
  "desempenho pedagogico": ["desempenho", "desempenho_obs"],
  "registro e escrita": ["registro", "registro_obs"],
  "autonomia e rotina familiar": ["autonomia", "autonomia_obs"],
  "adequacao logistica": ["logistica", ""],
  "adequacao pedagogica": ["pedagogica", ""],
};
const BARREIRAS: Record<string, [number, string]> = {
  "arquitetonica": [0, "b_arquitetonica"],
  "comunicacao": [1, "b_comunicacao"],
  "pedagogica": [2, "b_pedagogica"],
  "tecnologica": [3, "b_tecnologica"],
  "atitudinal": [4, "b_atitudinal"],
};
const APOIOS: Record<string, string> = {
  humano: "apoio_humano",
  comunicacao: "apoio_comunicacao",
  material: "apoio_material",
  "tempo ambiente": "apoio_tempo",
};

export interface ResultadoImportacao {
  respostas: Respostas;
  reconhecidos: number;
  naoReconhecidos: string[];
  cabecalho: { estudante?: string; turma?: string; profissional?: string; data?: string };
}

export function importarGuiaPratico(texto: string): ResultadoImportacao {
  const form = acharFormulario("estudo-de-caso", 2)!;
  const perguntas = form.secoes.flatMap((s) => s.perguntas);
  const opcoesDe = (id: string) => perguntas.find((p) => p.id === id)?.opcoes ?? [];
  const casar = (id: string, item: string) => {
    const n = norm(item);
    return opcoesDe(id).find((o) => {
      const on = norm(o);
      return on === n || on.startsWith(n.slice(0, 40)) || n.startsWith(on.slice(0, 40));
    });
  };

  const r: Respostas = {};
  const cab: ResultadoImportacao["cabecalho"] = {};
  const naoRec: string[] = [];
  let rec = 0;
  const marcar = (id: string, valor: string) => {
    const lista = (r[id] as string[] | undefined) ?? [];
    if (!lista.includes(valor)) lista.push(valor);
    r[id] = lista;
    rec++;
  };
  const anotar = (id: string, valor: string) => {
    const atual = (r[id] as string | undefined) ?? "";
    r[id] = atual ? atual + "\n" + valor : valor;
    rec++;
  };

  let grupo: [string, string] | null = null;
  let secao = "";
  let barreiraAtual: [number, string] | null = null;

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;

    const mEst = linha.match(/^ESTUDO DE CASO\s*[—–-]\s*(.+)$/i);
    if (mEst) { cab.estudante = mEst[1].trim(); continue; }
    const mMeta = linha.match(/^Turma:\s*(.*?)\s*\|\s*Profissional:\s*(.*?)\s*\|\s*Data:\s*(.*)$/i);
    if (mMeta) {
      cab.turma = mMeta[1]; cab.profissional = mMeta[2]; cab.data = mMeta[3];
      if (mMeta[2] && mMeta[2] !== "-") { r.profissional = mMeta[2]; rec++; }
      const d = mMeta[3].match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (d) { r.data = `${d[3]}-${d[2]}-${d[1]}`; rec++; }
      continue;
    }
    if (/^[—–-]\s*Elaborado com/i.test(linha)) continue;

    const n = norm(linha);
    if (/^\d\.\s/.test(linha) || /^(2 barreiras no contexto escolar|3 potencialidades e suportes|4 estrategias e recursos)/.test(n)) {
      secao = n.replace(/^\d\s*/, ""); grupo = null; barreiraAtual = null; continue;
    }
    if (GRUPOS[n]) { grupo = GRUPOS[n]; barreiraAtual = null; continue; }
    if (n === "apoios necessarios") { grupo = null; secao = "apoios"; continue; }

    const mHf = linha.match(/^Hiperfocos\/interesses:\s*(.*)$/i);
    if (mHf) { if (mHf[1] && mHf[1] !== "-") { r.hiperfocos = mHf[1]; rec++; } continue; }
    const mHb = linha.match(/^Habilidades:\s*(.*)$/i);
    if (mHb) { if (mHb[1] && mHb[1] !== "-") { r.habilidades = mHb[1]; rec++; } continue; }
    const mOut = linha.match(/^Outras estrat[ée]gias:\s*(.*)$/i);
    if (mOut) { anotar("outras_estrategias", mOut[1]); continue; }

    const mObs = linha.match(/^Obs\.?:\s*(.*)$/i);
    if (mObs && grupo && grupo[1]) { anotar(grupo[1], mObs[1]); continue; }

    const mBar = linha.match(/^•\s*Barreira\s+(.+?)(?::\s*(.*))?$/i);
    if (mBar) {
      const chave = Object.keys(BARREIRAS).find((k) => norm(mBar[1]).includes(k));
      if (chave) {
        barreiraAtual = BARREIRAS[chave];
        marcar("barreiras", opcoesDe("barreiras")[barreiraAtual[0]]);
        if (mBar[2]) anotar(barreiraAtual[1], mBar[2]);
      } else naoRec.push(linha);
      continue;
    }
    if (/^Impacto:/i.test(linha) && barreiraAtual) continue; // impacto é texto fixo do guia

    const mItem = linha.match(/^•\s*(.+)$/);
    if (mItem) {
      const item = mItem[1].trim();
      if (secao === "apoios") {
        const mAp = item.match(/^(.+?):\s*(.+)$/);
        const campo = mAp && APOIOS[norm(mAp[1])];
        const op = campo && casar(campo, mAp![2]);
        if (campo && op) marcar(campo, op); else naoRec.push(linha);
        continue;
      }
      if (grupo) {
        const op = casar(grupo[0], item);
        if (op) marcar(grupo[0], op); else naoRec.push(linha);
        continue;
      }
      naoRec.push(linha);
      continue;
    }
    if (/^nada marcado/i.test(linha) || /^nenhuma barreira/i.test(linha)) continue;
    naoRec.push(linha);
  }
  return { respostas: r, reconhecidos: rec, naoReconhecidos: naoRec, cabecalho: cab };
}
