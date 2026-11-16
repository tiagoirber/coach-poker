import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../middleware/auth.js', () => ({
  verifyToken: (req, _res, next) => {
    req.user = { uid: 'admin-uid', email: 'admin@test.com', role: 'admin', name: 'Admin' };
    next();
  },
  requireAdmin:        (_req, _res, next) => next(),
  requireActiveAccess: (_req, _res, next) => next(),
}));

const mocks = vi.hoisted(() => ({
  lessonsGet:  vi.fn(),
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
  userUpdate:  vi.fn(),
}));

vi.mock('../config/firebase.js', () => ({
  db: {
    collection: () => ({
      get: mocks.lessonsGet,
      doc: () => ({
        get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ name: 'X', email: 'x@x.com' }) }),
        set: vi.fn().mockResolvedValue(undefined),
        update: mocks.userUpdate,
      }),
    }),
    batch: () => ({ update: mocks.batchUpdate, commit: mocks.batchCommit }),
  },
  auth: {
    verifyIdToken: vi.fn(),
    setCustomUserClaims: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue({ displayName: 'X' }),
  },
  default: {},
}));

const { default: app } = await import('../app.js');

beforeEach(() => {
  mocks.lessonsGet.mockReset();
  mocks.batchUpdate.mockReset();
  mocks.batchCommit.mockReset().mockResolvedValue(undefined);
  mocks.userUpdate.mockReset().mockResolvedValue(undefined);
});

describe('DELETE /api/users/lessons/cache', () => {
  it('limpa só os docs que existem (batch.update em doc inexistente abortaria tudo)', async () => {
    const refs = [{ id: 'day_1' }, { id: 'day_7' }];
    mocks.lessonsGet.mockResolvedValue({ docs: refs.map(ref => ({ ref })) });

    const res = await request(app).delete('/api/users/lessons/cache');
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(2);
    expect(mocks.batchUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.batchUpdate.mock.calls[0][0]).toEqual({ id: 'day_1' });
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1);
  });

  it('não comita batch vazio quando não há lições em cache', async () => {
    mocks.lessonsGet.mockResolvedValue({ docs: [] });
    const res = await request(app).delete('/api/users/lessons/cache');
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(0);
    expect(mocks.batchCommit).not.toHaveBeenCalled();
  });
});

describe('PUT /api/users/me — validação', () => {
  it('rejeita name não-string sem estourar 500', async () => {
    const res = await request(app).put('/api/users/me').send({ name: 123 });
    expect(res.status).toBe(400);
  });

  it('rejeita avatarUrl com esquema javascript:', async () => {
    const res = await request(app).put('/api/users/me').send({ avatarUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
  });

  it('aceita avatarUrl https', async () => {
    const res = await request(app).put('/api/users/me').send({ avatarUrl: 'https://example.com/a.png' });
    expect(res.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({ avatarUrl: 'https://example.com/a.png' }));
  });
});

describe('POST /api/users/register — validação', () => {
  it('não estoura 500 com name não-string (perfil já existe → 409)', async () => {
    const res = await request(app).post('/api/users/register').send({ name: { x: 1 } });
    expect(res.status).toBe(409);
  });
});
