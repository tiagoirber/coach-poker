import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../middleware/auth.js', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { uid: 'test-uid', email: 'test@test.com', role: 'user', name: 'Test' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
}));

vi.mock('../config/firebase.js', () => ({
  db: {
    collection: () => ({
      doc: () => ({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
        set: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      orderBy: () => ({ limit: () => ({ get: vi.fn().mockResolvedValue({ docs: [] }) }) }),
      count: () => ({ get: vi.fn().mockResolvedValue({ data: () => ({ count: 0 }) }) }),
    }),
    runTransaction: vi.fn().mockResolvedValue(undefined),
  },
  auth: {
    verifyIdToken: vi.fn(),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue({ displayName: 'Test' }),
  },
  default: {},
}));

const { default: app } = await import('../app.js');

describe('POST /api/progress/complete — validação', () => {
  it('rejeita body vazio (campos obrigatórios ausentes)', async () => {
    const res = await request(app)
      .post('/api/progress/complete')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('rejeita day fora do range 1-91 (day = 0)', async () => {
    const res = await request(app)
      .post('/api/progress/complete')
      .send({ day: 0, category: 'MATH', title: 'Teste' });
    expect(res.status).toBe(400);
  });

  it('rejeita day fora do range 1-91 (day = 92)', async () => {
    const res = await request(app)
      .post('/api/progress/complete')
      .send({ day: 92, category: 'MATH', title: 'Teste' });
    expect(res.status).toBe(400);
  });

  it('rejeita categoria inválida', async () => {
    const res = await request(app)
      .post('/api/progress/complete')
      .send({ day: 1, category: 'INEXISTENTE', title: 'Teste' });
    expect(res.status).toBe(400);
  });

  it('aceita categorias válidas sem rejeitar na validação', async () => {
    // Apenas verifica que as categorias passam pela validação (podem falhar no db mockado)
    const categorias = ['MATH', 'PREFLOP', 'POSTFLOP', 'MENTAL', 'ICM'];
    for (const category of categorias) {
      const res = await request(app)
        .post('/api/progress/complete')
        .send({ day: 1, category, title: 'Teste' });
      // 400 seria falha de validação; 409/500 são erros de db (esperado com mock simples)
      expect(res.status).not.toBe(400);
    }
  });
});
