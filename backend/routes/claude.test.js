import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// vi.mock é hoistado pelo Vitest — intercepta antes do import do app
vi.mock('../middleware/auth.js', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'test@test.com', role: 'user', name: 'Test' };
    next();
  },
  requireAdmin:        (_req, _res, next) => next(),
  requireActiveAccess: (_req, _res, next) => next(),
}));

vi.mock('../config/firebase.js', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        get: vi.fn().mockResolvedValue({ exists: false }),
        set: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  auth: {
    verifyIdToken: vi.fn(),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
  },
  default: {},
}));

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
      json: vi.fn().mockResolvedValue({ content: [{ text: 'Coach reply here' }] }),
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
});
