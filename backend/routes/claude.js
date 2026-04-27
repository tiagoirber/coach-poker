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
import { verifyToken } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';

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
function getFallbackLesson(day, title, description, category) {
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
        { question: `O que é ${title}?`, options: ['A) Uma jogada aleatória','B) '+description,'C) Uma aposta de blefe','D) Uma dobra defensiva'], correct: 1, explanation: `${title} significa: ${description}` },
        { question: 'Qual é o objetivo principal ao estudar poker?', options: ['A) Ganhar sempre','B) Blefar mais','C) Tomar decisões com EV positivo','D) Memorizar mãos'], correct: 2, explanation: 'EV positivo a longo prazo é o fundamento do poker lucrativo.' },
      ],
      medium: [
        { question: `Como ${title} afeta suas decisões no jogo?`, options: ['A) Não afeta','B) Muda apenas pré-flop','C) Influencia o tamanho das apostas e frequências','D) Só importa no river'], correct: 2, explanation: `${title} deve guiar frequências e sizings em todas as ruas.` },
        { question: 'Você está no BTN com A♠K♦, pote 20bb, oponente aposta 15bb no flop A♥7♣2♦. O que fazer?', options: ['A) Fold','B) Call','C) Raise para valor','D) All-in imediato'], correct: 2, explanation: 'Top pair top kicker em board seco — raise para construir pote e proteger.' },
      ],
      hard: [
        { question: 'Com pot odds de 25% e equity de 30%, qual a decisão correta?', options: ['A) Fold sempre','B) Call — equity supera pot odds','C) Raise bluff','D) Depende do oponente apenas'], correct: 1, explanation: 'Quando equity (30%) > pot odds necessários (25%), call tem EV positivo.' },
        { question: `Aplicando ${title} em GTO, quando você deve usar mixed strategy?`, options: ['A) Nunca','B) Sempre','C) Quando o oponente é imprevisível','D) Para manter o oponente indiferente entre suas opções'], correct: 3, explanation: 'Mixed strategies evitam que o oponente explore frequências fixas.' },
      ],
    },
    handSimulations: {
      easy: {
        heroHand:'A♠K♦', position:'BTN', board:'A♥7♣2♦', pot:'12bb',
        streets:[
          { name:'Pré-Flop', actions:['CO: Fold','BTN (Você): Raise 2.5bb','BB: Call'] },
          { name:'Flop (A♥7♣2♦)', actions:['BB: Check','BTN: ?'] },
        ],
        situation:'Board seco, você tem top pair top kicker em posição.',
        question:'Qual é sua ação?',
        options:['Fold','Check','Bet 5bb','Bet 9bb','Raise'],
        correct:2,
        analysis:{
          explanation:`Com TPTK (${title}) em board seco A-7-2, bet para valor é a jogada correta. O oponente tem pares médios, Ax fraco e mãos que pagarão nossa aposta.\n\nApostar 5bb em um pote de 12bb (40%) é o sizing ideal: extrai valor de mãos fracas sem assustar o oponente. Checar seria passivo e perderia valor contra o range do BB.`,
          ev:'EV(Bet 5bb) ≈ +3.8bb | EV(Check) ≈ +1.6bb. Bet é superior pois o range do BB inclui ~60% de mãos que pagam ao menos uma rua.',
          gto:'Frequência de bet: 72% | Check: 28%. TPTK em board seco fica majoritariamente na linha de bet para valor, com uma minoria checada para balancear o range.',
        },
      },
      medium: {
        heroHand:'J♠T♠', position:'CO', board:'9♥8♦3♣', pot:'22bb',
        streets:[
          { name:'Pré-Flop', actions:['CO (Você): Raise 2.5bb','BTN: Fold','BB: Call'] },
          { name:'Flop (9♥8♦3♣)', actions:['BB: Check','CO: ?'] },
        ],
        situation:'Você tem OESD com dois overcards. Oponente checou no flop.',
        question:'Qual é sua ação?',
        options:['Fold','Check','Bet 8bb','Raise 25bb','All-in'],
        correct:2,
        analysis:{
          explanation:`JTs em 9-8-3 tem 8 outs para straight (qualquer 7 ou Q), aproximadamente 32% de equity no flop. Aplicando ${title}, o semi-bluff bet é ideal: podemos ganhar imediatamente se o oponente dobrar, ou melhorar no turn.\n\nO sizing de 8bb (~36% do pote) é eficiente: suficiente para dar fold equity sem arriscar muito com draw.`,
          ev:'EV(Bet 8bb) ≈ +4.2bb considerando 40% de fold equity + equity quando chamado. EV(Check) ≈ +1.8bb apenas com equity de draw.',
          gto:'Frequência de c-bet: 65% | Check: 35%. JTs é ideal para semi-bluff; misturamos check para não ser explorado no turn.',
        },
      },
      hard: {
        heroHand:'K♠Q♦', position:'BB', board:'K♥J♣4♦2♠', pot:'45bb',
        streets:[
          { name:'Pré-Flop', actions:['BTN: Raise 3bb','BB (Você): Call'] },
          { name:'Flop (K♥J♣4♦)', actions:['BB: Check','BTN: Bet 12bb','BB: Call'] },
          { name:'Turn (2♠)', actions:['BB: Check','BTN: Bet 38bb (overbet)','BB: ?'] },
        ],
        situation:'Oponente faz overbet 38bb em pote de 45bb no turn. Range polarizado.',
        question:'Qual é sua ação?',
        options:['Fold','Call 38bb','Raise 90bb','All-in'],
        correct:1,
        analysis:{
          explanation:`KQ em K-J-4-2 é um bluff catcher ideal contra overbet polarizada. O oponente tem sets, KJ (two pair), 22/44 como nuts — e blefes como QT, AQ. Nossa mão bate todos os blefes mas perde para os nuts.\n\nCom ${title}, call é correto: a overbet indica polarização, e temos equity suficiente como bluff catcher para chamar com frequência.`,
          ev:'EV(Call) ≈ +0.6bb (limite de MDF exige chamar ~47% para não ser explorado). EV(Fold) = 0. EV(Raise) ≈ -18bb (errado, só nuts devem reraise).',
          gto:'Frequência de call: 55% | Fold: 42% | Raise: 3% (apenas KJ, sets). TPGK está no topo da nossa gama de bluff-catchers — chamamos mais que dobramos.',
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
// Gera o conteúdo didático completo de uma lição do currículo.
// Retorna JSON estruturado com teoria, exemplos e quiz.
router.post('/lesson', verifyToken, claudeLimiter, async (req, res) => {
  const { day, title, description, category } = req.body;

  if (!day || !title || !category) {
    return res.status(400).json({ error: 'day, title e category são obrigatórios.' });
  }

  const system = `Você é um coach de poker profissional especializado em torneios e cash games.
Crie conteúdo didático rico em português brasileiro, com linguagem clara para iniciantes a intermediários.
Sempre retorne JSON válido, sem markdown extra, sem texto fora do JSON.
Use notação de cartas: A♠ K♥ Q♦ J♣ T=10.`;

  const prompt = `Crie uma lição COMPLETA de poker para o Dia ${day} do plano de 90 dias.
Título: "${title}"
Descrição: "${description}"
Categoria: ${category}

Retorne APENAS este JSON válido (sem markdown, sem texto extra):
{
  "theory": "Explicação em 3-4 parágrafos detalhados sobre ${title} em português",
  "keyPoints": ["ponto 1", "ponto 2", "ponto 3", "ponto 4"],
  "quiz": {
    "easy": [
      {"question":"Pergunta simples sobre ${title}","options":["A) opt","B) opt","C) opt","D) opt"],"correct":0,"explanation":"Explicação"},
      {"question":"Segunda pergunta fácil","options":["A) opt","B) opt","C) opt","D) opt"],"correct":1,"explanation":"Explicação"}
    ],
    "medium": [
      {"question":"Situação intermediária de jogo","options":["A) opt","B) opt","C) opt","D) opt"],"correct":2,"explanation":"Explicação com raciocínio"},
      {"question":"Segunda pergunta intermediária","options":["A) opt","B) opt","C) opt","D) opt"],"correct":0,"explanation":"Explicação"}
    ],
    "hard": [
      {"question":"Pergunta avançada com GTO ou cálculo","options":["A) opt","B) opt","C) opt","D) opt"],"correct":3,"explanation":"Explicação avançada"},
      {"question":"Segunda pergunta difícil","options":["A) opt","B) opt","C) opt","D) opt"],"correct":1,"explanation":"Explicação"}
    ]
  },
  "handSimulations": {
    "easy": {
      "heroHand":"A♠K♦","position":"BTN","board":"A♥7♣2♦","pot":"12bb",
      "streets":[
        {"name":"Pré-Flop","actions":["CO: Fold","BTN (Você): Raise 2.5bb","BB: Call"]},
        {"name":"Flop (A♥7♣2♦)","actions":["BB: Check","BTN: ?"]}
      ],
      "situation":"Situação simples relacionada a ${title}",
      "question":"Qual é sua ação?",
      "options":["Fold","Check","Bet 5bb","Bet 9bb","Raise"],
      "correct":2,
      "analysis":{
        "explanation":"2 parágrafos explicando a decisão correta aplicando ${title}.",
        "ev":"EV(opção correta) vs alternativas em formato numérico. Justificativa matemática breve.",
        "gto":"Frequência GTO: Ação A X% | Ação B Y%. Razão em 1 frase sobre ${title}."
      }
    },
    "medium": {
      "heroHand":"J♠T♠","position":"CO","board":"9♥8♦3♣","pot":"22bb",
      "streets":[
        {"name":"Pré-Flop","actions":["CO (Você): Raise 2.5bb","BTN: Fold","BB: Call"]},
        {"name":"Flop (9♥8♦3♣)","actions":["BB: Check","CO: ?"]}
      ],
      "situation":"Situação intermediária com mais variáveis e ${title}",
      "question":"Qual é sua ação?",
      "options":["Fold","Check","Bet 8bb","Raise 25bb","All-in"],
      "correct":2,
      "analysis":{
        "explanation":"2 parágrafos sobre a decisão intermediária usando ${title}.",
        "ev":"EV comparativo entre as principais opções com números aproximados.",
        "gto":"Frequências GTO para esta situação e como ${title} as determina."
      }
    },
    "hard": {
      "heroHand":"K♠Q♦","position":"BB","board":"K♥J♣4♦2♠","pot":"45bb",
      "streets":[
        {"name":"Pré-Flop","actions":["BTN: Raise 3bb","BB (Você): Call"]},
        {"name":"Flop (K♥J♣4♦)","actions":["BB: Check","BTN: Bet 12bb","BB: Call"]},
        {"name":"Turn (2♠)","actions":["BB: Check","BTN: Bet 38bb (overbet)","BB: ?"]}
      ],
      "situation":"Situação complexa com pressão e conceito avançado de ${title}",
      "question":"Qual é sua ação?",
      "options":["Fold","Call 38bb","Raise 90bb","All-in"],
      "correct":1,
      "analysis":{
        "explanation":"2 parágrafos de análise avançada com range thinking e ${title}.",
        "ev":"EV detalhado: EV(Call) vs EV(Fold) vs EV(Raise) com cálculos de MDF ou equity.",
        "gto":"Frequências GTO avançadas. Como ${title} define a distribuição de ações."
      }
    }
  },
  "infiniteTraining":{
    "concept":"1 frase resumindo o que praticar sobre ${title}",
    "drill":"Exercício prático para as próximas sessões de jogo",
    "challenge":"Desafio: faça X durante Y mãos e anote os resultados"
  },
  "tip":"Dica de 1-2 frases para aplicar ${title} imediatamente"
}`;

  try {
    const text   = await callClaude(system, prompt, 5500);
    // Extrai o JSON mesmo que a IA coloque texto antes/depois
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON');
    const lesson = JSON.parse(jsonMatch[0]);
    res.json({ lesson });
  } catch (err) {
    console.error('Erro ao gerar lição:', err.message);
    // Se for erro de crédito/billing, usa conteúdo de exemplo
    if (err.message.includes('credit') || err.message.includes('billing') || err.message.includes('balance')) {
      console.log('⚠️  Usando conteúdo de fallback (verifique o saldo na Anthropic)');
      return res.json({ lesson: getFallbackLesson(day, title, description, category), fallback: true });
    }
    if (err.message.includes('JSON')) {
      return res.status(502).json({ error: 'IA retornou formato inválido. Tente novamente.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/claude/chat ─────────────────────────────────────
// Chat livre com o coach. O usuário pode tirar dúvidas sobre poker.
router.post('/chat', verifyToken, claudeLimiter, async (req, res) => {
  const { message, context } = req.body;

  if (!message || message.trim().length < 3) {
    return res.status(400).json({ error: 'Mensagem muito curta.' });
  }

  if (message.length > 1000) {
    return res.status(400).json({ error: 'Mensagem deve ter no máximo 1000 caracteres.' });
  }

  const system = `Você é o Coach Poker IA, um especialista em poker para torneios e cash games.
Responda em português brasileiro, de forma didática e objetiva.
Foco em conceitos GTO, exploits e mental game.
Se a pergunta não for sobre poker, redirecione educadamente.
Máximo de 400 palavras por resposta.`;

  const fullMessage = context
    ? `Contexto: estou estudando "${context}"\n\nPergunta: ${message}`
    : message;

  try {
    const reply = await callClaude(system, fullMessage, 600);
    res.json({ reply });
  } catch (err) {
    console.error('Erro no chat:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
