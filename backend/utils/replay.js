// =============================================================
// replay.js — validação do roteiro lance a lance usado no replay
// animado da simulação (frontend/js/handReplay.js).
// A IA gera { table, replay }; aqui conferimos só a ESTRUTURA —
// a aritmética do pote não é validada (ver spec, "Riscos").
// =============================================================

import { normalizePokerLanguage, validatePokerLanguage } from './pokerLanguage.js';

export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const STREETS = ['preflop', 'flop', 'turn', 'river'];
const ACTIONS = ['post', 'fold', 'check', 'call', 'bet', 'raise', 'allin', 'deal', 'decision'];
const MIN_STEPS = 6;
const MAX_STEPS = 20;

const isAmount = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const fail = (reason) => ({ ok: false, reason });

export function validateReplay(sim) {
  const seats = sim?.table?.seats;
  if (!Array.isArray(seats) || seats.length !== 6) return fail('table.seats deve ter 6 assentos');

  const positions = new Set();
  let hero = null;
  for (const seat of seats) {
    if (!POSITIONS.includes(seat?.pos)) return fail(`posição inválida: ${seat?.pos}`);
    if (positions.has(seat.pos)) return fail(`posição duplicada: ${seat.pos}`);
    positions.add(seat.pos);
    if (!isAmount(seat.stack) || seat.stack <= 0) return fail(`stack inválido em ${seat.pos}`);
    if (seat.hero === true) {
      if (hero) return fail('mais de um hero');
      hero = seat.pos;
    }
  }
  if (!hero) return fail('nenhum hero em table.seats');

  const steps = sim.replay;
  if (!Array.isArray(steps) || steps.length < MIN_STEPS || steps.length > MAX_STEPS) {
    return fail(`replay deve ter entre ${MIN_STEPS} e ${MAX_STEPS} passos`);
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const at = `passo ${i}`;
    if (!STREETS.includes(step?.street)) return fail(`${at}: street inválida`);
    if (!ACTIONS.includes(step.action)) return fail(`${at}: action inválida (${step.action})`);
    if (!isAmount(step.amount) || !isAmount(step.pot)) return fail(`${at}: amount/pot devem ser números >= 0`);
    if (typeof step.board !== 'string') return fail(`${at}: board deve ser string`);
    if (typeof step.narration !== 'string' || !step.narration.trim()) return fail(`${at}: narration vazia`);
    if (step.action === 'deal') {
      if (step.actor !== null) return fail(`${at}: deal deve ter actor null`);
    } else if (!positions.has(step.actor)) {
      return fail(`${at}: actor inexistente (${step.actor})`);
    }
    if (step.action === 'decision' && i !== steps.length - 1) return fail(`${at}: decision antes do último passo`);
  }

  const last = steps[steps.length - 1];
  if (last.action !== 'decision' || last.actor !== hero) return fail('último passo deve ser decision do hero');

  return { ok: true, reason: null };
}

// Normaliza a narração de cada passo e valida o roteiro.
// Inválido → remove table/replay (o frontend cai na mesa estática) e retorna false,
// para o chamador decidir não cachear a lição.
export function applyReplay(sim, label) {
  if (!sim) return false;

  if (Array.isArray(sim.replay)) {
    for (const step of sim.replay) {
      if (typeof step?.narration === 'string') step.narration = normalizePokerLanguage(step.narration);
    }
  }

  const { ok, reason } = validateReplay(sim);
  if (!ok) {
    console.warn(`[replay] inválido ${label}: ${reason}`);
    delete sim.replay;
    delete sim.table;
    return false;
  }

  const terms = new Set(sim.replay.flatMap(step => validatePokerLanguage(step.narration).issues.map(i => i.forbiddenTerm)));
  if (terms.size) console.warn(`[pokerLanguage] replay ${label}:`, [...terms].join(', '));
  return true;
}
