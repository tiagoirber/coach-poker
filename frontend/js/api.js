// =============================================================
// api.js — Camada de comunicação com o backend
//
// Centraliza todas as chamadas fetch() em funções nomeadas.
// Vantagens:
//  - Um lugar só para mudar a URL base
//  - Tratamento de erros padronizado
//  - Token de autenticação adicionado automaticamente
// =============================================================

import { API_URL, fbAuth } from './config.js';

// ── apiFetch: wrapper central do fetch ───────────────────────
// Toda chamada à API passa por aqui.
// Adiciona automaticamente o token de autenticação no header.
async function apiFetch(path, options = {}) {
  // Obtém o token atual do usuário logado
  const user  = fbAuth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  // Sempre tenta parsear o JSON da resposta
  const data = await response.json().catch(() => ({}));

  // Se o servidor retornou erro (4xx ou 5xx), lança uma exceção
  if (!response.ok) {
    throw new Error(data.error || `Erro ${response.status}`);
  }

  return data;
}

// =============================================================
// USUÁRIOS
// =============================================================

export const userApi = {
  // Retorna os dados do usuário logado
  getMe: () => apiFetch('/users/me'),

  // Atualiza nome ou avatar do usuário
  updateMe: (updates) => apiFetch('/users/me', {
    method: 'PUT',
    body:   JSON.stringify(updates),
  }),

  // [Admin] Lista todos os usuários
  listAll: () => apiFetch('/users'),

  // [Admin] Muda o role de um usuário
  changeRole: (uid, role) => apiFetch(`/users/${uid}/role`, {
    method: 'PATCH',
    body:   JSON.stringify({ role }),
  }),

  // [Admin] Remove um usuário
  delete: (uid) => apiFetch(`/users/${uid}`, { method: 'DELETE' }),

  // [Admin] Bloqueia ou desbloqueia um usuário (bloqueio imediato via Firebase Auth)
  setStatus: (uid, disabled) => apiFetch(`/users/${uid}/status`, {
    method: 'PATCH',
    body:   JSON.stringify({ disabled }),
  }),

  // [Admin] Define ou remove o prazo de acesso (ISO string ou null)
  setAccess: (uid, accessExpiresAt) => apiFetch(`/users/${uid}/access`, {
    method: 'PATCH',
    body:   JSON.stringify({ accessExpiresAt }),
  }),
};

// =============================================================
// PROGRESSO
// =============================================================

export const progressApi = {
  // Resumo de progresso do usuário logado
  getMe: () => apiFetch('/progress/me'),

  // Marca uma lição como concluída
  complete: (day, category, title) => apiFetch('/progress/complete', {
    method: 'POST',
    body:   JSON.stringify({ day, category, title }),
  }),

  // Histórico de lições concluídas
  getHistory: () => apiFetch('/progress/history'),

  // Ranking global
  getLeaderboard: () => apiFetch('/progress/leaderboard'),
};

// =============================================================
// CLAUDE IA
// =============================================================

export const claudeApi = {
  // Gera a teoria da lição (fase 1 — rápida)
  getLesson: (day, title, description, category, forceNew = false) =>
    apiFetch('/claude/lesson', {
      method: 'POST',
      body:   JSON.stringify({ day, title, description, category, forceNew }),
    }),

  // Gera quiz e simulações (fase 2 — background)
  getLessonExercises: (day, title, description, category, forceNew = false) =>
    apiFetch('/claude/lesson-exercises', {
      method: 'POST',
      body:   JSON.stringify({ day, title, description, category, forceNew }),
    }),

  // Envia uma mensagem ao coach IA
  chat: (message, context = null) =>
    apiFetch('/claude/chat', {
      method: 'POST',
      body:   JSON.stringify({ message, context }),
    }),

  // Gera UMA mão de prática (Treinamento Infinito) no nível Difícil.
  // Aceita um AbortSignal opcional para cancelar requisições obsoletas
  // (ex: usuário clica FOCADO e GERAL em sequência rápida).
  practiceHand: (topicTitle, context = 'tournament', signal) =>
    apiFetch('/claude/practice-hand', {
      method: 'POST',
      body:   JSON.stringify({ topicTitle, context }),
      signal,
    }),
};
