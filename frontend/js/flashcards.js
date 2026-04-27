// =============================================================
// flashcards.js — Revisão com spaced repetition simplificada
// Puxa perguntas do quiz de lições já geradas (localStorage)
// Rating: Errei → 1min | Difícil → 10min | Bom → 1d | Fácil → 3d
// =============================================================

import { fbAuth, CURRICULUM } from './config.js';
import { userApi } from './api.js';

// ── State ─────────────────────────────────────────────────────
let deck          = [];    // Todas as cards carregadas
let sessionQueue  = [];    // Cards a revisar nesta sessão
let currentIndex  = 0;
let isFlipped     = false;
const DECK_KEY    = 'flashcard_deck';

// ── Init ──────────────────────────────────────────────────────
fbAuth.onAuthStateChanged(async (user) => {
  if (!user) return;
  try {
    const { user: data } = await userApi.getMe();
    const el = document.getElementById('nav-xp');
    el.textContent = `⚡ ${data.totalXP || 0} XP`;
    el.classList.remove('hidden');
  } catch {}
  loadDeck();
  buildSession();
  renderUI();
});

// ── Build deck from cached lessons ───────────────────────────
function loadDeck() {
  const saved = localStorage.getItem(DECK_KEY);
  if (saved) { try { deck = JSON.parse(saved); } catch {} }
}

function saveDeck() {
  localStorage.setItem(DECK_KEY, JSON.stringify(deck));
}

function buildDeckFromLessons() {
  const newCards = [];
  CURRICULUM.forEach(topic => {
    const cacheKey = `lesson_v3_${topic.day}`;
    const cached   = localStorage.getItem(cacheKey);
    if (!cached) return;
    try {
      const lesson = JSON.parse(cached);
      const allQ   = [
        ...(lesson.quiz?.easy   || []),
        ...(lesson.quiz?.medium || []),
        ...(lesson.quiz?.hard   || []),
      ];
      allQ.forEach((q, i) => {
        const id = `${topic.day}_${i}`;
        if (deck.some(c => c.id === id)) return;
        const correctText = (q.options?.[q.correct] || '').replace(/^[A-D]\)\s*/, '');
        newCards.push({
          id,
          category: topic.category,
          topic:    topic.title,
          day:      topic.day,
          question: q.question,
          answer:   correctText,
          explanation: q.explanation || '',
          due:      Date.now(),
          interval: 0,
          easeFactor: 2.5,
          status: 'new',
        });
      });
    } catch {}
  });
  deck = [...deck, ...newCards];
  saveDeck();
}

function buildSession() {
  buildDeckFromLessons();
  const now = Date.now();
  sessionQueue = deck
    .filter(c => c.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, 20);
}

// ── UI ────────────────────────────────────────────────────────
function renderUI() {
  updateStats();
  if (!sessionQueue.length) {
    if (!deck.length) {
      document.getElementById('empty-state').classList.remove('hidden');
    } else {
      document.getElementById('session-complete').classList.remove('hidden');
    }
    return;
  }
  document.getElementById('stats-bar').classList.remove('hidden');
  document.getElementById('progress-bar-wrap').classList.remove('hidden');
  document.getElementById('card-container').classList.remove('hidden');
  showCard(0);
}

function updateStats() {
  const now = Date.now();
  const newCount      = deck.filter(c => c.status === 'new').length;
  const learningCount = deck.filter(c => c.status === 'learning').length;
  const masteredCount = deck.filter(c => c.status === 'mastered').length;
  document.getElementById('stat-new').textContent      = newCount;
  document.getElementById('stat-learning').textContent = learningCount;
  document.getElementById('stat-mastered').textContent = masteredCount;
}

function showCard(index) {
  if (index >= sessionQueue.length) {
    finishSession();
    return;
  }
  currentIndex = index;
  isFlipped    = false;
  const card = sessionQueue[index];
  document.getElementById('card-question').textContent    = card.question;
  document.getElementById('card-answer').textContent      = card.answer;
  document.getElementById('card-explanation').textContent = card.explanation;
  document.getElementById('card-category').textContent    = card.category;
  document.getElementById('card-topic').textContent       = `Dia ${card.day}: ${card.topic}`;

  const flipEl = document.getElementById('flip-card');
  flipEl.classList.remove('flipped');
  document.getElementById('rating-buttons').classList.add('hidden');

  const total = sessionQueue.length;
  const done  = index;
  document.getElementById('progress-text').textContent = `Card ${done + 1} de ${total}`;
  document.getElementById('progress-pct').textContent  = `${Math.round((done / total) * 100)}%`;
  document.getElementById('progress-fill').style.width = `${(done / total) * 100}%`;
}

window.flipCard = function() {
  if (isFlipped) return;
  isFlipped = true;
  document.getElementById('flip-card').classList.add('flipped');
  document.getElementById('rating-buttons').classList.remove('hidden');
};

window.rateCard = function(rating) {
  const card = sessionQueue[currentIndex];
  const deckCard = deck.find(c => c.id === card.id);
  if (!deckCard) return;
  const now = Date.now();
  const MINUTE = 60 * 1000, DAY = 86400 * 1000;

  if (rating === 'again') {
    deckCard.interval   = 0;
    deckCard.due        = now + MINUTE;
    deckCard.status     = 'learning';
    sessionQueue.splice(currentIndex + 3, 0, { ...deckCard });
  } else if (rating === 'hard') {
    deckCard.interval   = Math.max(1, deckCard.interval) * 1.2;
    deckCard.due        = now + 10 * MINUTE;
    deckCard.easeFactor = Math.max(1.3, (deckCard.easeFactor || 2.5) - 0.15);
    deckCard.status     = 'learning';
  } else if (rating === 'good') {
    deckCard.interval   = deckCard.interval === 0 ? 1 : Math.round(deckCard.interval * (deckCard.easeFactor || 2.5));
    deckCard.due        = now + deckCard.interval * DAY;
    deckCard.status     = deckCard.interval >= 21 ? 'mastered' : 'learning';
  } else if (rating === 'easy') {
    deckCard.interval   = deckCard.interval === 0 ? 3 : Math.round(deckCard.interval * (deckCard.easeFactor || 2.5) * 1.3);
    deckCard.due        = now + deckCard.interval * DAY;
    deckCard.easeFactor = Math.min(3.5, (deckCard.easeFactor || 2.5) + 0.1);
    deckCard.status     = deckCard.interval >= 21 ? 'mastered' : 'learning';
  }
  saveDeck();
  updateStats();
  showCard(currentIndex + 1);
};

function finishSession() {
  document.getElementById('card-container').classList.add('hidden');
  document.getElementById('progress-bar-wrap').classList.add('hidden');
  document.getElementById('session-complete').classList.remove('hidden');
}

window.restartSession = function() {
  deck.forEach(c => { c.due = Date.now(); });
  saveDeck();
  sessionQueue = [];
  buildSession();
  document.getElementById('session-complete').classList.add('hidden');
  if (sessionQueue.length) {
    document.getElementById('card-container').classList.remove('hidden');
    document.getElementById('progress-bar-wrap').classList.remove('hidden');
    showCard(0);
  }
};
