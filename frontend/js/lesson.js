// =============================================================
// lesson.js — Lição completa com todas as funcionalidades
// Visual cards, Feynman, 5 action buttons, streets, 3-tab analysis,
// infinite training FOCADO/GERAL, celebration screen, glossary
// =============================================================

import { fbAuth, CURRICULUM, CATEGORY_COLORS, XP_BY_CATEGORY, LESSON_CACHE_VER } from './config.js';
import { claudeApi, progressApi, userApi } from './api.js';
import { applyGlossary } from './glossary.js';

// Sanitiza recursivamente todos os campos string de um objeto vindo da IA.
// Strips qualquer HTML — o conteúdo da IA deve ser texto puro; o HTML é
// construído pelos nossos templates, nunca pela IA.
function sanitizeAiData(val) {
  if (typeof val === 'string') {
    return typeof DOMPurify !== 'undefined'
      ? DOMPurify.sanitize(val, { ALLOWED_TAGS: [] })
      : val;
  }
  if (Array.isArray(val)) return val.map(sanitizeAiData);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = sanitizeAiData(v);
    return out;
  }
  return val;
}

// ── State ─────────────────────────────────────────────────────
let currentTopic   = null;
let lessonData     = null;
let alreadyDone    = false;
let quizState = {
  easy:   { current: 0, answers: {} },
  medium: { current: 0, answers: {} },
  hard:   { current: 0, answers: {} },
};
let simAnswered      = { easy:false, medium:false, hard:false };
let infiniteAnswered = false;
let feynmanDone      = false;
let nextLesson     = null;
// Cancela uma geração de mão em voo se o usuário disparar outra antes do
// resultado chegar (ex: clica FOCADO depois GERAL). Sem isso, a resposta
// tardia da primeira sobrescreveria window._infSim e o usuário responderia
// contra a mão errada.
let infiniteController = null;

// ── Step progression ──────────────────────────────────────────
const STEPS = [
  { id:'theory',      label:'Teoria',     icon:'📖' },
  { id:'feynman',     label:'Feynman',    icon:'🧬' },
  { id:'quiz-easy',   label:'Quiz Fácil', icon:'🧠' },
  { id:'quiz-medium', label:'Quiz Médio', icon:'🧠' },
  { id:'quiz-hard',   label:'Quiz Difíc', icon:'🧠' },
  { id:'sim-easy',    label:'Sim Fácil',  icon:'🎯' },
  { id:'sim-medium',  label:'Sim Médio',  icon:'🎯' },
  { id:'sim-hard',    label:'Sim Difíc',  icon:'🎯' },
  { id:'training',    label:'Treino ∞',   icon:'♾️' },
];
const STEP_NEXT = {
  'feynman':    'quiz-easy',
  'quiz-easy':  'quiz-medium',
  'quiz-medium':'quiz-hard',
  'quiz-hard':  'sim-easy',
  'sim-easy':   'sim-medium',
  'sim-medium': 'sim-hard',
  'sim-hard':   'training',
};
let completedSteps = new Set(['theory']);
let currentStep    = 'theory';

function stepPanelId(stepId) {
  // theory e feynman têm IDs próprios; demais seguem step-{id}
  if (stepId === 'feynman') return 'feynman-section';
  return `step-${stepId}`;
}

function showStep(stepId) {
  document.querySelectorAll('.step-panel').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(stepPanelId(stepId));
  if (target) {
    // re-trigger animação removendo e re-adicionando active no próximo frame
    void target.offsetWidth;
    target.classList.add('active');
  }
  currentStep = stepId;
  updateStepper();
  // não rolamos a página — a etapa surge no mesmo espaço visual
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function updateStepper() {
  const el = document.getElementById('progress-stepper');
  if (!el) return;
  let html = '<div style="display:flex;align-items:flex-start;min-width:max-content;">';
  STEPS.forEach((step, i) => {
    const done    = completedSteps.has(step.id);
    const current = step.id === currentStep;
    let cStyle, lColor, icon;
    if (current) {
      cStyle = 'background:rgba(200,160,69,0.2);border-color:#c8a045;box-shadow:0 0 0 3px rgba(200,160,69,0.18);';
      lColor = '#c8a045'; icon = step.icon;
    } else if (done) {
      cStyle = 'background:rgba(52,211,153,0.2);border-color:#34d399;';
      lColor = '#34d399'; icon = '✓';
    } else {
      cStyle = 'background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.1);';
      lColor = '#4b5563'; icon = '🔒';
    }
    html += `<button type="button" class="step-dot" onclick="goToStep('${step.id}')" aria-label="${step.label}">
      <div style="width:30px;height:30px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;${cStyle}">${icon}</div>
      <span style="font-size:8px;color:${lColor};text-align:center;margin-top:3px;line-height:1.2;max-width:44px;">${step.label}</span>
    </button>`;
    if (i < STEPS.length - 1) {
      const lineColor = done ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.07)';
      html += `<div style="flex:1;height:2px;background:${lineColor};margin-top:14px;min-width:8px;"></div>`;
    }
  });
  html += '</div>';
  el.innerHTML = html;
}

window.advanceStep = function(fromStepId) {
  completedSteps.add(fromStepId);
  const nextId = STEP_NEXT[fromStepId];
  if (nextId) {
    showStep(nextId);
  } else {
    updateStepper();
  }
};

window.goToStep = function(stepId) {
  if (stepId === currentStep) return;
  if (completedSteps.has(stepId)) {
    showStep(stepId);
    return;
  }
  // Pulo para frente — pedir confirmação
  const target = STEPS.find(s => s.id === stepId);
  const ok = window.confirm(
    `Pular para "${target.label}"? As etapas anteriores serão marcadas como concluídas.`
  );
  if (!ok) return;
  // marca todas as anteriores como concluídas
  const idx = STEPS.findIndex(s => s.id === stepId);
  for (let i = 0; i < idx; i++) completedSteps.add(STEPS[i].id);
  showStep(stepId);
};

// ── Init ──────────────────────────────────────────────────────
fbAuth.onAuthStateChanged(async (user) => {
  if (!user) return;
  const params = new URLSearchParams(window.location.search);
  const day    = parseInt(params.get('day'));
  if (!day || day < 1 || day > 91) { window.location.href = '/pages/dashboard.html'; return; }
  currentTopic = CURRICULUM.find(t => t.day === day);
  if (!currentTopic) { window.location.href = '/pages/dashboard.html'; return; }
  nextLesson = CURRICULUM.find(t => t.day === day + 1) || null;
  renderHeader();
  await checkIfCompleted();
  await loadLesson();
  initFeynman();
});

// ── Header ────────────────────────────────────────────────────
function renderHeader() {
  const colors = CATEGORY_COLORS[currentTopic.category];
  document.title = `Dia ${currentTopic.day}: ${currentTopic.title} — Poker Coach`;
  document.getElementById('nav-lesson-title').textContent   = `Dia ${currentTopic.day}: ${currentTopic.title}`;
  document.getElementById('lesson-title').textContent       = currentTopic.title;
  document.getElementById('lesson-description').textContent = currentTopic.description;
  document.getElementById('lesson-day-badge').textContent   = `Dia ${currentTopic.day}`;
  document.getElementById('xp-preview').textContent         = XP_BY_CATEGORY[currentTopic.category];
  const catBadge = document.getElementById('lesson-category-badge');
  catBadge.textContent      = currentTopic.category;
  catBadge.style.background = colors.bg;
  catBadge.style.color      = colors.text;
}

async function checkIfCompleted() {
  try {
    const { lessons } = await progressApi.getHistory();
    alreadyDone = lessons.some(l => l.day === currentTopic.day);
    if (alreadyDone) {
      document.getElementById('btn-complete').classList.add('hidden');
      document.getElementById('already-done-badge').classList.remove('hidden');
      // Lição já concluída: libera navegação completa pelo stepper sem confirmações
      STEPS.forEach(s => completedSteps.add(s.id));
    }
  } catch {}
}

// ── Load lesson ───────────────────────────────────────────────
async function loadLesson() {
  const { day, title, description, category } = currentTopic;
  const visitKey   = `lesson_visits_${day}`;
  const visitCount = parseInt(localStorage.getItem(visitKey) || '0', 10);
  const forceNew   = visitCount > 0;
  const cacheKey   = `lesson_${LESSON_CACHE_VER}_${day}`;

  // 1ª visita: tenta cache local (objeto completo com quiz+sims)
  if (!forceNew) {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        lessonData = sanitizeAiData(JSON.parse(cached));
        localStorage.setItem(visitKey, visitCount + 1);
        renderLesson();
        return;
      } catch {}
    }
  } else {
    localStorage.removeItem(cacheKey);
  }

  // Fase 1: teoria rápida (~10s)
  try {
    const { lesson } = await claudeApi.getLesson(day, title, description, category, forceNew);
    lessonData = sanitizeAiData(lesson);
    localStorage.setItem(visitKey, visitCount + 1);

    document.getElementById('loading-state').classList.add('hidden');
    document.getElementById('lesson-content').classList.remove('hidden');
    renderTheory();
    document.getElementById('tip-text').innerHTML = applyGlossary(lessonData.tip || '');
    // Placeholder nos painéis de exercício — bloqueados por Feynman de qualquer forma
    ['quiz-easy', 'quiz-medium', 'quiz-hard', 'sim-easy', 'sim-medium', 'sim-hard'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<p class="text-gray-500 animate-pulse text-sm py-6 text-center">⏳ Gerando exercícios...</p>';
    });
    showStep(currentStep);

    // Fase 2: exercícios em background
    loadExercises(day, title, description, category, forceNew, cacheKey);
  } catch (err) {
    document.getElementById('loading-state').innerHTML = `
      <div class="text-center py-20">
        <p class="text-5xl mb-4">⚠️</p>
        <p class="text-red-400 mb-2 font-semibold">Erro ao carregar lição</p>
        <p class="text-gray-500 text-sm mb-6">${err.message}</p>
        <button onclick="location.reload()"
                class="px-6 py-2 rounded-lg text-sm font-semibold"
                style="background:#0e1c10; border:1px solid rgba(255,255,255,0.1); color:#9ca3af;">
          Tentar novamente
        </button>
      </div>`;
  }
}

// ── Load exercises (fase 2, background) ──────────────────────
async function loadExercises(day, title, description, category, forceNew, cacheKey) {
  try {
    const { exercises } = await claudeApi.getLessonExercises(day, title, description, category, forceNew);
    lessonData = { ...lessonData, ...sanitizeAiData(exercises) };

    renderQuizCard('easy');
    renderQuizCard('medium');
    renderQuizCard('hard');
    renderSimLevel('easy');
    renderSimLevel('medium');
    renderSimLevel('hard');

    // Se o usuário já avançou para um passo de exercício, re-popula o painel ativo
    const exerciseSteps = new Set(['quiz-easy','quiz-medium','quiz-hard','sim-easy','sim-medium','sim-hard','training']);
    if (exerciseSteps.has(currentStep)) showStep(currentStep);

    // Salva objeto completo (teoria + exercícios) no cache local
    localStorage.setItem(cacheKey, JSON.stringify(lessonData));
  } catch (err) {
    console.error('Erro ao gerar exercícios:', err.message);
    const errHtml = `
      <div class="text-center py-6">
        <p class="text-red-400 text-sm mb-3">⚠️ Erro ao gerar exercícios</p>
        <button onclick="window.loadExercisesRetry()"
                class="px-4 py-2 rounded-lg text-xs font-semibold"
                style="background:#0e1c10; border:1px solid rgba(255,255,255,0.1); color:#9ca3af;">
          Tentar novamente
        </button>
      </div>`;
    ['quiz-easy', 'quiz-medium', 'quiz-hard', 'sim-easy', 'sim-medium', 'sim-hard'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = errHtml;
    });
  }
}

window.loadExercisesRetry = function() {
  const { day, title, description, category } = currentTopic;
  const visitKey   = `lesson_visits_${day}`;
  const visitCount = parseInt(localStorage.getItem(visitKey) || '0', 10);
  const forceNew   = visitCount > 0;
  const cacheKey   = `lesson_${LESSON_CACHE_VER}_${day}`;
  ['quiz-easy', 'quiz-medium', 'quiz-hard', 'sim-easy', 'sim-medium', 'sim-hard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<p class="text-gray-500 animate-pulse text-sm py-6 text-center">⏳ Gerando exercícios...</p>';
  });
  loadExercises(day, title, description, category, forceNew, cacheKey);
};

function renderLesson() {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('lesson-content').classList.remove('hidden');
  renderTheory();
  renderQuizCard('easy');
  renderQuizCard('medium');
  renderQuizCard('hard');
  renderSimLevel('easy');
  renderSimLevel('medium');
  renderSimLevel('hard');
  document.getElementById('tip-text').innerHTML = applyGlossary(lessonData.tip || '');
  showStep(currentStep);
}

// ── POKER CARDS ───────────────────────────────────────────────
function parseCards(str) {
  if (!str) return [];
  const cards = [];
  const matches = [...str.matchAll(/([AKQJT]|10|[2-9])([♠♥♦♣])/g)];
  for (const m of matches) cards.push({ rank: m[1], suit: m[2] });
  return cards;
}

function cardHtml(rank, suit) {
  const isRed = suit === '♥' || suit === '♦';
  return `<div class="pcard ${isRed ? 'red' : 'blk'}">
    <div class="pc-tl"><span class="pc-rank">${rank}</span><span class="pc-suit-sm">${suit}</span></div>
    <span class="pc-center">${suit}</span>
    <div class="pc-br"><span class="pc-rank">${rank}</span><span class="pc-suit-sm">${suit}</span></div>
  </div>`;
}

function cardsHtml(str) {
  if (!str) return '';
  const cards = parseCards(str);
  if (!cards.length) return `<span class="text-white text-sm font-mono">${str}</span>`;
  return cards.map(c => cardHtml(c.rank, c.suit)).join('');
}

// Renderiza 2 hole cards em leque (fan effect)
function heroCardsHtml(str) {
  const cards = parseCards(str);
  if (!cards.length) return str ? `<span class="text-white text-sm font-mono">${str}</span>` : '';
  if (cards.length === 1) return cardHtml(cards[0].rank, cards[0].suit);
  const [c1, c2] = cards;
  return `<span style="display:inline-block;transform:rotate(-9deg) translateY(7px);margin-right:-20px;z-index:1;position:relative;">${cardHtml(c1.rank, c1.suit)}</span><span style="display:inline-block;transform:rotate(9deg) translateY(7px);z-index:2;position:relative;">${cardHtml(c2.rank, c2.suit)}</span>`;
}

function renderPokerTable(sim) {
  const hasBoard = parseCards(sim.board).length > 0;
  const boardDisplay = hasBoard
    ? cardsHtml(sim.board)
    : `<div class="pcard-back" style="opacity:0.45;"></div>
       <div class="pcard-back" style="opacity:0.45;"></div>
       <div class="pcard-back" style="opacity:0.45;"></div>`;

  return `
    <div class="relative mb-5 select-none"
         style="border-radius:36px;
                background:linear-gradient(160deg,#4a2800 0%,#6b3e10 40%,#4a2800 70%,#2e1600 100%);
                padding:10px;
                box-shadow:0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,200,120,0.08), inset 0 1px 0 rgba(255,200,120,0.15);">
      <div class="relative overflow-hidden"
           style="border-radius:28px;
                  min-height:270px;
                  background:radial-gradient(ellipse 80% 65% at 50% 45%, #27723a 0%, #1b5229 40%, #0e3318 72%, #061209 100%);
                  padding:20px 18px;">
        <div class="absolute inset-0 pointer-events-none"
             style="border-radius:28px;
                    background:repeating-linear-gradient(0deg,transparent,transparent 4px,rgba(255,255,255,0.012) 4px,rgba(255,255,255,0.012) 5px);
                    opacity:0.35;"></div>
        <div class="absolute inset-0 pointer-events-none"
             style="border-radius:28px;
                    border:1px solid rgba(255,255,255,0.06);
                    box-shadow:inset 0 0 60px rgba(0,0,0,0.45);"></div>
        <div class="flex flex-col items-center mb-4">
          <p class="text-xs font-bold tracking-widest uppercase mb-2" style="color:rgba(255,255,255,0.22);">${sim.villainPosition || 'Vilão'}</p>
          <div style="position:relative; width:92px; height:76px; margin:0 auto;">
            <div class="pcard-back" style="position:absolute; left:0; top:0; transform:rotate(-10deg); transform-origin:50% 100%;"></div>
            <div class="pcard-back" style="position:absolute; right:0; top:0; transform:rotate(10deg); transform-origin:50% 100%;"></div>
          </div>
        </div>
        <div class="flex flex-col items-center gap-2 my-1">
          <div class="flex gap-1.5 flex-wrap justify-center">${boardDisplay}</div>
          <div class="text-center rounded-xl px-4 py-1.5"
               style="background:rgba(0,0,0,0.50); border:1px solid rgba(255,255,255,0.09);">
            <div class="text-xs uppercase tracking-wider mb-0.5" style="color:rgba(255,255,255,0.3);">Pote</div>
            <div class="font-black text-2xl" style="color:#fbbf24;">${sim.pot}</div>
          </div>
        </div>
        <div class="flex items-end justify-between mt-4">
          <div class="flex flex-col items-center">
            <div style="display:inline-flex; align-items:flex-end;">${heroCardsHtml(sim.heroHand)}</div>
            <div class="flex items-center gap-1.5 mt-2">
              <div class="w-2 h-2 rounded-full" style="background:#fbbf24; box-shadow:0 0 6px #fbbf24;"></div>
              <p class="text-xs font-bold tracking-wider uppercase" style="color:#fbbf24;">${sim.position}</p>
              <span class="text-xs" style="color:rgba(255,255,255,0.28);">— Você</span>
            </div>
          </div>
          ${sim.stack ? `
          <div class="text-right">
            <div class="text-xs uppercase" style="color:rgba(255,255,255,0.22);">Stack</div>
            <div class="text-sm font-bold" style="color:rgba(255,255,255,0.50);">${sim.stack}</div>
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

// ── STREETS ───────────────────────────────────────────────────
function renderStreets(streets) {
  if (!streets?.length) return '';
  return `
    <div class="mb-4 rounded-lg p-3 space-y-3"
         style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);">
      <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Histórico da Mão</p>
      ${streets.map(st => `
        <div class="street-item">
          <div class="flex items-center gap-2 mb-1">
            <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:rgba(200,160,69,0.5);"></div>
            <span class="text-xs font-bold text-yellow-400">${st.name}</span>
          </div>
          <div class="ml-5 space-y-0.5">
            ${(st.actions || []).map(a => {
              const isHero = a.includes('(Você)') || a.includes('Hero') || a.endsWith('?');
              return `<p class="text-xs ${isHero ? 'text-white font-semibold' : 'text-gray-500'}">${a}</p>`;
            }).join('')}
          </div>
        </div>`).join('')}
    </div>`;
}

// ── ACTION BUTTON TYPE ────────────────────────────────────────
function actionClass(label) {
  // Remove prefixos "A) ", "B) " que a IA às vezes adiciona
  const l = label.replace(/^[A-Za-z]\)\s*/, '').toLowerCase().trim();
  if (l === 'fold')                                        return 'act-btn act-fold';
  if (l === 'check')                                       return 'act-btn act-check';
  if (l.startsWith('call'))                                return 'act-btn act-call';
  if (l === 'all-in' || l === 'all in' || l.startsWith('all-in') || l.startsWith('all in')) return 'act-btn act-allin';
  if (l.startsWith('raise'))                               return 'act-btn act-raise';
  if (l.startsWith('bet'))                                 return 'act-btn act-bet';
  return 'act-btn act-bet';
}

// ── SIMULATION RENDERING ──────────────────────────────────────
function renderSimLevel(level) {
  const sim       = lessonData.handSimulations?.[level];
  const container = document.getElementById(`sim-${level}`);
  if (!sim) { container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Simulação não disponível.</p>'; return; }

  const analysis   = sim.analysis || {};

  // Streets summary for the collapsible
  const streetsSummary = (sim.streets || []).map(st => `
    <div class="flex gap-2 text-xs leading-relaxed">
      <span class="font-bold whitespace-nowrap" style="color:#c8a045;">${st.name}:</span>
      <span class="text-gray-400">${(st.actions || []).join(' → ')}</span>
    </div>`).join('');

  // Narrative paragraphs
  const narrativeText = sim.narrative || sim.situation || '';
  const narrativeHtml = narrativeText.split('\n').filter(Boolean)
    .map(p => `<p>${applyGlossary(p)}</p>`).join('');

  container.innerHTML = `

    ${renderPokerTable(sim)}

    <!-- ══ COMO A MÃO SE DESENVOLVEU ══ -->
    <div class="rounded-xl p-5 mb-4" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);">
      <h3 class="text-sm font-bold mb-4 flex items-center gap-2" style="color:#c8a045;">
        <span>📖</span> Como a Mão se Desenvolveu
      </h3>
      <div class="text-gray-300 text-sm leading-loose space-y-3">${narrativeHtml}</div>

      ${streetsSummary ? `
      <details class="mt-5">
        <summary class="text-xs cursor-pointer select-none transition-colors hover:text-gray-300"
                 style="color:#4b5563;">📋 Ver resumo das streets</summary>
        <div class="mt-3 space-y-2 pl-3" style="border-left:2px solid rgba(255,255,255,0.07);">
          ${streetsSummary}
        </div>
      </details>` : ''}
    </div>

    <!-- ══ DECISÃO ══ -->
    <div class="rounded-xl p-4 mb-4" style="background:rgba(200,160,69,0.07); border:1px solid rgba(200,160,69,0.25);">
      <p class="text-xs font-bold uppercase tracking-widest mb-2" style="color:#c8a045;">Sua Decisão</p>
      <p class="text-white font-semibold text-sm leading-relaxed">👉 ${sim.question || 'Qual é sua ação?'}</p>
    </div>

    <!-- ══ OPÇÕES ══ -->
    <div class="flex flex-wrap gap-2 mb-4" id="sim-actions-${level}">
      ${(sim.options || []).map((opt, oi) => `
        <button onclick="answerSim('${level}',${oi},${sim.correct})"
                id="sim-btn-${level}-${oi}"
                class="${actionClass(opt)}"
                style="font-size:14px; padding:10px 18px;">
          ${opt}
        </button>`).join('')}
    </div>

    <!-- ══ FEEDBACK DE ACERTO/ERRO ══ -->
    <div id="sim-feedback-${level}" class="hidden mb-3"></div>

    <!-- ══ ANÁLISE (hidden until answered) ══ -->
    <div id="sim-analysis-${level}" class="hidden">
      <div class="flex gap-1 mb-3 flex-wrap">
        <button onclick="setAnalysisTab('${level}','explanation')" id="ana-${level}-explanation" class="ana-tab active">📖 Explicação</button>
        <button onclick="setAnalysisTab('${level}','ev')"          id="ana-${level}-ev"          class="ana-tab">📊 EV</button>
        <button onclick="setAnalysisTab('${level}','gto')"         id="ana-${level}-gto"         class="ana-tab">⚖️ GTO</button>
      </div>
      <div class="rounded-xl p-4 text-sm" style="background:rgba(5,150,105,0.06); border:1px solid rgba(52,211,153,0.15);">
        <div id="ana-${level}-explanation-content" class="text-gray-300 leading-relaxed space-y-2">
          ${(analysis.explanation || '').split('\n').filter(Boolean).map(p => `<p>${applyGlossary(p)}</p>`).join('')}
        </div>
        <div id="ana-${level}-ev-content" class="hidden">
          <p class="text-xs font-bold text-green-400 mb-2">VALOR ESPERADO (EV)</p>
          <p class="text-gray-300 font-mono text-xs leading-relaxed">${analysis.ev || '—'}</p>
        </div>
        <div id="ana-${level}-gto-content" class="hidden">
          <p class="text-xs font-bold text-blue-400 mb-2">FREQUÊNCIAS GTO</p>
          <p class="text-gray-300 text-sm leading-relaxed">${applyGlossary(analysis.gto || '—')}</p>
        </div>
      </div>
    </div>`;
}

window.answerSim = function(level, selected, correct) {
  if (simAnswered[level]) return;
  simAnswered[level] = true;
  const sim = lessonData.handSimulations?.[level];
  const isCorrect = selected === correct;

  (sim.options || []).forEach((_, oi) => {
    const btn = document.getElementById(`sim-btn-${level}-${oi}`);
    if (!btn) return;
    btn.disabled = true;
    if (oi === selected) {
      if (isCorrect) { btn.style.background = 'rgba(5,150,105,0.3)'; btn.style.borderColor = 'rgba(52,211,153,0.6)'; btn.style.color = '#34d399'; }
      else { btn.style.background = 'rgba(239,68,68,0.3)'; btn.style.borderColor = 'rgba(239,68,68,0.6)'; btn.style.color = '#f87171'; }
    }
    if (oi === correct && !isCorrect) {
      btn.style.background = 'rgba(5,150,105,0.3)'; btn.style.borderColor = 'rgba(52,211,153,0.6)'; btn.style.color = '#34d399';
    }
  });

  // ── Feedback visual de acerto / erro ─────────────────────────
  const correctLabel = (sim.options || [])[correct] || '';
  const feedbackEl   = document.getElementById(`sim-feedback-${level}`);
  if (feedbackEl) {
    if (isCorrect) {
      feedbackEl.innerHTML = `
        <div class="rounded-xl p-4 flex items-center gap-3"
             style="background:rgba(5,150,105,0.2); border:2px solid rgba(52,211,153,0.5);">
          <span class="text-3xl flex-shrink-0">✅</span>
          <div>
            <p class="font-bold text-lg" style="color:#34d399;">Você acertou!</p>
            <p class="text-sm text-gray-300 mt-0.5">Excelente decisão — veja a análise completa abaixo.</p>
          </div>
        </div>`;
    } else {
      feedbackEl.innerHTML = `
        <div class="rounded-xl p-4 flex items-center gap-3"
             style="background:rgba(239,68,68,0.15); border:2px solid rgba(239,68,68,0.45);">
          <span class="text-3xl flex-shrink-0">❌</span>
          <div>
            <p class="font-bold text-lg" style="color:#f87171;">Você errou.</p>
            <p class="text-sm text-gray-300 mt-0.5">A ação correta era:
              <strong style="color:#34d399;">${correctLabel}</strong>
            </p>
          </div>
        </div>`;
    }
    feedbackEl.classList.remove('hidden');
  }

  document.getElementById(`sim-analysis-${level}`)?.classList.remove('hidden');

  const nextStepId = STEP_NEXT[`sim-${level}`];
  if (nextStepId) {
    const isLast  = nextStepId === 'training';
    const label   = isLast ? '♾️ Ir para o Treinamento Infinito →' : 'Próxima etapa →';
    const btnStyle = isLast
      ? 'background:rgba(147,197,253,0.15); border:1px solid rgba(147,197,253,0.3); color:#93c5fd;'
      : 'background:rgba(52,211,153,0.15); border:1px solid rgba(52,211,153,0.3); color:#34d399;';
    const container = document.getElementById(`sim-${level}`);
    const advDiv = document.createElement('div');
    advDiv.className = 'mt-4 pt-4 border-t border-white/5';
    advDiv.innerHTML = `
      <button onclick="this.parentElement.remove(); advanceStep('sim-${level}')"
              class="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
              style="${btnStyle}">
        ${label}
      </button>`;
    container.appendChild(advDiv);
  }
};

window.setAnalysisTab = function(level, tab) {
  ['explanation','ev','gto'].forEach(t => {
    document.getElementById(`ana-${level}-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`ana-${level}-${t}-content`)?.classList.toggle('hidden', t !== tab);
  });
};


// ── QUIZ ──────────────────────────────────────────────────────
function renderQuizCard(level) {
  const questions = lessonData.quiz?.[level] || [];
  const state     = quizState[level];
  const container = document.getElementById(`quiz-${level}`);
  if (!container) return;

  if (questions.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Quiz não disponível.</p>';
    return;
  }

  // Tela de resultado final
  if (state.current >= questions.length) {
    const correct  = Object.values(state.answers).filter(a => a.isCorrect).length;
    const total    = questions.length;
    const emoji    = correct === total ? '🏆' : correct >= Math.ceil(total / 2) ? '👍' : '📚';
    const nextStep = STEP_NEXT[`quiz-${level}`];
    const alreadyAdvanced = completedSteps.has(`quiz-${level}`);
    const advBtn = nextStep && !alreadyAdvanced ? `
      <button onclick="this.style.display='none'; advanceStep('quiz-${level}')"
              class="w-full mt-3 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
              style="background:rgba(52,211,153,0.15); border:1px solid rgba(52,211,153,0.3); color:#34d399;">
        Próxima etapa →
      </button>` : '';
    container.innerHTML = `
      <div class="text-center py-8 rise">
        <p class="text-4xl mb-3">${emoji}</p>
        <p class="text-white font-bold text-xl mb-1">${correct}/${total} corretas</p>
        <p class="text-gray-400 text-sm mb-5">${correct === total ? 'Perfeito! Domínio total.' : correct >= Math.ceil(total/2) ? 'Bom resultado! Continue praticando.' : 'Revise a teoria e tente novamente.'}</p>
        <button onclick="resetQuizLevel('${level}')"
                class="px-5 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
                style="background:rgba(200,160,69,0.15); border:1px solid rgba(200,160,69,0.3); color:#c8a045;">
          🔄 Refazer quiz
        </button>
        ${advBtn}
      </div>`;
    if (!alreadyAdvanced) completedSteps.add(`quiz-${level}`); // marca como completado mas sem avançar ainda
    updateStepper();
    return;
  }

  const qi       = state.current;
  const q        = questions[qi];
  const answered = state.answers[qi];
  const dots     = questions.map((_, i) => {
    const col = i < qi ? '#34d399' : i === qi ? '#c8a045' : 'rgba(255,255,255,0.12)';
    return `<div style="width:8px;height:8px;border-radius:50%;background:${col};"></div>`;
  }).join('');

  container.innerHTML = `
    <div class="rise" style="animation:rise .3s ease forwards;">
      <div class="flex justify-between items-center mb-5">
        <span class="text-xs font-semibold" style="color:#6b7280;">Pergunta ${qi+1} de ${questions.length}</span>
        <div class="flex gap-1.5">${dots}</div>
      </div>

      <p class="text-sm font-semibold text-white leading-relaxed mb-5">${q.question}</p>

      <div class="space-y-2 mb-4">
        ${(q.options || []).map((opt, oi) => {
          let bg = 'rgba(255,255,255,0.04)'; let br = 'rgba(255,255,255,0.08)'; let cl = '#d1d5db';
          let extra = '';
          if (answered !== undefined) {
            if (oi === q.correct)                          { bg='rgba(5,150,105,0.18)'; br='rgba(52,211,153,0.5)'; cl='#34d399'; extra='font-semibold'; }
            else if (oi === answered.selected)             { bg='rgba(239,68,68,0.12)'; br='rgba(239,68,68,0.4)';  cl='#f87171'; }
            else                                           { bg='rgba(255,255,255,0.02)'; br='rgba(255,255,255,0.04)'; cl='#4b5563'; }
          }
          const click = answered !== undefined ? '' : `onclick="answerQuizCard('${level}',${qi},${oi},${q.correct})"`;
          return `<button ${click} ${answered !== undefined ? 'disabled' : ''}
                    class="w-full text-left text-sm px-4 py-3 rounded-xl transition-all ${extra} ${answered === undefined ? 'hover:border-white/20 hover:bg-white/8' : ''}"
                    style="background:${bg}; border:1px solid ${br}; color:${cl}; cursor:${answered !== undefined ? 'default' : 'pointer'};">
            ${opt}
          </button>`;
        }).join('')}
      </div>

      ${answered !== undefined ? (() => {
          const isLast   = qi + 1 >= questions.length;
          const nextSt   = STEP_NEXT[`quiz-${level}`];
          const skipResult = isLast && nextSt;
          const btnLabel = !isLast ? 'Próxima pergunta →'
                         : skipResult ? 'Próxima etapa →'
                         : 'Ver resultado →';
          const btnClick = skipResult
            ? `this.style.display='none'; advanceStep('quiz-${level}')`
            : `nextQuizCard('${level}')`;
          return `
        <div class="rounded-xl p-4 mb-4" style="background:rgba(255,255,255,0.03); border-left:3px solid ${answered.isCorrect ? '#34d399' : '#f87171'};">
          <p class="text-sm font-bold mb-2 ${answered.isCorrect ? 'text-green-400' : 'text-red-400'}">
            ${answered.isCorrect ? '✅ Correto!' : '❌ Incorreto'}
          </p>
          <p class="text-gray-400 text-sm leading-relaxed">💡 ${q.explanation || ''}</p>
        </div>
        <button onclick="${btnClick}"
                class="w-full py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
                style="background:${skipResult ? 'rgba(52,211,153,0.15)' : 'rgba(200,160,69,0.15)'}; border:1px solid ${skipResult ? 'rgba(52,211,153,0.3)' : 'rgba(200,160,69,0.3)'}; color:${skipResult ? '#34d399' : '#c8a045'};">
          ${btnLabel}
        </button>`;
        })() : ''}
    </div>`;
}

window.answerQuizCard = function(level, qi, selected, correct) {
  if (quizState[level].answers[qi] !== undefined) return;
  quizState[level].answers[qi] = { selected, isCorrect: selected === correct };
  renderQuizCard(level);
};

window.nextQuizCard = function(level) {
  quizState[level].current++;
  renderQuizCard(level);
};

window.resetQuizLevel = function(level) {
  quizState[level] = { current: 0, answers: {} };
  renderQuizCard(level);
};


// ── THEORY ────────────────────────────────────────────────────
function renderTheory() {
  const theoryEl = document.getElementById('theory-text');
  const rawHtml  = (lessonData.theory || '').split('\n').filter(p => p.trim())
    .map(p => `<p>${applyGlossary(p)}</p>`).join('');
  theoryEl.innerHTML = rawHtml;

  const kpEl = document.getElementById('key-points');
  kpEl.innerHTML = (lessonData.keyPoints || []).map(pt => `
    <li class="flex items-start gap-2 text-sm text-gray-300">
      <span style="color:#c8a045; flex-shrink:0; margin-top:2px;">▸</span>
      <span>${applyGlossary(pt)}</span>
    </li>`).join('');
}

// ── FEYNMAN ───────────────────────────────────────────────────
function initFeynman() {
  // Sem mínimos — o botão está sempre habilitado
}

window.submitFeynman = function() {
  feynmanDone = true;
  const section = document.getElementById('feynman-section');
  section.innerHTML = `
    <div class="flex items-center gap-3">
      <span class="text-2xl">✅</span>
      <div>
        <p class="font-semibold text-green-400">Feynman concluído!</p>
        <p class="text-xs text-gray-500">Sua compreensão foi registrada. Agora teste seus conhecimentos.</p>
      </div>
    </div>`;
  section.style.background = 'rgba(5,150,105,0.08)';
  section.style.borderColor = 'rgba(52,211,153,0.2)';
  window.advanceStep('feynman');
};

// ── INFINITE TRAINING ─────────────────────────────────────────
window.startInfiniteHand = async function(mode) {
  // Cancela qualquer geração anterior ainda em voo
  if (infiniteController) infiniteController.abort();
  infiniteController = new AbortController();
  const controller = infiniteController;

  // Destaca visualmente o botão ativo
  document.getElementById('btn-mode-focado')?.classList.remove('active-focado', 'active-geral');
  document.getElementById('btn-mode-geral')?.classList.remove('active-focado', 'active-geral');
  document.getElementById(`btn-mode-${mode}`)?.classList.add(`active-${mode}`);

  const exEl = document.getElementById('infinite-hand');
  exEl.classList.remove('hidden');
  exEl.innerHTML = '<p class="text-gray-500 animate-pulse text-sm py-6 text-center">⏳ Gerando uma nova mão difícil...</p>';
  infiniteAnswered = false;

  let topicTitle = currentTopic.title;
  let chosenTopic = currentTopic;
  if (mode === 'geral') {
    const completedStr = localStorage.getItem('completedDays');
    const completedArr = completedStr ? JSON.parse(completedStr) : [];
    if (completedArr.length) {
      const randomDay = completedArr[Math.floor(Math.random() * completedArr.length)];
      const randomTopic = CURRICULUM.find(t => t.day === randomDay);
      if (randomTopic) { chosenTopic = randomTopic; topicTitle = randomTopic.title; }
    } else {
      chosenTopic = CURRICULUM[Math.floor(Math.random() * CURRICULUM.length)];
      topicTitle = chosenTopic.title;
    }
  }

  const handContext = chosenTopic.day === 91 ? 'cash' : 'tournament';

  try {
    const { sim } = await claudeApi.practiceHand(topicTitle, handContext, controller.signal);
    // Se outra chamada substituiu este controller, descarta a resposta tardia
    if (controller.signal.aborted) return;
    renderInfiniteHand(sim, topicTitle, mode);
  } catch (err) {
    // AbortError é cancelamento intencional — não mostrar erro
    if (err.name === 'AbortError' || controller.signal.aborted) return;
    exEl.innerHTML = `
      <div class="rounded-xl p-4 text-sm" style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25); color:#fca5a5;">
        ❌ Não foi possível gerar a mão. Tente novamente.
        <button onclick="startInfiniteHand('${mode}')" class="block mt-3 text-xs underline">🔄 Tentar de novo</button>
      </div>`;
  }
};

function renderInfiniteHand(sim, topicTitle, mode) {
  const exEl       = document.getElementById('infinite-hand');
  const analysis   = sim.analysis || {};

  const streetsSummary = (sim.streets || []).map(st => `
    <div class="flex gap-2 text-xs leading-relaxed">
      <span class="font-bold whitespace-nowrap" style="color:#c8a045;">${st.name}:</span>
      <span class="text-gray-400">${(st.actions || []).join(' → ')}</span>
    </div>`).join('');

  const narrativeHtml = (sim.narrative || sim.situation || '').split('\n').filter(Boolean)
    .map(p => `<p>${applyGlossary(p)}</p>`).join('');

  const modeTag  = mode === 'focado' ? '🎯 FOCADO' : '🌐 GERAL';
  const modeStyle = mode === 'focado'
    ? 'background:rgba(52,211,153,0.15);color:#34d399;'
    : 'background:rgba(147,197,253,0.15);color:#93c5fd;';

  exEl.innerHTML = `
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <span class="text-xs font-bold px-2 py-0.5 rounded" style="${modeStyle}">${modeTag}</span>
      <span class="text-xs text-gray-400">${topicTitle}</span>
      <span class="text-xs font-bold ml-auto px-2 py-0.5 rounded" style="background:rgba(239,68,68,0.15);color:#f87171;">DIFÍCIL</span>
    </div>

    ${renderPokerTable(sim)}

    <div class="rounded-xl p-5 mb-4" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);">
      <h3 class="text-sm font-bold mb-4 flex items-center gap-2" style="color:#c8a045;"><span>📖</span> Como a Mão se Desenvolveu</h3>
      <div class="text-gray-300 text-sm leading-loose space-y-3">${narrativeHtml}</div>
      ${streetsSummary ? `
      <details class="mt-5">
        <summary class="text-xs cursor-pointer select-none hover:text-gray-300 transition-colors" style="color:#4b5563;">📋 Ver resumo das streets</summary>
        <div class="mt-3 space-y-2 pl-3" style="border-left:2px solid rgba(255,255,255,0.07);">${streetsSummary}</div>
      </details>` : ''}
    </div>

    <div class="rounded-xl p-4 mb-4" style="background:rgba(200,160,69,0.07); border:1px solid rgba(200,160,69,0.25);">
      <p class="text-xs font-bold uppercase tracking-widest mb-2" style="color:#c8a045;">Sua Decisão</p>
      <p class="text-white font-semibold text-sm leading-relaxed">👉 ${sim.question || 'Qual é sua ação?'}</p>
    </div>

    <div class="flex flex-wrap gap-2 mb-4" id="sim-actions-inf">
      ${(sim.options || []).map((opt, oi) => `
        <button onclick="answerInfiniteHand(${oi},${sim.correct})" id="sim-btn-inf-${oi}"
                class="${actionClass(opt)}" style="font-size:14px; padding:10px 18px;">${opt}</button>`).join('')}
    </div>

    <div id="sim-feedback-inf" class="hidden mb-3"></div>

    <div id="sim-analysis-inf" class="hidden">
      <div class="flex gap-1 mb-3 flex-wrap">
        <button onclick="setAnalysisTabInf('explanation')" id="ana-inf-explanation" class="ana-tab active">📖 Explicação</button>
        <button onclick="setAnalysisTabInf('ev')"          id="ana-inf-ev"          class="ana-tab">📊 EV</button>
        <button onclick="setAnalysisTabInf('gto')"         id="ana-inf-gto"         class="ana-tab">⚖️ GTO</button>
      </div>
      <div class="rounded-xl p-4 text-sm" style="background:rgba(5,150,105,0.06); border:1px solid rgba(52,211,153,0.15);">
        <div id="ana-inf-explanation-content" class="text-gray-300 leading-relaxed space-y-2">
          ${(analysis.explanation || '').split('\n').filter(Boolean).map(p => `<p>${applyGlossary(p)}</p>`).join('')}
        </div>
        <div id="ana-inf-ev-content" class="hidden">
          <p class="text-xs font-bold text-green-400 mb-2">VALOR ESPERADO (EV)</p>
          <p class="text-gray-300 font-mono text-xs leading-relaxed">${analysis.ev || '—'}</p>
        </div>
        <div id="ana-inf-gto-content" class="hidden">
          <p class="text-xs font-bold text-blue-400 mb-2">FREQUÊNCIAS GTO</p>
          <p class="text-gray-300 text-sm leading-relaxed">${applyGlossary(analysis.gto || '—')}</p>
        </div>
      </div>
    </div>

    <button onclick="startInfiniteHand('${mode}')"
            class="w-full mt-5 py-3 rounded-xl text-sm font-bold transition-all hover:opacity-80"
            style="background:rgba(200,160,69,0.15); border:1px solid rgba(200,160,69,0.3); color:#c8a045;">
      🔄 Gerar nova mão
    </button>`;

  window._infSim = sim;
}

window.answerInfiniteHand = function(selected, correct) {
  if (infiniteAnswered) return;
  infiniteAnswered = true;
  const sim = window._infSim || {};
  const isCorrect = selected === correct;

  (sim.options || []).forEach((_, oi) => {
    const btn = document.getElementById(`sim-btn-inf-${oi}`);
    if (!btn) return;
    btn.disabled = true;
    if (oi === selected) {
      if (isCorrect) { btn.style.background = 'rgba(5,150,105,0.3)'; btn.style.borderColor = 'rgba(52,211,153,0.6)'; btn.style.color = '#34d399'; }
      else           { btn.style.background = 'rgba(239,68,68,0.3)'; btn.style.borderColor = 'rgba(239,68,68,0.6)'; btn.style.color = '#f87171'; }
    }
    if (oi === correct && !isCorrect) {
      btn.style.background = 'rgba(5,150,105,0.3)'; btn.style.borderColor = 'rgba(52,211,153,0.6)'; btn.style.color = '#34d399';
    }
  });

  const correctLabel = (sim.options || [])[correct] || '';
  const feedbackEl   = document.getElementById('sim-feedback-inf');
  if (feedbackEl) {
    feedbackEl.classList.remove('hidden');
    feedbackEl.innerHTML = isCorrect
      ? `<div class="rounded-xl p-4 flex items-center gap-3" style="background:rgba(5,150,105,0.2); border:2px solid rgba(52,211,153,0.5);">
           <span class="text-3xl flex-shrink-0">✅</span>
           <div><p class="font-bold text-green-400 text-sm">Você acertou!</p><p class="text-xs text-gray-300">Excelente decisão.</p></div>
         </div>`
      : `<div class="rounded-xl p-4 flex items-center gap-3" style="background:rgba(239,68,68,0.15); border:2px solid rgba(239,68,68,0.45);">
           <span class="text-3xl flex-shrink-0">❌</span>
           <div><p class="font-bold text-red-400 text-sm">Você errou.</p><p class="text-xs text-gray-300">A ação correta era: <strong>${correctLabel}</strong></p></div>
         </div>`;
  }
  document.getElementById('sim-analysis-inf')?.classList.remove('hidden');
};

window.setAnalysisTabInf = function(tab) {
  ['explanation','ev','gto'].forEach(t => {
    document.getElementById(`ana-inf-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`ana-inf-${t}-content`)?.classList.toggle('hidden', t !== tab);
  });
};

// ── COMPLETE LESSON ───────────────────────────────────────────
window.completeLesson = async function() {
  if (alreadyDone) return;
  const btn = document.getElementById('btn-complete');
  btn.disabled    = true;
  btn.textContent = 'Salvando...';
  try {
    const result = await progressApi.complete(currentTopic.day, currentTopic.category, currentTopic.title);
    alreadyDone = true;
    btn.classList.add('hidden');
    document.getElementById('already-done-badge').classList.remove('hidden');
    localStorage.setItem('completedDays', JSON.stringify(
      [...new Set([...(JSON.parse(localStorage.getItem('completedDays') || '[]')), currentTopic.day])]
    ));
    showCelebration(result.xpGained, result.newStreak);
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = `✅ Concluir Lição (+${XP_BY_CATEGORY[currentTopic.category]} XP)`;
    if (err.message.includes('já foi concluída')) {
      alreadyDone = true;
      btn.classList.add('hidden');
      document.getElementById('already-done-badge').classList.remove('hidden');
    }
  }
};

// ── CELEBRATION ───────────────────────────────────────────────
function showCelebration(xp, streak) {
  document.getElementById('cel-xp').textContent = `+${xp} XP`;
  document.getElementById('cel-streak').textContent = streak > 1 ? `${streak} dias seguidos 🔥` : '';
  if (nextLesson) {
    document.getElementById('cel-next-title').textContent = `Dia ${nextLesson.day}: ${nextLesson.title}`;
    document.getElementById('cel-next').classList.remove('hidden');
  } else {
    document.getElementById('cel-next').classList.add('hidden');
  }
  document.getElementById('celebration-overlay').classList.remove('hidden');
  spawnConfetti();
}

function spawnConfetti() {
  const container = document.getElementById('confetti-container');
  const colors = ['#c8a045','#34d399','#60a5fa','#f87171','#fbbf24','#a78bfa'];
  for (let i = 0; i < 60; i++) {
    const div = document.createElement('div');
    const color = colors[Math.floor(Math.random() * colors.length)];
    const size  = 6 + Math.random() * 8;
    div.style.cssText = `
      position:absolute; width:${size}px; height:${size}px;
      background:${color}; border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
      left:${Math.random() * 100}%; top:-20px;
      animation:confetti-fall ${2 + Math.random() * 3}s ease-in ${Math.random() * 2}s forwards;
    `;
    container.appendChild(div);
  }
  setTimeout(() => container.innerHTML = '', 5500);
}

window.closeCelebration = function() {
  document.getElementById('celebration-overlay').classList.add('hidden');
  window.location.href = '/pages/dashboard.html';
};

window.goNextLesson = function() {
  if (nextLesson) window.location.href = `/pages/lesson.html?day=${nextLesson.day}`;
  else window.location.href = '/pages/dashboard.html';
};

// ── CHAT ──────────────────────────────────────────────────────
window.toggleChat = function() {
  const panel = document.getElementById('chat-panel');
  const arrow = document.getElementById('chat-arrow');
  const open  = panel.classList.toggle('hidden');
  arrow.textContent = open ? '▼ abrir' : '▲ fechar';
};

window.sendChat = async function() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  const msgs = document.getElementById('chat-messages');
  const safeMsg = sanitizeAiData(msg);
  msgs.innerHTML += `<div class="flex justify-end"><p class="text-sm px-3 py-2 rounded-lg max-w-xs" style="background:rgba(200,160,69,0.15);color:#c8a045;">${safeMsg}</p></div>`;
  input.value = ''; input.disabled = true;
  const typingId = 'typing-' + Date.now();
  msgs.innerHTML += `<div id="${typingId}" class="text-xs text-gray-500 animate-pulse">Coach digitando...</div>`;
  msgs.scrollTop = msgs.scrollHeight;
  try {
    const { reply } = await claudeApi.chat(msg, currentTopic?.title);
    document.getElementById(typingId)?.remove();
    const safeReply = sanitizeAiData(reply);
    const replyHtml = safeReply.split('\n').filter(l => l.trim())
      .map(l => `<p class="text-sm text-gray-300 leading-relaxed mb-1">${applyGlossary(l)}</p>`).join('');
    msgs.innerHTML += `<div class="flex gap-2 items-start"><span class="mt-1 flex-shrink-0">🃏</span><div>${replyHtml}</div></div>`;
  } catch (err) {
    document.getElementById(typingId)?.remove();
    msgs.innerHTML += `<p class="text-xs text-red-400">Erro: ${sanitizeAiData(err.message)}</p>`;
  } finally {
    input.disabled = false; input.focus(); msgs.scrollTop = msgs.scrollHeight;
  }
};
