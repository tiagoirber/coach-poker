// =============================================================
// routes/progress.js — Rotas de progresso do aluno
//
// Endpoints:
//   GET  /api/progress/me         → resumo do progresso do usuário logado
//   POST /api/progress/complete   → marca uma lição como concluída e dá XP
//   GET  /api/progress/history    → histórico completo de lições concluídas
//   GET  /api/progress/leaderboard → ranking global (top 10 por XP)
// =============================================================

import { Router } from 'express';
import { db } from '../config/firebase.js';
import { verifyToken, requireActiveAccess } from '../middleware/auth.js';

const router = Router();

// XP ganho por categoria de lição.
// ATENÇÃO: cópia espelhada em frontend/js/config.js — manter em sincronia.
const XP_BY_CATEGORY = {
  MATH:     30,
  PREFLOP:  25,
  POSTFLOP: 25,
  MENTAL:   20,
  ICM:      30,
};

const DAY_MS    = 24 * 60 * 60 * 1000;
const STREAK_TZ = 'America/Sao_Paulo';

// 'YYYY-MM-DD' no fuso do aluno — base da comparação de streak.
function calendarDay(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: STREAK_TZ });
}

// ── GET /api/progress/me ──────────────────────────────────────
// Retorna um resumo do progresso do usuário logado:
// dia atual, XP total, streak, % de conclusão.
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection('users').doc(req.user.uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: 'Perfil não encontrado.' });
    }

    const data = userDoc.data();

    // Conta quantas lições foram concluídas (sub-coleção)
    const completedSnap = await db
      .collection('users').doc(req.user.uid)
      .collection('completedLessons')
      .count()  // Firestore count() — não carrega os documentos, só conta
      .get();

    const completedCount = completedSnap.data().count;
    const totalLessons   = 91;
    // Clampamos o numerador para nunca ultrapassar 100% na barra de progresso
    const percentComplete = Math.round((Math.min(completedCount, totalLessons) / totalLessons) * 100);

    res.json({
      progress: {
        currentDay:      data.currentDay      || 1,
        totalXP:         data.totalXP         || 0,
        streak:          data.streak          || 0,
        completedLessons: completedCount,
        totalLessons,
        percentComplete,
        lastLoginAt:     data.lastLoginAt,
      },
    });
  } catch (err) {
    console.error('Erro ao buscar progresso:', err);
    res.status(500).json({ error: 'Erro ao buscar progresso.' });
  }
});

// ── POST /api/progress/complete ───────────────────────────────
// Marca uma lição como concluída.
// Atualiza: XP total, dia atual, streak, histórico.
router.post('/complete', verifyToken, requireActiveAccess, async (req, res) => {
  const { day, category, title } = req.body;

  // Validação dos dados recebidos
  if (!day || !category || !title) {
    return res.status(400).json({ error: 'day, category e title são obrigatórios.' });
  }
  if (day < 1 || day > 91) {
    return res.status(400).json({ error: 'day deve ser entre 1 e 91.' });
  }
  if (!XP_BY_CATEGORY[category]) {
    return res.status(400).json({ error: `Categoria inválida: ${category}` });
  }

  const uid       = req.user.uid;
  const userRef   = db.collection('users').doc(uid);
  const lessonRef = userRef.collection('completedLessons').doc(`day_${day}`);

  try {
    // Transação garante idempotência contra cliques duplos / retries de rede:
    // o read de existing + userSnap e os writes acontecem atomicamente, evitando
    // que duas requisições concorrentes ambas passem pelo `existing.exists` e
    // creditem XP em duplicidade.
    const result = await db.runTransaction(async (tx) => {
      const existing = await tx.get(lessonRef);
      if (existing.exists) {
        const err = new Error('ALREADY_COMPLETED');
        err.completedAt = existing.data().completedAt;
        throw err;
      }

      const userSnap = await tx.get(userRef);
      const userData = userSnap.data() || {};

      // Calcula o novo streak comparando dias-calendário no fuso do aluno
      // (a Cloud Function roda em UTC; "ontem" em UTC não é "ontem" no Brasil).
      // Última conclusão hoje → mantém; ontem → incrementa; antes → reseta para 1.
      // lastLoginAt só é escrito aqui e no registro — na prática é "última conclusão".
      const nowMs        = Date.now();
      const todayKey     = calendarDay(nowMs);
      const yesterdayKey = calendarDay(nowMs - DAY_MS);
      const lastKey      = userData.lastLoginAt ? calendarDay(Date.parse(userData.lastLoginAt)) : null;
      const prevStreak   = userData.streak || 0;
      const newStreak    = lastKey === todayKey     ? Math.max(prevStreak, 1)
                         : lastKey === yesterdayKey ? prevStreak + 1
                         : 1;

      const xpGained = XP_BY_CATEGORY[category];
      const now      = new Date().toISOString();

      tx.set(lessonRef, {
        day,
        category,
        title,
        xpGained,
        completedAt: now,
      });

      tx.update(userRef, {
        totalXP:     (userData.totalXP || 0) + xpGained,
        currentDay:  Math.max((userData.currentDay || 1), day + 1),
        streak:      newStreak,
        lastLoginAt: now,
        updatedAt:   now,
      });

      return { xpGained, newStreak, newTotalXP: (userData.totalXP || 0) + xpGained };
    });

    res.json({
      message: `Lição ${day} concluída! +${result.xpGained} XP`,
      xpGained:   result.xpGained,
      newStreak:  result.newStreak,
      newTotalXP: result.newTotalXP,
    });
  } catch (err) {
    if (err.message === 'ALREADY_COMPLETED') {
      return res.status(409).json({
        error: 'Esta lição já foi concluída.',
        completedAt: err.completedAt,
      });
    }
    console.error('Erro ao salvar progresso:', err);
    res.status(500).json({ error: 'Erro ao salvar progresso.' });
  }
});

// ── GET /api/progress/history ─────────────────────────────────
// Retorna o histórico completo de lições concluídas pelo usuário.
// Com ?day=N retorna só esse dia (1 leitura em vez do histórico inteiro).
router.get('/history', verifyToken, requireActiveAccess, async (req, res) => {
  try {
    const completedRef = db.collection('users').doc(req.user.uid).collection('completedLessons');

    if (req.query.day !== undefined) {
      const day = Number(req.query.day);
      if (!Number.isInteger(day) || day < 1 || day > 91) {
        return res.status(400).json({ error: 'day deve ser um inteiro entre 1 e 91.' });
      }
      const doc = await completedRef.doc(`day_${day}`).get();
      const lessons = doc.exists ? [doc.data()] : [];
      return res.json({ lessons, total: lessons.length });
    }

    const snapshot = await completedRef
      .orderBy('completedAt', 'desc')
      .get();

    const lessons = snapshot.docs.map(doc => doc.data());
    res.json({ lessons, total: lessons.length });
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
});

// ── GET /api/progress/leaderboard ────────────────────────────
// Top 10 usuários por XP total — ranking público.
router.get('/leaderboard', verifyToken, async (req, res) => {
  try {
    const snapshot = await db.collection('users')
      .orderBy('totalXP', 'desc')
      .limit(10)
      .get();

    const ranking = snapshot.docs.map((doc, index) => ({
      position: index + 1,
      uid:      doc.id,
      name:     doc.data().name,
      totalXP:  doc.data().totalXP || 0,
      streak:   doc.data().streak  || 0,
    }));

    res.json({ ranking });
  } catch (err) {
    console.error('Erro ao buscar leaderboard:', err);
    res.status(500).json({ error: 'Erro ao buscar ranking.' });
  }
});

export default router;
