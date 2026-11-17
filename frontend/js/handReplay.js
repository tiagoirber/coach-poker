// =============================================================
// handReplay.js — replay animado da mão: mesa 6-max + narração
// sincronizada, parando na decisão do Hero.
//
// Os dados chegam de lesson.js já passados por sanitizeAiData:
// strings sem tags, com & < > codificados como entidades. Por isso a
// narração entra via innerHTML (textContent mostraria "&amp;").
// Nenhum outro texto da IA vira HTML: posições são checadas contra
// POSITIONS e cartas passam pelo regex de parseCards.
// =============================================================

const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
// Ordem horária na mesa; o assento do Hero sempre ocupa o slot 0 (embaixo)
const CLOCKWISE = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
const SLOTS = [
  { seat: [50, 94], bet: [50, 74], dealer: [60, 82] },
  { seat: [12, 76], bet: [25, 70], dealer: [22, 86] },
  { seat: [8, 28],  bet: [21, 32], dealer: [16, 42] },
  { seat: [32, 2],  bet: [36, 22], dealer: [22, 10] },
  { seat: [68, 2],  bet: [64, 22], dealer: [78, 10] },
  { seat: [92, 28], bet: [79, 32], dealer: [84, 42] },
];
const STREET_LABEL = { preflop: 'PRÉ-FLOP', flop: 'FLOP', turn: 'TURN', river: 'RIVER' };
const BET_ACTIONS = ['post', 'call', 'bet', 'raise', 'allin'];
const BADGE_CLASS = { post: 'b-call', fold: 'b-fold', check: 'b-check', call: 'b-call', bet: 'b-bet', raise: 'b-bet', allin: 'b-allin' };

const fmt = (n) => `${+Number(n || 0).toFixed(1)}bb`;

function parseCards(str) {
  return [...String(str || '').matchAll(/([AKQJT]|10|[2-9])([♠♥♦♣])/g)].map(m => ({ rank: m[1], suit: m[2] }));
}

function cardHtml(card, cls = '') {
  const red = card.suit === '♥' || card.suit === '♦' ? 'red' : '';
  return `<span class="rp-card ${cls} ${red}"><span class="c-tl">${card.rank}<small>${card.suit}</small></span><span class="c-mid">${card.suit}</span></span>`;
}

function badgeText(action, amount) {
  switch (action) {
    case 'post':  return `BLIND ${fmt(amount)}`;
    case 'fold':  return 'FOLD';
    case 'check': return 'CHECK';
    case 'call':  return `CALL ${fmt(amount)}`;
    case 'bet':   return `BET ${fmt(amount)}`;
    case 'raise': return `RAISE ${fmt(amount)}`;
    case 'allin': return 'ALL-IN';
    default:      return '';
  }
}

// O frontend só tenta animar se a estrutura mínima existe (o backend já valida;
// isto protege contra cache antigo ou dado parcial).
export function canReplay(sim) {
  const seats = sim?.table?.seats;
  const steps = sim?.replay;
  return Array.isArray(seats) && seats.length === 6
    && seats.every(s => POSITIONS.includes(s?.pos))
    && seats.filter(s => s?.hero === true).length === 1
    && Array.isArray(steps) && steps.length > 0
    && steps[steps.length - 1]?.action === 'decision';
}

// Estado da mesa após aplicar os passos 0..i (função pura).
export function stateAt(sim, i) {
  const st = {
    folded: new Set(), bets: {}, stacks: {}, pot: 0, board: '', street: 'preflop',
    actor: null, action: null, amount: 0, deciding: false, streetChanged: false,
  };
  for (const seat of sim.table.seats) {
    st.stacks[seat.pos] = Number(seat.stack) || 0;
    st.bets[seat.pos] = 0;
  }
  for (let k = 0; k <= i; k++) {
    const step = sim.replay[k];
    const changed = step.street !== st.street;
    if (changed) {
      for (const pos in st.bets) st.bets[pos] = 0;
      st.street = step.street;
    }
    if (k === i) st.streetChanged = changed && k > 0;
    st.board = step.board || '';
    st.pot = Number(step.pot) || 0;
    st.actor = step.actor;
    st.action = step.action;
    st.amount = Number(step.amount) || 0;
    if (step.action === 'fold') st.folded.add(step.actor);
    if (BET_ACTIONS.includes(step.action) && step.actor in st.bets) {
      const add = Math.max(0, st.amount - st.bets[step.actor]);
      st.stacks[step.actor] = Math.max(0, st.stacks[step.actor] - add);
      st.bets[step.actor] = st.amount;
    }
    st.deciding = step.action === 'decision';
  }
  return st;
}

export function mountReplay(container, sim, { onDecision } = {}) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  container.innerHTML = `
    <div class="rp">
      <div class="rp-stage"><div class="rp-felt">
        <div class="rp-street"></div>
        <div class="rp-board"></div>
        <div class="rp-pot"><span class="rp-chip c1"></span><span class="rp-chip c3"></span><span class="rp-potv"></span></div>
        <div class="rp-logo">POKER COACH</div>
      </div></div>
      <div class="rp-side">
        <div class="rp-narr" aria-live="polite"></div>
        <div class="rp-ctrl">
          <button type="button" class="rp-btn" data-act="prev" aria-label="Lance anterior">⏮</button>
          <button type="button" class="rp-btn" data-act="play" aria-label="Tocar">▶</button>
          <button type="button" class="rp-btn" data-act="next" aria-label="Próximo lance">⏭</button>
          <div class="rp-prog"></div>
          <button type="button" class="rp-btn" data-act="speed" aria-label="Velocidade">1x</button>
        </div>
        <button type="button" class="rp-skip" data-act="skip">⏩ Ir para a decisão</button>
      </div>
    </div>`;

  const q = (sel) => container.querySelector(sel);
  const felt = q('.rp-felt');
  const narr = q('.rp-narr');
  const prog = q('.rp-prog');
  const boardEl = q('.rp-board');
  const playBtn = q('[data-act="play"]');
  const skipBtn = q('[data-act="skip"]');

  const heroPos = sim.table.seats.find(s => s.hero === true).pos;
  const offset = CLOCKWISE.indexOf(heroPos);
  const slotOf = (pos) => SLOTS[(CLOCKWISE.indexOf(pos) - offset + 6) % 6];

  const seatEls = {};
  const betEls = {};
  for (const seat of sim.table.seats) {
    const slot = slotOf(seat.pos);
    const el = document.createElement('div');
    el.className = 'rp-seat' + (seat.hero ? ' hero' : '');
    el.style.left = `${slot.seat[0]}%`;
    el.style.top = `${slot.seat[1]}%`;
    el.innerHTML = '<div class="rp-hole"></div><div class="rp-plate"><div class="rp-pos"></div><div class="rp-stk"></div></div><div class="rp-badge"></div>';
    el.querySelector('.rp-pos').textContent = seat.pos + (seat.hero ? ' · Você' : '');
    felt.appendChild(el);
    seatEls[seat.pos] = el;

    const bet = document.createElement('div');
    bet.className = 'rp-bet';
    bet.style.left = `${slot.bet[0]}%`;
    bet.style.top = `${slot.bet[1]}%`;
    felt.appendChild(bet);
    betEls[seat.pos] = bet;

    if (seat.pos === 'BTN') {
      const dealer = document.createElement('div');
      dealer.className = 'rp-dealer';
      dealer.textContent = 'D';
      dealer.style.left = `${slot.dealer[0]}%`;
      dealer.style.top = `${slot.dealer[1]}%`;
      felt.appendChild(dealer);
    }
  }

  const lines = sim.replay.map((step, i) => {
    const line = document.createElement('div');
    line.className = 'rp-line future';
    const tag = document.createElement('span');
    tag.className = 'rp-st';
    tag.textContent = STREET_LABEL[step.street] || '';
    const text = document.createElement('span');
    text.innerHTML = step.narration || ''; // já sanitizado em lesson.js (ver cabeçalho)
    line.append(tag, text);
    narr.appendChild(line);

    const tick = document.createElement('button');
    tick.type = 'button';
    tick.className = 'rp-tick';
    tick.setAttribute('aria-label', `Ir para o lance ${i + 1}`);
    tick.addEventListener('click', () => go(i, true));
    prog.appendChild(tick);
    return line;
  });
  const ticks = [...prog.children];

  let cur = -1;
  let playing = false;
  let speed = 1;
  let timer = null;
  let shownBoard = 0;
  let destroyed = false;

  function render(i, jump) {
    const st = stateAt(sim, i);
    const step = sim.replay[i];

    q('.rp-street').textContent = STREET_LABEL[st.street] || '';
    q('.rp-potv').textContent = fmt(st.pot);

    const cards = parseCards(st.board);
    const animateFrom = (jump || reduceMotion) ? cards.length : Math.min(shownBoard, cards.length);
    boardEl.innerHTML = cards.map((c, k) => cardHtml(c, k >= animateFrom ? 'dealt' : '')).join('')
      + '<span class="rp-slot"></span>'.repeat(Math.max(0, 5 - cards.length));
    shownBoard = cards.length;

    for (const seat of sim.table.seats) {
      const el = seatEls[seat.pos];
      const folded = st.folded.has(seat.pos);
      el.classList.toggle('folded', folded);
      el.classList.toggle('acting', st.actor === seat.pos && !st.deciding);
      el.classList.toggle('deciding', st.deciding && seat.hero === true);
      el.querySelector('.rp-stk').textContent = fmt(st.stacks[seat.pos]);

      const hole = el.querySelector('.rp-hole');
      if (folded) hole.innerHTML = '';
      else if (seat.hero) hole.innerHTML = parseCards(sim.heroHand).map(c => cardHtml(c, 'hero-c')).join('');
      else hole.innerHTML = '<span class="rp-card sm back"></span><span class="rp-card sm back"></span>';

      const badge = el.querySelector('.rp-badge');
      const label = st.actor === seat.pos ? badgeText(st.action, st.amount) : '';
      badge.className = label ? `rp-badge ${BADGE_CLASS[st.action]} show` : 'rp-badge';
      badge.textContent = label;

      const bet = betEls[seat.pos];
      bet.classList.remove('to-pot');
      const amt = st.bets[seat.pos];
      bet.style.opacity = amt > 0 ? '1' : '0';
      bet.innerHTML = amt > 0 ? `<span class="rp-chip ${amt >= 2 ? 'c3' : 'c1'}"></span>` : '';
      if (amt > 0) bet.append(fmt(amt));
    }

    // Fichas da street anterior deslizam para o pote
    if (st.streetChanged && !jump && !reduceMotion) {
      const prev = stateAt(sim, i - 1);
      for (const seat of sim.table.seats) {
        const prevAmt = prev.bets[seat.pos];
        if (prevAmt <= 0) continue;
        const bet = betEls[seat.pos];
        bet.style.opacity = '1';
        bet.innerHTML = '<span class="rp-chip c3"></span>';
        bet.append(fmt(prevAmt));
        requestAnimationFrame(() => requestAnimationFrame(() => bet.classList.add('to-pot')));
      }
    }

    lines.forEach((line, k) => {
      line.classList.toggle('future', k > i);
      line.classList.toggle('on', k === i);
    });
    narr.scrollTop = Math.max(0, lines[i].offsetTop - narr.clientHeight / 2);
    ticks.forEach((t, k) => { t.className = k < i ? 'rp-tick done' : k === i ? 'rp-tick cur' : 'rp-tick'; });

    const isDecision = step.action === 'decision';
    skipBtn.hidden = isDecision;
    if (isDecision) {
      setPlaying(false);
      onDecision?.();
    }
  }

  function go(i, jump) {
    if (destroyed) return;
    cur = Math.max(0, Math.min(sim.replay.length - 1, i));
    render(cur, jump);
    schedule();
  }

  function schedule() {
    clearTimeout(timer);
    if (!playing || destroyed || cur < 0) return;
    const step = sim.replay[cur];
    if (step.action === 'decision') return;
    const ms = Math.min(7000, 1500 + 35 * String(step.narration || '').length) / speed;
    timer = setTimeout(() => go(cur + 1, false), ms);
  }

  function setPlaying(value) {
    playing = value;
    playBtn.textContent = value ? '⏸' : '▶';
    playBtn.setAttribute('aria-label', value ? 'Pausar' : 'Tocar');
    schedule();
  }

  const onClick = (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'play') {
      if (cur === sim.replay.length - 1) { go(0, true); setPlaying(true); }
      else if (cur < 0) { setPlaying(true); go(0, false); }
      else setPlaying(!playing);
    } else if (act === 'next') go(cur + 1, false);
    else if (act === 'prev') go(cur - 1, true);
    else if (act === 'skip') go(sim.replay.length - 1, true);
    else if (act === 'speed') {
      speed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
      e.target.textContent = `${speed}x`;
      schedule();
    }
  };
  container.addEventListener('click', onClick);

  // Os painéis de simulação são montados escondidos (step-panel inativo).
  // Só começa a tocar quando o replay aparece na tela, senão chegaria à
  // decisão antes do aluno abrir a etapa.
  go(0, true);
  let observer = null;
  const start = () => { if (!destroyed && cur === 0 && !playing) setPlaying(true); };
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { observer.disconnect(); observer = null; start(); }
    }, { threshold: 0.3 });
    observer.observe(container);
  } else {
    start();
  }

  return {
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      observer?.disconnect();
      container.removeEventListener('click', onClick);
    },
  };
}
