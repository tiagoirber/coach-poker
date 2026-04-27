// =============================================================
// auth.js — Gerencia autenticação no frontend
//
// Fluxo de login:
//  1. Usuário preenche email/senha no formulário
//  2. Firebase Auth (client SDK) verifica as credenciais
//  3. Se válido, Firebase retorna um ID Token (JWT)
//  4. Frontend salva o token e redireciona para o dashboard
//
// O token é enviado no header de cada chamada ao backend:
//   Authorization: Bearer <id_token>
// =============================================================

import { fbAuth, API_URL } from './config.js';

// Flag: impede o redirect automático enquanto o cadastro Google está em andamento
let _googleRegistering = false;

// ── Gerenciamento de sessão ───────────────────────────────────
export async function getToken() {
  const user = fbAuth.currentUser;
  if (!user) return null;
  return user.getIdToken(false);
}

// ── Observador de estado de autenticação ─────────────────────
fbAuth.onAuthStateChanged(async (user) => {
  const path = window.location.pathname;
  const isAuthPage    = path.endsWith('index.html') || path === '/' || path.endsWith('/');
  const isDashboard   = path.includes('dashboard');
  const isLesson      = path.includes('lesson');
  const isAdmin       = path.includes('admin');
  const isFlashcards  = path.includes('flashcards');

  if (user) {
    // Só redireciona se NÃO estiver no meio do registro Google
    // (evita race condition onde o redirect acontece antes do perfil ser criado)
    if (isAuthPage && !_googleRegistering) {
      window.location.href = '/frontend/pages/dashboard.html';
    }
    window._currentUser = user;
  } else {
    if (isDashboard || isLesson || isAdmin || isFlashcards) {
      window.location.href = '/frontend/index.html';
    }
  }
});

// ── Handlers dos formulários ──────────────────────────────────

// Alterna entre as abas Login e Registro
window.switchTab = function(tab) {
  const isLogin = tab === 'login';
  document.getElementById('form-login').classList.toggle('hidden', !isLogin);
  document.getElementById('form-register').classList.toggle('hidden',  isLogin);

  const tabLogin    = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  if (isLogin) {
    tabLogin.style.cssText    = 'background:#c8a045; color:#000;';
    tabRegister.style.cssText = 'background:transparent; color:#6b7280;';
  } else {
    tabRegister.style.cssText = 'background:#c8a045; color:#000;';
    tabLogin.style.cssText    = 'background:transparent; color:#6b7280;';
  }
};

// Mostra mensagem de erro no formulário
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
}

function hideError(elementId) {
  document.getElementById(elementId)?.classList.add('hidden');
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Aguarde...' : btn.dataset.label;
}

// Inicializa os labels dos botões (para restaurar após loading)
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-login')?.setAttribute('data-label', 'Entrar');
  document.getElementById('btn-register')?.setAttribute('data-label', 'Criar minha conta');
});

// ── handleLogin ───────────────────────────────────────────────
window.handleLogin = async function(event) {
  event.preventDefault();
  hideError('login-error');

  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  setLoading('btn-login', true);

  try {
    await fbAuth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged detecta o login e redireciona
  } catch (err) {
    const messages = {
      'auth/user-not-found':   'E-mail não cadastrado.',
      'auth/wrong-password':   'Senha incorreta.',
      'auth/invalid-email':    'E-mail inválido.',
      'auth/too-many-requests':'Muitas tentativas. Tente em alguns minutos.',
    };
    showError('login-error', messages[err.code] || 'Erro ao entrar. Tente novamente.');
    setLoading('btn-login', false);
  }
};

// ── handleRegister ────────────────────────────────────────────
window.handleRegister = async function(event) {
  event.preventDefault();
  hideError('reg-error');

  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;

  if (password !== confirm) {
    return showError('reg-error', 'As senhas não coincidem.');
  }

  setLoading('btn-register', true);

  try {
    // Passo 1: cria a conta no Firebase Auth
    const { user } = await fbAuth.createUserWithEmailAndPassword(email, password);

    // Passo 2: pega o token e cria o perfil no backend (Firestore via API)
    const token = await user.getIdToken();
    const res   = await fetch(`${API_URL}/users/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ name }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Erro ao criar perfil.');
    }

    // onAuthStateChanged detecta e redireciona automaticamente
  } catch (err) {
    const messages = {
      'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
      'auth/weak-password':        'Senha muito fraca. Use ao menos 6 caracteres.',
      'auth/invalid-email':        'E-mail inválido.',
    };
    showError('reg-error', messages[err.code] || err.message);
    setLoading('btn-register', false);
  }
};

// ── handleResetPassword ───────────────────────────────────────
window.handleResetPassword = async function() {
  const email = document.getElementById('login-email')?.value.trim();
  if (!email) {
    return showError('login-error', 'Digite seu e-mail antes de redefinir a senha.');
  }
  try {
    await fbAuth.sendPasswordResetEmail(email);
    showError('login-error', `✅ Link de redefinição enviado para ${email}`);
    document.getElementById('login-error').style.color = '#34d399';
  } catch (err) {
    showError('login-error', 'E-mail não encontrado ou inválido.');
  }
};

// ── handleGoogleLogin ─────────────────────────────────────────
window.handleGoogleLogin = async function() {
  // Bloqueia o redirect automático do onAuthStateChanged enquanto criamos o perfil
  _googleRegistering = true;
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const { user } = await fbAuth.signInWithPopup(provider);

    // Usa displayName do Google; cai para a parte antes do @ no email como fallback
    const name = user.displayName || user.email?.split('@')[0] || 'Usuário';

    // Aguarda o perfil ser criado no Firestore ANTES de redirecionar
    const token = await user.getIdToken();
    await fetch(`${API_URL}/users/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body:    JSON.stringify({ name }),
    });
    // 409 = perfil já existe, tudo certo. Outros erros são ignorados (fallback no backend).
  } catch (err) {
    if (err.code === 'auth/popup-closed-by-user') {
      _googleRegistering = false;
      return;
    }
    // Não bloqueia o login por falha no registro — o backend tem fallback
    console.warn('Aviso no registro Google:', err.message);
  } finally {
    _googleRegistering = false;
    // Redireciona manualmente após garantir que o perfil foi criado
    if (fbAuth.currentUser) {
      window.location.href = '/frontend/pages/dashboard.html';
    }
  }
};

// ── logout ────────────────────────────────────────────────────
window.logout = async function() {
  await fbAuth.signOut();
  window.location.href = '/frontend/index.html';
};
