// =============================================================
// routes/users.js — Rotas de gerenciamento de usuários
//
// Endpoints:
//   POST   /api/users/register  → cria perfil após cadastro no Firebase Auth
//   GET    /api/users/me        → retorna dados do usuário logado
//   PUT    /api/users/me        → atualiza perfil do usuário logado
//   GET    /api/users           → lista todos os usuários (só admin)
//   PATCH  /api/users/:uid/role → muda role de um usuário (só admin)
//   DELETE /api/users/:uid      → remove usuário (só admin)
// =============================================================

import { Router } from 'express';
import { db, auth } from '../config/firebase.js';
import { verifyToken, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ── POST /api/users/register ──────────────────────────────────
// Chamado pelo frontend logo após o usuário se registrar no Firebase Auth.
// Cria o documento do usuário no Firestore com dados iniciais.
router.post('/register', verifyToken, async (req, res) => {
  const rawName = req.body.name;
  const name = (rawName || '').trim() || req.user.email?.split('@')[0] || 'Usuário';

  if (name.length < 1) {
    return res.status(400).json({ error: 'Nome inválido.' });
  }

  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const existing = await userRef.get();

    // Se o perfil já existe mas tem nome igual ao email (bug do race condition),
    // atualiza o nome para o displayName correto do Google
    if (existing.exists) {
      const data = existing.data();
      const looksLikeEmail = data.name?.includes('@') || data.name === data.email;
      if (looksLikeEmail && name !== data.email) {
        await userRef.update({ name, updatedAt: new Date().toISOString() });
        return res.status(200).json({ message: 'Nome atualizado.', user: { ...data, name } });
      }
      return res.status(409).json({ error: 'Usuário já possui perfil cadastrado.' });
    }

    const now = new Date().toISOString();
    const newUser = {
      name:       name.trim(),
      email:      req.user.email,
      role:       'user',         // Padrão: usuário comum (não admin)
      createdAt:  now,
      updatedAt:  now,
      // Dados de progresso iniciais
      currentDay: 1,
      totalXP:    0,
      streak:     0,
      lastLoginAt: now,
    };

    await userRef.set(newUser);

    res.status(201).json({ message: 'Perfil criado com sucesso!', user: newUser });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro ao criar perfil.' });
  }
});

// ── GET /api/users/me ─────────────────────────────────────────
// Retorna os dados do usuário logado.
// Se o perfil não existir (ex: race condition no Google Sign-In),
// auto-cria usando os dados que o Firebase Auth já possui.
router.get('/me', verifyToken, async (req, res) => {
  try {
    const userRef = db.collection('users').doc(req.user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // Busca o displayName do Firebase Auth (vem preenchido pelo Google)
      const authUser = await auth.getUser(req.user.uid);
      const name = authUser.displayName
        || req.user.email?.split('@')[0]
        || 'Usuário';

      const now = new Date().toISOString();
      const newUser = {
        name,
        email:      req.user.email,
        role:       'user',
        createdAt:  now,
        updatedAt:  now,
        currentDay: 1,
        totalXP:    0,
        streak:     0,
        lastLoginAt: now,
      };
      await userRef.set(newUser);
      console.log(`Perfil auto-criado para ${req.user.uid} (${name})`);
      return res.json({ user: { uid: req.user.uid, ...newUser } });
    }

    res.json({ user: { uid: req.user.uid, ...userDoc.data() } });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

// ── PUT /api/users/me ─────────────────────────────────────────
// Atualiza o perfil do usuário logado.
// O usuário só pode editar: name, avatarUrl
// Campos como role, totalXP, currentDay são controlados pelo servidor.
router.put('/me', verifyToken, async (req, res) => {
  const { name, avatarUrl } = req.body;

  // Constrói o objeto de atualização apenas com campos permitidos
  const updates = { updatedAt: new Date().toISOString() };

  if (name !== undefined) {
    if (name.trim().length < 2) {
      return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres.' });
    }
    updates.name = name.trim();
  }

  if (avatarUrl !== undefined) {
    // Valida que é uma URL válida
    try { new URL(avatarUrl); } catch {
      return res.status(400).json({ error: 'avatarUrl inválida.' });
    }
    updates.avatarUrl = avatarUrl;
  }

  try {
    await db.collection('users').doc(req.user.uid).update(updates);
    res.json({ message: 'Perfil atualizado!', updates });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ error: 'Erro ao atualizar perfil.' });
  }
});

// ── GET /api/users (admin only) ───────────────────────────────
// Lista todos os usuários. Apenas administradores podem acessar.
router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('users')
      .orderBy('createdAt', 'desc')
      .limit(100) // Paginação simples — nunca busque tudo sem limite
      .get();

    const users = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
    }));

    res.json({ users, total: users.length });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    res.status(500).json({ error: 'Erro ao listar usuários.' });
  }
});

// ── PATCH /api/users/:uid/role (admin only) ───────────────────
// Altera o papel (role) de um usuário: 'user' ou 'admin'.
router.patch('/:uid/role', verifyToken, requireAdmin, async (req, res) => {
  const { uid } = req.params;
  const { role } = req.body;

  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: "Role deve ser 'user' ou 'admin'." });
  }

  // Admin não pode rebaixar a si mesmo (proteção contra bloqueio acidental)
  if (uid === req.user.uid) {
    return res.status(400).json({ error: 'Você não pode alterar sua própria role.' });
  }

  try {
    await db.collection('users').doc(uid).update({
      role,
      updatedAt: new Date().toISOString(),
    });
    res.json({ message: `Role do usuário ${uid} alterada para '${role}'.` });
  } catch (err) {
    console.error('Erro ao alterar role:', err);
    res.status(500).json({ error: 'Erro ao alterar role.' });
  }
});

// ── DELETE /api/users/:uid (admin only) ──────────────────────
// Remove um usuário do Firestore E do Firebase Auth.
router.delete('/:uid', verifyToken, requireAdmin, async (req, res) => {
  const { uid } = req.params;

  if (uid === req.user.uid) {
    return res.status(400).json({ error: 'Você não pode deletar sua própria conta por aqui.' });
  }

  try {
    // Deleta em paralelo: documento no Firestore + conta no Auth
    await Promise.all([
      db.collection('users').doc(uid).delete(),
      auth.deleteUser(uid),
    ]);

    res.json({ message: `Usuário ${uid} removido com sucesso.` });
  } catch (err) {
    console.error('Erro ao deletar usuário:', err);
    res.status(500).json({ error: 'Erro ao remover usuário.' });
  }
});

export default router;
