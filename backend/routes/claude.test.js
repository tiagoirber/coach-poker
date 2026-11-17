import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { makeValidSim } from '../utils/replay.fixture.js';

// vi.mock é hoistado pelo Vitest — intercepta antes do import do app
vi.mock('../middleware/auth.js', () => ({
  verifyToken: (req, _res, next) => {
    // uid único por request: o claudeLimiter (20/10min por uid) estouraria com a suíte inteira
    req.user = { uid: `test-uid-${Math.random()}`, email: 'test@test.com', role: 'user', name: 'Test' };
    next();
  },
  requireAdmin:        (_req, _res, next) => next(),
  requireActiveAccess: (_req, _res, next) => next(),
}));

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

const { default: app } = await import('../app.js');

describe('POST /api/claude/chat — validação', () => {
  it('rejeita mensagem curta (< 3 chars)', async () => {
    const res = await request(app)
      .post('/api/claude/chat')
      .send({ message: 'hi' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejeita mensagem vazia', async () => {
    const res = await request(app)
      .post('/api/claude/chat')
      .send({ message: '' });
    expect(res.status).toBe(400);
  });

  it('rejeita mensagem acima de 1000 chars', async () => {
    const res = await request(app)
      .post('/api/claude/chat')
      .send({ message: 'a'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1000/);
  });

  it('retorna reply para mensagem válida', async () => {
    vi.stubEnv('CLAUDE_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'req-0' },
      json: vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Coach reply here' }] }),
    }));

    const res = await request(app)
      .post('/api/claude/chat')
      .send({ message: 'O que é equity no poker?' });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Coach reply here');

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

describe('POST /api/claude/lesson — validação', () => {
  it('rejeita body sem day', async () => {
    const res = await request(app)
      .post('/api/claude/lesson')
      .send({ title: 'Equity', category: 'MATH' });
    expect(res.status).toBe(400);
  });

  it('rejeita body sem title', async () => {
    const res = await request(app)
      .post('/api/claude/lesson')
      .send({ day: 1, category: 'MATH' });
    expect(res.status).toBe(400);
  });

  it('rejeita body sem category', async () => {
    const res = await request(app)
      .post('/api/claude/lesson')
      .send({ day: 1, title: 'Equity' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/claude/lesson-exercises — validação', () => {
  it('rejeita body sem day', async () => {
    const res = await request(app)
      .post('/api/claude/lesson-exercises')
      .send({ title: 'Equity', category: 'MATH' });
    expect(res.status).toBe(400);
  });

  it('rejeita body sem title', async () => {
    const res = await request(app)
      .post('/api/claude/lesson-exercises')
      .send({ day: 1, category: 'MATH' });
    expect(res.status).toBe(400);
  });

  it('rejeita body sem category', async () => {
    const res = await request(app)
      .post('/api/claude/lesson-exercises')
      .send({ day: 1, title: 'Equity' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/claude/practice-hand — validação', () => {
  it('rejeita body sem topicTitle', async () => {
    const res = await request(app)
      .post('/api/claude/practice-hand')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejeita topicTitle não-string', async () => {
    const res = await request(app)
      .post('/api/claude/practice-hand')
      .send({ topicTitle: 123 });
    expect(res.status).toBe(400);
  });

  it('rejeita topicTitle acima de 150 caracteres', async () => {
    const res = await request(app)
      .post('/api/claude/practice-hand')
      .send({ topicTitle: 'a'.repeat(151) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/claude/lesson — limites de entrada (cache global)', () => {
  it('rejeita day não-inteiro', async () => {
    const res = await request(app).post('/api/claude/lesson')
      .send({ day: '1; DROP', title: 'Equity', category: 'MATH' });
    expect(res.status).toBe(400);
  });

  it('rejeita day fora de 1-91', async () => {
    const res = await request(app).post('/api/claude/lesson')
      .send({ day: 92, title: 'Equity', category: 'MATH' });
    expect(res.status).toBe(400);
  });

  it('rejeita title acima de 120 caracteres', async () => {
    const res = await request(app).post('/api/claude/lesson')
      .send({ day: 1, title: 'x'.repeat(121), category: 'MATH' });
    expect(res.status).toBe(400);
  });

  it('rejeita description acima de 400 caracteres', async () => {
    const res = await request(app).post('/api/claude/lesson-exercises')
      .send({ day: 1, title: 'Equity', description: 'x'.repeat(401), category: 'MATH' });
    expect(res.status).toBe(400);
  });
});

describe('callClaude — robustez da resposta', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const stubClaude = (payload, status = 200) => {
    vi.stubEnv('CLAUDE_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'req-1' },
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('lê blocos de texto por tipo (ignora thinking do Haiku 5.5)', async () => {
    stubClaude({
      stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Resposta' }],
    });
    const res = await request(app).post('/api/claude/chat').send({ message: 'O que é equity?' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Resposta');
  });

  it('JSON truncado por max_tokens → 502 formato inválido', async () => {
    stubClaude({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"theory":"corta' }] });
    const res = await request(app).post('/api/claude/lesson')
      .send({ day: 1, title: 'Equity', description: '', category: 'MATH' });
    expect(res.status).toBe(502);
  });

  it('refusal → 422 sem vazar mensagem da API', async () => {
    stubClaude({ stop_reason: 'refusal', content: [] });
    const res = await request(app).post('/api/claude/chat').send({ message: 'pergunta qualquer' });
    expect(res.status).toBe(422);
  });

  it('erro genérico da API → 500 com mensagem neutra (sem o texto da Anthropic)', async () => {
    stubClaude({ error: { message: 'internal upstream detail' } }, 500);
    const res = await request(app).post('/api/claude/chat').send({ message: 'pergunta qualquer' });
    expect(res.status).toBe(500);
    expect(res.body.error).not.toMatch(/upstream/);
  });

  it('envia o modelo Haiku 5.5 com effort low e sem system vazio', async () => {
    const fetchMock = stubClaude({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    await request(app).post('/api/claude/chat').send({ message: 'pergunta qualquer' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('claude-haiku-5-5');
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(typeof body.system).toBe('string');
    expect(body.system.length).toBeGreaterThan(0);
  });
});

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
