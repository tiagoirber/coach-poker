// app.js — Express app (sem app.listen, para uso no Firebase Functions e local)
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import usersRouter    from './routes/users.js';
import progressRouter from './routes/progress.js';
import claudeRouter   from './routes/claude.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app = express();

// Atrás do Firebase Hosting + Cloud Run o IP real vem em X-Forwarded-For.
// Sem isso o rate limiter global usa o IP do proxy e vira um bucket coletivo.
app.set('trust proxy', true);

// Esta CSP só vale quando o Express serve o frontend (dev local) — em produção
// o Firebase Hosting serve os HTMLs direto e esta política não é aplicada.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://www.gstatic.com", "https://apis.google.com", "https://cdnjs.cloudflare.com"],
      // O default do helmet é 'none', o que bloqueia todos os onclick inline do frontend.
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      connectSrc:  ["'self'", "https://api.anthropic.com", "https://*.googleapis.com", "https://*.firebaseio.com", "wss://*.firebaseio.com", "https://securetoken.googleapis.com"],
      imgSrc:      ["'self'", "data:", "https:"],
      fontSrc:     ["'self'", "https:"],
      frameSrc:    ["'self'", "https://*.firebaseapp.com", "https://accounts.google.com", "https://*.google.com"],
    },
  },
}));

const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://poker-coach-ia.web.app',
  'https://poker-coach-ia.firebaseapp.com',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error(`CORS bloqueado: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  // 'trust proxy: true' é intencional aqui (API autenticada; o limite por
  // usuário está em claudeLimiter) — silencia o aviso de proxy permissivo.
  validate: { trustProxy: false },
}));

app.use(express.json({ limit: '10kb' }));

// Serve frontend em desenvolvimento local
const frontendPath = join(__dirname, '..', 'frontend');
app.use('/frontend', express.static(frontendPath));
app.use(express.static(frontendPath));
app.get('/', (req, res) => res.redirect('/frontend/index.html'));

app.use('/api/users',    usersRouter);
app.use('/api/progress', progressRouter);
app.use('/api/claude',   claudeRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

app.use((err, req, res, _next) => {
  console.error('Erro interno:', err.message);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({ error: 'Erro interno do servidor.', detail: isProd ? undefined : err.message });
});

export default app;
