# Poker Coach 90d
> Comprimido em: 2026-11-17 | Sessão: revisão geral + correção dos 26 achados (PR #3) e replay animado da mão nas simulações (PR #4), ambos deployados

## Objetivo do projeto
Plataforma web de coaching de poker com IA. Currículo de 90 dias (teoria, Feynman, quizzes progressivos, simulações de mão, treino infinito) gerado sob demanda pela API Claude. Projeto solo, deployado em `https://poker-coach-ia.web.app`.

## Stack e configurações
- **Frontend**: HTML puro + Tailwind CDN + Firebase Client SDK compat 9.23 + DOMPurify CDN (cdnjs 3.1.5)
- **Backend**: Node 22 + Express (ESM), Cloud Functions v2 `api` (`us-central1`, 256MiB, **timeout 120s**), Hosting reescreve `/api/**` → função
- **Banco**: Firestore via Admin SDK (sem ORM). Coleções: `users/{uid}` + `completedLessons/day_N`, `lessons/day_N` (cache global)
- **IA**: `claude-haiku-5-5` com `output_config.effort: 'low'` em tudo (lições, chat, treino). `fetch` direto, `anthropic-version: 2023-06-01`
- **Secrets**: Secret Manager `CLAUDE_API_KEY`
- **Projeto Firebase**: `poker-coach-ia`. Repositório: `tiagoirber/coach-poker`. `main` em `99b0f6a`
- **CI**: GitHub Actions `.github/workflows/ci.yml` (`npm test` em push e PR)
- **Testes**: Vitest + supertest, 88 testes (`backend/**/*.test.js`). Lint: ESLint 9, 0/0

## Estrutura de arquivos relevante
```
backend/
  app.js                  → helmet (CSP só vale em dev), trust proxy, CORS, rate limit global
  middleware/auth.js      → verifyToken, requireAdmin, requireActiveAccess (NÃO TOCAR)
  routes/claude.js        → /lesson (fase 1), /lesson-exercises (fase 2 + replay), /chat, /practice-hand; callClaude, REPLAY_RULES, buildSystemPrompt
  routes/progress.js      → complete (transação + streak por fuso), history (?day=N), leaderboard, me
  routes/users.js         → CRUD, roles, syncClaims, status/access, DELETE /lessons/cache
  utils/replay.js         → validateReplay + applyReplay
  utils/pokerLanguage.js  → normalize/validate linguagem poker BR (+ poker-glossary.json)
  utils/extractJson.js    → parse direto → fence → primeiro/último {}
frontend/
  js/lesson.js            → lição (stepper, quiz, sim, Feynman, treino ∞); integra o replay
  js/handReplay.js        → player do replay 6-max (canReplay, stateAt, mountReplay → {destroy})
  css/replay.css          → visual da mesa animada (prefixo rp-)
  js/config.js            → Firebase init, CURRICULUM (91 dias), LESSON_CACHE_VER v8
  js/dashboard.js, admin.js, api.js, auth.js, profile.js, flashcards.js
docs/superpowers/specs/2026-11-17-hand-replay-design.md, plans/2026-11-17-hand-replay.md
functions/index.js        → onRequest(app)
```

## Decisões tomadas
- **Cache em 2 níveis**: localStorage `lesson_v8_X` (escrito pela lição, lido só pelos flashcards) + Firestore `lessons/day_X`. A 2ª visita do mesmo navegador sempre gera de novo (`forceNew`). `lesson_visits_X` só incrementa após a fase 2.
- **Duas fases**: fase 1 com max_tokens 2500 (teoria); fase 2 com 16000 (quiz + 3 simulações + replay); practice-hand 6000; chat 1200.
- **`callClaude`**:
  - lê os blocos por tipo (ignora thinking);
  - `stop_reason` `max_tokens` → erro JSON (502); `refusal` → 422;
  - 1 retry em 429/529 se ainda faltam mais de 15s;
  - timeout 110s;
  - nunca repassa ao cliente o texto de erro da Anthropic (`sendClaudeError`).
- **Validação de entrada**: `day` inteiro de 1 a 91; `title` até 120 chars; `description` até 400; `topicTitle` até 150; `context` do chat até 200. Fecha o envenenamento do cache global.
- **Streak**: dia-calendário em `America/Sao_Paulo`. Mesmo dia mantém; ontem → +1; senão → 1.
- **Replay animado**:
  - Cada simulação traz `table.seats` (6-max, 1 hero) e `replay[]`.
  - Cada passo tem `street`, `board`, `actor`, `action` (post/fold/check/call/bet/raise/allin/deal/decision), `amount` (total na street), `pot` e `narration`.
  - Replay inválido → a simulação sai sem animação e a fase 2 não é cacheada.
  - O cache só vale se `easy.replay` existir.
  - No frontend, o player só toca quando fica visível, as opções ficam ocultas até a decisão e, sem replay, aparece a mesa estática antiga.
- **Progressão linear estrita**: `goToStep` só navega para etapas já concluídas.
- **Glossário**: `rio`, `virada`, `chamou`, `chamaram` e `verificar` só são sinalizados no log, não auto-substituídos. A substituição preserva a maiúscula inicial.
- **Bundle da função**: `functions.ignore` exclui `.env*`, `firebase-service-account.json`, `context/` e `docs/`.
- **Admin**: o primeiro admin é criado por script com Admin SDK (Firestore `role` + custom claim). O usuário precisa sair e entrar de novo.
- **Fluxo de feature**: brainstorming com mockups no navegador → spec → plano → subagentes com revisão de spec e de qualidade.

## Regras e restrições
- **NÃO TOCAR**: `backend/middleware/auth.js`, `firestore.rules`, `.env*`, `firebase-service-account.json`.
- **NÃO ALTERAR**:
  - campos do Firestore;
  - `CURRICULUM`;
  - `CACHE_KEY_VER` e `LESSON_CACHE_VER`, porque o replay só acrescenta campos.
- **Commits**: nunca automáticos (o usuário commita ou roda `/deploy`) e nunca push direto em `main` (sempre via PR + API do GitHub).
- **Plan mode**: obrigatório para tarefas que tocam 3+ arquivos ou um golden path.
- **Dados de produção**: ler usuários de produção exige autorização explícita do usuário (o classificador bloqueia).
- **Backend local** (`npm run dev`): grava no Firestore de produção.

## Estado atual
- **Produção** (`main` em `99b0f6a`): PR #3 (correções) + PR #4 (replay), com functions, hosting e índices deployados.
- **Cache de exercícios**: limpo após o PR #3. As lições cacheadas antes do PR #4 vão regenerar os exercícios uma vez.
- **Admin**: a conta `tiagoirber@gmail.com` é admin.
- **Player do replay**: validado no Chrome com dados de exemplo, no desktop e no celular, incluindo movimento reduzido e `destroy`.
- **Ainda não validado**: a geração real do replay pela IA, o tempo da fase 2 com 16000 tokens e os golden paths no navegador após as mudanças.
- **Branches já mescladas** (podem ser apagadas): `feat/hand-replay`, `fix/revisao-nov-2026`, `feat/implementacao-maio-2026`.

## Pendências (em ordem de prioridade)
1. **Validar o replay com a IA real**:
   - Abra 2-3 lições e veja o replay tocar até a decisão.
   - Rode `npx firebase functions:log --only api` e conte os `[replay] inválido`.
   - Se forem frequentes, ajuste `REPLAY_RULES` e os exemplos, ou suba o `effort` só na fase 2.
2. **Conferir nos logs**:
   - tempo da fase 2 (meta: até 60s);
   - frequência de `[pokerLanguage]` com rio, virada e verificar.
3. **Golden paths no navegador**:
   - concluir 2 lições no mesmo dia (o streak não pode cair);
   - stepper sem pulo de etapa;
   - prazo no admin sem +1 dia;
   - console sem erros.
4. **Segurança**: considerar rotacionar a chave da service account, porque bundles antigos podem ter levado o arquivo. Também verificar se o Hosting respeita respostas acima de 60s.
5. **Limpeza**: apagar as branches já mescladas.
6. **Futuro**:
   - build step do Tailwind (CSP real e fim do FOUC);
   - narração em voz;
   - revelar as cartas do vilão após a resposta;
   - testes de frontend com jsdom;
   - domínio customizado.
