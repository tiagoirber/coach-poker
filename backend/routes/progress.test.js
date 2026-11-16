import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../middleware/auth.js', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'test@test.com', role: 'user', name: 'Test' };
    next();
  },
  requireAdmin:        (_req, _res, next) => next(),
  requireActiveAccess: (_req, _res, next) => next(),
}));

// Mocks controláveis por teste
const mocks = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  dayDocGet:      vi.fn(),
}));

vi.mock('../config/firebase.js', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        collection: () => ({
          doc: () => ({
            get: mocks.dayDocGet,
            set: vi.fn().mockResolvedValue(undefined),
          }),
          orderBy: () => ({ get: vi.fn().mockResolvedValue({ docs: [] }) }),
          count: () => ({ get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }) }),
        }),
      }),
      orderBy: () => ({ limit: () => ({ get: vi.fn().mockResolvedValue({ docs: [] }) }) }),
    }),
    runTransaction: mocks.runTransaction,
  },
  auth: {
    verifyIdToken: vi.fn(),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue({ displayName: 'Test' }),
  },
  default: {},
}));

const { default: app } = await import('../app.js');

// Simula a transação: 1ª tx.get = lessonRef (já concluída?), 2ª = userRef.
function mockTransaction({ alreadyDone = false, user = {} } = {}) {
  const tx = {
    get: vi.fn()
      .mockResolvedValueOnce({ exists: alreadyDone, data: () => ({ completedAt: '2026-01-01T00:00:00.000Z' }) })
      .mockResolvedValueOnce({ exists: true, data: () => user }),
    set:    vi.fn(),
    update: vi.fn(),
  };
  mocks.runTransaction.mockImplementation(async (fn) => fn(tx));
  return tx;
}

const HOUR = 60 * 60 * 1000;
const iso  = (msAgo) => new Date(Date.now() - msAgo).toISOString();

beforeEach(() => {
  mocks.runTransaction.mockReset();
  mocks.dayDocGet.mockReset();
});

describe('POST /api/progress/complete — validação', () => {
  it('rejeita body vazio (campos obrigatórios ausentes)', async () => {
    const res = await request(app).post('/api/progress/complete').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejeita day fora do range 1-91 (day = 0)', async () => {
    const res = await request(app).post('/api/progress/complete')
      .send({ day: 0, category: 'MATH', title: 'Teste' });
    expect(res.status).toBe(400);
  });

  it('rejeita day fora do range 1-91 (day = 92)', async () => {
    const res = await request(app).post('/api/progress/complete')
      .send({ day: 92, category: 'MATH', title: 'Teste' });
    expect(res.status).toBe(400);
  });

  it('rejeita categoria inválida', async () => {
    const res = await request(app).post('/api/progress/complete')
      .send({ day: 1, category: 'INEXISTENTE', title: 'Teste' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/progress/complete — transação e XP', () => {
  it('credita XP da categoria e grava a lição', async () => {
    const tx = mockTransaction({ user: { totalXP: 100, streak: 0, currentDay: 1 } });
    const res = await request(app).post('/api/progress/complete')
      .send({ day: 1, category: 'MATH', title: 'Pot odds' });
    expect(res.status).toBe(200);
    expect(res.body.xpGained).toBe(30);
    expect(res.body.newTotalXP).toBe(130);
    expect(tx.set).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ totalXP: 130, currentDay: 2 }));
  });

  it('retorna 409 se a lição já foi concluída', async () => {
    mockTransaction({ alreadyDone: true });
    const res = await request(app).post('/api/progress/complete')
      .send({ day: 1, category: 'MATH', title: 'Pot odds' });
    expect(res.status).toBe(409);
    expect(res.body.completedAt).toBeDefined();
  });
});

describe('POST /api/progress/complete — streak', () => {
  const complete = () => request(app).post('/api/progress/complete')
    .send({ day: 5, category: 'PREFLOP', title: 'Ranges' });

  it('primeira conclusão de um perfil recém-criado → streak 1', async () => {
    mockTransaction({ user: { streak: 0, lastLoginAt: iso(0) } });
    const res = await complete();
    expect(res.body.newStreak).toBe(1);
  });

  it('segunda lição no mesmo dia mantém o streak (não reseta)', async () => {
    mockTransaction({ user: { streak: 3, lastLoginAt: iso(2 * HOUR) } });
    const res = await complete();
    expect(res.body.newStreak).toBe(3);
  });

  it('conclusão no dia seguinte incrementa', async () => {
    mockTransaction({ user: { streak: 3, lastLoginAt: iso(24 * HOUR) } });
    const res = await complete();
    expect(res.body.newStreak).toBe(4);
  });

  it('dois ou mais dias sem concluir reseta para 1', async () => {
    mockTransaction({ user: { streak: 7, lastLoginAt: iso(72 * HOUR) } });
    const res = await complete();
    expect(res.body.newStreak).toBe(1);
  });

  it('sem lastLoginAt → streak 1', async () => {
    mockTransaction({ user: { streak: 9 } });
    const res = await complete();
    expect(res.body.newStreak).toBe(1);
  });
});

describe('GET /api/progress/history?day=', () => {
  it('retorna só o dia pedido quando existe', async () => {
    mocks.dayDocGet.mockResolvedValue({ exists: true, data: () => ({ day: 3, category: 'MATH' }) });
    const res = await request(app).get('/api/progress/history?day=3');
    expect(res.status).toBe(200);
    expect(res.body.lessons).toEqual([{ day: 3, category: 'MATH' }]);
    expect(res.body.total).toBe(1);
  });

  it('retorna lista vazia quando o dia não foi concluído', async () => {
    mocks.dayDocGet.mockResolvedValue({ exists: false });
    const res = await request(app).get('/api/progress/history?day=3');
    expect(res.status).toBe(200);
    expect(res.body.lessons).toEqual([]);
  });

  it('rejeita day inválido', async () => {
    const res = await request(app).get('/api/progress/history?day=abc');
    expect(res.status).toBe(400);
  });
});
