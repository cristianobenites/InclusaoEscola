// Síntese: a partir da Ficha de Observação, da Entrevista com a Família e do Estudo de Caso
// concluídos, propõe um Documento Unificado (PAEE + PEI) campo a campo, com justificativa e fonte.
// Sem GEMINI_API_KEY: proposta por regras (mapeamento dos guias do Instituto) + trechos dos Cadernos.
// Com a chave: o modelo redige a proposta no mesmo formato, obrigado a citar fonte e página.
import { createClient } from "npm:@supabase/supabase-js@2";
import { anonimizador, chaveGemini, gerarTexto } from "../_shared/gemini.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
type Dados = Record<string, unknown>;
type Just = { porque: string; fonte?: { titulo: string; pagina: number | null } };
type Trecho = { trecho_id: number; grupo: string; titulo: string; pagina: number | null; texto: string; relevancia: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: quem } = await sb.auth.getUser();
    if (!quem.user) return json({ erro: "não autenticado" }, 401);
    const { estudante_id } = await req.json();

    const { data: resps, error } = await sb.from("respostas").select("*").eq("estudante_id", estudante_id).eq("status", "concluido").order("atualizado_em", { ascending: false });
    if (error) return json({ erro: error.message }, 500);
    const ultima = (id: string) => (resps ?? []).find((r) => r.formulario_id === id);
    const ficha = ultima("ficha-observacao"), entrevista = ultima("entrevista-familia"), estudo = ultima("estudo-de-caso");
    if (!ficha || !entrevista) return json({ erro: "É preciso concluir a Ficha de Observação e a Entrevista com a Família antes." }, 400);

    const { data: ident } = await sb.from("estudantes_identidade").select("nome").eq("estudante_id", estudante_id).maybeSingle();
    const nome = ident?.nome ?? null;
    const limpa = (d: Dados) => anonimizador(nome).fundo(d) as Dados;
    const F = limpa(ficha.dados as Dados), E = limpa(entrevista.dados as Dados), C = estudo ? limpa(estudo.dados as Dados) : {};

    // 1. proposta por regras (sempre; serve de base e de fallback)
    const { campos, justificativas } = regras(F, E, C);

    // 2. trechos dos Cadernos para os temas centrais da proposta
    const temas = [
      "plano de atendimento educacional especializado organização frequência sala de recursos",
      "plano educacional individualizado objetivos metas habilidade BNCC",
      ...(txt(campos.barreiras_descricao) ? [txt(campos.barreiras_descricao).slice(0, 200)] : []),
      ...(arr(campos.recursos_ta).length ? ["tecnologia assistiva " + arr(campos.recursos_ta).join(" ")] : []),
      ...(arr(campos.comunicacao).some((x) => /Alternativa/.test(x)) ? ["comunicação alternativa aumentativa prancha pictogramas"] : []),
    ];
    const trechos = new Map<number, Trecho>();
    for (const t of temas) {
      const { data } = await sb.rpc("busca_conhecimento", { p_consulta: t, p_limite: 3, p_grupos: ["caderno", "regra"] });
      for (const x of (data ?? []) as Trecho[]) if (!trechos.has(x.trecho_id)) trechos.set(x.trecho_id, x);
    }
    const lista = [...trechos.values()].sort((a, b) => b.relevancia - a.relevancia).slice(0, 10);
    // liga as páginas dos cadernos às justificativas que ainda não têm fonte
    const cad3 = lista.find((t) => /Caderno 3/.test(t.titulo));
    const cad5 = lista.find((t) => /Caderno 5/.test(t.titulo));
    const cad2 = lista.find((t) => /Caderno 2/.test(t.titulo));
    for (const [id, j] of Object.entries(justificativas)) {
      if (j.fonte) continue;
      const t = /^(lp_|mat_|outros|dua_|flex)/.test(id) ? cad3 : /^(recursos|equip)/.test(id) ? cad5 : /^(freq|formato|colab|profiss)/.test(id) ? cad2 : cad3;
      if (t) j.fonte = { titulo: t.titulo, pagina: t.pagina };
    }

    let modo = "regras", modelo: string | null = null, resumo = "", tentativas: string[] = [], aviso: string | null = null;
    let saidaCampos = campos, saidaJust = justificativas;
    const chave = await chaveGemini();
    if (chave) {
      modo = "ia";
      const { data: regrasTxt } = await sb.rpc("regras_do_instituto");
      const { data: form } = await sb.from("formularios").select("esquema").eq("id", "documento-unificado").eq("versao", 1).single();
      try {
        const r = await comGemini(chave, form?.esquema, { F, E, C }, campos, regrasTxt ?? "", lista);
        modelo = r.modelo; tentativas = r.tentativas;
        if (r.ok) { saidaCampos = { ...campos, ...r.campos }; saidaJust = { ...justificativas, ...r.justificativas }; resumo = r.resumo; }
        else aviso = "A IA respondeu em um formato que não deu para ler; esta proposta é a do modo regras.";
      } catch (e) {
        // Google indisponível (503/429 em todos os modelos): entrega a proposta por regras em vez de falhar
        modo = "regras"; modelo = null;
        aviso = "A IA estava indisponível neste momento (" + (e as Error).message.slice(0, 160) + "). Esta proposta é a do modo regras; gere de novo mais tarde para a redação por IA.";
      }
    }
    if (!resumo) resumo = resumoPorRegras(saidaCampos, !!estudo);

    const saida = {
      resumo, aviso, campos: saidaCampos, justificativas: saidaJust,
      base: { ficha: ficha.id, entrevista: entrevista.id, estudo: estudo?.id ?? null },
      trechos: lista.map((t) => ({ grupo: t.grupo, titulo: t.titulo, pagina: t.pagina, texto: t.texto })),
    };
    const { data: salvo, error: e2 } = await sb.from("sinteses_ia").insert({
      estudante_id, respostas_ids: [ficha.id, entrevista.id, ...(estudo ? [estudo.id] : [])], modelo: modelo ?? "regras-v1", prompt_versao: modo, saida, criado_por: quem.user.id,
    }).select("id, criado_em").single();
    if (e2) return json({ erro: e2.message }, 500);
    await sb.from("auditoria").insert({ quem: quem.user.id, acao: "sintese.gerou", alvo: "estudantes:" + estudante_id, detalhe: { modo, modelo, campos: Object.keys(saidaCampos).length, tentativas } });
    return json({ id: salvo.id, modo, modelo, criado_em: salvo.criado_em, saida });
  } catch (e) {
    return json({ erro: (e as Error).message }, 500);
  }
});

/* ---------------- regras: formulários → Documento Unificado ---------------- */

const txt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
const tem = (lista: string[], re: RegExp) => lista.some((x) => re.test(x));
const esc = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {});
const ver = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, { opcao?: string; detalhe?: string }>) : {});
const juntar = (...partes: unknown[]) => partes.map(txt).filter(Boolean).join(" ");

function regras(F: Dados, E: Dados, C: Dados) {
  const campos: Dados = {};
  const J: Record<string, Just> = {};
  const G = (titulo: string) => ({ titulo, pagina: null });
  const guiaDU = G("Guia do Instituto: Documento Unificado PAEE e PEI");
  const guiaEC = G("Guia do Instituto: Estudo de Caso");
  const guiaFO = G("Guia do Instituto: Ficha de Observação");
  const guiaEF = G("Guia do Instituto: Entrevista com a Família");
  const todoTexto = Object.values({ ...F, ...E, ...C }).map((v) => (typeof v === "string" ? v : Array.isArray(v) ? v.join(" ") : "")).join(" \n ").toLowerCase();
  const fala = (re: RegExp) => re.test(todoTexto);

  // 1. Equipe de apoio presente
  const equipe = ["Professor do AEE"];
  if (tem(arr(C.apoio_humano), /Profissional de apoio/) || fala(/profissional de apoio/)) equipe.push("Profissional de apoio escolar");
  if (tem(arr(C.apoio_humano), /Libras/) || tem(arr(E.formas_comunicacao), /Libras/)) equipe.push("Tradutor/intérprete de Libras ou guia-intérprete");
  if (txt(E.terapias) || tem(arr(C.autonomia), /Terapias/)) equipe.push("Outros (fonoaudiólogo, psicólogo, acompanhante terapêutico)");
  campos.equipe_apoio = equipe;
  J.equipe_apoio = { porque: "Montado a partir dos apoios humanos marcados no Estudo de Caso e dos atendimentos externos citados pela família.", fonte: guiaDU };

  // 2.1 Interesses
  const interessesTxt = juntar(C.hiperfocos, F.interesses, E.interesses);
  const interesses: string[] = [];
  if (/tablet|celular|computador|jogo|vídeo|video|tela/i.test(interessesTxt)) interesses.push("Atividades com uso de tecnologia (celular, tablet, computador)");
  if (/arte|desenh|colag|encaix|massinha|pintar|montar/i.test(interessesTxt)) interesses.push("Tarefas práticas, artísticas, com colagem ou jogos de encaixe");
  if (interessesTxt && interesses.length < 2) interesses.unshift("Temas específicos (dinossauros, meios de transporte, jogos, desenhos, músicas)");
  if (interessesTxt) interesses.push("Outro: " + interessesTxt.slice(0, 160));
  campos.interesses = interesses;
  J.interesses = { porque: "Interesses relatados na Ficha (interesses), no Estudo de Caso (hiperfocos) e pela família. Interesse é o gancho de aprendizagem: deve virar estratégia no PEI.", fonte: guiaEC };

  // Comunicação
  const fc = arr(E.formas_comunicacao);
  const com: string[] = [];
  if (tem(fc, /^Fala/)) com.push("Fala frases completas e entende ordens diretas");
  if (tem(fc, /Gestos|Aponta/)) com.push("Usa comunicação não verbal (gestos, olhares, aponta o que quer)");
  if (tem(fc, /Alternativa/) || tem(arr(C.registro), /Comunicação Alternativa/) || fala(/\bcaa\b|prancha/)) com.push("Usa Comunicação Alternativa (pranchas, cartões/PECS, aplicativos)");
  if (tem(fc, /Libras/)) com.push("Comunica-se por Libras");
  campos.comunicacao = com;
  J.comunicacao = { porque: "Formas de comunicação marcadas pela família na Entrevista, cruzadas com o registro do Estudo de Caso.", fonte: guiaEF };

  // Habilidades
  const hab: string[] = [];
  const habTxt = juntar(F.ja_aprendeu, C.habilidades, E.pontos_fortes);
  if (/letra|vogal|nome|lê|ler|palavra|escrev/i.test(habTxt)) hab.push("Reconhece letras, vogais ou escreve o próprio nome");
  if (/número|numero|conta|quantidade|soma|agrup/i.test(habTxt)) hab.push("Reconhece números, faz contagens concretas ou agrupamentos");
  if (/cor|forma|objeto|animal/i.test(habTxt)) hab.push("Identifica cores, formas, objetos e animais");
  if (habTxt) hab.push("Outro: " + habTxt.slice(0, 160));
  campos.habilidades = hab;
  J.habilidades = { porque: "O que o estudante já faz, segundo a Ficha (conhecimentos prévios), o Estudo de Caso e a família.", fonte: guiaFO };

  // Autonomia
  const escala = esc(F.nivel_apoio);
  const niveis = Object.values(escala);
  const permanente = niveis.filter((x) => /permanente|cont[ií]nuo/i.test(x)).length;
  const frequente = niveis.filter((x) => /frequente/i.test(x)).length;
  const auto: string[] = [];
  if (tem(arr(C.autonomia), /auxílio na alimentação|auxílio na higiene/) || permanente >= 3) auto.push("Precisa de muitos apoios nas atividades de vida diária e nas interações");
  else if (frequente >= 3 || tem(arr(C.participacao), /mediação individual/)) auto.push("Interage melhor em duplas ou com mediação direta de um adulto");
  else auto.push("Realiza atividades sozinho e busca ajuda quando precisa");
  if (tem(arr(C.participacao), /Brinca e interage em grupo/) || /sem apoio/i.test(escala["Convive com os colegas da turma"] ?? "")) auto.push("Brinca e realiza tarefas com os colegas sem conflitos");
  campos.autonomia = auto;
  J.autonomia = { porque: `Derivado da escala de apoio da Ficha (${permanente} atividade(s) com apoio permanente, ${frequente} com apoio frequente) e da autonomia marcada no Estudo de Caso.`, fonte: guiaFO };

  // 2.2 Barreiras
  const bF = arr(F.barreiras), bC = arr(C.barreiras);
  const bArq: string[] = [], bCom: string[] = [], bMet: string[] = [], bAti: string[] = [];
  if (tem(bF, /Arquitet|Urban|transporte/) || tem(bC, /Arquitet/)) bArq.push("Falta de rampa, piso tátil ou banheiro adaptado");
  if (fala(/barulho|ruído|ruido|ilumina/)) bArq.push("Sala com muito barulho ou iluminação forte");
  if (fala(/carteira|mesa|postura|cadeira/)) bArq.push("Carteira ou mesa inadequada para a altura ou postura");
  if (txt(C.b_arquitetonica)) bArq.push("Outro: " + txt(C.b_arquitetonica).slice(0, 140));
  if (tem(bF, /comunica/i) || tem(bC, /Comunica/)) bCom.push("Dificuldade para entender ordens faladas longas");
  if (fala(/não fala|nao fala|não verbal|prancha|\bcaa\b/)) bCom.push("O estudante não fala e não possui prancha de comunicação");
  if (tem(bF, /Tecnol/) || tem(bC, /Tecnol/)) bCom.push("Falta de computador adaptado ou leitores de tela");
  if (txt(C.b_comunicacao) || txt(C.b_tecnologica)) bCom.push("Outro: " + juntar(C.b_comunicacao, C.b_tecnologica).slice(0, 140));
  if (tem(bF, /Metodol/) || tem(bC, /Pedag/)) { bMet.push("Atividades e provas iguais para toda a turma, sem adaptação visual ou de texto"); bMet.push("Pouco uso de materiais visuais ou concretos"); }
  if (txt(C.b_pedagogica)) bMet.push("Outro: " + txt(C.b_pedagogica).slice(0, 140));
  if (tem(bF, /Atitud/) || tem(bC, /Atitud/)) bAti.push("Pouca expectativa sobre a capacidade do estudante ou cuidado excessivo da equipe");
  if (fala(/recus|exclu|isola|irrita/)) bAti.push("Colegas recusam o estudante em trabalhos em grupo");
  if (txt(C.b_atitudinal)) bAti.push("Outro: " + txt(C.b_atitudinal).slice(0, 140));
  campos.b_arquitetonicas = bArq; campos.b_comunicacionais = bCom; campos.b_metodologicas = bMet; campos.b_atitudinais = bAti;
  const jb = { porque: "Barreiras marcadas na Ficha e no Estudo de Caso, traduzidas para as categorias do Documento Unificado. Barreira é do contexto escolar, nunca característica do estudante.", fonte: guiaEC };
  J.b_arquitetonicas = jb; J.b_comunicacionais = jb; J.b_metodologicas = jb; J.b_atitudinais = jb;
  campos.barreiras_descricao = [txt(F.barreiras_descricao), txt(C.impactos), txt(F.impede_participacao), txt(E.dificuldades)].filter(Boolean).join("\n").slice(0, 1200);
  J.barreiras_descricao = { porque: "Descrições da Ficha (barreiras e fatores limitadores), do Estudo de Caso e da família, reunidas.", fonte: guiaEC };

  // 3. PAEE
  campos.frequencia = permanente >= 3 || frequente >= 4 ? "2 vezes por semana, sessões de 50 minutos (sugestão inicial; ajustar à rede)" : "1 a 2 vezes por semana, sessões de 50 minutos (sugestão inicial; ajustar à rede)";
  J.frequencia = { porque: "Sugestão do guia (ex.: 2 vezes por semana, 50 minutos), ajustada ao nível de apoio observado.", fonte: guiaDU };
  campos.formato = com.some((x) => /Alternativa|Libras/.test(x)) ? "Individual e coletivo" : "Coletivo";
  J.formato = { porque: "Quem usa Comunicação Alternativa ou Libras precisa de momentos individuais para o recurso e coletivos para a interação.", fonte: guiaDU };
  campos.colaborativo = `O professor de AEE acompanha o estudante na sala comum 1 vez por semana para adequar materiais e orientar o regente${com.some((x) => /Alternativa/.test(x)) ? ", com foco no uso da Comunicação Alternativa pela turma e pelos professores" : ""}.`;
  J.colaborativo = { porque: "Modelo de atuação colaborativa do guia, adaptado ao recurso principal do estudante.", fonte: guiaDU };
  const prof: Record<string, { opcao: string; detalhe?: string }> = {};
  const linhasProf = ["Profissional de apoio escolar (descreva o papel: higiene, alimentação, locomoção, uso do material, interação com colegas)", "Tradutor/intérprete de Libras ou guia-intérprete (tradução de conteúdos e instruções para Libras)", "Serviços de orientação e mobilidade (ensina o estudante cego ou com baixa visão a andar com segurança pela escola)"];
  const precisaApoio = tem(arr(C.apoio_humano), /Profissional de apoio/) || tem(arr(C.autonomia), /auxílio/) || permanente >= 2;
  prof[linhasProf[0]] = { opcao: precisaApoio ? "Sim" : "Não", detalhe: precisaApoio ? [tem(arr(C.autonomia), /alimentação/) ? "alimentação" : "", tem(arr(C.autonomia), /higiene/) ? "higiene" : "", fala(/andador|cadeira de rodas|locomo/) ? "locomoção" : "", "apoio no uso do material e na interação com os colegas"].filter(Boolean).join(", ") : undefined };
  prof[linhasProf[1]] = { opcao: tem(fc, /Libras/) ? "Sim" : "Não" };
  prof[linhasProf[2]] = { opcao: fala(/cego|baixa visão|braille/) ? "Sim" : "Não" };
  campos.profissionais = prof;
  J.profissionais = { porque: "Profissional de apoio quando há auxílio em alimentação, higiene ou locomoção; intérprete quando a comunicação é em Libras; orientação e mobilidade quando há deficiência visual.", fonte: guiaDU };
  const ta: string[] = [];
  if (com.some((x) => /Alternativa/.test(x)) || tem(arr(C.apoio_comunicacao), /Pictogramas|Cartões/)) ta.push("Prancha ou álbum de Comunicação Alternativa (CAA)");
  if (tem(arr(C.apoio_material), /Fontes ampliadas/) || fala(/baixa visão|ampliad/)) ta.push("Atividades com fonte ampliada e contraste");
  if (tem(arr(C.apoio_material), /engrossador|Tesouras/) || tem(arr(C.registro), /apoio físico/)) ta.push("Engrossador de lápis, tesoura adaptada");
  if (tem(arr(C.apoio_material), /Plano inclinado/)) ta.push("Plano inclinado");
  if (tem(arr(C.apoio_comunicacao), /Apoios visuais|Cartões/) || /Sim|Parcial/.test(ver(F.verificacoes)["Precisa de materiais visuais, táteis ou concretos?"]?.opcao ?? "")) { ta.push("Atividades com apoios visuais"); ta.push("Materiais concretos"); }
  campos.recursos_ta = ta;
  J.recursos_ta = { porque: "Recursos de baixo custo ligados aos apoios marcados no Estudo de Caso e à necessidade de materiais visuais e concretos registrada na Ficha." };
  const eq: string[] = [];
  if (tem(arr(C.registro), /Digitação/) || fala(/computador|tablet|notebook/)) eq.push("Computador ou tablet");
  if (fala(/leitor de tela|cego|baixa visão/)) eq.push("Leitor de tela");
  if (fala(/teclado adaptado|acionador/)) eq.push("Teclado adaptado");
  campos.equipamentos = eq;
  J.equipamentos = { porque: "Equipamentos citados nas respostas (registro por digitação, uso de computador ou tablet, leitor de tela)." };
  campos.recursos_descricao = [ta.length ? `Recursos: ${ta.join("; ")}.` : "", eq.length ? `Equipamentos: ${eq.join("; ")}.` : "", "Orientação para a equipe: reunião mensal com os regentes para ensinar o uso dos recursos" + (com.some((x) => /Alternativa/.test(x)) ? ", em especial a prancha de comunicação, para que colegas e professores também a usem." : "."), txt(F.facilitadores) ? "O que já funciona: " + txt(F.facilitadores) : ""].filter(Boolean).join("\n");
  J.recursos_descricao = { porque: "Objetivo e forma de uso de cada recurso, mais as estratégias que a Ficha diz que já funcionam.", fonte: guiaDU };
  campos.saude = txt(E.terapias) || (tem(arr(C.autonomia), /Terapias/) ? "Terapias externas citadas no Estudo de Caso (detalhar com a família)" : "");
  J.saude = { porque: "Atendimentos externos informados pela família.", fonte: guiaEF };
  campos.assistencia = fala(/cras|creas|bpc|benefício|beneficio/) ? "Acompanhamento no CRAS/CREAS ou benefício social citado nas respostas (confirmar)." : "";
  J.assistencia = { porque: "Só preenchido quando a família ou a equipe citou CRAS, CREAS ou benefício." };

  // 4. PEI
  const prio = txt(F.prioridades) || txt(C.desempenho_obs);
  const sabe = txt(F.ja_aprendeu);
  const metas = (area: string) => [
    `Curto prazo (1 a 2 meses): ${sabe ? "consolidar o que já faz (" + sabe.slice(0, 90) + ")" : "consolidar o que o estudante já faz em " + area} com os apoios definidos no PAEE.`,
    `Médio prazo (3 a 4 meses): ${prio ? "avançar em: " + prio.slice(0, 120) : "avançar nas demandas de aprendizagem registradas na Ficha"}.`,
    `Longo prazo (até o fim do ano): participar das atividades de ${area} da turma com os recursos de acessibilidade, com indicadores observáveis definidos pelo regente.`,
  ].join("\n");
  campos.lp_objeto = ""; campos.lp_bncc = ""; campos.mat_objeto = ""; campos.mat_bncc = "";
  campos.lp_metas = metas("Língua Portuguesa"); campos.mat_metas = metas("Matemática");
  const jm = { porque: "Esqueleto de metas em três prazos, a partir do que o estudante já sabe e do que precisa aprender (Ficha). Objeto de conhecimento e habilidade BNCC são do planejamento do regente e não dá para inferir dos formulários.", fonte: guiaDU };
  J.lp_metas = jm; J.mat_metas = jm;
  J.lp_objeto = { porque: "Depende do conteúdo que a turma está trabalhando: preencher pelo regente." }; J.lp_bncc = J.lp_objeto; J.mat_objeto = J.lp_objeto; J.mat_bncc = J.lp_objeto;
  const dap: string[] = [];
  if (ta.includes("Materiais concretos") || tem(arr(C.pedagogica), /imagens/)) dap.push("Materiais concretos (jogos, blocos, objetos reais)");
  if (ta.includes("Atividades com apoios visuais") || tem(arr(C.pedagogica), /imagens|textos/) || bMet.length) dap.push("Imagens, esquemas visuais e vídeos curtos");
  if (bCom.length || tem(arr(C.participacao), /apoio visual|mediação/)) dap.push("Frases curtas, tom de voz calmo e orientação passo a passo");
  campos.dua_apresentar = dap;
  const ddm: string[] = [];
  if (tem(arr(C.registro), /oral|desenho|Alternativa/) || com.some((x) => /Alternativa/.test(x))) ddm.push("Respostas orais, apontando imagens ou usando pranchas de comunicação");
  if (tem(arr(C.registro), /desenho|colagem/) || tem(arr(C.participacao), /grupo/)) ddm.push("Trabalhos em duplas, colagens ou desenhos");
  if (tem(arr(C.registro), /Digitação/) || eq.includes("Computador ou tablet")) ddm.push("Digitação em computador ou tablet");
  campos.dua_demonstrar = ddm;
  const deng: string[] = [];
  if (interessesTxt) deng.push("Usar os temas de interesse do estudante nas tarefas");
  if (tem(arr(C.participacao), /grupo|aproximação/) || tem(arr(C.logistica), /dupla/) || /sem apoio|esporádico/i.test(escala["Convive com os colegas da turma"] ?? "")) deng.push("Tarefas em duplas colaborativas");
  campos.dua_engajar = deng;
  const jd = { porque: "Desenho Universal para a Aprendizagem: formas de apresentar, de demonstrar e de engajar escolhidas a partir das barreiras, do registro e dos interesses.", fonte: guiaDU };
  J.dua_apresentar = jd; J.dua_demonstrar = jd; J.dua_engajar = jd;
  campos.flexibilizacoes = [arr(C.logistica).join(". "), txt(F.lugar_sala) ? "Espaço: " + txt(F.lugar_sala) : "", tem(arr(C.apoio_tempo), /Pausas/) ? "Rotina e pausas: pausas de 5 minutos após cada atividade." : "", txt(F.outras) ? "Observação: " + txt(F.outras) : ""].filter(Boolean).join("\n");
  J.flexibilizacoes = { porque: "Adequações logísticas do Estudo de Caso e observações da Ficha sobre espaço, rotina e momentos de maior rendimento.", fonte: guiaEC };

  // 5. Avaliação
  const fmt: string[] = [];
  if (dap.includes("Materiais concretos (jogos, blocos, objetos reais)")) fmt.push("Avaliação prática com materiais concretos");
  fmt.push("Portfólio de atividades");
  if (ddm.some((x) => /orais|pranchas/.test(x))) fmt.push("Avaliação oral ou por figuras");
  if (eq.includes("Computador ou tablet")) fmt.push("Outro: realização das atividades e avaliações no computador ou tablet");
  campos.formatos = fmt;
  const cond: string[] = ["Tempo estendido"];
  if (fala(/barulho|ruído|ruido|sensorial/)) cond.push("Ambiente reservado e silencioso");
  if (bCom.length || tem(arr(C.participacao), /mediação/)) cond.push("Mediação pedagógica (leitura das questões para o estudante)");
  campos.condicoes = cond;
  const tav: string[] = [];
  if (eq.includes("Computador ou tablet")) tav.push("Computador");
  if (ta.some((x) => /Comunicação Alternativa/.test(x))) tav.push("Prancha de comunicação");
  if (ta.some((x) => /Engrossador/.test(x))) tav.push("Lápis adaptado");
  campos.ta_avaliacao = tav;
  const ja = { porque: "Formatos e condições coerentes com os recursos e as formas de registro definidos acima.", fonte: guiaDU };
  J.formatos = ja; J.condicoes = ja; J.ta_avaliacao = ja;
  campos.monitoramento = "Bimestral"; campos.devolutiva = "Bimestral";
  J.monitoramento = { porque: "O guia pede revisão bimestral ou trimestral; o Estudo de Caso prevê acompanhamento em 30, 60 e 90 dias, por isso bimestral.", fonte: guiaEC };
  J.devolutiva = { porque: `A família pediu acompanhar por: ${arr(E.canal).join(", ") || "canal não informado"}.`, fonte: guiaEF };

  return { campos, justificativas: J };
}

function resumoPorRegras(c: Dados, temEstudo: boolean) {
  const n = (k: string) => arr(c[k]).length;
  return `Proposta de Documento Unificado montada por regras a partir da Ficha de Observação, da Entrevista com a Família${temEstudo ? " e do Estudo de Caso" : ""}: ${n("b_arquitetonicas") + n("b_comunicacionais") + n("b_metodologicas") + n("b_atitudinais")} barreira(s) traduzidas, ${n("recursos_ta") + n("equipamentos")} recurso(s) de tecnologia assistiva e ${n("dua_apresentar") + n("dua_demonstrar") + n("dua_engajar")} estratégias DUA. Objeto de conhecimento e habilidade BNCC ficam para o regente. Compare com o que a equipe preencheu e ajuste: a proposta é ponto de partida, não decisão.`;
}

/* ---------------- modo IA ---------------- */

async function comGemini(chave: string, esquema: unknown, dados: Dados, base: Dados, regras: string, trechos: Trecho[]) {
  const sistema = `Você apoia equipes escolares da rede pública brasileira a elaborar o Documento Unificado (PAEE e PEI) a partir do Estudo de Caso, dentro do Programa Decola AEE do Instituto Inclusão na Escola.
Devolva APENAS JSON: {"resumo": string, "campos": {<id do campo>: valor}, "justificativas": {<id>: {"porque": string, "fonte": {"titulo": string, "pagina": number|null}}}}.
Os ids e os valores válidos estão no ESQUEMA (para escolha_multipla use um array com os textos exatos das opções e, se precisar, um item "Outro: ..."; para verificacao use {linha: {opcao, detalhe}}; para escolha_unica, o texto da opção; para texto, string).
REGRAS: 1) baseie-se só nas RESPOSTAS, nas REGRAS DO INSTITUTO e nos TRECHOS; cite fonte e página em cada justificativa. 2) Barreira é do contexto escolar, nunca característica do estudante. 3) Nunca use linguagem clínica ou diagnóstico. 4) Metas do PEI em curto, médio e longo prazo, observáveis e mensuráveis, ligadas ao que o estudante já faz. 5) Objeto de conhecimento e habilidade BNCC: proponha só se as respostas indicarem o conteúdo; senão deixe vazio e explique. 6) Linguagem Simples, pt-BR. Nunca escreva nome de pessoa: diga "o estudante", "a família", "o professor". Quando a base for um formulário e não um livro, use como fonte o nome do formulário ("Ficha de Observação", "Entrevista com a Família", "Estudo de Caso") e pagina null. 7) Você recebe uma PROPOSTA BASE feita por regras: melhore, corrija e complete; mantenha o que estiver certo.`;
  const usuario = `ESQUEMA DO DOCUMENTO UNIFICADO:\n${JSON.stringify(esquema)}\n\nRESPOSTAS (Ficha F, Entrevista E, Estudo de Caso C):\n${JSON.stringify(dados)}\n\nPROPOSTA BASE POR REGRAS:\n${JSON.stringify(base)}\n\nREGRAS DO INSTITUTO:\n${regras.slice(0, 40000)}\n\nTRECHOS:\n${trechos.map((t, i) => `[${i + 1}] ${t.titulo}${t.pagina ? ", página " + t.pagina : ""}:\n${t.texto}`).join("\n\n")}`;
  const { texto, modelo, tentativas } = await gerarTexto(chave, sistema, usuario, { maxOutputTokens: 8192 });
  try {
    const r = JSON.parse(texto);
    // o modelo às vezes devolve a justificativa como texto solto; o app espera {porque, fonte}
    const just: Record<string, Just> = {};
    for (const [k, j] of Object.entries((r.justificativas ?? {}) as Record<string, unknown>)) {
      if (typeof j === "string") just[k] = { porque: j };
      else if (j && typeof j === "object") {
        const f = (j as { fonte?: { titulo?: unknown; pagina?: unknown } }).fonte;
        just[k] = { porque: String((j as { porque?: unknown }).porque ?? "") };
        if (f && typeof f === "object" && f.titulo) just[k].fonte = { titulo: String(f.titulo), pagina: typeof f.pagina === "number" ? f.pagina : null };
      }
    }
    return { ok: true, modelo, tentativas, resumo: String(r.resumo ?? ""), campos: r.campos ?? {}, justificativas: just };
  } catch {
    return { ok: false, modelo, tentativas, resumo: "", campos: {}, justificativas: {} };
  }
}

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
