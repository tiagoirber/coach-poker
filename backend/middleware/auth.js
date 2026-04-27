// =============================================================
// auth.js — Middleware de autenticação e autorização
//
// Fluxo:
//  1. Frontend faz login via Firebase Auth → recebe um "ID Token" (JWT)
//  2. Frontend envia esse token no cabeçalho de cada requisição
//  3. Este middleware verifica se o token é válido junto ao Firebase
//  4. Se válido, anexa os dados do usuário em req.user e libera a rota
//  5. Se inválido/ausente, retorna erro 401 (não autorizado)
// =============================================================

import { auth, db } from '../config/firebase.js';

// ── verifyToken ────────────────────────────────────────────────
// Verifica se o usuário está autenticado.
// Adiciona req.user = { uid, email, role, ... } para uso nas rotas.
export async function verifyToken(req, res, next) {
  // O token vem no cabeçalho "Authorization: Bearer <token>"
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Token de autenticação ausente.',
      hint: 'Envie o header: Authorization: Bearer <seu-token>',
    });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // O Firebase verifica assinatura, expiração e revogação do token
    const decoded = await auth.verifyIdToken(idToken);

    // Busca dados extras do usuário no Firestore (ex: role)
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Anexa tudo em req.user — disponível para a próxima função da rota
    req.user = {
      uid:   decoded.uid,
      email: decoded.email,
      role:  userData.role || 'user', // padrão: usuário comum
      name:  userData.name  || decoded.email,
    };

    next(); // Passa para a próxima função (a rota em si)
  } catch (err) {
    console.error('Erro ao verificar token:', err.code);
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

// ── requireAdmin ───────────────────────────────────────────────
// Middleware adicional: só deixa passar quem tem role === 'admin'.
// Use APÓS verifyToken: router.get('/admin-only', verifyToken, requireAdmin, handler)
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Acesso negado. Apenas administradores podem acessar este recurso.',
    });
  }
  next();
}
