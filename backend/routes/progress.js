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
import { verifyToken } from '../middleware/auth.js';

const router = Router();

// XP ganho por categoria de lição
const XP_BY_CATEGORY = {
  MATH:     30,
  PREFLOP:  25,
  POSTFLOP: 25,
  MENTAL:   20,
  ICM:      30,
};

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
    const totalLessons   = 90;
    const percentComplete = Math.round((completedCount / totalLessons) * 100);

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
router.post('/complete', verifyToken, async (req, res) => {
  const { day, category, title } = req.body;

  // Validação dos dados recebidos
  if (!day || !category || !title) {
    return res.status(400).json({ error: 'day, category e title são obrigatórios.' });
  }
  if (day < 1 || day > 90) {
    return res.status(400).json({ error: 'day deve ser entre 1 e 90.' });
  }
  if (!XP_BY_CATEGORY[category]) {
    return res.status(400).json({ error: `Categoria inválida: ${category}` });
  }

  const uid       = req.user.uid;
  const userRef   = db.collection('users').doc(uid);
  const lessonRef = userRef.collection('completedLessons').doc(`day_${day}`);

  try {
    // Verifica se já foi concluída antes (evita XP duplicado)
    const existing = await lessonRef.get();
    if (existing.exists) {
      return res.status(409).json({
        error: 'Esta lição já foi concluída.',
        completedAt: existing.data().completedAt,
      });
    }

    const xpGained   = XP_BY_CATEGORY[category];
    const now        = new Date().toISOString();
    const userSnap   = await userRef.get();
    const userData   = userSnap.data() || {};

    // Calcula o novo streak
    // Se o último login foi ontem → incrementa; senão → reseta para 1
    const lastLogin  = userData.lastLoginAt ? new Date(userData.lastLoginAt) : null;
    const today      = new Date();
    const yesterday  = new Date(today); yesterday.setDate(today.getDate() - 1);
    const wasYesterday = lastLogin
      && lastLogin.toDateString() === yesterday.toDateString();
    const newStreak = wasYesterday ? (userData.streak || 0) + 1 : 1;

    // Usa uma transação batch para garantir que TUDO seja salvo junto
    // (ou nada — evita inconsistência de dados)
    const batch = db.batch();

    // 1. Salva a lição concluída na sub-coleção do usuário
    batch.set(lessonRef, {
      day,
      category,
      title,
      xpGained,
      completedAt: now,
    });

    // 2. Atualiza os dados do usuário
    batch.update(userRef, {
      totalXP:     (userData.totalXP || 0) + xpGained,
      currentDay:  Math.max((userData.currentDay || 1), day + 1), // avança o dia
      streak:      newStreak,
      lastLoginAt: now,
      updatedAt:   now,
    });

    await batch.commit();

    res.json({
      message: `Lição ${day} concluída! +${xpGained} XP`,
      xpGained,
      newStreak,
      newTotalXP: (userData.totalXP || 0) + xpGained,
    });
  } catch (err) {
    console.error('Erro ao salvar progresso:', err);
    res.status(500).json({ error: 'Erro ao salvar progresso.' });
  }
});

// ── GET /api/progress/history ─────────────────────────────────
// Retorna o histórico completo de lições concluídas pelo usuário.
router.get('/history', verifyToken, async (req, res) => {
  try {
    const snapshot = await db
      .collection('users').doc(req.user.uid)
      .collection('completedLessons')
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
