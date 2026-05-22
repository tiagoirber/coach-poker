// =============================================================
// routes/claude.js — Proxy seguro para a API do Claude (Anthropic)
//
// Por que um proxy?
//   Se o frontend chamasse a API do Claude diretamente, a chave de API
//   ficaria visível no código JavaScript — qualquer usuário poderia roubá-la.
//   Com o proxy, a chave fica no servidor (variável de ambiente) e o
//   frontend só chama /api/claude/chat (sua própria API).
//
// Endpoints:
//   POST /api/claude/lesson  → gera o conteúdo didático de uma lição
//   POST /api/claude/chat    → chat livre com o coach de poker
// =============================================================

import { Router } from 'express';
import { verifyToken, requireActiveAccess } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import { db } from '../config/firebase.js';
import { extractJson } from '../utils/extractJson.js';

const router = Router();

// Rate limit específico para Claude — mais restritivo (caro por chamada)
// Máximo de 20 requisições por usuário a cada 10 minutos
const claudeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.uid || req.ip, // Limita por usuário, não por IP
  message: { error: 'Limite de chamadas à IA atingido. Aguarde 10 minutos.' },
  skip: (req) => !req.user, // O middleware verifyToken já rejeita sem token
});

// Função auxiliar: chama a API do Claude
async function callClaude(system, userMessage, maxTokens = 2000) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) throw new Error('CLAUDE_API_KEY não configurada no servidor.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(55_000), // 55s < timeout padrão da Cloud Function (60s)
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages:   [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Erro da API Claude: ${response.status}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// Conteúdo de exemplo usado como fallback quando a API está indisponível
function getFallbackLesson(day, title, description, category, isCashGame = false) {
  const ctx = isCashGame
    ? { easy: 'Cash game NL 100bb, 6-max.', medium: 'Cash game NL 6-max, 100bb efetivos.', hard: 'Cash game NL, você está no BB com 100bb.' }
    : { easy: 'Torneio MTT, fase mid-stage — blinds 300/600 com antes.', medium: 'Torneio MTT 6-max, mid-stage com antes. Stacks de ~85bb.', hard: 'Torneio MTT late stage, aproximando-se da bolha de premiação.' };

  return {
    theory: `${title} é um conceito fundamental no poker moderno. ${description}\n\nDominar este conceito permite tomar decisões mais lucrativas a longo prazo, baseadas em matemática e lógica em vez de intuição. Jogadores profissionais aplicam estes princípios em cada mão que jogam.\n\nA prática consistente deste conceito, aliada à análise de mãos, acelera o desenvolvimento do jogador e aumenta o winrate significativamente.`,
    keyPoints: [
      `${title} é essencial para qualquer jogador sério de poker`,
      'A aplicação consistente gera lucro a longo prazo',
      'Combine este conceito com leitura de oponentes para maximizar EV',
      'Estude exemplos reais e revise suas mãos regularmente',
    ],
    quiz: {
      easy: [
        { question: `O que é ${title}?`, options: ['A) Uma jogada aleatória', 'B) ' + description, 'C) Uma aposta de blefe', 'D) Uma dobra defensiva'], correct: 1, explanation: `${title} significa: ${description}` },
      ],
      medium: [
        { question: `Como ${title} influencia o sizing e frequência das suas apostas?`, options: ['A) Não influencia', 'B) Muda apenas pré-flop', 'C) Determina frequências e tamanhos em todas as ruas', 'D) Só importa no river'], correct: 2, explanation: `${title} deve guiar frequências e sizings em todas as ruas para maximizar EV.` },
      ],
      hard: [
        { question: 'Com pot odds de 25% e equity de 30%, qual a decisão matematicamente correta?', options: ['A) Fold sempre', 'B) Call — equity supera pot odds', 'C) Raise bluff', 'D) Depende apenas do oponente'], correct: 1, explanation: 'Quando equity (30%) > pot odds necessários (25%), call tem EV positivo — fundamento de ' + title + '.' },
      ],
    },
    handSimulations: {
      easy: {
        heroHand: 'A♠K♦', position: 'BTN', villainPosition: 'BB', board: 'A♥7♣2♦', pot: '12bb', stack: '100bb',
        streets: [
          { name: 'Pré-Flop', actions: ['UTG: Fold', 'MP: Fold', 'CO: Fold', 'BTN (Você): Raise 2.5bb', 'SB: Fold', 'BB: Call'] },
          { name: 'Flop (A♥7♣2♦)', actions: ['BB: Check', 'BTN: ?'] },
        ],
        narrative: `${ctx.easy} Você está no BTN com A♠K♦ — uma das mãos premium do poker. A ação passa para você após todos foldarem, e você faz um raise padrão de 2.5bb. Apenas o BB decide defender, e os dois chegam ao flop com ~5bb de pote cada.\n\nO flop vem A♥7♣2♦ — um board extremamente seco e favorável para o seu range. Você flopeou top pair top kicker (TPTK), a combinação mais forte possível com seu A♠K♦. O BB checa sem hesitar.\n\nDo ponto de vista de range, você como BTN tem uma vantagem enorme neste board: seu range de raise pré-flop inclui muitos Ax, enquanto o range de defesa do BB é mais disperso. O board seco (rainbow, sem draws) significa que há poucas cartas de turn que podem assustá-lo.\n\nO BB checou, o que é esperado — ele pode ter pares médios (77, 55), Ax fraco (A4, A5), ou mãos completamente sem showdown value. O pote agora tem 12bb e você está em posição. Esta é exatamente a situação em que ${title} se aplica diretamente à sua decisão de bet sizing.\n\nA pergunta que define um jogador técnico: dado que você tem a melhor mão com alta probabilidade, como extrair o máximo valor sem assustar o oponente? Qual é a sua ação?`,
        situation: 'Board seco, TPTK em posição após check do BB.',
        question: 'Qual é sua ação?',
        options: ['Fold', 'Check', 'Bet 5bb', 'Bet 9bb', 'All-in'],
        correct: 2,
        analysis: {
          explanation: `Com TPTK (A♠K♦) em board seco A♥7♣2♦, bet para valor é a jogada correta. O range do BB inclui muitos pares médios (77, 55), mãos Ax fracas e draws sem draw — todas essas mãos pagarão ao menos uma rua de valor.\n\nApostar 5bb (40% do pote de 12bb) é o sizing ideal: suficiente para construir o pote contra mãos que pagam, mas não agressivo demais a ponto de só receber calls de mãos que nos batem. Check seria passivo e perderia valor significativo contra o range amplo do BB.`,
          ev: 'EV(Bet 5bb) ≈ +3.8bb | EV(Check) ≈ +1.6bb. Bet é superior pois o range do BB inclui ~60% de mãos que pagam ao menos uma rua. Bet 9bb é sizing excessivo para este board seco.',
          gto: 'Frequência de bet: 72% | Check: 28%. TPTK em board seco fica majoritariamente na linha de bet para valor. A minoria checada serve para balancear o range e proteger mãos fracas que checamos.',
        },
      },
      medium: {
        heroHand: 'J♠T♠', position: 'CO', villainPosition: 'BB', board: '9♥8♦3♣', pot: '22bb', stack: '85bb',
        streets: [
          { name: 'Pré-Flop', actions: ['UTG: Fold', 'MP: Fold', 'CO (Você): Raise 2.5bb', 'BTN: Fold', 'SB: Fold', 'BB: Call'] },
          { name: 'Flop (9♥8♦3♣)', actions: ['BB: Check', 'CO: ?'] },
        ],
        narrative: `${ctx.medium} Você está no CO com J♠T♠ — uma mão conectada suited com boa equidade em muitos boards. Você abre para 2.5bb e recebe um call do BB, um jogador que defende amplamente sua posição.\n\nO flop vem 9♥8♦3♣ — um board coordenado que hit seu J♠T♠ de forma poderosa: você tem um open-ended straight draw (OESD), com qualquer 7 ou Q completando a nut straight. São 8 outs, aproximadamente 32% de equity no flop contra uma mão como top pair.\n\nO BB checa. Este check pode significar muitas coisas: ele pode ter uma mão média (55, 66), estar slowplaying um set de 99 ou 88, ter uma mão Ax sem conexão com o board, ou simplesmente estar dando espaço para ver o que você faz — o típico check-call ou check-fold.\n\nDo ponto de vista de ${title}, esta situação é rica em nuances. Você tem equity real com o OESD, mas também pode ganhar o pote imediatamente se o BB foldar. A decisão de bet ou check vai definir a linha de jogo para o turn e river.\n\nCom 22bb no pote e o BB aparentemente fraco, como você joga sua mão semi-forte no flop?`,
        situation: 'OESD no flop, BB check, CO em posição com 32% de equity.',
        question: 'Qual é sua ação?',
        options: ['Fold', 'Check', 'Bet 8bb', 'Raise 22bb', 'All-in'],
        correct: 2,
        analysis: {
          explanation: `JTs com OESD em 9-8-3 é o candidato ideal para semi-bluff c-bet. Você tem ~32% de equity contra top pair, mais fold equity quando o BB não conectou. Apostar 8bb (~36% do pote) aplica pressão eficiente: se o BB foldar, você vence imediatamente; se ele pagar, você tem outs reais para melhorar.\n\nCheck seria passivo — perderia fold equity e entregaria o turn de graça. Raise seria exagerado para uma mão de draw sem showdown value imediato. Sizing de 8bb é o equilíbrio perfeito entre pressão e proteção do stack.`,
          ev: 'EV(Bet 8bb) ≈ +4.2bb considerando ~40% de fold equity + equity quando chamado. EV(Check) ≈ +1.8bb apenas com equity passiva. A diferença de ~2.4bb é significativa no longo prazo.',
          gto: 'Frequência de c-bet neste spot: 65% | Check: 35%. JTs é ideal para semi-bluff; misturamos check com algumas mãos fortes (sets) para não sermos explorados no turn quando checamos.',
        },
      },
      hard: {
        heroHand: 'K♠Q♦', position: 'BB', villainPosition: 'BTN', board: 'K♥J♣4♦2♠', pot: '45bb', stack: '70bb',
        streets: [
          { name: 'Pré-Flop', actions: ['UTG: Fold', 'MP: Fold', 'CO: Fold', 'BTN: Raise 3bb', 'SB: Fold', 'BB (Você): Call'] },
          { name: 'Flop (K♥J♣4♦)', actions: ['BB: Check', 'BTN: Bet 12bb', 'BB: Call'] },
          { name: 'Turn (2♠)', actions: ['BB: Check', 'BTN: Bet 38bb (overbet)', 'BB: ?'] },
        ],
        narrative: `${ctx.hard} Você está no BB com K♠Q♦ e defende contra o raise do BTN. O range do BTN inclui mãos premium, broadways, suited connectors e pequenos pares — um range amplo típico de botão.\n\nO flop vem K♥J♣4♦, dando a você top pair com kicker de rainha. Você checa para disfarçar a força da sua mão. O BTN aposta 12bb em um pote de 9bb — uma c-bet razoável de ~130%. Você decide fazer um call, representando um range que inclui Kx médio, pares intermediários e possíveis draws.\n\nO turn traz 2♠ — uma carta praticamente neutra, sem completar draws óbvios. Você checa novamente. O BTN então faz uma overbet surpreendente: 38bb em um pote de 45bb, mais de 84% do pote. Esta é uma aposta polarizada — indica ou mãos muito fortes (sets de KK, JJ, 44, two pair como KJ) ou grandes blefes (QT, AQ, mãos com equity que não pagaram uma bet normal).\n\nCom K♠Q♦, você tem top pair com segunda melhor kicker — uma mão forte que bate todos os blefes do BTN, mas perde para os nuts da polarização. A pergunta de ${title} é sobre bluff catching: qual frequência de call você deve ter aqui para não ser explorado pelo BTN? O pote agora seria 121bb se você pagar — quase dois stacks. Cada decisão tem consequências enormes.\n\nVocê está no BB, fora de posição, com um stack efetivo de ~70bb. Como você responde ao overbet?`,
        situation: 'Turn overbet 38bb em pote de 45bb. TPGK como bluff catcher contra range polarizado.',
        question: 'Qual é sua ação?',
        options: ['Fold', 'Call 38bb', 'Raise 90bb', 'All-in'],
        correct: 1,
        analysis: {
          explanation: `KQ em K-J-4-2 é um bluff catcher ideal contra overbet polarizada. O BTN tem como nuts: sets (KK seria improvável dado sua mão, JJ, 44), KJ (two pair) — e como blefes: QT, AQ, hands que perderam equity. Nossa K♠Q♦ bate 100% dos blefes mas perde para os nuts.\n\nA overbet indica polarização extrema. Com ${title}, o MDF (Minimum Defense Frequency) exige que você chame com frequência suficiente para tornar os blefes do BTN não lucrativos. Fold permitiria ao BTN blefar qualquer duas cartas com lucro. Raise seria erro — apenas nuts deveriam reraise aqui.`,
          ev: 'EV(Call) ≈ +0.6bb em equilíbrio de MDF. EV(Fold) = 0 — cedendo equity gratuitamente. EV(Raise) ≈ -18bb (negativo, pois apenas KJ e sets ganham um reraise). MDF = 1 - (38/(45+38)) ≈ 54% de frequência de não-fold exigida.',
          gto: 'Frequência de call: 55% | Fold: 42% | Raise: 3% (apenas KJ, sets de JJ/44). K♠Q♦ está no topo das mãos de bluff-catching — chamamos mais que dobramos para manter o BTN honesto em spots de overbet.',
        },
      },
    },
    infiniteTraining: {
      concept: `Aplicar ${title} conscientemente em cada decisão`,
      drill: `Nas próximas 3 sessões, antes de cada ação pergunte: "Como ${title} afeta esta decisão?" Anote 5 situações onde aplicou o conceito.`,
      challenge: `Desafio: identifique 10 spots onde ${title} foi determinante nas suas sessões. Compare suas decisões com o que aprendeu hoje.`,
    },
    tip: `Para aplicar ${title} imediatamente: antes de cada decisão, pause 3 segundos e pense no conceito. A consistência transforma conhecimento em lucro.`,
  };
}

// ── POST /api/claude/lesson ───────────────────────────────────
// Fase 1 (rápida): gera teoria, pontos-chave e dica (~10s).
// A fase 2 (exercícios) é disparada em paralelo pelo frontend.
router.post('/lesson', verifyToken, requireActiveAccess, claudeLimiter, async (req, res) => {
  const { day, title, description, category, forceNew = false } = req.body;

  if (!day || !title || !category) {
    return res.status(400).json({ error: 'day, title e category são obrigatórios.' });
  }

  // ── Cache global no Firestore ─────────────────────────────────
  if (!forceNew) {
    try {
      const doc = await db.collection('lessons').doc(`day_${day}`).get();
      if (doc.exists) {
        const data = doc.data();
        if (data?.theory) {
          return res.json({ lesson: { theory: data.theory, keyPoints: data.keyPoints, tip: data.tip }, cached: true });
        }
      }
    } catch (e) {
      console.warn('Aviso: falha ao ler cache do Firestore:', e.message);
    }
  }

  const isCashGame = day === 91;
  const system = `Você é um coach de poker profissional especializado em ${isCashGame ? 'cash game (NL Hold\'em)' : 'torneios de poker (MTT)'}.
Crie conteúdo didático rico em português brasileiro, com linguagem clara para iniciantes a intermediários.
IMPORTANTE: Mantenha SEMPRE os termos técnicos do poker em inglês, nunca os traduza. Exemplos obrigatórios: call (nunca "chamar"), fold (nunca "dobrar"), raise (nunca "aumentar"), check (nunca "passar"), bet (nunca "apostar" quando for jargão), bluff, range, equity, pot odds, EV, GTO, c-bet, barrel, float, squeeze, 3-bet, 4-bet, flop, turn, river, showdown, stack, blinds, ante, BTN, CO, HJ, UTG, BB, SB, overbet, check-raise, value bet, hand, board, outs.
Sempre retorne JSON válido, sem markdown extra, sem texto fora do JSON.
Use notação de cartas: A♠ K♥ Q♦ J♣ T=10.
Para naipes no texto (fora da notação de carta): Espadas (♠), Copas (♥), Ouros (♦), Paus (♣) — NUNCA "corações"; o naipe ♥ é sempre "Copas" em poker.
Não use termos compostos híbridos como "3-bet-happy", "fold-equity-aware" etc. Use termos poker padrão ou descreva o conceito em português.`;

  const contextPrefix = isCashGame
    ? 'Contexto: Cash game NL Hold\'em, stacks profundos (100–200bb), sem antes.'
    : 'Contexto: Torneio MTT, stacks em BBs (80–120bb early, 25–60bb mid, 8–20bb late/FT).';

  const prompt = `Crie a teoria introdutória para o Dia ${day} do plano de 90 dias.
Título: "${title}"
Descrição: "${description}"
Categoria: ${category}
${contextPrefix}

Retorne APENAS este JSON válido (sem markdown, sem texto extra):
{
  "theory": "Explicação em 3-4 parágrafos detalhados sobre ${title}",
  "keyPoints": ["ponto 1", "ponto 2", "ponto 3", "ponto 4"],
  "tip": "Dica de 1-2 frases para aplicar ${title} imediatamente"
}`;

  try {
    const text = await callClaude(system, prompt, 1500);
    console.log('Resposta IA fase 1 (primeiros 200 chars):', text.slice(0, 200));

    const lesson = extractJson(text);
    if (!lesson) throw new Error('JSON');

    if (!forceNew) {
      try {
        await db.collection('lessons').doc(`day_${day}`).set(
          { theory: lesson.theory, keyPoints: lesson.keyPoints, tip: lesson.tip },
          { merge: true }
        );
      } catch (e) {
        console.warn('Aviso: falha ao salvar cache no Firestore:', e.message);
      }
    }

    res.json({ lesson: { theory: lesson.theory, keyPoints: lesson.keyPoints, tip: lesson.tip } });
  } catch (err) {
    console.error('Erro ao gerar teoria da lição:', err.message);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'A IA demorou mais de 55s. Tente novamente.' });
    }
    if (err.message.includes('credit') || err.message.includes('billing') || err.message.includes('balance')) {
      console.log('⚠️  Usando conteúdo de fallback (verifique o saldo na Anthropic)');
      const fb = getFallbackLesson(day, title, description, category, isCashGame);
      return res.json({ lesson: { theory: fb.theory, keyPoints: fb.keyPoints, tip: fb.tip }, fallback: true });
    }
    if (err.message.includes('JSON')) {
      return res.status(502).json({ error: 'IA retornou formato inválido. Tente novamente.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/claude/lesson-exercises ────────────────────────
// Fase 2 (pesada): gera quiz, simulações e treinamento (~40s).
// Disparado em background pelo frontend enquanto o usuário lê a teoria.
router.post('/lesson-exercises', verifyToken, requireActiveAccess, claudeLimiter, async (req, res) => {
  const { day, title, description, category, forceNew = false } = req.body;

  if (!day || !title || !category) {
    return res.status(400).json({ error: 'day, title e category são obrigatórios.' });
  }

  // ── Cache global no Firestore ─────────────────────────────────
  if (!forceNew) {
    try {
      const doc = await db.collection('lessons').doc(`day_${day}`).get();
      if (doc.exists) {
        const data = doc.data();
        if (data?.handSimulations?.easy?.narrative) {
          return res.json({
            exercises: { quiz: data.quiz, handSimulations: data.handSimulations, infiniteTraining: data.infiniteTraining },
            cached: true,
          });
        }
      }
    } catch (e) {
      console.warn('Aviso: falha ao ler cache do Firestore:', e.message);
    }
  }

  const isCashGame = day === 91;
  const system = `Você é um coach de poker profissional especializado em ${isCashGame ? 'cash game (NL Hold\'em)' : 'torneios de poker (MTT)'}.
Crie conteúdo didático rico em português brasileiro, com linguagem clara para iniciantes a intermediários.
IMPORTANTE: Mantenha SEMPRE os termos técnicos do poker em inglês, nunca os traduza. Exemplos obrigatórios: call (nunca "chamar"), fold (nunca "dobrar"), raise (nunca "aumentar"), check (nunca "passar"), bet (nunca "apostar" quando for jargão), bluff, range, equity, pot odds, EV, GTO, c-bet, barrel, float, squeeze, 3-bet, 4-bet, flop, turn, river, showdown, stack, blinds, ante, BTN, CO, HJ, UTG, BB, SB, overbet, check-raise, value bet, hand, board, outs.
Sempre retorne JSON válido, sem markdown extra, sem texto fora do JSON.
Use notação de cartas: A♠ K♥ Q♦ J♣ T=10.
Para naipes no texto (fora da notação de carta): Espadas (♠), Copas (♥), Ouros (♦), Paus (♣) — NUNCA "corações"; o naipe ♥ é sempre "Copas" em poker.
Não use termos compostos híbridos como "3-bet-happy", "fold-equity-aware" etc. Use termos poker padrão ou descreva o conceito em português.`;

  const contextRule = isCashGame
    ? `0. CONTEXTO OBRIGATÓRIO — CASH GAME: Todas as simulações de mãos devem refletir NL Hold'em cash game: stacks profundos (100–200bb), sem antes, sem pressão de bubble ou ICM, sem aumento de blinds durante a sessão. Mencione rake/rakeback quando fizer sentido pedagógico.`
    : `0. CONTEXTO OBRIGATÓRIO — TORNEIO (MTT): Todas as simulações de mãos devem refletir torneio: stacks em BBs típicos de fase (80–120bb early, 25–60bb mid, 8–20bb late/bubble/FT), antes presentes a partir do mid-stage, pressão de bubble/ICM quando aplicável. NUNCA use contexto de cash game — sem rake, sem sessão de cash, sem rebuy ilimitado.`;

  const prompt = `Crie os exercícios de poker para o Dia ${day} do plano de 90 dias.
Título: "${title}"
Descrição: "${description}"
Categoria: ${category}

REGRAS OBRIGATÓRIAS:
${contextRule}
1. "correct": índice 0-based da opção correta. A "explanation" DEVE confirmar exatamente essa opção.
2. O quiz tem EXATAMENTE 1 pergunta por nível (array com 1 elemento).
3. "narrative" de cada simulação: 4-5 parágrafos de NARRAÇÃO ENVOLVENTE descrevendo como a mão se desenvolveu street por street — contexto do jogo, raciocínio dos jogadores, leituras de range, dinâmica da mesa. Linguagem de comentarista de poker ao vivo. NÃO revele a resposta correta. Termine no momento exato de decisão.

Retorne APENAS este JSON válido (sem markdown, sem texto extra):
{
  "quiz": {
    "easy": [
      {"question":"Pergunta simples e direta sobre ${title}","options":["A) opt","B) opt","C) opt","D) opt"],"correct":0,"explanation":"Explicação clara confirmando a opção correta"}
    ],
    "medium": [
      {"question":"Situação real de jogo intermediária aplicando ${title}","options":["A) opt","B) opt","C) opt","D) opt"],"correct":2,"explanation":"Explicação com raciocínio de poker detalhado"}
    ],
    "hard": [
      {"question":"Problema avançado com GTO, cálculo ou análise de range","options":["A) opt","B) opt","C) opt","D) opt"],"correct":3,"explanation":"Explicação avançada com range thinking e números"}
    ]
  },
  "handSimulations": {
    "easy": {
      "heroHand":"A♠K♦","position":"BTN","villainPosition":"BB","board":"A♥7♣2♦","pot":"12bb","stack":"100bb",
      "streets":[
        {"name":"Pré-Flop","actions":["UTG: Fold","MP: Fold","CO: Fold","BTN (Você): Raise 2.5bb","SB: Fold","BB: Call"]},
        {"name":"Flop (A♥7♣2♦)","actions":["BB: Check","BTN: ?"]}
      ],
      "narrative":"4-5 parágrafos de narração detalhada sobre como esta mão se desenvolveu — contexto, cada street, raciocínios, leituras, chegando ao momento de decisão sem revelar a resposta",
      "situation":"Resumo em 1 frase da situação atual",
      "question":"Qual é sua ação?",
      "options":["Fold","Check","Bet 5bb","Bet 9bb","All-in"],
      "correct":2,
      "analysis":{
        "explanation":"2-3 parágrafos explicando a decisão correta com ${title}. Por que as outras opções são piores.",
        "ev":"EV(opção correta) vs alternativas. Justificativa matemática com números.",
        "gto":"Frequência GTO: Ação A X% | Ação B Y%. Como ${title} determina essa frequência."
      }
    },
    "medium": {
      "heroHand":"J♠T♠","position":"CO","villainPosition":"BB","board":"9♥8♦3♣","pot":"22bb","stack":"85bb",
      "streets":[
        {"name":"Pré-Flop","actions":["UTG: Fold","MP: Fold","CO (Você): Raise 2.5bb","BTN: Fold","SB: Fold","BB: Call"]},
        {"name":"Flop (9♥8♦3♣)","actions":["BB: Check","CO: ?"]}
      ],
      "narrative":"4-5 parágrafos de narração detalhada sobre esta mão intermediária — contexto, dinâmica, ranges dos jogadores, chegando ao ponto de decisão",
      "situation":"Resumo em 1 frase da situação intermediária",
      "question":"Qual é sua ação?",
      "options":["Fold","Check","Bet 8bb","Raise 22bb","All-in"],
      "correct":2,
      "analysis":{
        "explanation":"2-3 parágrafos sobre a decisão intermediária usando ${title}.",
        "ev":"EV comparativo entre as principais opções com números aproximados.",
        "gto":"Frequências GTO e como ${title} as determina."
      }
    },
    "hard": {
      "heroHand":"K♠Q♦","position":"BB","villainPosition":"BTN","board":"K♥J♣4♦2♠","pot":"45bb","stack":"70bb",
      "streets":[
        {"name":"Pré-Flop","actions":["UTG: Fold","MP: Fold","CO: Fold","BTN: Raise 3bb","SB: Fold","BB (Você): Call"]},
        {"name":"Flop (K♥J♣4♦)","actions":["BB: Check","BTN: Bet 12bb","BB: Call"]},
        {"name":"Turn (2♠)","actions":["BB: Check","BTN: Bet 38bb (overbet)","BB: ?"]}
      ],
      "narrative":"4-5 parágrafos de narração avançada — contexto de torneio/cash, cada street com range thinking profundo, a pressão do overbet, chegando ao momento crítico de decisão",
      "situation":"Resumo em 1 frase da situação complexa",
      "question":"Qual é sua ação?",
      "options":["Fold","Call 38bb","Raise 90bb","All-in"],
      "correct":1,
      "analysis":{
        "explanation":"2-3 parágrafos de análise avançada com range thinking, MDF e ${title}.",
        "ev":"EV detalhado: EV(Call) vs EV(Fold) vs EV(Raise) com cálculos.",
        "gto":"Frequências GTO avançadas. Como ${title} define a distribuição de ações."
      }
    }
  },
  "infiniteTraining":{
    "concept":"1 frase resumindo o que praticar sobre ${title}",
    "drill":"Exercício prático para as próximas sessões de jogo",
    "challenge":"Desafio: faça X durante Y mãos e anote os resultados"
  }
}`;

  try {
    const text = await callClaude(system, prompt, 6500);
    console.log('Resposta IA fase 2 (primeiros 200 chars):', text.slice(0, 200));

    const exercises = extractJson(text);
    if (!exercises) throw new Error('JSON');

    if (!forceNew) {
      try {
        await db.collection('lessons').doc(`day_${day}`).set(
          { quiz: exercises.quiz, handSimulations: exercises.handSimulations, infiniteTraining: exercises.infiniteTraining },
          { merge: true }
        );
      } catch (e) {
        console.warn('Aviso: falha ao salvar exercícios no Firestore:', e.message);
      }
    }

    res.json({ exercises: { quiz: exercises.quiz, handSimulations: exercises.handSimulations, infiniteTraining: exercises.infiniteTraining } });
  } catch (err) {
    console.error('Erro ao gerar exercícios da lição:', err.message);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'A IA demorou mais de 55s gerando exercícios. Tente novamente.' });
    }
    if (err.message.includes('credit') || err.message.includes('billing') || err.message.includes('balance')) {
      console.log('⚠️  Usando conteúdo de fallback (verifique o saldo na Anthropic)');
      const fb = getFallbackLesson(day, title, description, category, isCashGame);
      return res.json({
        exercises: { quiz: fb.quiz, handSimulations: fb.handSimulations, infiniteTraining: fb.infiniteTraining },
        fallback: true,
      });
    }
    if (err.message.includes('JSON')) {
      return res.status(502).json({ error: 'IA retornou formato inválido nos exercícios. Tente novamente.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/claude/chat ─────────────────────────────────────
// Chat livre com o coach. O usuário pode tirar dúvidas sobre poker.
router.post('/chat', verifyToken, requireActiveAccess, claudeLimiter, async (req, res) => {
  const { message, context } = req.body;

  if (!message || message.trim().length < 3) {
    return res.status(400).json({ error: 'Mensagem muito curta.' });
  }

  if (message.length > 1000) {
    return res.status(400).json({ error: 'Mensagem deve ter no máximo 1000 caracteres.' });
  }

  const system = `Você é um coach de poker especialista em torneios e cash games.
Responda em português brasileiro, de forma didática e fluida — como um professor conversando com o aluno.

REGRAS OBRIGATÓRIAS:
1. NUNCA use markdown. Proibido: asteriscos (*), cerquilhas (#), traços de lista (-), underlines (_). Zero formatação especial.
2. Escreva em parágrafos corridos, separados por uma linha em branco. Não use listas nem bullets.
3. NUNCA traduza termos técnicos de poker. Use sempre a versão em inglês:
   - streets (NUNCA "ruas"), street (NUNCA "rua")
   - call (NUNCA "pagar" ou "chamar"), fold (NUNCA "descartar" ou "dobrar")
   - raise (NUNCA "aumentar"), check (NUNCA "passar"), bet (NUNCA "apostar")
   - flop, turn, river (NUNCA traduzir), board (NUNCA "mesa" no sentido das cartas)
   - stack (NUNCA "fichas"), range, equity, EV, GTO, bluff, c-bet, hand, outs, pot
   - naipes no texto: Espadas (♠), Copas (♥), Ouros (♦), Paus (♣) — NUNCA "corações"
   - não use compostos híbridos como "3-bet-happy"; use termos padrão ou descreva em português
4. Foco em GTO, exploits, EV e mental game.
5. Máximo de 250 palavras. Se a pergunta não for sobre poker, redirecione educadamente.`;

  const fullMessage = context
    ? `Contexto: estou estudando "${context}"\n\nPergunta: ${message}`
    : message;

  try {
    const reply = await callClaude(system, fullMessage, 800);
    res.json({ reply });
  } catch (err) {
    console.error('Erro no chat:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/claude/practice-hand ────────────────────────────
// Gera UMA simulação de mão no nível Difícil sobre o tópico informado.
// Sem cache — cada chamada deve ser uma mão nova.
router.post('/practice-hand', verifyToken, requireActiveAccess, claudeLimiter, async (req, res) => {
  const { topicTitle, context = 'tournament' } = req.body;
  if (!topicTitle || typeof topicTitle !== 'string') {
    return res.status(400).json({ error: 'topicTitle é obrigatório.' });
  }

  const isCash = context === 'cash';
  const system = `Você é um coach de poker profissional especializado em ${isCash ? 'cash game (NL Hold\'em)' : 'torneios de poker (MTT)'}.
Crie simulações realistas de mãos em português brasileiro.
IMPORTANTE: Mantenha SEMPRE os termos técnicos em inglês (call, fold, raise, check, bet, range, equity, EV, GTO, c-bet, flop, turn, river, etc). Nunca os traduza.
Sempre retorne JSON válido, sem markdown extra, sem texto fora do JSON.
Use notação de cartas: A♠ K♥ Q♦ J♣ T=10.
Para naipes no texto (fora da notação de carta): Espadas (♠), Copas (♥), Ouros (♦), Paus (♣) — NUNCA "corações"; o naipe ♥ é sempre "Copas" em poker.
Não use termos compostos híbridos como "3-bet-happy", "fold-equity-aware" etc. Use termos poker padrão ou descreva o conceito em português.`;

  const contextRule = isCash
    ? `0. CONTEXTO OBRIGATÓRIO — CASH GAME: stacks profundos (100–200bb), sem antes, sem pressão de bubble ou ICM, sem aumento de blinds. Mencione rake quando relevante.`
    : `0. CONTEXTO OBRIGATÓRIO — TORNEIO (MTT): stacks em BBs de fase (80–120bb early, 25–60bb mid, 8–20bb late/bubble), antes a partir do mid-stage, pressão de bubble/ICM quando aplicável. NUNCA use contexto de cash game.`;

  const prompt = `Crie UMA simulação de mão de poker AVANÇADA (nível DIFÍCIL) sobre "${topicTitle}".

REGRAS OBRIGATÓRIAS:
${contextRule}
1. A mão deve ter 3-4 streets (pré-flop, flop, turn e opcionalmente river).
2. "narrative": 4-5 parágrafos envolventes descrevendo como a mão se desenvolveu — contexto, raciocínios, leituras de range, dinâmica da mesa. Linguagem de comentarista de poker ao vivo. NÃO revele a resposta correta. Termine exatamente no momento de decisão.
3. "correct": índice 0-based da opção correta. A "explanation" DEVE confirmar exatamente essa opção.
4. A pergunta deve exigir range thinking, MDF, blockers ou cálculo avançado — nível DIFÍCIL.
5. Varie posições, mãos e boards a cada chamada para gerar mãos sempre diferentes.

Retorne APENAS este JSON válido (sem markdown):
{
  "heroHand":"K♠Q♦","position":"BB","villainPosition":"BTN","board":"K♥J♣4♦2♠","pot":"45bb","stack":"70bb",
  "streets":[
    {"name":"Pré-Flop","actions":["BTN: Raise 3bb","BB (Você): Call"]},
    {"name":"Flop (K♥J♣4♦)","actions":["BB: Check","BTN: Bet 12bb","BB: Call"]},
    {"name":"Turn (2♠)","actions":["BB: Check","BTN: Bet 38bb (overbet)","BB: ?"]}
  ],
  "narrative":"4-5 parágrafos de narração avançada sobre ${topicTitle} chegando ao momento crítico sem revelar a resposta",
  "situation":"Resumo em 1 frase da situação complexa",
  "question":"Qual é sua ação?",
  "options":["Fold","Call 38bb","Raise 90bb","All-in"],
  "correct":1,
  "analysis":{
    "explanation":"2-3 parágrafos com range thinking, MDF e ${topicTitle}. Por que as outras opções são piores.",
    "ev":"EV(Call) vs EV(Fold) vs EV(Raise) com cálculos baseados em ${topicTitle}.",
    "gto":"Frequências GTO avançadas. Como ${topicTitle} define a distribuição de ações."
  }
}`;

  try {
    const text = await callClaude(system, prompt, 3000);
    const sim = extractJson(text);
    if (!sim || !sim.options || sim.correct === undefined) throw new Error('JSON');
    res.json({ sim });
  } catch (err) {
    console.error('Erro ao gerar mão de prática:', err.message);
    if (err.name === 'TimeoutError') {
      return res.status(504).json({ error: 'A IA demorou mais de 55s. Tente novamente.' });
    }
    if (err.message.includes('JSON')) {
      return res.status(502).json({ error: 'IA retornou formato inválido. Tente novamente.' });
    }
    res.status(500).json({ error: err.message });
  }
});

export default router;
