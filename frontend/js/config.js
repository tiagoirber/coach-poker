// =============================================================
// config.js — Configurações globais do frontend
//
// Este arquivo inicializa o Firebase Client SDK e exporta
// as instâncias prontas para uso em todos os outros módulos.
// =============================================================

// URL do seu servidor Express (backend)
// Em desenvolvimento: localhost; em produção: URL do Cloud Run ou Render
export const API_URL = 'http://127.0.0.1:3000/api';

// Configuração do Firebase (pode ser pública — é o projeto, não a chave admin)
// Encontre em: Firebase Console → Configurações do projeto → Seus apps → Configuração SDK
const firebaseConfig = {
  apiKey:            "AIzaSyDLgfdHXk87rgvjDia19-BcgKiLRDpUNhU",
  authDomain:        "poker-coach-ia.firebaseapp.com",
  projectId:         "poker-coach-ia",
  storageBucket:     "poker-coach-ia.firebasestorage.app",
  messagingSenderId: "310712863013",
  appId:             "1:310712863013:web:2b0f206cd0d9a41d8172cc",
};

// Guard contra inicialização dupla (se dois scripts importarem este arquivo)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Exporta as instâncias do Firebase para os outros módulos
export const fbAuth = firebase.auth();
export const fbDb   = firebase.firestore();

// Currículo completo — reutilizado no dashboard e na página de lição
export const CURRICULUM = [
  {day:1,  week:1,  title:"Pot Odds & Equidade",        description:"A relação matemática entre pote e custo de uma call.", category:"MATH"},
  {day:2,  week:1,  title:"Ranges Pré-Flop (RFI)",       description:"Quais mãos abrir de cada posição.",                    category:"PREFLOP"},
  {day:3,  week:1,  title:"Vantagem de Posição",          description:"Por que agir por último é vantajoso.",                 category:"POSTFLOP"},
  {day:4,  week:1,  title:"Textura de Board",             description:"Boards secos vs úmidos vs conectados.",                category:"POSTFLOP"},
  {day:5,  week:1,  title:"Fundamentos da C-Bet",         description:"A lógica por trás da continuation bet.",              category:"POSTFLOP"},
  {day:6,  week:1,  title:"Mental Game: Fim do Tilt",     description:"Ferramentas psicológicas para manter o foco.",        category:"MENTAL"},
  {day:7,  week:1,  title:"Revisão Semana 1",             description:"Consolidação: pot odds, ranges, posição e c-bet.",    category:"MENTAL"},
  {day:8,  week:2,  title:"Mecânica de 3-Bet",            description:"Ranges lineares vs polares para 3-bet.",              category:"PREFLOP"},
  {day:9,  week:2,  title:"Jogando dos Blinds",           description:"Defesa de BB com MDF.",                               category:"PREFLOP"},
  {day:10, week:2,  title:"Donk Betting",                 description:"Quando liderar contra o agressor faz sentido.",       category:"POSTFLOP"},
  {day:11, week:2,  title:"Check-Raising no Flop",        description:"Proteger range e punir c-bets automáticas.",          category:"POSTFLOP"},
  {day:12, week:2,  title:"Probes no Turn",               description:"Atacar fraqueza quando agressor checa no flop.",      category:"POSTFLOP"},
  {day:13, week:2,  title:"Implied Odds",                 description:"Calculando o valor futuro de draws.",                 category:"MATH"},
  {day:14, week:2,  title:"Revisão Semana 2",             description:"Análise de mãos com 3-bet e check-raise.",            category:"MENTAL"},
  {day:15, week:3,  title:"Delayed C-Bet",                description:"Por que checar o flop pode ser mais forte.",          category:"POSTFLOP"},
  {day:16, week:3,  title:"Barreling no Turn",            description:"Mantendo pressão em turn cards favoráveis.",          category:"POSTFLOP"},
  {day:17, week:3,  title:"Blockers e Combinatória",      description:"A matemática das remoções de cartas.",                category:"MATH"},
  {day:18, week:3,  title:"Value Betting no River",       description:"Thin value: extraindo máximo de mãos marginais.",     category:"POSTFLOP"},
  {day:19, week:3,  title:"Bluff Catching",               description:"Identificar blefes por linhas inconsistentes.",       category:"MATH"},
  {day:20, week:3,  title:"Overbets e Polarização",       description:"Apostas acima do pote para maximizar EV.",            category:"POSTFLOP"},
  {day:21, week:3,  title:"Revisão Semana 3",             description:"Simulações flop → turn → river.",                    category:"MENTAL"},
  {day:22, week:4,  title:"Estratégia 20-30 BBs",         description:"Push/fold intermediário e re-steal.",                 category:"PREFLOP"},
  {day:23, week:4,  title:"Estratégia de Bolha",          description:"Pressão máxima com stacks grandes.",                  category:"ICM"},
  {day:24, week:4,  title:"Introdução ao ICM",            description:"O que é o Independent Chip Model.",                   category:"ICM"},
  {day:25, week:4,  title:"Defesa de Blinds com Antes",   description:"Ranges mais amplos com ante.",                        category:"MATH"},
  {day:26, week:4,  title:"Estratégia de Mesa Final",     description:"Pressão de premiação e posição relativa.",            category:"ICM"},
  {day:27, week:4,  title:"Flatting vs 3-Bet/Jam",        description:"Quando pagar vs all-in vs reraise.",                  category:"PREFLOP"},
  {day:28, week:4,  title:"Revisão Semana 4",             description:"Simulações ICM com premiações reais.",                category:"MENTAL"},
  {day:29, week:5,  title:"Player Profiling",             description:"Classificar vilões: TIGHT/LOOSE e PASSIVE/AGGRESSIVE.", category:"MENTAL"},
  {day:30, week:5,  title:"Exploitando Nits",             description:"Estratégia contra jogadores super-tight.",            category:"PREFLOP"},
  {day:31, week:5,  title:"Exploitando Fish",             description:"Value bet em excesso, nunca blefar.",                 category:"POSTFLOP"},
  {day:32, week:5,  title:"Exploitando Maniacs",          description:"Trapping e pot controle contra agressivos.",          category:"POSTFLOP"},
  {day:33, week:5,  title:"Reads e Tells",                description:"Timing tells, sizing tells e padrões.",               category:"MENTAL"},
  {day:34, week:5,  title:"Table Selection",              description:"Escolher a mesa certa é fundamental.",                 category:"MENTAL"},
  {day:35, week:5,  title:"Revisão Semana 5",             description:"Perfis de vilões e ajustes.",                         category:"MENTAL"},
  {day:36, week:6,  title:"4-Bet e 5-Bet",               description:"Ranges de 4-bet para valor e blefe.",                 category:"PREFLOP"},
  {day:37, week:6,  title:"Squeeze Play",                 description:"3-bet isolador com callers à frente.",                category:"PREFLOP"},
  {day:38, week:6,  title:"Steals e Resteal",             description:"Frequência correta de steal por posição.",            category:"PREFLOP"},
  {day:39, week:6,  title:"Limp-Raise e Limp-Call",       description:"Quando limpar pré-flop tem sentido.",                 category:"PREFLOP"},
  {day:40, week:6,  title:"Multi-Way Pré-Flop",           description:"Ajustes de range com múltiplos callers.",             category:"PREFLOP"},
  {day:41, week:6,  title:"Ajustes por Stack Depth",      description:"Como profundidade de stack muda tudo.",               category:"MATH"},
  {day:42, week:6,  title:"Revisão Semana 6",             description:"Quiz de situações pré-flop avançadas.",              category:"MENTAL"},
  {day:43, week:7,  title:"C-Bet em Multi-Way",           description:"C-bet perde valor com múltiplos oponentes.",          category:"POSTFLOP"},
  {day:44, week:7,  title:"Range Advantage no Flop",      description:"Como identificar vantagem de range.",                 category:"POSTFLOP"},
  {day:45, week:7,  title:"Tamanhos de Aposta no Flop",   description:"33% vs 50% vs 75% vs overbet.",                      category:"POSTFLOP"},
  {day:46, week:7,  title:"Slow Playing",                 description:"Quando checar mãos fortes faz sentido.",              category:"POSTFLOP"},
  {day:47, week:7,  title:"Semi-Bluffs no Flop",          description:"Draws como ferramentas de pressão.",                  category:"POSTFLOP"},
  {day:48, week:7,  title:"Board Coverage e Equity",      description:"Como seu range cobre diferentes boards.",             category:"MATH"},
  {day:49, week:7,  title:"Revisão Semana 7",             description:"Análise de flops e frequências.",                    category:"MENTAL"},
  {day:50, week:8,  title:"Turn Card Analysis",           description:"Como cada carta do turn muda ranges.",                category:"POSTFLOP"},
  {day:51, week:8,  title:"Second Barrel Strategy",       description:"Quando continuar no turn após c-bet?",               category:"POSTFLOP"},
  {day:52, week:8,  title:"Turn Check-Raise",             description:"Proteção de range e blefe no turn.",                  category:"POSTFLOP"},
  {day:53, week:8,  title:"Pot Control no Turn",          description:"Quando desacelerar com mãos médias.",                 category:"POSTFLOP"},
  {day:54, week:8,  title:"Float Play",                   description:"Chamar fraco para roubar no turn.",                   category:"POSTFLOP"},
  {day:55, week:8,  title:"Flush e Straight Draws",       description:"Como jogar draws no turn.",                           category:"MATH"},
  {day:56, week:8,  title:"Revisão Semana 8",             description:"Simulações de turn.",                                 category:"MENTAL"},
  {day:57, week:9,  title:"River Bet Sizing Avançado",    description:"Sizing baseado na composição de range.",              category:"POSTFLOP"},
  {day:58, week:9,  title:"Frequência de Blefe no River", description:"A regra do MDF.",                                     category:"MATH"},
  {day:59, week:9,  title:"River Check-Raise Bluff",      description:"Check-raise no river como blefe.",                    category:"POSTFLOP"},
  {day:60, week:9,  title:"Triple Barrel Bluffs",         description:"Contar história consistente em 3 ruas.",              category:"POSTFLOP"},
  {day:61, week:9,  title:"Thin Value no River",          description:"Valor com mãos de margem pequena.",                   category:"POSTFLOP"},
  {day:62, week:9,  title:"Jam Lines no River",           description:"Quando all-in maximiza EV.",                          category:"POSTFLOP"},
  {day:63, week:9,  title:"Revisão Semana 9",             description:"River spots completos.",                              category:"MENTAL"},
  {day:64, week:10, title:"Introdução ao GTO",            description:"O que é Game Theory Optimal.",                        category:"MATH"},
  {day:65, week:10, title:"Frequency-Based Thinking",     description:"Pensar em frequências, não mãos individuais.",        category:"MATH"},
  {day:66, week:10, title:"Mixed Strategies",             description:"Por que solvers misturam ações.",                     category:"MATH"},
  {day:67, week:10, title:"GTO vs Exploitative",          description:"Quando seguir GTO e quando explorar?",               category:"MENTAL"},
  {day:68, week:10, title:"Usando Solvers",               description:"Como interpretar outputs de PioSolver.",              category:"MATH"},
  {day:69, week:10, title:"Node Locking",                 description:"Forçar exploits no solver.",                          category:"MATH"},
  {day:70, week:10, title:"Revisão Semana 10",            description:"GTO aplicado.",                                       category:"MENTAL"},
  {day:71, week:11, title:"ICM Avançado",                 description:"Quando ChipEV e $EV divergem.",                       category:"ICM"},
  {day:72, week:11, title:"Nash em Push/Fold",            description:"Tabelas de Nash abaixo de 15 BBs.",                   category:"ICM"},
  {day:73, week:11, title:"ICM em Satélites",             description:"ICM extremo em satélites.",                           category:"ICM"},
  {day:74, week:11, title:"Acumulação vs Sobrevivência",  description:"Acumule cedo, sobreviva tarde.",                      category:"ICM"},
  {day:75, week:11, title:"Bankroll Management",          description:"Limites de buy-in e gestão financeira.",              category:"MENTAL"},
  {day:76, week:11, title:"Deal Making",                  description:"Chops e negociações na mesa final.",                  category:"ICM"},
  {day:77, week:11, title:"Revisão Semana 11",            description:"Simulações ICM avançadas.",                           category:"MENTAL"},
  {day:78, week:12, title:"Gestão de Downswings",         description:"Como sobreviver a sequências ruins.",                 category:"MENTAL"},
  {day:79, week:12, title:"Mindfulness e Flow State",     description:"Atenção plena para longas sessões.",                  category:"MENTAL"},
  {day:80, week:12, title:"Estudo vs Volume",             description:"Equilíbrio entre estudo e jogo.",                     category:"MENTAL"},
  {day:81, week:12, title:"Hand History Review",          description:"Como revisar mãos com eficiência.",                   category:"MENTAL"},
  {day:82, week:12, title:"Leaks Mais Comuns",            description:"Os 10 vazamentos em micro stakes.",                   category:"POSTFLOP"},
  {day:83, week:12, title:"Construindo uma Rotina",       description:"Estrutura ideal de dia de poker.",                    category:"MENTAL"},
  {day:84, week:12, title:"Revisão Semana 12",            description:"Identifique seus leaks.",                             category:"MENTAL"},
  {day:85, week:13, title:"Teoria dos Jogos",             description:"Exploração, punição e metagame.",                     category:"MATH"},
  {day:86, week:13, title:"Poker Heads-Up",               description:"Dinâmicas únicas do HU.",                             category:"PREFLOP"},
  {day:87, week:13, title:"Short Deck Hold'em",           description:"Variante com cartas removidas.",                      category:"POSTFLOP"},
  {day:88, week:13, title:"Live Poker Adjustments",       description:"Diferenças entre live e online.",                     category:"MENTAL"},
  {day:89, week:13, title:"Construindo seu Estilo",       description:"Integrar GTO com exploração.",                        category:"MENTAL"},
  {day:90, week:13, title:"Mindset de Elite",             description:"A psicologia dos vencedores de High Stakes.",         category:"MENTAL"},
];

// Cores de cada categoria (para badges coloridos)
export const CATEGORY_COLORS = {
  MATH:     { bg:'rgba(52,211,153,0.15)',  text:'#34d399' },
  PREFLOP:  { bg:'rgba(147,197,253,0.15)', text:'#93c5fd' },
  POSTFLOP: { bg:'rgba(196,181,253,0.15)', text:'#c4b5fd' },
  MENTAL:   { bg:'rgba(251,191,36,0.15)',  text:'#fbbf24' },
  ICM:      { bg:'rgba(252,165,165,0.15)', text:'#fca5a5' },
};

export const XP_BY_CATEGORY = {
  MATH:30, PREFLOP:25, POSTFLOP:25, MENTAL:20, ICM:30
};
