// =============================================================
// lesson.js — Lição completa com todas as funcionalidades
// Visual cards, Feynman, 5 action buttons, streets, 3-tab analysis,
// infinite training FOCADO/GERAL, celebration screen, glossary
// =============================================================

import { fbAuth, CURRICULUM, CATEGORY_COLORS, XP_BY_CATEGORY } from './config.js';
import { claudeApi, progressApi, userApi } from './api.js';
import { applyGlossary } from './glossary.js';

// ── State ─────────────────────────────────────────────────────
let currentTopic   = null;
let lessonData     = null;
let alreadyDone    = false;
let quizAnswered   = { easy:{}, medium:{}, hard:{} };
let simAnswered    = { easy:false, medium:false, hard:false };
let feynmanDone    = false;
let nextLesson     = null;
const CACHE_KEY_VER = 'v3';

// ── Init ──────────────────────────────────────────────────────
fbAuth.onAuthStateChanged(async (user) => {
  if (!user) return;
  const params = new URLSearchParams(window.location.search);
  const day    = parseInt(params.get('day'));
  if (!day || day < 1 || day > 90) { window.location.href = '/frontend/pages/dashboard.html'; return; }
  currentTopic = CURRICULUM.find(t => t.day === day);
  if (!currentTopic) { window.location.href = '/frontend/pages/dashboard.html'; return; }
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
    }
  } catch {}
}

// ── Load lesson ───────────────────────────────────────────────
async function loadLesson() {
  const { day, title, description, category } = currentTopic;
  const cacheKey = `lesson_${CACHE_KEY_VER}_${day}`;
  const cached   = localStorage.getItem(cacheKey);
  if (cached) {
    try { lessonData = JSON.parse(cached); renderLesson(); return; } catch {}
  }
  try {
    const { lesson } = await claudeApi.getLesson(day, title, description, category);
    lessonData = lesson;
    localStorage.setItem(cacheKey, JSON.stringify(lesson));
    renderLesson();
  } catch (err) {
    document.getElementById('loading-state').innerHTML = `
      <div class="text-center py-20">
        <p class="text-5xl mb-4">⚠️</p>
        <p class="text-red-400 mb-2 font-semibold">Erro ao carregar lição</p>
        <p class="text-gray-500 text-sm mb-6">${err.message}</p>
        <button onclick="location.reload()"
                class="px-6 py-2 rounded-lg text-sm font-semibold"
                style="background:#161a16; border:1px solid rgba(255,255,255,0.1); color:#9ca3af;">
          Tentar novamente
        </button>
      </div>`;
  }
}

function renderLesson() {
  document.getElementById('loading-state').classList.add('hidden');
  document.getElementById('lesson-content').classList.remove('hidden');
  renderTheory();
  renderQuizLevel('easy');
  renderQuizLevel('medium');
  renderQuizLevel('hard');
  renderSimLevel('easy');
  renderSimLevel('medium');
  renderSimLevel('hard');
  renderInfiniteTraining();
  document.getElementById('tip-text').innerHTML = applyGlossary(lessonData.tip || '');
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
    <span class="r">${rank}</span>
    <span class="s">${suit}</span>
    <span class="rb">${rank}</span>
  </div>`;
}

function cardsHtml(str) {
  if (!str) return '';
  const cards = parseCards(str);
  if (!cards.length) return `<span class="text-white text-sm font-mono">${str}</span>`;
  return cards.map(c => cardHtml(c.rank, c.suit)).join('');
}

function renderPokerTable(sim) {
  const heroCards  = cardsHtml(sim.heroHand);
  const boardCards = cardsHtml(sim.board);
  const boardStr   = sim.board || '?';
  const hasBoard   = parseCards(sim.board).length > 0;

  return `
    <div class="rounded-xl p-4 mb-4 relative overflow-hidden"
         style="background:linear-gradient(135deg,#14532d 0%,#166534 50%,#14532d 100%); border:3px solid #78350f; box-shadow:inset 0 0 30px rgba(0,0,0,0.4);">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p class="text-xs font-bold text-yellow-300 mb-2 uppercase tracking-wider">Sua Mão</p>
          <div class="flex gap-1.5">${heroCards}</div>
          <p class="text-xs text-green-300/70 mt-1.5">${sim.position}</p>
        </div>
        <div class="text-center">
          <div class="text-xs text-white/40 mb-1">POT</div>
          <div class="text-yellow-400 font-black text-xl">${sim.pot}</div>
        </div>
        <div>
          <p class="text-xs font-bold text-green-300 mb-2 uppercase tracking-wider">Board</p>
          <div class="flex gap-1.5 flex-wrap">
            ${hasBoard ? boardCards : '<div class="pcard-back"></div><div class="pcard-back"></div><div class="pcard-back"></div>'}
          </div>
          ${hasBoard ? `<p class="text-xs text-white/40 mt-1.5">${boardStr}</p>` : ''}
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
  const l = label.toLowerCase();
  if (l === 'fold')                        return 'act-btn act-fold';
  if (l === 'check')                       return 'act-btn act-check';
  if (l.startsWith('call'))                return 'act-btn act-call';
  if (l === 'all-in' || l === 'all in')    return 'act-btn act-allin';
  if (l.startsWith('raise'))               return 'act-btn act-raise';
  if (l.startsWith('bet'))                 return 'act-btn act-bet';
  return 'act-btn act-bet';
}

// ── SIMULATION RENDERING ──────────────────────────────────────
function renderSimLevel(level) {
  const sim       = lessonData.handSimulations?.[level];
  const container = document.getElementById(`sim-${level}`);
  if (!sim) { container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Simulação não disponível.</p>'; return; }

  const analysis = sim.analysis || {};

  container.innerHTML = `
    ${renderPokerTable(sim)}
    ${renderStreets(sim.streets)}

    <div class="rounded-lg p-4 mb-4" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05);">
      <p class="text-gray-300 text-sm mb-2">${sim.situation || ''}</p>
      <p class="text-white font-semibold text-sm">👉 ${sim.question || 'Qual é sua ação?'}</p>
    </div>

    <div class="flex flex-wrap gap-2 mb-4" id="sim-actions-${level}">
      ${(sim.options || []).map((opt, oi) => `
        <button onclick="answerSim('${level}',${oi},${sim.correct})"
                id="sim-btn-${level}-${oi}"
                class="${actionClass(opt)}">
          ${opt}
        </button>`).join('')}
    </div>

    <div id="sim-analysis-${level}" class="hidden">
      <div class="flex gap-1 mb-3 flex-wrap">
        <button onclick="setAnalysisTab('${level}','explanation')" id="ana-${level}-explanation" class="ana-tab active">📖 Explicação</button>
        <button onclick="setAnalysisTab('${level}','ev')"          id="ana-${level}-ev"          class="ana-tab">📊 EV</button>
        <button onclick="setAnalysisTab('${level}','gto')"         id="ana-${level}-gto"         class="ana-tab">⚖️ GTO</button>
      </div>
      <div class="rounded-lg p-4 text-sm" style="background:rgba(5,150,105,0.06); border:1px solid rgba(52,211,153,0.15);">
        <div id="ana-${level}-explanation-content" class="text-gray-300 leading-relaxed space-y-2">
          ${(analysis.explanation || sim.explanation || '').split('\n').filter(Boolean).map(p => `<p>${applyGlossary(p)}</p>`).join('')}
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

  document.getElementById(`sim-analysis-${level}`)?.classList.remove('hidden');
  if (simAnswered.easy && simAnswered.medium && simAnswered.hard) {
    document.getElementById('training-choice')?.classList.remove('hidden');
  }
};

window.setAnalysisTab = function(level, tab) {
  ['explanation','ev','gto'].forEach(t => {
    document.getElementById(`ana-${level}-${t}`)?.classList.toggle('active', t === tab);
    document.getElementById(`ana-${level}-${t}-content`)?.classList.toggle('hidden', t !== tab);
  });
};

window.setSimLevel = function(level) {
  ['easy','medium','hard'].forEach(l => {
    document.getElementById(`sim-${l}`)?.classList.toggle('hidden', l !== level);
  });
  const colors = { easy:'rgba(52,211,153,0.3)', medium:'rgba(251,191,36,0.3)', hard:'rgba(239,68,68,0.3)' };
  const text   = { easy:'#34d399', medium:'#fbbf24', hard:'#f87171' };
  ['easy','medium','hard'].forEach(l => {
    const tab = document.getElementById(`sim-tab-${l}`);
    if (!tab) return;
    if (l === level) { tab.style.background = colors[l]; tab.style.color = text[l]; }
    else { tab.style.background = 'transparent'; tab.style.color = '#6b7280'; }
  });
};

// ── QUIZ ──────────────────────────────────────────────────────
function renderQuizLevel(level) {
  const questions = lessonData.quiz?.[level] || [];
  const container = document.getElementById(`quiz-${level}`);
  container.innerHTML = questions.map((q, qi) => `
    <div class="rounded-lg p-4" style="background:#0d0f0d; border:1px solid rgba(255,255,255,0.06);" id="quiz-${level}-${qi}">
      <p class="text-sm font-medium text-white mb-3">
        <span class="text-xs mr-2" style="color:#6b7280;">Q${qi+1}</span>${q.question}
      </p>
      <div class="space-y-2">
        ${(q.options || []).map((opt, oi) => `
          <button onclick="answerQuiz('${level}',${qi},${oi},${q.correct})"
                  id="quiz-btn-${level}-${qi}-${oi}"
                  class="w-full text-left text-sm px-3 py-2 rounded-lg transition-colors"
                  style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); color:#d1d5db;">
            ${opt}
          </button>`).join('')}
      </div>
      <p id="quiz-exp-${level}-${qi}" class="hidden mt-3 text-xs text-gray-400 italic border-t border-white/5 pt-3">
        💡 ${q.explanation || ''}
      </p>
    </div>`).join('');
}

window.answerQuiz = function(level, qi, selected, correct) {
  if (quizAnswered[level][qi] !== undefined) return;
  quizAnswered[level][qi] = selected;
  const isCorrect = selected === correct;
  const btn = document.getElementById(`quiz-btn-${level}-${qi}-${selected}`);
  btn.style.background  = isCorrect ? 'rgba(5,150,105,0.2)' : 'rgba(239,68,68,0.2)';
  btn.style.borderColor = isCorrect ? 'rgba(52,211,153,0.4)' : 'rgba(239,68,68,0.4)';
  btn.style.color       = isCorrect ? '#34d399' : '#f87171';
  if (!isCorrect) {
    const cb = document.getElementById(`quiz-btn-${level}-${qi}-${correct}`);
    if (cb) { cb.style.background = 'rgba(5,150,105,0.2)'; cb.style.borderColor = 'rgba(52,211,153,0.4)'; cb.style.color = '#34d399'; }
  }
  document.getElementById(`quiz-exp-${level}-${qi}`)?.classList.remove('hidden');
};

window.setQuizLevel = function(level) {
  ['easy','medium','hard'].forEach(l => {
    document.getElementById(`quiz-${l}`)?.classList.toggle('hidden', l !== level);
  });
  const colors = { easy:'#34d399', medium:'#fbbf24', hard:'#f87171' };
  ['easy','medium','hard'].forEach(l => {
    const tab = document.getElementById(`quiz-tab-${l}`);
    if (!tab) return;
    if (l === level) { tab.style.background = colors[l]+'33'; tab.style.color = colors[l]; }
    else { tab.style.background = 'transparent'; tab.style.color = '#6b7280'; }
  });
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
  document.getElementById('quiz-lock')?.classList.add('hidden');
};

// ── INFINITE TRAINING ─────────────────────────────────────────
function renderInfiniteTraining() {
  const t = lessonData.infiniteTraining || {};
  document.getElementById('train-concept').innerHTML   = applyGlossary(t.concept || '');
  document.getElementById('train-drill').innerHTML     = applyGlossary(t.drill || '');
  document.getElementById('train-challenge').innerHTML = applyGlossary(t.challenge || '');
}

window.startInfiniteMode = async function(mode) {
  const exEl = document.getElementById('infinite-exercise');
  exEl.innerHTML = '<p class="text-gray-500 animate-pulse text-sm">⏳ Gerando situação...</p>';
  exEl.classList.remove('hidden');

  let topicTitle = currentTopic.title;
  if (mode === 'geral') {
    const completedStr = localStorage.getItem('completedDays');
    let completedArr = completedStr ? JSON.parse(completedStr) : [];
    if (!completedArr.length) {
      const randomTopic = CURRICULUM[Math.floor(Math.random() * CURRICULUM.length)];
      topicTitle = randomTopic.title;
    } else {
      const randomDay = completedArr[Math.floor(Math.random() * completedArr.length)];
      const randomTopic = CURRICULUM.find(t => t.day === randomDay) || currentTopic;
      topicTitle = randomTopic.title;
    }
  }

  const positions = ['UTG','MP','CO','BTN','SB','BB'];
  const hands     = ['A♠K♦','J♠T♠','9♥9♣','Q♦J♦','K♠Q♠','A♥J♥','T♣T♦','8♠7♠'];
  const boards    = ['A♥7♣2♦','K♠Q♥J♣','9♦8♥7♠','T♣4♦2♥','A♣K♦Q♠','6♥5♣4♦'];
  const pos   = positions[Math.floor(Math.random() * positions.length)];
  const hand  = hands[Math.floor(Math.random() * hands.length)];
  const board = boards[Math.floor(Math.random() * boards.length)];

  try {
    const { reply } = await claudeApi.chat(
      `Crie uma situação de poker: posição ${pos}, mão ${hand}, board ${board}. Tema: ${topicTitle}. Máximo 4 frases incluindo a ação correta e por quê.`,
      topicTitle
    );
    exEl.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs font-bold px-2 py-0.5 rounded" style="background:rgba(200,160,69,0.2);color:#c8a045;">
          ${mode === 'focado' ? '🎯 FOCADO' : '🌐 GERAL'}
        </span>
        <span class="text-xs text-gray-500">${topicTitle}</span>
      </div>
      <p class="text-gray-300 leading-relaxed">${applyGlossary(reply)}</p>
      <button onclick="startInfiniteMode('${mode}')" class="mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors">
        🔄 Gerar nova situação
      </button>`;
  } catch {
    exEl.innerHTML = `<p class="text-gray-400">${pos} com ${hand} no board ${board}. Analise o conceito de <strong>${topicTitle}</strong> e defina sua linha de ação.</p>`;
  }
};

window.generateRandomSituation = async function() {
  const btn = event.target;
  const origText = btn.textContent;
  btn.textContent = '⏳ Gerando...';
  btn.disabled = true;
  const positions = ['UTG','MP','CO','BTN','SB','BB'];
  const hands     = ['A♠K♦','J♠T♠','9♥9♣','Q♦J♦','K♠Q♠'];
  const boards    = ['A♥7♣2♦','K♠Q♥J♣','9♦8♥7♠','T♣4♦2♥'];
  const pos   = positions[Math.floor(Math.random() * positions.length)];
  const hand  = hands[Math.floor(Math.random() * hands.length)];
  const board = boards[Math.floor(Math.random() * boards.length)];
  try {
    const { reply } = await claudeApi.chat(
      `Situação de poker: ${pos} com ${hand}, board ${board}. Tema: ${currentTopic?.title}. 3 frases + ação correta.`,
      currentTopic?.title
    );
    const el = document.getElementById('random-situation');
    el.innerHTML = applyGlossary(reply);
    el.classList.remove('hidden');
  } catch {
    const el = document.getElementById('random-situation');
    el.textContent = `${pos} com ${hand} no board ${board}. Analise ${currentTopic?.title} e defina sua ação.`;
    el.classList.remove('hidden');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
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
  window.location.href = '/frontend/pages/dashboard.html';
};

window.goNextLesson = function() {
  if (nextLesson) window.location.href = `/frontend/pages/lesson.html?day=${nextLesson.day}`;
  else window.location.href = '/frontend/pages/dashboard.html';
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
  msgs.innerHTML += `<div class="flex justify-end"><p class="text-sm px-3 py-2 rounded-lg max-w-xs" style="background:rgba(200,160,69,0.15);color:#c8a045;">${msg}</p></div>`;
  input.value = ''; input.disabled = true;
  const typingId = 'typing-' + Date.now();
  msgs.innerHTML += `<div id="${typingId}" class="text-xs text-gray-500 animate-pulse">Coach digitando...</div>`;
  msgs.scrollTop = msgs.scrollHeight;
  try {
    const { reply } = await claudeApi.chat(msg, currentTopic?.title);
    document.getElementById(typingId)?.remove();
    msgs.innerHTML += `<div class="flex gap-2 items-start"><span class="mt-1">🃏</span><p class="text-sm text-gray-300 leading-relaxed">${applyGlossary(reply)}</p></div>`;
  } catch (err) {
    document.getElementById(typingId)?.remove();
    msgs.innerHTML += `<p class="text-xs text-red-400">Erro: ${err.message}</p>`;
  } finally {
    input.disabled = false; input.focus(); msgs.scrollTop = msgs.scrollHeight;
  }
};
