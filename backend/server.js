// =============================================================
// server.js — Ponto de entrada do servidor Express
//
// Responsabilidades:
//  - Configurar middlewares de segurança (helmet, cors, rate-limit)
//  - Registrar as rotas da API
//  - Iniciar o servidor na porta definida
// =============================================================

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Importa as rotas (cada arquivo cuida de um grupo de endpoints)
import usersRouter    from './routes/users.js';
import progressRouter from './routes/progress.js';
import claudeRouter   from './routes/claude.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// =============================================================
// MIDDLEWARES GLOBAIS (rodam em TODAS as requisições)
// =============================================================

// Helmet: adiciona ~15 cabeçalhos HTTP de segurança com uma linha
app.use(helmet());

// CORS: define quem pode chamar esta API
// Em desenvolvimento: libera localhost. Em produção: só seu domínio.
const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean); // Remove valores undefined/null

app.use(cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (ex: Postman, curl) em desenvolvimento
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado para origem: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate Limiting: máximo de 100 requisições por IP a cada 15 minutos
// Protege contra scripts abusivos e ataques de força bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos em milissegundos
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Parseia o corpo das requisições como JSON
// Sem isso, req.body seria undefined em requisições POST/PUT
app.use(express.json({ limit: '10kb' })); // Limite de 10KB evita payloads gigantes

// =============================================================
// ROTAS DA API
// Cada router cuida de um grupo de URLs:
//   /api/users    → CRUD de usuários e perfis
//   /api/progress → Progresso do aluno (lições concluídas, XP)
//   /api/claude   → Proxy seguro para a API do Claude (IA)
// =============================================================

app.use('/api/users',    usersRouter);
app.use('/api/progress', progressRouter);
app.use('/api/claude',   claudeRouter);

// Rota de health check — útil para verificar se o servidor está vivo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================================
// TRATAMENTO DE ERROS GLOBAL
// Captura qualquer erro não tratado nas rotas
// =============================================================

// 404 — Rota não encontrada
app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// 500 — Erro interno do servidor
// O Express reconhece este middleware pelo 4° parâmetro (err)
app.use((err, req, res, next) => {
  console.error('Erro interno:', err.message);
  // Nunca exponha stack traces para o usuário em produção
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: 'Erro interno do servidor.',
    detail: isProd ? undefined : err.message,
  });
});

// =============================================================
// INICIALIZAÇÃO
// =============================================================

app.listen(PORT, () => {
  console.log(`\n🃏 Poker Coach API rodando!`);
  console.log(`   → http://localhost:${PORT}/api/health\n`);
});
