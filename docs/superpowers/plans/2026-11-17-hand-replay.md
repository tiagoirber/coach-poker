# Replay animado da mão — Plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar tarefa a tarefa. Os passos usam checkbox (`- [ ]`).
>
> **Regra do projeto (CLAUDE.md §7):** não commitar automaticamente. Os passos "Checkpoint" sugerem a mensagem de commit. Quem commita é o usuário.

**Objetivo:** substituir a mesa estática das simulações por um replay animado 6-max, sincronizado com a narração e pausando na decisão do Hero.

**Arquitetura:**
- A IA passa a devolver `table` e `replay` em cada simulação.
- O backend valida com uma função pura em `backend/utils/replay.js`. Replay inválido é removido e, nesse caso, a lição não é cacheada.
- O frontend ganha o módulo isolado `frontend/js/handReplay.js` (com `stateAt` puro e `mountReplay`) e o `frontend/css/replay.css`.
- O `lesson.js` usa o player quando `canReplay(sim)` é verdadeiro. Se não, mantém a mesa estática atual.

**Stack:** Node 22 + Express (ESM), Vitest + supertest, HTML/JS puro (módulos ES) + Tailwind CDN.

**Spec:** `docs/superpowers/specs/2026-11-17-hand-replay-design.md`

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `backend/utils/replay.js` | Criar | `validateReplay(sim)` (pura) e `applyReplay(sim, label)`, que normaliza a narração, valida e remove o replay quando inválido |
| `backend/utils/replay.fixture.js` | Criar | `makeValidSim()`: simulação válida compartilhada pelos testes (não é `*.test.js`, então o Vitest não a executa) |
| `backend/utils/replay.test.js` | Criar | Testes de `validateReplay` e `applyReplay` |
| `backend/routes/claude.js` | Modificar | Prompts com regras e exemplo do replay; `applyReplay` na fase 2 e no practice-hand; cache exige replay; não grava cache se o replay vier inválido; `max_tokens` maiores |
| `backend/routes/claude.test.js` | Modificar | Mocks do Firestore controláveis; testes de rota do replay |
| `frontend/css/replay.css` | Criar | Visual do protótipo v3 (mesa, cartas, fichas, badges, controles, responsivo) |
| `frontend/js/handReplay.js` | Criar | `canReplay`, `stateAt` e `mountReplay` → `{ destroy }` |
| `frontend/js/lesson.js` | Modificar | Integração: contêiner do replay, opções ocultas até a decisão, ciclo de vida dos players |
| `frontend/pages/lesson.html` | Modificar | Carregar `replay.css` |
| `CLAUDE.md` | Modificar | Registrar a decisão e o formato novo |

---

### Tarefa 1: fixture compartilhada + `validateReplay`

**Arquivos:**
- Criar: `backend/utils/replay.fixture.js`
- Criar: `backend/utils/replay.js`
- Criar: `backend/utils/replay.test.js`

- [ ] **Passo 1: criar a fixture**

`backend/utils/replay.fixture.js`:
```js
// Simulação válida usada pelos testes de replay (não é um arquivo de teste).
export function makeValidSim() {
  return {
    heroHand: 'A♠K♦',
    narrative: 'Narrativa corrida da mão.',
    question: 'Qual é sua ação?',
    options: ['Fold', 'Check', 'Bet 3bb'],
    correct: 2,
    table: {
      seats: [
        { pos: 'UTG', stack: 98 }, { pos: 'HJ', stack: 120 }, { pos: 'CO', stack: 75 },
        { pos: 'BTN', stack: 100, hero: true }, { pos: 'SB', stack: 60 }, { pos: 'BB', stack: 91 },
      ],
    },
    replay: [
      { street: 'preflop', board: '', actor: 'SB',  action: 'post',  amount: 0.5, pot: 0.5, narration: 'SB posta o small blind.' },
      { street: 'preflop', board: '', actor: 'BB',  action: 'post',  amount: 1,   pot: 1.5, narration: 'BB posta o big blind.' },
      { street: 'preflop', board: '', actor: 'UTG', action: 'fold',  amount: 0,   pot: 1.5, narration: 'UTG folda.' },
      { street: 'preflop', board: '', actor: 'HJ',  action: 'fold',  amount: 0,   pot: 1.5, narration: 'HJ folda.' },
      { street: 'preflop', board: '', actor: 'CO',  action: 'fold',  amount: 0,   pot: 1.5, narration: 'CO folda.' },
      { street: 'preflop', board: '', actor: 'BTN', action: 'raise', amount: 2.5, pot: 4,   narration: 'Você dá raise para 2.5bb.' },
      { street: 'preflop', board: '', actor: 'SB',  action: 'fold',  amount: 0,   pot: 4,   narration: 'SB folda.' },
      { street: 'preflop', board: '', actor: 'BB',  action: 'call',  amount: 2.5, pot: 5.5, narration: 'BB paga.' },
      { street: 'flop', board: 'A♥7♣2♦', actor: null,  action: 'deal',     amount: 0, pot: 5.5, narration: 'Flop A♥7♣2♦.' },
      { street: 'flop', board: 'A♥7♣2♦', actor: 'BB',  action: 'check',    amount: 0, pot: 5.5, narration: 'BB dá check.' },
      { street: 'flop', board: 'A♥7♣2♦', actor: 'BTN', action: 'decision', amount: 0, pot: 5.5, narration: 'Sua vez.' },
    ],
  };
}
```

- [ ] **Passo 2: escrever os testes de `validateReplay` (vão falhar)**

`backend/utils/replay.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateReplay } from './replay.js';
import { makeValidSim } from './replay.fixture.js';

describe('validateReplay', () => {
  it('aceita uma simulação válida', () => {
    expect(validateReplay(makeValidSim())).toEqual({ ok: true, reason: null });
  });

  it('rejeita sem table/replay', () => {
    const sim = makeValidSim();
    delete sim.table;
    expect(validateReplay(sim).ok).toBe(false);
  });

  it('rejeita 5 assentos', () => {
    const sim = makeValidSim();
    sim.table.seats.pop();
    expect(validateReplay(sim)).toMatchObject({ ok: false, reason: expect.stringMatching(/6 assentos/) });
  });

  it('rejeita posição duplicada ou desconhecida', () => {
    const dup = makeValidSim();
    dup.table.seats[0].pos = 'HJ';
    expect(validateReplay(dup).ok).toBe(false);
    const bad = makeValidSim();
    bad.table.seats[0].pos = 'MP';
    expect(validateReplay(bad).ok).toBe(false);
  });

  it('rejeita dois heroes e nenhum hero', () => {
    const two = makeValidSim();
    two.table.seats[0].hero = true;
    expect(validateReplay(two)).toMatchObject({ ok: false, reason: expect.stringMatching(/hero/) });
    const none = makeValidSim();
    delete none.table.seats[3].hero;
    expect(validateReplay(none)).toMatchObject({ ok: false, reason: expect.stringMatching(/hero/) });
  });

  it('rejeita action fora do enum', () => {
    const sim = makeValidSim();
    sim.replay[2].action = 'muck';
    expect(validateReplay(sim)).toMatchObject({ ok: false, reason: expect.stringMatching(/action/) });
  });

  it('rejeita actor inexistente e deal com actor', () => {
    const ghost = makeValidSim();
    ghost.replay[2].actor = 'MP';
    expect(validateReplay(ghost).ok).toBe(false);
    const deal = makeValidSim();
    deal.replay[8].actor = 'BB';
    expect(validateReplay(deal)).toMatchObject({ ok: false, reason: expect.stringMatching(/deal/) });
  });

  it('rejeita amount/pot não numéricos', () => {
    const sim = makeValidSim();
    sim.replay[5].amount = '2.5';
    expect(validateReplay(sim).ok).toBe(false);
  });

  it('rejeita quando o último passo não é decision do hero', () => {
    const noDecision = makeValidSim();
    noDecision.replay.pop();
    expect(validateReplay(noDecision)).toMatchObject({ ok: false, reason: expect.stringMatching(/último passo/) });
    const villain = makeValidSim();
    villain.replay.at(-1).actor = 'BB';
    expect(validateReplay(villain).ok).toBe(false);
  });

  it('rejeita decision antes do último passo', () => {
    const sim = makeValidSim();
    sim.replay[3].action = 'decision';
    expect(validateReplay(sim)).toMatchObject({ ok: false, reason: expect.stringMatching(/decision/) });
  });

  it('rejeita menos de 6 ou mais de 20 passos', () => {
    const short = makeValidSim();
    short.replay = short.replay.slice(-5);
    expect(validateReplay(short).ok).toBe(false);
    const long = makeValidSim();
    const fold = { street: 'preflop', board: '', actor: 'UTG', action: 'fold', amount: 0, pot: 1.5, narration: 'x' };
    long.replay = [...Array(20).fill(fold), long.replay.at(-1)];
    expect(validateReplay(long).ok).toBe(false);
  });
});
```

- [ ] **Passo 3: rodar e confirmar a falha**

Comando: `npx vitest run backend/utils/replay.test.js`
Esperado: FAIL com `Failed to resolve import "./replay.js"`.

- [ ] **Passo 4: implementar `validateReplay`**

`backend/utils/replay.js`:
```js
// =============================================================
// replay.js — validação do roteiro lance a lance usado no replay
// animado da simulação (frontend/js/handReplay.js).
// A IA gera { table, replay }; aqui conferimos só a ESTRUTURA —
// a aritmética do pote não é validada (ver spec, "Riscos").
// =============================================================

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
```

- [ ] **Passo 5: rodar e confirmar que passa**

Comando: `npx vitest run backend/utils/replay.test.js`
Esperado: PASS, 11 testes.

- [ ] **Passo 6: checkpoint** — mensagem sugerida: `feat(replay): validateReplay + fixture de testes`

---

### Tarefa 2: `applyReplay` (normalização + remoção quando inválido)

**Arquivos:**
- Modificar: `backend/utils/replay.js`
- Modificar: `backend/utils/replay.test.js`

- [ ] **Passo 1: acrescentar os testes (vão falhar)**

No topo de `backend/utils/replay.test.js`, troque a linha de import de `./replay.js` por:
```js
import { validateReplay, applyReplay } from './replay.js';
```
E acrescente no fim do arquivo:
```js
describe('applyReplay', () => {
  it('mantém replay válido e normaliza a narração de cada passo', () => {
    const sim = makeValidSim();
    sim.replay[2].narration = 'No fracasso o grande cego pensou.';
    expect(applyReplay(sim, 'teste')).toBe(true);
    expect(sim.replay[2].narration).toBe('No flop o big blind pensou.');
    expect(sim.table).toBeDefined();
  });

  it('remove table e replay quando inválido e retorna false', () => {
    const sim = makeValidSim();
    sim.replay.pop();
    expect(applyReplay(sim, 'teste')).toBe(false);
    expect(sim.replay).toBeUndefined();
    expect(sim.table).toBeUndefined();
    expect(sim.narrative).toBe('Narrativa corrida da mão.');
  });

  it('retorna false quando a IA não mandou replay', () => {
    const sim = makeValidSim();
    delete sim.replay;
    delete sim.table;
    expect(applyReplay(sim, 'teste')).toBe(false);
  });

  it('retorna false para sim ausente', () => {
    expect(applyReplay(undefined, 'teste')).toBe(false);
  });
});
```

- [ ] **Passo 2: rodar e confirmar a falha**

Comando: `npx vitest run backend/utils/replay.test.js`
Esperado: FAIL com `applyReplay is not a function`.

- [ ] **Passo 3: implementar**

Em `backend/utils/replay.js`, acrescente no topo (abaixo do comentário de cabeçalho):
```js
import { normalizePokerLanguage, validatePokerLanguage } from './pokerLanguage.js';
```
E no fim do arquivo:
```js
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
```

- [ ] **Passo 4: rodar e confirmar que passa**

Comando: `npx vitest run backend/utils/replay.test.js`
Esperado: PASS, 15 testes.

- [ ] **Passo 5: checkpoint** — mensagem sugerida: `feat(replay): applyReplay normaliza narração e remove replay inválido`

---

### Tarefa 3: backend — prompts, pipeline e cache em `claude.js`

**Arquivos:**
- Modificar: `backend/routes/claude.js`
- Modificar: `backend/routes/claude.test.js`

- [ ] **Passo 1: tornar os mocks do Firestore controláveis em `claude.test.js`**

Troque a linha 1:
```js
import { describe, it, expect, vi, afterEach } from 'vitest';
```
por:
```js
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { makeValidSim } from '../utils/replay.fixture.js';
```
Troque o bloco `vi.mock('../config/firebase.js', ...)` inteiro por:
```js
const dbMocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('../config/firebase.js', () => ({
  db: {
    collection: () => ({
      doc: () => ({ get: dbMocks.get, set: dbMocks.set }),
    }),
  },
  auth: {
    verifyIdToken: vi.fn(),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
  },
  default: {},
}));

beforeEach(() => {
  dbMocks.get.mockReset().mockResolvedValue({ exists: false });
  dbMocks.set.mockReset().mockResolvedValue(undefined);
});
```

- [ ] **Passo 2: escrever os testes de rota (vão falhar)**

No fim de `backend/routes/claude.test.js`:
```js
describe('POST /api/claude/lesson-exercises — replay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const question = { question: 'q', options: ['A) a', 'B) b'], correct: 0, explanation: 'e' };
  const exercisesWith = (sims) => ({
    quiz: { easy: [question], medium: [question], hard: [question] },
    handSimulations: sims,
    infiniteTraining: { concept: 'c', drill: 'd', challenge: 'x' },
  });
  const stubExercises = (payload) => {
    vi.stubEnv('CLAUDE_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'req-ex' },
      json: vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(payload) }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };
  const body = { day: 3, title: 'Equity', description: '', category: 'MATH' };

  it('replay válido nas 3 simulações → 200 com replay e grava no cache', async () => {
    stubExercises(exercisesWith({ easy: makeValidSim(), medium: makeValidSim(), hard: makeValidSim() }));
    const res = await request(app).post('/api/claude/lesson-exercises').send(body);
    expect(res.status).toBe(200);
    expect(res.body.exercises.handSimulations.easy.replay).toHaveLength(11);
    expect(dbMocks.set).toHaveBeenCalledTimes(1);
  });

  it('replay inválido → 200 sem replay naquela simulação e NÃO grava no cache', async () => {
    const broken = makeValidSim();
    broken.replay.pop();
    stubExercises(exercisesWith({ easy: broken, medium: makeValidSim(), hard: makeValidSim() }));
    const res = await request(app).post('/api/claude/lesson-exercises').send(body);
    expect(res.status).toBe(200);
    expect(res.body.exercises.handSimulations.easy.replay).toBeUndefined();
    expect(res.body.exercises.handSimulations.easy.narrative).toBeDefined();
    expect(res.body.exercises.handSimulations.medium.replay).toHaveLength(11);
    expect(dbMocks.set).not.toHaveBeenCalled();
  });

  it('cache do Firestore sem replay é ignorado e a IA é chamada', async () => {
    dbMocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ handSimulations: { easy: { narrative: 'antiga, sem replay' } } }),
    });
    const fetchMock = stubExercises(exercisesWith({ easy: makeValidSim(), medium: makeValidSim(), hard: makeValidSim() }));
    const res = await request(app).post('/api/claude/lesson-exercises').send(body);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body.cached).toBeUndefined();
  });

  it('cache do Firestore com replay é servido sem chamar a IA', async () => {
    dbMocks.get.mockResolvedValue({
      exists: true,
      data: () => ({ quiz: {}, handSimulations: { easy: makeValidSim() }, infiniteTraining: {} }),
    });
    const fetchMock = stubExercises({});
    const res = await request(app).post('/api/claude/lesson-exercises').send(body);
    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/claude/practice-hand — replay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('replay inválido não derruba a mão (200 sem replay)', async () => {
    const sim = makeValidSim();
    sim.replay[2].action = 'muck';
    vi.stubEnv('CLAUDE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'req-ph' },
      json: vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(sim) }] }),
    }));
    const res = await request(app).post('/api/claude/practice-hand').send({ topicTitle: 'Pot odds' });
    expect(res.status).toBe(200);
    expect(res.body.sim.replay).toBeUndefined();
    expect(res.body.sim.options).toHaveLength(3);
  });
});
```

- [ ] **Passo 3: rodar e confirmar a falha**

Comando: `npx vitest run backend/routes/claude.test.js`
Esperado: FAIL nos 2 testes do cache (o cache antigo é servido) e no teste "replay inválido" (o replay quebrado volta na resposta e o cache é gravado).

- [ ] **Passo 4: importar `applyReplay` em `claude.js`**

Abaixo de `import { extractJson } from '../utils/extractJson.js';`:
```js
import { applyReplay } from '../utils/replay.js';
```

- [ ] **Passo 5: adicionar as regras do replay (constante compartilhada)**

Logo abaixo da função `buildSystemPrompt` em `claude.js`:
```js
// Regras do roteiro lance a lance (replay animado). Compartilhadas pela fase 2
// e pelo practice-hand. Estrutura validada em utils/replay.js.
const REPLAY_RULES = `REPLAY — OBRIGATÓRIO em cada simulação: roteiro lance a lance usado para animar a mão na tela.
- "table.seats": EXATAMENTE 6 assentos com "pos" em UTG, HJ, CO, BTN, SB, BB (cada uma uma vez), "stack" NUMÉRICO em bb ANTES dos blinds, e "hero": true em exatamente um assento (a posição do Hero).
- "replay": 6 a 20 passos em ordem cronológica. Cada passo: {"street":"preflop|flop|turn|river","board":"cartas do board até este lance","actor":"posição ou null","action":"...","amount":número,"pot":número,"narration":"1-3 frases"}.
- "action": post (blinds: SEMPRE os 2 primeiros passos, SB depois BB), fold, check, call, bet, raise, allin, deal (revela flop/turn/river; actor null), decision (SEMPRE o ÚLTIMO passo; actor = posição do Hero).
- "amount": TOTAL que o ator colocou NA STREET atual (raise para 2.5bb → 2.5; call de 2.5bb → 2.5). Use 0 em fold, check, deal e decision. "pot": pote APÓS o lance. Números sem "bb".
- Inclua TODOS os jogadores que agem: cada fold pré-flop é um passo.
- "narration" de cada passo é o trecho da narração daquele lance, no tom de comentarista; juntas, contam a mesma mão de "narrative". NÃO revele a resposta correta.
- Pote, apostas e stacks devem fechar matematicamente.`;
```

- [ ] **Passo 6: regra e exemplo na fase 2 (`/lesson-exercises`)**

No prompt da fase 2, troque a linha:
```
4. As "options" das simulações DEVEM ser ações REAIS e VÁLIDAS na situação descrita. NUNCA inclua uma ação impossível (ex: "Check" quando Hero já apostou, "Call" quando não há aposta, "Bet" quando há aposta adversária). Se uma ação não for possível naquele momento, substitua por outra ação válida e distinta.
```
por:
```
4. As "options" das simulações DEVEM ser ações REAIS e VÁLIDAS na situação descrita. NUNCA inclua uma ação impossível (ex: "Check" quando Hero já apostou, "Call" quando não há aposta, "Bet" quando há aposta adversária). Se uma ação não for possível naquele momento, substitua por outra ação válida e distinta.
5. ${REPLAY_RULES}
```

No exemplo JSON da simulação `easy`, troque:
```
      "heroHand":"A♠K♦","position":"BTN","villainPosition":"BB","board":"A♥7♣2♦","pot":"12bb","stack":"100bb",
```
por:
```
      "heroHand":"A♠K♦","position":"BTN","villainPosition":"BB","board":"A♥7♣2♦","pot":"5.5bb","stack":"97.5bb",
      "table":{"seats":[{"pos":"UTG","stack":98},{"pos":"HJ","stack":120},{"pos":"CO","stack":75},{"pos":"BTN","stack":100,"hero":true},{"pos":"SB","stack":60},{"pos":"BB","stack":91}]},
      "replay":[
        {"street":"preflop","board":"","actor":"SB","action":"post","amount":0.5,"pot":0.5,"narration":"Mid-stage do torneio. SB posta 0.5bb."},
        {"street":"preflop","board":"","actor":"BB","action":"post","amount":1,"pot":1.5,"narration":"BB posta 1bb. Você recebe A♠K♦ no BTN."},
        {"street":"preflop","board":"","actor":"UTG","action":"fold","amount":0,"pot":1.5,"narration":"UTG desiste rápido."},
        {"street":"preflop","board":"","actor":"HJ","action":"fold","amount":0,"pot":1.5,"narration":"HJ também folda."},
        {"street":"preflop","board":"","actor":"CO","action":"fold","amount":0,"pot":1.5,"narration":"CO folda; a ação chega no seu botão."},
        {"street":"preflop","board":"","actor":"BTN","action":"raise","amount":2.5,"pot":4,"narration":"Você faz o raise padrão de 2.5bb."},
        {"street":"preflop","board":"","actor":"SB","action":"fold","amount":0,"pot":4,"narration":"SB folda."},
        {"street":"preflop","board":"","actor":"BB","action":"call","amount":2.5,"pot":5.5,"narration":"BB, que defende amplo, paga."},
        {"street":"flop","board":"A♥7♣2♦","actor":null,"action":"deal","amount":0,"pot":5.5,"narration":"Flop A♥7♣2♦: board seco, rainbow."},
        {"street":"flop","board":"A♥7♣2♦","actor":"BB","action":"check","amount":0,"pot":5.5,"narration":"BB dá check sem hesitar."},
        {"street":"flop","board":"A♥7♣2♦","actor":"BTN","action":"decision","amount":0,"pot":5.5,"narration":"Você tem posição e top pair top kicker. Como extrair valor?"}
      ],
```
No exemplo `medium`, troque:
```
      "heroHand":"J♠T♠","position":"CO","villainPosition":"BB","board":"9♥8♦3♣","pot":"22bb","stack":"85bb",
```
por:
```
      "heroHand":"J♠T♠","position":"CO","villainPosition":"BB","board":"9♥8♦3♣","pot":"22bb","stack":"85bb",
      "table":{"seats":["6 assentos no MESMO formato do exemplo easy; hero = CO"]},
      "replay":["passos no MESMO formato do exemplo easy, de post do SB até decision do CO"],
```
No exemplo `hard`, troque:
```
      "heroHand":"K♠Q♦","position":"BB","villainPosition":"BTN","board":"K♥J♣4♦2♠","pot":"45bb","stack":"70bb",
```
por:
```
      "heroHand":"K♠Q♦","position":"BB","villainPosition":"BTN","board":"K♥J♣4♦2♠","pot":"45bb","stack":"70bb",
      "table":{"seats":["6 assentos no MESMO formato do exemplo easy; hero = BB"]},
      "replay":["passos no MESMO formato do exemplo easy, de post do SB até decision do BB no turn"],
```

- [ ] **Passo 7: `max_tokens` da fase 2**

Troque:
```js
    // 6500 truncava JSON com Haiku 4.5; o tokenizer do 5.5 conta ~30% a mais.
    const text = await callClaude(system, prompt, 12000);
```
por:
```js
    // 6500 truncava JSON com Haiku 4.5; tokenizer do 5.5 conta ~30% a mais;
    // o replay lance a lance soma ~30-40% de saída.
    const text = await callClaude(system, prompt, 16000);
```

- [ ] **Passo 8: pipeline da fase 2 (aplicar replay e não cachear se inválido)**

Troque o bloco que vai de `// ── Pipeline de linguagem poker brasileiro` até o fim do `if (!forceNew) { ... }` que grava os exercícios:
```js
    // ── Pipeline de linguagem poker brasileiro ────────────────────────────
    for (const level of ['easy', 'medium', 'hard']) {
      const sim = exercises.handSimulations?.[level];
      if (!sim?.narrative) continue;
```
por:
```js
    // ── Replay + pipeline de linguagem poker brasileiro ───────────────────
    // allReplaysOk=false → a lição é entregue (sem animação onde faltou) mas
    // NÃO vai para o cache global, para a próxima visita tentar de novo.
    let allReplaysOk = true;
    for (const level of ['easy', 'medium', 'hard']) {
      const sim = exercises.handSimulations?.[level];
      if (!applyReplay(sim, `lesson-exercises day=${day} ${level}`)) allReplaysOk = false;
      if (!sim?.narrative) continue;
```
E troque:
```js
    if (!forceNew) {
      try {
        await db.collection('lessons').doc(`day_${day}`).set(
          { quiz: exercises.quiz, handSimulations: exercises.handSimulations, infiniteTraining: exercises.infiniteTraining },
          { merge: true }
        );
      } catch (e) {
        console.warn('Aviso: falha ao salvar exercícios no Firestore:', e.message);
      }
    }
```
por:
```js
    if (!forceNew && !allReplaysOk) {
      console.warn(`[replay] exercícios de day=${day} não cacheados (replay inválido em alguma simulação)`);
    }
    if (!forceNew && allReplaysOk) {
      try {
        await db.collection('lessons').doc(`day_${day}`).set(
          { quiz: exercises.quiz, handSimulations: exercises.handSimulations, infiniteTraining: exercises.infiniteTraining },
          { merge: true }
        );
      } catch (e) {
        console.warn('Aviso: falha ao salvar exercícios no Firestore:', e.message);
      }
    }
```

- [ ] **Passo 9: cache só vale com replay**

Troque:
```js
        if (data?.handSimulations?.easy?.narrative) {
```
por:
```js
        // Sem replay = gerado antes do replay animado → regenera uma vez
        if (data?.handSimulations?.easy?.narrative && data?.handSimulations?.easy?.replay) {
```

- [ ] **Passo 10: practice-hand (regra, exemplo coerente, tokens, applyReplay)**

No prompt do `/practice-hand`, troque a linha:
```
6. As "options" DEVEM ser ações REAIS e VÁLIDAS na situação descrita. NUNCA inclua ação impossível (ex: "Check" quando Hero já apostou, "Call" quando não há aposta, "Bet" quando há aposta adversária). Se uma ação não for possível naquele momento, substitua por outra ação válida e distinta.
```
por:
```
6. As "options" DEVEM ser ações REAIS e VÁLIDAS na situação descrita. NUNCA inclua ação impossível (ex: "Check" quando Hero já apostou, "Call" quando não há aposta, "Bet" quando há aposta adversária). Se uma ação não for possível naquele momento, substitua por outra ação válida e distinta.
7. ${REPLAY_RULES}
```
Troque o exemplo JSON, do `{` inicial até `"correct":1,`:
```
{
  "heroHand":"K♠Q♦","position":"BB","villainPosition":"BTN","board":"K♥J♣4♦2♠","pot":"45bb","stack":"70bb",
  "streets":[
    {"name":"Pré-Flop","actions":["BTN: Raise 3bb","BB (Você): Call"]},
    {"name":"Flop (K♥J♣4♦)","actions":["BB: Check","BTN: Bet 12bb","BB: Call"]},
    {"name":"Turn (2♠)","actions":["BB: Check","BTN: Bet 38bb (overbet)","BB: ?"]}
  ],
  "narrative":"4-5 parágrafos de narração avançada sobre ${topicTitle} chegando ao momento crítico sem revelar a resposta",
  "situation":"Resumo em 1 frase da situação complexa",
  "question":"Qual é sua ação?",
  "options":["Fold","Call 38bb","Raise 90bb","All-in"],
  "correct":1,
```
por:
```
{
  "heroHand":"K♠Q♦","position":"BB","villainPosition":"BTN","board":"K♥J♣4♦2♠","pot":"35.5bb","stack":"62.5bb",
  "streets":[
    {"name":"Pré-Flop","actions":["BTN: Raise 3bb","BB (Você): Call"]},
    {"name":"Flop (K♥J♣4♦)","actions":["BB: Check","BTN: Bet 4.5bb","BB: Call"]},
    {"name":"Turn (2♠)","actions":["BB: Check","BTN: Bet 20bb (overbet)","BB: ?"]}
  ],
  "table":{"seats":[{"pos":"UTG","stack":80},{"pos":"HJ","stack":64},{"pos":"CO","stack":110},{"pos":"BTN","stack":95},{"pos":"SB","stack":52},{"pos":"BB","stack":70,"hero":true}]},
  "replay":[
    {"street":"preflop","board":"","actor":"SB","action":"post","amount":0.5,"pot":0.5,"narration":"SB posta 0.5bb."},
    {"street":"preflop","board":"","actor":"BB","action":"post","amount":1,"pot":1.5,"narration":"Você posta o big blind com K♠Q♦."},
    {"street":"preflop","board":"","actor":"UTG","action":"fold","amount":0,"pot":1.5,"narration":"UTG folda."},
    {"street":"preflop","board":"","actor":"HJ","action":"fold","amount":0,"pot":1.5,"narration":"HJ folda."},
    {"street":"preflop","board":"","actor":"CO","action":"fold","amount":0,"pot":1.5,"narration":"CO folda."},
    {"street":"preflop","board":"","actor":"BTN","action":"raise","amount":3,"pot":4.5,"narration":"BTN abre para 3bb, range amplo de botão."},
    {"street":"preflop","board":"","actor":"SB","action":"fold","amount":0,"pot":4.5,"narration":"SB folda."},
    {"street":"preflop","board":"","actor":"BB","action":"call","amount":3,"pot":6.5,"narration":"Você defende e paga."},
    {"street":"flop","board":"K♥J♣4♦","actor":null,"action":"deal","amount":0,"pot":6.5,"narration":"Flop K♥J♣4♦: você acerta top pair."},
    {"street":"flop","board":"K♥J♣4♦","actor":"BB","action":"check","amount":0,"pot":6.5,"narration":"Você dá check."},
    {"street":"flop","board":"K♥J♣4♦","actor":"BTN","action":"bet","amount":4.5,"pot":11,"narration":"BTN aposta 4.5bb."},
    {"street":"flop","board":"K♥J♣4♦","actor":"BB","action":"call","amount":4.5,"pot":15.5,"narration":"Você paga."},
    {"street":"turn","board":"K♥J♣4♦2♠","actor":null,"action":"deal","amount":0,"pot":15.5,"narration":"Turn 2♠, carta neutra."},
    {"street":"turn","board":"K♥J♣4♦2♠","actor":"BB","action":"check","amount":0,"pot":15.5,"narration":"Você dá check de novo."},
    {"street":"turn","board":"K♥J♣4♦2♠","actor":"BTN","action":"bet","amount":20,"pot":35.5,"narration":"BTN faz overbet de 20bb: range polarizado."},
    {"street":"turn","board":"K♥J♣4♦2♠","actor":"BB","action":"decision","amount":0,"pot":35.5,"narration":"Top pair contra overbet. Qual é sua resposta?"}
  ],
  "narrative":"4-5 parágrafos de narração avançada sobre ${topicTitle} chegando ao momento crítico sem revelar a resposta",
  "situation":"Resumo em 1 frase da situação complexa",
  "question":"Qual é sua ação?",
  "options":["Fold","Call 20bb","Raise 55bb","All-in"],
  "correct":1,
```
Troque `const text = await callClaude(system, prompt, 4500);` por `const text = await callClaude(system, prompt, 6000);`.

Logo antes de `res.json({ sim });`:
```js
    applyReplay(sim, 'practice-hand');
```

- [ ] **Passo 11: rodar os testes**

Comando: `npm test`
Esperado: PASS em todos (68 anteriores + 15 de `replay.test.js` + 5 novos de rota = 88).

- [ ] **Passo 12: lint**

Comando: `npm run lint`
Esperado: 0 erros, 0 warnings.

- [ ] **Passo 13: checkpoint** — mensagem sugerida: `feat(claude): IA gera roteiro do replay; replay inválido não derruba nem cacheia`

---

### Tarefa 4: `frontend/css/replay.css`

**Arquivos:**
- Criar: `frontend/css/replay.css`
- Modificar: `frontend/pages/lesson.html:25`

- [ ] **Passo 1: criar o CSS (visual do protótipo v3)**

`frontend/css/replay.css`:
```css
/* =============================================================
   replay.css — replay animado da mão (handReplay.js)
   Visual aprovado no protótipo v3 (brainstorm 2026-11-17).
   Prefixo rp- para não colidir com .pcard/.act-btn de lesson.html.
   ============================================================= */
.rp { --rp-gold:#c8a045; display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap; }
.rp-stage { flex:1 1 560px; min-width:0; }
.rp-felt { position:relative; width:100%; aspect-ratio:16/11.5; border-radius:48% / 50%;
  background:
    radial-gradient(ellipse 70% 60% at 50% 42%, rgba(255,255,255,.10), transparent 60%),
    repeating-radial-gradient(circle at 50% 50%, rgba(0,0,0,.035) 0 1px, transparent 1px 3px),
    radial-gradient(ellipse at 50% 45%, #2f9e57 0%, #1f7a40 45%, #135a2d 75%, #0a3a1c 100%);
  box-shadow: 0 0 0 10px #4a2a10, 0 0 0 12px #7a4a1e, 0 0 0 14px #2e1708,
    inset 0 0 50px rgba(0,0,0,.55), 0 30px 60px rgba(0,0,0,.75);
  margin:34px 20px 30px; }
.rp-felt::after { content:''; position:absolute; inset:9%; border-radius:48%/50%; border:1px solid rgba(255,255,255,.07); pointer-events:none; }
.rp-logo { position:absolute; left:50%; top:79%; transform:translate(-50%,-50%); font-size:10px; letter-spacing:4px; color:rgba(255,255,255,.08); font-weight:900; }
.rp-street { position:absolute; left:50%; top:19%; transform:translate(-50%,-50%); font-size:10px; letter-spacing:3px; font-weight:900; color:rgba(255,255,255,.45); }

/* Assentos */
.rp-seat { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:4px; transition:opacity .35s; z-index:2; }
.rp-seat.folded { opacity:.28; }
.rp-plate { min-width:76px; text-align:center; background:linear-gradient(#1b1f24,#0e1114); border:1px solid rgba(255,255,255,.12);
  border-radius:12px; padding:4px 10px; box-shadow:0 4px 10px rgba(0,0,0,.5); transition:box-shadow .3s, border-color .3s; }
.rp-pos { font-size:11px; font-weight:800; color:#f3f4f6; letter-spacing:.5px; white-space:nowrap; }
.rp-stk { font-size:10px; color:#9ca3af; font-variant-numeric:tabular-nums; }
.rp-seat.hero .rp-plate { border-color:rgba(251,191,36,.7); }
.rp-seat.acting .rp-plate { border-color:#34d399; box-shadow:0 0 0 2px rgba(52,211,153,.35), 0 0 18px rgba(52,211,153,.55); }
.rp-seat.deciding .rp-plate { animation:rpPulse 1.1s ease-in-out infinite; }
@keyframes rpPulse { 0%,100%{ box-shadow:0 0 0 2px rgba(251,191,36,.4), 0 0 10px rgba(251,191,36,.4);} 50%{ box-shadow:0 0 0 4px rgba(251,191,36,.6), 0 0 26px rgba(251,191,36,.8);} }

/* Badge da ação */
.rp-badge { position:absolute; left:50%; top:-18px; transform:translate(-50%,0) scale(.6); opacity:0; font-size:10px; font-weight:900; letter-spacing:.5px;
  padding:3px 8px; border-radius:999px; white-space:nowrap; transition:all .25s cubic-bezier(.2,1.4,.4,1); pointer-events:none; }
.rp-badge.show { opacity:1; transform:translate(-50%,-6px) scale(1); }
.rp-badge.b-fold { background:#374151; color:#d1d5db; }
.rp-badge.b-check { background:#1e3a8a; color:#bfdbfe; }
.rp-badge.b-call { background:#065f46; color:#a7f3d0; }
.rp-badge.b-bet { background:#92400e; color:#fde68a; }
.rp-badge.b-allin { background:#7f1d1d; color:#fecaca; }

/* Cartas */
.rp-card { position:relative; display:inline-block; width:70px; height:98px; border-radius:9px; background:linear-gradient(#fff,#f1f1f1);
  box-shadow:0 2px 0 #cfcfcf, 0 6px 14px rgba(0,0,0,.5); margin:0 3px; color:#111; font-weight:800; vertical-align:middle; }
.rp-card .c-tl { position:absolute; left:6px; top:5px; font-size:23px; line-height:1; text-align:center; }
.rp-card .c-tl small { display:block; font-size:18px; }
.rp-card .c-mid { position:absolute; left:50%; top:58%; transform:translate(-50%,-50%); font-size:41px; }
.rp-card.red { color:#d11d1d; }
.rp-card.back { background:repeating-linear-gradient(45deg, rgba(255,255,255,.12) 0 2px, transparent 2px 6px), linear-gradient(135deg,#7f1d1d,#b91c1c); border:2px solid #fff; }
.rp-card.hero-c { width:60px; height:84px; }
.rp-card.hero-c .c-tl { font-size:19px; } .rp-card.hero-c .c-tl small { font-size:16px; } .rp-card.hero-c .c-mid { font-size:34px; }
.rp-card.sm { width:46px; height:65px; border-radius:7px; }
.rp-card.sm .c-mid { display:none; }
.rp-card.dealt { animation:rpDeal .45s cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes rpDeal { from { transform:translateY(-30px) rotateY(90deg) scale(.7); opacity:0 } to { transform:none; opacity:1 } }
.rp-hole { display:flex; }
.rp-hole .rp-card:first-child { transform:rotate(-7deg) translateX(4px); }
.rp-hole .rp-card:last-child { transform:rotate(7deg) translateX(-4px); }

/* Board, pote, fichas, dealer */
.rp-board { position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); display:flex; z-index:1; }
.rp-slot { width:70px; height:98px; border-radius:9px; border:1px dashed rgba(255,255,255,.14); margin:0 3px; }
.rp-pot { position:absolute; left:50%; top:66%; transform:translate(-50%,-50%); display:flex; align-items:center; gap:6px;
  background:rgba(0,0,0,.55); border:1px solid rgba(251,191,36,.35); padding:3px 10px; border-radius:999px; font-size:11px; font-weight:900; color:#fbbf24; font-variant-numeric:tabular-nums; z-index:1; }
.rp-chip { width:12px; height:12px; border-radius:50%; border:2px dashed rgba(255,255,255,.85); box-shadow:0 1px 2px rgba(0,0,0,.6); display:inline-block; }
.rp-chip.c1 { background:#dc2626; } .rp-chip.c3 { background:#111827; }
.rp-pot .rp-chip + .rp-chip { margin-left:-8px; }
.rp-bet { position:absolute; transform:translate(-50%,-50%); display:flex; align-items:center; gap:4px; font-size:10px; font-weight:800; color:#fde68a;
  background:rgba(0,0,0,.45); padding:2px 6px 2px 3px; border-radius:999px; transition:left .5s ease, top .5s ease, opacity .5s; z-index:1; opacity:0; }
.rp-bet.to-pot { left:50% !important; top:66% !important; opacity:0 !important; }
.rp-dealer { position:absolute; width:18px; height:18px; border-radius:50%; background:radial-gradient(#fff,#ddd); color:#111; font-size:9px; font-weight:900;
  display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,.6); transform:translate(-50%,-50%); z-index:1; }

/* Narração e controles */
.rp-side { flex:1 1 280px; min-width:0; display:flex; flex-direction:column; gap:10px; }
.rp-narr { position:relative; height:300px; overflow:auto; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:12px; scroll-behavior:smooth; }
.rp-line { font-size:13px; line-height:1.55; color:#6b7280; padding:6px 10px; border-radius:8px; margin-bottom:4px; border-left:3px solid transparent; transition:all .3s; }
.rp-line .rp-st { font-size:9px; font-weight:900; letter-spacing:2px; color:#4b5563; display:block; margin-bottom:2px; }
.rp-line.on { color:#f3f4f6; background:rgba(200,160,69,.12); border-left-color:var(--rp-gold); }
.rp-line.on .rp-st { color:var(--rp-gold); }
.rp-line.future { display:none; }
.rp-ctrl { display:flex; align-items:center; gap:6px; }
.rp-btn { background:#1f2937; color:#e5e7eb; border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:6px 10px; font-size:13px; cursor:pointer; }
.rp-btn:hover { background:#273444; }
.rp-prog { flex:1; display:flex; gap:3px; }
.rp-tick { flex:1; height:6px; border-radius:3px; background:rgba(255,255,255,.1); cursor:pointer; border:0; padding:0; transition:background .2s; }
.rp-tick.done { background:rgba(200,160,69,.55); }
.rp-tick.cur { background:var(--rp-gold); }
.rp-skip { background:transparent; border:1px solid rgba(200,160,69,.4); color:var(--rp-gold); border-radius:8px; padding:6px 10px; font-size:12px; cursor:pointer; align-self:flex-start; }

/* Celular: mesa em cima, narração embaixo, cartas menores */
@media (max-width: 767px) {
  .rp { flex-direction:column; }
  .rp-stage, .rp-side { flex-basis:auto; width:100%; }
  .rp-felt { margin:28px 10px 24px; aspect-ratio:4/3.4; }
  .rp-card { width:42px; height:59px; border-radius:6px; }
  .rp-card .c-tl { font-size:14px; left:4px; top:3px; } .rp-card .c-tl small { font-size:11px; } .rp-card .c-mid { font-size:24px; }
  .rp-slot { width:42px; height:59px; border-radius:6px; margin:0 2px; }
  .rp-card.hero-c { width:38px; height:53px; } .rp-card.hero-c .c-tl { font-size:12px; } .rp-card.hero-c .c-tl small { font-size:10px; } .rp-card.hero-c .c-mid { font-size:20px; }
  .rp-card.sm { width:26px; height:37px; }
  .rp-plate { min-width:58px; padding:3px 6px; }
  .rp-pos { font-size:9px; } .rp-stk { font-size:9px; }
  .rp-narr { height:180px; }
}

@media (prefers-reduced-motion: reduce) {
  .rp * { animation:none !important; transition:none !important; }
}
```

- [ ] **Passo 2: carregar o CSS em `lesson.html`**

Em `frontend/pages/lesson.html`, troque:
```html
  <link rel="stylesheet" href="../css/glass.css">
```
por:
```html
  <link rel="stylesheet" href="../css/glass.css">
  <link rel="stylesheet" href="../css/replay.css">
```

- [ ] **Passo 3: checkpoint** — mensagem sugerida: `feat(replay): estilos da mesa animada (protótipo v3)`

---

### Tarefa 5: `frontend/js/handReplay.js`

**Arquivos:**
- Criar: `frontend/js/handReplay.js`

- [ ] **Passo 1: criar o módulo**

`frontend/js/handReplay.js`:
```js
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

  container.addEventListener('click', (e) => {
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
  });

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
    },
  };
}
```

- [ ] **Passo 2: checar a sintaxe**

Comando: `node --check frontend/js/handReplay.js`
Esperado: nenhuma saída (exit 0).

- [ ] **Passo 3: lint**

Comando: `npm run lint`
Esperado: 0 erros, 0 warnings.

- [ ] **Passo 4: checkpoint** — mensagem sugerida: `feat(replay): módulo handReplay (stateAt puro + player com controles)`

---

### Tarefa 6: integração em `lesson.js`

**Arquivos:**
- Modificar: `frontend/js/lesson.js`

- [ ] **Passo 1: import e registro dos players ativos**

Troque:
```js
import { applyGlossary } from './glossary.js';
```
por:
```js
import { applyGlossary } from './glossary.js';
import { canReplay, mountReplay } from './handReplay.js';

// Players de replay montados, por sufixo ('easy'|'medium'|'hard'|'inf').
// Um painel pode ser re-renderizado (cache local → exercícios novos); o player
// antigo precisa ser destruído para o timer dele parar.
const activeReplays = {};

function stopReplay(suffix) {
  activeReplays[suffix]?.destroy();
  delete activeReplays[suffix];
}

function startReplay(sim, suffix) {
  stopReplay(suffix);
  const box = document.getElementById(`replay-${suffix}`);
  if (!box) return;
  activeReplays[suffix] = mountReplay(box, sim, {
    // Opções só aparecem na decisão; depois disso continuam visíveis
    onDecision: () => {
      document.getElementById(`sim-actions-${suffix}`)?.classList.remove('hidden');
      document.getElementById(`sim-q-${suffix}`)?.classList.remove('hidden');
    },
  });
}
```

- [ ] **Passo 2: `simBodyHtml` usa o contêiner do replay quando há roteiro**

Em `simBodyHtml`, troque o trecho que vai de `return \`` até o fechamento do bloco `<!-- ══ OPÇÕES ══ -->`:
```js
  return `
    <!-- ══ LAYOUT: MESA + NARRATIVA PARALELOS ══ -->
    <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:16px;">
```
por:
```js
  const hasReplay = canReplay(sim);
  const topHtml = hasReplay ? `
    <div id="replay-${suffix}" class="mb-4"></div>
    <div id="sim-q-${suffix}" class="hidden rounded-xl p-4 mb-3" style="background:rgba(200,160,69,0.07); border:1px solid rgba(200,160,69,0.25);">
      <p class="text-xs font-bold uppercase tracking-widest mb-2" style="color:#c8a045;">Sua Decisão</p>
      <p class="text-white font-semibold text-sm leading-relaxed">👉 ${sim.question || 'Qual é sua ação?'}</p>
    </div>` : `
    <!-- ══ LAYOUT: MESA + NARRATIVA PARALELOS ══ -->
    <div style="display:flex; gap:16px; align-items:flex-start; margin-bottom:16px;">
```
Ainda em `simBodyHtml`, troque:
```js
      </div>
    </div>

    <!-- ══ OPÇÕES ══ -->
    <div class="flex flex-wrap gap-2 mb-4" id="sim-actions-${suffix}">
```
por:
```js
      </div>
    </div>`;

  return `
    ${topHtml}

    <!-- ══ OPÇÕES (ocultas até a decisão quando há replay) ══ -->
    <div class="flex flex-wrap gap-2 mb-4 ${hasReplay ? 'hidden' : ''}" id="sim-actions-${suffix}">
```

- [ ] **Passo 3: montar o player em `renderSimLevel`**

Troque:
```js
  container.innerHTML = simBodyHtml(sim, level, (oi) => `answerSim('${level}',${oi},${sim.correct})`);
}
```
por:
```js
  container.innerHTML = simBodyHtml(sim, level, (oi) => `answerSim('${level}',${oi},${sim.correct})`);
  if (canReplay(sim)) startReplay(sim, level);
  else stopReplay(level);
}
```

- [ ] **Passo 4: Treino Infinito — parar o player antigo e montar o novo**

Em `window.startInfiniteHand`, troque:
```js
  const exEl = document.getElementById('infinite-hand');
  exEl.classList.remove('hidden');
```
por:
```js
  stopReplay('inf');
  const exEl = document.getElementById('infinite-hand');
  exEl.classList.remove('hidden');
```
Em `renderInfiniteHand`, troque:
```js
  window._infSim = sim;
}
```
por:
```js
  window._infSim = sim;
  if (canReplay(sim)) startReplay(sim, 'inf');
}
```

- [ ] **Passo 5: sintaxe, lint e testes**

Comandos:
```
node --check frontend/js/lesson.js
npm run lint
npm test
```
Esperado: `node --check` sem saída; lint com 0/0; os 88 testes passando.

- [ ] **Passo 6: checkpoint** — mensagem sugerida: `feat(lesson): simulações e treino infinito usam o replay animado`

---

### Tarefa 7: validação manual no browser + CLAUDE.md

**Arquivos:**
- Modificar: `CLAUDE.md`

- [ ] **Passo 1: subir o servidor local**

Comando: `npm run dev` e abrir `http://localhost:3001`.
Atenção: o backend local grava no Firestore de produção. As lições abertas aqui entram no cache global já no formato novo, o que é o comportamento esperado.

- [ ] **Passo 2: roteiro de verificação** (marcar cada item)
- [ ] Abrir uma lição ainda não gerada (ou uma em cache sem replay): a teoria aparece em ≤ 15s e os exercícios em ≤ 60s, sem "formato inválido".
- [ ] Ir até Sim Fácil: o replay só começa a tocar quando o painel aparece, não durante a teoria.
- [ ] O replay toca do post do SB até a decisão: folds apagam, a badge aparece, as fichas vão para o pote na troca de street e o board entra com animação.
- [ ] As opções e o "Sua Decisão" só aparecem na decisão; depois disso, ⏮ e a barra continuam funcionando e as opções continuam visíveis.
- [ ] Testar ⏸/▶, ⏭, velocidade 1x→1.5x→2x e "Ir para a decisão". O ▶ no último lance reinicia.
- [ ] Responder: o feedback e a análise aparecem como antes, e a "Próxima etapa" avança.
- [ ] Sim Médio e Sim Difícil, com o Hero em outra posição: o Hero continua embaixo e a mesa gira corretamente.
- [ ] Treino Infinito FOCADO e GERAL: a mão nova destrói a anterior, sem dois replays tocando ao mesmo tempo.
- [ ] DevTools → modo celular (390px): mesa em cima, narração embaixo, cartas legíveis e nada sobreposto.
- [ ] DevTools → Rendering → `prefers-reduced-motion: reduce`: os estados trocam sem animação.
- [ ] Console sem erros vermelhos.
- [ ] Log do backend: aparecem `[replay] inválido ...`? Anotar a frequência; se for alta, revisar o prompt antes do deploy.

- [ ] **Passo 3: registrar no CLAUDE.md**

Em `CLAUDE.md` §12, na lista "Decisões importantes", acrescente:
```markdown
- Replay animado das simulações (spec `docs/superpowers/specs/2026-11-17-hand-replay-design.md`): cada simulação traz `table.seats` (6-max) + `replay[]` (lance a lance com `narration`), validados em `backend/utils/replay.js`. Replay inválido → simulação sai sem animação e a fase 2 NÃO é cacheada. Cache de exercícios só vale se `handSimulations.easy.replay` existir. Frontend: `frontend/js/handReplay.js` + `frontend/css/replay.css`; sem replay, mesa estática antiga.
```

- [ ] **Passo 4: checklist final do CLAUDE.md §7**

`npm test` verde, `npm run lint` 0 erros, roteiro do Passo 2 completo, golden paths intactos (login → dashboard, lição sem "formato inválido", progressão bloqueada, concluir lição → XP).

- [ ] **Passo 5: checkpoint** — mensagem sugerida: `docs: CLAUDE.md — replay animado das simulações`. Depois disso, o deploy segue o `/deploy` (functions + hosting).
