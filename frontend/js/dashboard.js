// =============================================================
// dashboard.js — Lógica da tela principal
//
// Responsabilidades:
//  - Carregar e exibir progresso do usuário
//  - Renderizar o currículo de 90 lições com status
//  - Filtrar lições por semana
//  - Exibir leaderboard
// =============================================================

import { userApi, progressApi } from './api.js';
import { fbAuth, CURRICULUM, CATEGORY_COLORS } from './config.js';

// Estado local da página
let completedDays = new Set(); // Dias já concluídos pelo usuário
let currentFilter = 'all';    // Filtro de semana ativo

// ── Inicialização ─────────────────────────────────────────────
// Aguarda o Firebase confirmar o login antes de carregar dados
fbAuth.onAuthStateChanged(async (user) => {
  if (!user) return; // auth.js já redireciona se não logado

  // Carrega tudo em paralelo (mais rápido que sequencial)
  await Promise.all([
    loadUserData(user),
    loadProgress(),
    loadLeaderboard(),
  ]);

  renderCurriculum();
  buildWeekFilter();
});

// ── Carrega dados do usuário ──────────────────────────────────
async function loadUserData(user) {
  try {
    const { user: data } = await userApi.getMe();

    // Atualiza navbar
    document.getElementById('nav-email').textContent   = data.email;
    document.getElementById('user-avatar').textContent = (data.name || '?')[0].toUpperCase();
    document.getElementById('welcome-name').textContent = data.name?.split(' ')[0] || 'jogador';

    // Mostra link admin se for administrador
    if (data.role === 'admin') {
      document.getElementById('admin-link')?.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Erro ao carregar usuário:', err.message);
  }
}

// ── Carrega progresso ─────────────────────────────────────────
async function loadProgress() {
  try {
    // Carrega resumo e histórico em paralelo
    const [{ progress }, { lessons }] = await Promise.all([
      progressApi.getMe(),
      progressApi.getHistory(),
    ]);

    // Marca os dias concluídos no Set local
    completedDays = new Set(lessons.map(l => l.day));

    // Atualiza cards de estatísticas
    document.getElementById('current-day').textContent     = progress.currentDay;
    document.getElementById('stat-xp').textContent         = progress.totalXP.toLocaleString('pt-BR');
    document.getElementById('stat-streak').textContent     = `${progress.streak} 🔥`;
    document.getElementById('stat-completed').textContent  = progress.completedLessons;
    document.getElementById('stat-remaining').textContent  = 90 - progress.completedLessons;

    // Barra de progresso geral
    const pct = progress.percentComplete;
    document.getElementById('progress-pct').textContent    = `${pct}%`;
    document.getElementById('progress-bar').style.width    = `${pct}%`;
  } catch (err) {
    console.error('Erro ao carregar progresso:', err.message);
  }
}

// ── Carrega leaderboard ───────────────────────────────────────
async function loadLeaderboard() {
  try {
    const { ranking } = await progressApi.getLeaderboard();
    const container   = document.getElementById('leaderboard');
    const uid         = fbAuth.currentUser?.uid;

    const medals = ['🥇', '🥈', '🥉'];

    container.innerHTML = ranking.map((entry) => {
      const isMe = entry.uid === uid;
      return `
        <div class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${isMe ? 'ring-1 ring-yellow-500/30' : ''}"
             style="background:${isMe ? 'rgba(200,160,69,0.08)' : '#111412'};">
          <span class="text-lg w-6 text-center">
            ${medals[entry.position - 1] || entry.position}
          </span>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate ${isMe ? 'text-yellow-400' : 'text-white'}">
              ${entry.name}${isMe ? ' (você)' : ''}
            </p>
            <p class="text-xs text-gray-500">${entry.streak} dias seguidos 🔥</p>
          </div>
          <span class="text-xs font-bold" style="color:#c8a045;">${entry.totalXP} XP</span>
        </div>`;
    }).join('');

    if (ranking.length === 0) {
      container.innerHTML = '<p class="text-center text-sm text-gray-500 py-4">Sem dados ainda.</p>';
    }
  } catch (err) {
    console.error('Erro ao carregar ranking:', err.message);
  }
}

// ── Renderiza a lista de lições ───────────────────────────────
function renderCurriculum() {
  const container = document.getElementById('lessons-list');
  const filtered  = currentFilter === 'all'
    ? CURRICULUM
    : CURRICULUM.filter(t => t.week === parseInt(currentFilter));

  container.innerHTML = filtered.map(topic => {
    const done    = completedDays.has(topic.day);
    const colors  = CATEGORY_COLORS[topic.category];
    const isNext  = !done && !filtered.slice(0, filtered.indexOf(topic)).some(t => !completedDays.has(t.day));

    return `
      <div class="flex items-center gap-3 rounded-lg px-4 py-3 transition-colors cursor-pointer hover:bg-white/5"
           style="background:#111412; border:1px solid ${done ? 'rgba(5,150,105,0.3)' : isNext ? 'rgba(200,160,69,0.2)' : 'rgba(255,255,255,0.04)'};"
           onclick="openLesson(${topic.day})">

        <!-- Ícone de status -->
        <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm"
             style="background:${done ? 'rgba(5,150,105,0.2)' : isNext ? 'rgba(200,160,69,0.15)' : 'rgba(255,255,255,0.05)'};">
          ${done ? '✅' : isNext ? '▶' : `<span style="color:#4b5563;font-size:10px;">${topic.day}</span>`}
        </div>

        <!-- Título e descrição -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium ${done ? 'text-gray-400 line-through' : isNext ? 'text-white' : 'text-gray-300'} truncate">
            ${topic.title}
          </p>
          <p class="text-xs text-gray-500 truncate">${topic.description}</p>
        </div>

        <!-- Badge de categoria -->
        <span class="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline"
              style="background:${colors.bg}; color:${colors.text};">
          ${topic.category}
        </span>
      </div>`;
  }).join('');
}

// ── Filtro por semana ─────────────────────────────────────────
function buildWeekFilter() {
  const weeks  = [...new Set(CURRICULUM.map(t => t.week))].sort((a, b) => a - b);
  const select = document.getElementById('week-filter');

  weeks.forEach(w => {
    const opt   = document.createElement('option');
    opt.value   = w;
    opt.textContent = `Semana ${w}`;
    select.appendChild(opt);
  });
}

window.filterWeek = function(value) {
  currentFilter = value;
  renderCurriculum();
};

// ── Navega para a página da lição ─────────────────────────────
window.openLesson = function(day) {
  window.location.href = `/frontend/pages/lesson.html?day=${day}`;
};

// ── Modal de conclusão ────────────────────────────────────────
window.closeModal = function() {
  document.getElementById('modal-complete').classList.add('hidden');
  document.getElementById('modal-complete').classList.remove('flex');
};
