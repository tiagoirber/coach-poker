# Poker Coach 90d
> Comprimido em: 2026-06-01 | Sessão: revisão crítica de engenharia (10 bugs/dívidas mapeados) + sistema de linguagem poker BR aguardando deploy

## Objetivo do projeto
Plataforma web de coaching de poker com IA — currículo de 90 dias (teoria, Feynman, quizzes progressivos, simulação de mãos) gerado sob demanda pela API Claude. Projeto solo, deployado em `https://poker-coach-ia.web.app`.

## Stack e configurações
- **Frontend**: HTML puro + Tailwind CSS (CDN) + Firebase Client SDK (compat v9)
- **Backend**: Node.js 22 + Express, Cloud Functions v2 (`us-central1`, 256MiB, timeout 60s)
- **Banco**: Firestore (SDK direto, sem ORM)
- **IA**: Haiku 4.5 (`claude-haiku-4-5-20251001`) p/ lições, Sonnet 4.6 p/ chat
- **Hosting**: Firebase → `https://poker-coach-ia.web.app`
- **Secrets**: Firebase Secret Manager (`CLAUDE_API_KEY`)
- **Branch atual**: `feat/implementacao-maio-2026` (main em SHA `26db39a`)

## Estrutura de arquivos relevante
```
.github/workflows/ci.yml      → CI: npm test em todo push/PR (Node 22)
backend/
  app.js                      → Express (helmet/CSP, CORS, rate limit global)
  middleware/auth.js          → verifyToken + requireAdmin + requireActiveAccess (NÃO TOCAR)
  routes/claude.js            → /lesson (fase 1), /lesson-exercises (fase 2), /chat, /practice-hand
  routes/progress.js          → complete (transação), history, leaderboard, me
  routes/users.js             → CRUD + roles + syncClaims + status/access + DELETE /lessons/cache
  utils/pokerLanguage.js      → validate/normalize + prompts (NOVO, não deployado)
  utils/poker-glossary.json   → glossário canônico 16 termos (NOVO)
  utils/extractJson.js        → parse direto → fence → primeiro/último {}
frontend/
  js/config.js                → Firebase init + CURRICULUM (91 dias) + XP_BY_CATEGORY
  js/api.js                   → userApi, progressApi, claudeApi
  js/lesson.js                → lição completa (stepper, quiz, sim, Feynman, treino ∞)
  js/dashboard.js             → currículo, XP, streak, leaderboard
  js/admin.js                 → painel admin
docs/poker-language-style-guide.md → guia de linguagem (NOVO)
functions/index.js            → onRequest(app)
```

## Decisões tomadas
- Cache 2 níveis: localStorage (por sessão/navegador) + Firestore `lessons/day_X` (global). 2ª visita do mesmo navegador sempre gera novo (`forceNew:true`, não lê nem grava cache).
- Two-phase: fase 1 `max_tokens:1500` (~10s, teoria); fase 2 `max_tokens:6500` (~40s, exercícios). `set({merge:true})`.
- Progressão linear bloqueada: Feynman → Quiz E/M/D → Sim E/M/D → Treino ∞.
- `requireActiveAccess`: bloqueia expirados nas rotas de conteúdo; admins passam. Propagação via claims ~1h.
- `syncClaims`: preserva role + accessExpiresAt juntos (setCustomUserClaims sobrescreve tudo).
- Sistema de linguagem poker BR: `normalizePokerLanguage` (auto-replace seguro) + `validatePokerLanguage` (log) no pipeline das narrativas. Revisão por IA só com `STRICT_POKER_LANGUAGE=true`.
- Conclusão idempotente via `db.runTransaction` (anti clique-duplo).
- Sanitização de dados de IA via DOMPurify (ALLOWED_TAGS:[]) — `sanitizeAiData`.

## Regras e restrições
- NÃO TOCAR: `backend/middleware/auth.js`, `firestore.rules`, `firebase.json`, `.env*`, `firebase-service-account.json`
- NÃO ALTERAR: campos Firestore (`lessons/day_X`, progresso), `CURRICULUM` em `config.js`, `CACHE_KEY_VER`/`LESSON_CACHE_VER` em `lesson.js`
- Nunca push em main. Nunca commit automático. Não instalar deps sem perguntar.
- Tarefas que tocam 3+ arquivos ou golden path: plan mode obrigatório.

## Estado atual
- Produção: `https://poker-coach-ia.web.app` (main SHA `26db39a`) — SEM o sistema de linguagem poker BR ainda.
- Painel admin funcional: bloqueio/desbloqueio, prazo de acesso, reset de senha.
- CI configurado (aguardando push da branch para validar).
- Sistema de linguagem poker BR: **código completo na branch, não deployado, testes não rodados** (npm indisponível no PC do trabalho).

## Bugs conhecidos (da revisão de 2026-06-01)
1. Streak reseta ao concluir 2+ lições/dia — `progress.js:108-113` (`lastLoginAt` sobrescrito).
2. `practice-hand` não sanitiza o `sim` — `lesson.js:811-814` (innerHTML cru).
3. Sanitização depende do CDN DOMPurify — `lesson.js:16-18` (fallback retorna cru).
4. `max_tokens:6500` apertado na fase 2 → truncamento → 502 "formato inválido".
5. `completedDays` localStorage dessincroniza — `lesson.js:796` (dashboard não escreve).
6. `checkIfCompleted` lê histórico inteiro p/ 1 dia — `lesson.js:183`.
7. Rate limiter global por IP sem `trust proxy` — `app.js:53` (bucket coletivo no Cloud Functions).
8. Tailwind via CDN força `'unsafe-inline'` na CSP + FOUC.
9. `goToStep` permite pular etapas com confirm — contradiz golden path #4.
10. Duplicação: `renderSimLevel`≈`renderInfiniteHand`; system prompt repetido em 3 endpoints.

## Pendências (em ordem de prioridade)
1. **Deploy do sistema de linguagem poker BR** (em casa): `npm test` → `npm run lint` → `npx firebase deploy --only functions,hosting` → `DELETE /api/users/lessons/cache` (1x) → verificar narrativas limpas.
2. Corrigir bugs conhecidos — priorizar #1 (streak), #2/#3 (sanitização), #7 (trust proxy).
3. Push da branch p/ validar o CI no GitHub.
4. Decidir regra do golden path #4 vs `goToStep` (bug #9).
5. Melhorias futuras: build step de Tailwind (resolve #3/#8), Firestore emulator, perfil com foto Google, leaderboard com posição própria.
