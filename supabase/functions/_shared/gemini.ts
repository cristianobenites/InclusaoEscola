// Chamada ao Gemini com lista de modelos de reserva: o plano gratuito devolve 503 ("high demand")
// ou 429 (cota) com frequência, então tentamos o modelo configurado e, se falhar, os seguintes.
// Devolve o texto gerado e o nome do modelo que respondeu.

// Pseudonimização: troca o nome do estudante (nome completo e cada parte com inicial maiúscula,
// com 3+ letras) por "o estudante" em qualquer texto, inclusive dentro de objetos e listas.
export function anonimizador(nome: string | null) {
  const partes = new Set<string>();
  if (nome && nome.trim().length > 2) {
    partes.add(nome.trim());
    for (const t of nome.split(/\s+/)) if (t.length >= 3 && /^\p{Lu}/u.test(t)) partes.add(t);
  }
  const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regs = [...partes].sort((a, b) => b.length - a.length).map((t) => new RegExp(`(?<!\\p{L})(?:[oa]\\s+)?${escapar(t)}(?!\\p{L})`, "giu"));
  const texto = (v: string) => regs.reduce((acc, r) => acc.replace(r, "o estudante"), v);
  const fundo = (v: unknown): unknown => {
    if (typeof v === "string") return texto(v);
    if (Array.isArray(v)) return v.map(fundo);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, fundo(x)]));
    return v;
  };
  return { texto, fundo };
}

export const MODELOS_RESERVA = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
];

// Chave e modelo: primeiro os Secrets da função (GEMINI_API_KEY / GEMINI_MODELO); se não houver,
// o Vault do banco (função public.segredo, só service_role).
let cacheVault: Record<string, string | null> | null = null;
async function doVault(nome: string): Promise<string | null> {
  if (!cacheVault) cacheVault = {};
  if (nome in cacheVault) return cacheVault[nome];
  try {
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await sb.rpc("segredo", { p_nome: nome });
    cacheVault[nome] = typeof data === "string" && data.trim() ? data.trim() : null;
  } catch {
    cacheVault[nome] = null;
  }
  return cacheVault[nome];
}

export async function chaveGemini(): Promise<string | null> {
  return Deno.env.get("GEMINI_API_KEY")?.trim() || (await doVault("GEMINI_API_KEY"));
}

export async function modelosParaTentar(): Promise<string[]> {
  const preferido = Deno.env.get("GEMINI_MODELO")?.trim() || (await doVault("GEMINI_MODELO"));
  const lista = preferido ? [preferido, ...MODELOS_RESERVA.filter((m) => m !== preferido)] : [...MODELOS_RESERVA];
  return lista;
}

export async function gerarTexto(
  chave: string,
  sistema: string,
  usuario: string,
  opcoes: { maxOutputTokens?: number; temperature?: number } = {},
): Promise<{ texto: string; modelo: string; tentativas: string[] }> {
  const TEMPO_MAXIMO_MS = 75_000; // por tentativa; a função inteira precisa caber em 150 s
  const corpo = {
    systemInstruction: { parts: [{ text: sistema }] },
    contents: [{ role: "user", parts: [{ text: usuario }] }],
    generationConfig: { temperature: opcoes.temperature ?? 0.3, responseMimeType: "application/json", maxOutputTokens: opcoes.maxOutputTokens ?? 8192 },
  };
  const tentativas: string[] = [];
  const modelos = await modelosParaTentar();
  let ultimoErro = "";
  for (let rodada = 0; rodada < 2; rodada++) {
    for (const modelo of modelos) {
      const inicio = Date.now();
      const dur = () => `${((Date.now() - inicio) / 1000).toFixed(1)}s`;
      let resp: Response;
      try {
        resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
          body: JSON.stringify(corpo),
          signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
        });
      } catch (e) {
        ultimoErro = `${modelo}: ${(e as Error).name === "TimeoutError" ? "tempo esgotado" : (e as Error).message} (${dur()})`;
        tentativas.push(ultimoErro); console.log("gemini", ultimoErro);
        continue;
      }
      if (resp.ok) {
        const j = await resp.json();
        const texto = j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        if (texto.trim()) {
          tentativas.push(`${modelo}: ok (${dur()})`); console.log("gemini", tentativas.at(-1));
          return { texto, modelo, tentativas };
        }
        tentativas.push(`${modelo}: resposta vazia (${j.candidates?.[0]?.finishReason ?? "?"}, ${dur()})`);
        continue;
      }
      const msg = (await resp.text()).slice(0, 200);
      ultimoErro = `${modelo}: ${resp.status} ${msg} (${dur()})`;
      tentativas.push(ultimoErro); console.log("gemini", ultimoErro);
      // 404 (modelo indisponível), 429 (cota), 5xx (instabilidade): passa ao próximo. Outros erros (chave, pedido) param.
      if (![404, 429, 500, 502, 503, 504].includes(resp.status)) throw new Error(`Gemini ${ultimoErro}`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Gemini indisponível em todos os modelos. Última tentativa: ${ultimoErro}`);
}
