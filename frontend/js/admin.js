// =============================================================
// admin.js — Lógica do painel administrativo
//
// Verifica se o usuário é admin e, se for:
//  - Carrega e renderiza a lista de usuários
//  - Permite mudar roles (user ↔ admin)
//  - Permite deletar usuários
// =============================================================

import { fbAuth } from './config.js';
import { userApi } from './api.js';

let pendingDeleteUid  = null; // UID aguardando confirmação de deleção
let pendingDeleteName = null;
let pendingAccessUid  = null; // UID aguardando definição de prazo
let allUsers          = []; // cache para lookups por uid nos handlers de onclick

// ── Inicialização ─────────────────────────────────────────────
fbAuth.onAuthStateChanged(async (user) => {
  if (!user) return;

  try {
    const { user: me } = await userApi.getMe();

    if (me.role !== 'admin') {
      document.getElementById('access-denied').classList.remove('hidden');
      return;
    }

    document.getElementById('admin-panel').classList.remove('hidden');
    await loadUsers();
  } catch (err) {
    document.getElementById('access-denied').classList.remove('hidden');
  }
});

// ── Carrega e renderiza lista de usuários ─────────────────────
async function loadUsers() {
  try {
    const { users } = await userApi.listAll();
    const myUid     = fbAuth.currentUser?.uid;

    // Atualiza estatísticas
    const adminCount = users.filter(u => u.role === 'admin').length;
    document.getElementById('admin-total').textContent = users.length;
    document.getElementById('admin-count').textContent = adminCount;
    document.getElementById('user-count').textContent  = users.length - adminCount;

    // Renderiza tabela
    allUsers = users;
    const tbody = document.getElementById('users-table');
    const safe = (s) => DOMPurify.sanitize(String(s ?? ''), { ALLOWED_TAGS: [] });
    tbody.innerHTML = users.map(u => {
      const isMe    = u.uid === myUid;
      const blocked = u.disabled === true;
      const expDate = u.accessExpiresAt ? new Date(u.accessExpiresAt) : null;
      const expired = expDate && expDate < new Date();

      const statusBadge = blocked
        ? `<span class="text-xs font-bold px-2 py-1 rounded-full text-red-400" style="background:rgba(239,68,68,0.1);">Bloqueado</span>`
        : `<span class="text-xs font-bold px-2 py-1 rounded-full text-green-400" style="background:rgba(74,222,128,0.1);">Ativo</span>`;

      const accessLabel = expDate
        ? `<span class="${expired ? 'text-red-400' : 'text-gray-300'} text-xs">${expDate.toLocaleDateString('pt-BR')}${expired ? ' ⚠️' : ''}</span>`
        : `<span class="text-xs text-gray-600">Sem limite</span>`;

      return `
        <tr class="border-t border-white/5 hover:bg-white/[0.02]">
          <td class="px-4 py-3 text-white font-medium">
            ${safe(u.name)}
            ${isMe ? '<span class="text-xs text-yellow-500 ml-1">(você)</span>' : ''}
          </td>
          <td class="px-4 py-3 text-gray-400 text-xs">${safe(u.email)}</td>
          <td class="px-4 py-3">
            <span class="text-xs font-bold px-2 py-1 rounded-full ${u.role === 'admin' ? 'text-yellow-400' : 'text-gray-400'}"
                  style="background:${u.role === 'admin' ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.05)'};">
              ${u.role}
            </span>
          </td>
          <td class="px-4 py-3 text-gray-300 text-sm">${(u.totalXP || 0).toLocaleString('pt-BR')}</td>
          <td class="px-4 py-3">${statusBadge}</td>
          <td class="px-4 py-3">${accessLabel}</td>
          <td class="px-4 py-3">
            <div class="flex flex-wrap gap-1">
              ${!isMe ? `
                <button onclick="toggleRole('${u.uid}')"
                        class="text-xs px-2 py-1 rounded border transition-colors hover:bg-white/5"
                        style="border-color:rgba(255,255,255,0.1); color:#9ca3af;">
                  ${u.role === 'admin' ? '↓ user' : '↑ admin'}
                </button>
                <button onclick="toggleStatus('${u.uid}')"
                        class="text-xs px-2 py-1 rounded border transition-colors ${blocked ? 'hover:bg-green-900/20' : 'hover:bg-orange-900/20'}"
                        style="border-color:${blocked ? 'rgba(74,222,128,0.2)' : 'rgba(251,146,60,0.2)'}; color:${blocked ? '#4ade80' : '#fb923c'};">
                  ${blocked ? 'Ativar' : 'Bloquear'}
                </button>
                <button onclick="openAccessModal('${u.uid}')"
                        class="text-xs px-2 py-1 rounded border transition-colors hover:bg-white/5"
                        style="border-color:rgba(255,255,255,0.1); color:#9ca3af;">
                  Prazo
                </button>
                <button onclick="resetPassword('${u.uid}')"
                        class="text-xs px-2 py-1 rounded border transition-colors hover:bg-blue-900/20"
                        style="border-color:rgba(96,165,250,0.2); color:#60a5fa;">
                  Reset senha
                </button>
                <button onclick="openDeleteModal('${u.uid}')"
                        class="text-xs px-2 py-1 rounded border transition-colors hover:bg-red-900/20"
                        style="border-color:rgba(239,68,68,0.2); color:#f87171;">
                  Remover
                </button>
              ` : '<span class="text-xs text-gray-600">—</span>'}
            </div>
          </td>
        </tr>`;
    }).join('');

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">
          Nenhum usuário encontrado.
        </td></tr>`;
    }
  } catch (err) {
    console.error('Erro ao carregar usuários:', err.message);
  }
}

// ── Alterna role do usuário ───────────────────────────────────
window.toggleRole = async function(uid) {
  const user        = allUsers.find(u => u.uid === uid);
  const currentRole = user?.role || 'user';
  const name        = user?.name || uid;
  const newRole     = currentRole === 'admin' ? 'user' : 'admin';
  const action      = newRole === 'admin' ? 'promover' : 'rebaixar';

  if (!confirm(`Deseja ${action} ${name} para "${newRole}"?`)) return;

  try {
    await userApi.changeRole(uid, newRole);
    await loadUsers(); // Recarrega a tabela
  } catch (err) {
    alert(`Erro: ${err.message}`);
  }
};

// ── Modal de confirmação de deleção ───────────────────────────
window.openDeleteModal = function(uid) {
  const name        = allUsers.find(u => u.uid === uid)?.name || uid;
  pendingDeleteUid  = uid;
  pendingDeleteName = name;
  document.getElementById('delete-name').textContent = name;
  const modal = document.getElementById('modal-delete');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeDeleteModal = function() {
  pendingDeleteUid  = null;
  pendingDeleteName = null;
  const modal = document.getElementById('modal-delete');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.confirmDelete = async function() {
  if (!pendingDeleteUid) return;

  try {
    await userApi.delete(pendingDeleteUid);
    window.closeDeleteModal();
    await loadUsers();
  } catch (err) {
    alert(`Erro ao remover: ${err.message}`);
    window.closeDeleteModal();
  }
};

// ── Bloquear / Ativar usuário ──────────────────────────────────
window.toggleStatus = async function(uid) {
  const user     = allUsers.find(u => u.uid === uid);
  const blocked  = user?.disabled === true;
  const name     = user?.name || uid;
  const action   = blocked ? 'ativar' : 'bloquear';

  if (!confirm(`Deseja ${action} o acesso de ${name}?`)) return;

  try {
    await userApi.setStatus(uid, !blocked);
    await loadUsers();
  } catch (err) {
    alert(`Erro: ${err.message}`);
  }
};

// ── Modal de prazo de acesso ───────────────────────────────────
window.openAccessModal = function(uid) {
  const user = allUsers.find(u => u.uid === uid);
  pendingAccessUid = uid;
  document.getElementById('access-name').textContent = user?.name || uid;

  // Preenche a data atual do prazo se existir
  const input = document.getElementById('access-date');
  input.value = user?.accessExpiresAt
    ? new Date(user.accessExpiresAt).toISOString().split('T')[0]
    : '';

  const modal = document.getElementById('modal-access');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeAccessModal = function() {
  pendingAccessUid = null;
  const modal = document.getElementById('modal-access');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
};

window.confirmAccess = async function() {
  if (!pendingAccessUid) return;
  const dateVal = document.getElementById('access-date').value;
  if (!dateVal) {
    alert('Selecione uma data ou clique em "Sem limite" para remover o prazo.');
    return;
  }
  try {
    // Converte para ISO com hora final do dia (23:59:59 no fuso local)
    await userApi.setAccess(pendingAccessUid, new Date(dateVal + 'T23:59:59').toISOString());
    window.closeAccessModal();
    await loadUsers();
  } catch (err) {
    alert(`Erro: ${err.message}`);
  }
};

window.clearAccess = async function() {
  if (!pendingAccessUid) return;
  try {
    await userApi.setAccess(pendingAccessUid, null);
    window.closeAccessModal();
    await loadUsers();
  } catch (err) {
    alert(`Erro: ${err.message}`);
  }
};

// ── Reset de senha ─────────────────────────────────────────────
// Usa Firebase client SDK — envia email de redefinição pelo serviço do Firebase.
// Funciona para contas de email/senha. Contas Google não têm senha local.
window.resetPassword = async function(uid) {
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;
  if (!confirm(`Enviar email de redefinição de senha para ${user.name} (${user.email})?`)) return;
  try {
    await fbAuth.sendPasswordResetEmail(user.email);
    alert(`Email de redefinição enviado para ${user.email}.`);
  } catch (err) {
    alert(`Erro ao enviar email: ${err.message}`);
  }
};
