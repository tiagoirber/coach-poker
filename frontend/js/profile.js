import { fbAuth } from './config.js';
import { userApi, progressApi } from './api.js';

fbAuth.onAuthStateChanged(async (user) => {
  if (!user) return;
  await loadProfile();
});

async function loadProfile() {
  try {
    const [{ user }, { progress }] = await Promise.all([
      userApi.getMe(),
      progressApi.getMe(),
    ]);

    // Identidade
    const nameEl  = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const roleEl  = document.getElementById('profile-role');
    const avatarEl = document.getElementById('profile-avatar');

    nameEl.textContent  = user.name  || '—';
    emailEl.textContent = user.email || '—';
    roleEl.textContent  = user.role  || 'user';

    if (user.role === 'admin') {
      roleEl.style.background = 'rgba(234,179,8,0.1)';
      roleEl.style.color      = '#eab308';
    }

    if (user.avatarUrl) {
      const img = document.createElement('img');
      img.src       = user.avatarUrl;
      img.alt       = 'avatar';
      img.className = 'w-full h-full object-cover rounded-full';
      img.onerror   = () => { img.replaceWith(makeInitialEl(user.name)); };
      avatarEl.textContent = '';
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = makeInitial(user.name);
    }

    // Pré-preenche o formulário
    document.getElementById('input-name').value   = user.name   || '';
    document.getElementById('input-avatar').value = user.avatarUrl || '';

    // Stats
    document.getElementById('stat-xp').textContent        = (progress.totalXP || 0).toLocaleString('pt-BR');
    document.getElementById('stat-streak').textContent    = `${progress.streak || 0} 🔥`;
    document.getElementById('stat-completed').textContent = progress.completedLessons || 0;
    document.getElementById('stat-day').textContent       = progress.currentDay || 1;

    const pct = Math.min(progress.percentComplete || 0, 100);
    document.getElementById('stat-percent').textContent = `${pct}%`;
    document.getElementById('progress-bar').style.width  = `${pct}%`;

  } catch (err) {
    console.error('Erro ao carregar perfil:', err.message);
  }
}

function makeInitial(name) {
  return (name || '?')[0].toUpperCase();
}

function makeInitialEl(name) {
  const div = document.createElement('div');
  div.className = 'w-full h-full flex items-center justify-center text-2xl font-bold';
  div.textContent = makeInitial(name);
  return div;
}

window.saveProfile = async function() {
  const nameInput   = document.getElementById('input-name');
  const avatarInput = document.getElementById('input-avatar');
  const feedback    = document.getElementById('edit-feedback');

  const name      = nameInput.value.trim();
  const avatarUrl = avatarInput.value.trim();

  if (name.length < 2) {
    showFeedback(feedback, 'O nome deve ter pelo menos 2 caracteres.', false);
    return;
  }

  const updates = { name };
  if (avatarUrl) updates.avatarUrl = avatarUrl;

  try {
    await userApi.updateMe(updates);
    showFeedback(feedback, 'Perfil atualizado com sucesso!', true);
    await loadProfile();
  } catch (err) {
    showFeedback(feedback, err.message || 'Erro ao salvar.', false);
  }
};

function showFeedback(el, msg, ok) {
  el.textContent = msg;
  el.style.color = ok ? '#4ade80' : '#f87171';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}
