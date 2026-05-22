# Poker Coach 90d — Instruções para Claude Code

## Modelos (opusplan)

Configurado via `.claude/settings.local.json`. Troca automática:

| Modo | Modelo |
|------|--------|
| Plan mode (`/plan` ou Shift+Tab 2×) | Claude Opus 4.7 (`claude-opus-4-7`) |
| Padrão (implementação) | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |

```bash
/model        # ver qual está ativo agora
/model opus   # forçar Opus (arquitetura, debug complexo)
/model sonnet # forçar Sonnet
```

---

## 1. Visão geral

Plataforma web de coaching de poker com IA para um currículo estruturado de 90 dias. O usuário estuda teoria, faz consolidação Feynman, responde quizzes progressivos e pratica simulações de mãos — tudo com conteúdo gerado sob demanda pela API do Claude (Anthropic). Projeto solo em desenvolvimento ativo, deployado publicamente em `https://poker-coach-ia.web.app` (sem usuários reais além do autor por enquanto).

## 2. Stack e comandos exatos

**Stack:**
- Frontend: HTML puro + Tailwind CSS (CDN) + Firebase Client SDK (compat v9)
- Backend: Node.js 20 + Express, servido via Firebase Cloud Functions v2
- Banco: Firestore (sem ORM — SDK direto)
- IA: Anthropic Claude — Haiku 4.5 para geração de lições, Sonnet 4.6 para chat do coach
- Hosting: Firebase Hosting → `https://poker-coach-ia.web.app`
- Secrets: Firebase Secret Manager (`CLAUDE_API_KEY`)

**Comandos:**
```bash
# Dev local (Express na porta 3001)
npm run dev                                    # node --watch backend/server.js

# Deploy
npx firebase deploy --only hosting             # só frontend (mais rápido)
npx firebase deploy --only functions           # só backend (Cloud Function)
npx firebase deploy --only functions,hosting   # tudo

npm test                                       # Vitest — backend/**/*.test.js
npm run lint                                   # ESLint flat config v9
# Typecheck: não há (JavaScript puro, sem TypeScript)
```

## 3. Estrutura de pastas

```
.claude/                  → settings e permissions do Claude Code
backend/
  app.js                  → Express app (montagem de rotas)
  server.js               → entry point local (dev)
  config/firebase.js      → Firebase Admin SDK
  middleware/auth.js      → verificação de token Firebase (NÃO TOCAR)
  routes/
    claude.js             → POST /api/claude/lesson e /api/claude/chat
    progress.js           → complete, history, leaderboard
    users.js              → CRUD de usuários e roles
frontend/
  index.html              → página de login/auth
  404.html                → redirect automático para /
  css/glass.css           → estilos customizados (glassmorphism)
  js/
    config.js             → Firebase init + CURRICULUM (90 dias) + CATEGORY_COLORS
    api.js                → wrapper fetch (userApi, progressApi, claudeApi)
    auth.js               → guard de autenticação
    lesson.js             → lógica completa da lição (quiz, sim, Feynman, stepper)
    dashboard.js          → currículo, progresso, XP, streak
    flashcards.js         → revisão de flashcards
    glossary.js           → tooltips de termos de poker
    admin.js              → painel admin
  pages/                  → HTMLs das páginas internas
functions/index.js        → entry point da Cloud Function
firebase.json             → config hosting, functions, Firestore (NÃO TOCAR sem avisar)
firestore.rules           → regras de segurança (NÃO TOCAR sem avisar)
```

## 4. Funcionalidades críticas (GOLDEN PATHS — não podem regredir)

| # | Funcionalidade | Como validar manualmente |
|---|---------------|--------------------------|
| 1 | **Login / autenticação Firebase** | Abrir `poker-coach-ia.web.app`, fazer login com Google → deve redirecionar para o dashboard. |
| 2 | **Geração de lição pela IA** | Abrir qualquer lição → teoria, quiz e simulação aparecem em ≤ 15s, sem erro "formato inválido". |
| 3 | **Cache de lições (2 níveis)** | 1ª visita: busca do Firestore ou gera via IA. 2ª visita: gera novo conteúdo (forceNew). Nenhuma visita exibe erro de rede. |
| 4 | **Progressão vertical bloqueada** | Na lição: Quiz Fácil bloqueado até Feynman ser enviado; Quiz Médio bloqueado até Quiz Fácil respondido; e assim até Treinamento Infinito. |
| 5 | **Marcar lição como concluída** | Clicar "Concluir Lição" → salva no Firestore, mostra celebração com XP, atualiza dashboard. |
| 6 | **Dashboard com currículo e progresso** | Acessar dashboard → 90 dias por semana, dias concluídos marcados, XP e streak corretos. |

## 5. Áreas intocáveis sem autorização

- **`backend/middleware/auth.js`** — qualquer bug aqui expõe a API sem autenticação.
- **`firestore.rules`** — regras de segurança do banco.
- **Campos dos documentos Firestore** — coleção `lessons/day_X` e coleção de progresso. Mudar chaves quebra cache e histórico existente.
- **`CURRICULUM` em `frontend/js/config.js`** — alterar ordem ou IDs dos 90 dias quebra o progresso salvo.
- **`CACHE_KEY_VER` em `frontend/js/lesson.js`** — bumpar só intencionalmente ao mudar o formato JSON da lição. Bumpar sem querer invalida o cache de todos.
- **Arquivos `.env`, `.env.local`, `firebase-service-account.json`** — nunca ler em voz alta, nunca commitar, nunca logar conteúdo.

## 6. Convenções de código

- Variáveis e funções em inglês; comentários, commits e este arquivo em português.
- Termos técnicos de poker permanecem em inglês: call, fold, raise, equity, EV, GTO, c-bet, flop, turn, river, etc. — nunca traduzir.
- Comentar só o "porquê" não-óbvio. Nunca o "o quê".
- Seguir o padrão dos arquivos vizinhos antes de inventar (ex: ver como `api.js` expõe funções antes de criar rota nova).
- Preferir sempre a solução mais simples. Sem abstrações que não foram pedidas.
- NÃO refatorar código que não foi pedido para refatorar.

## 7. Workflow obrigatório (anti-regressão)

- Para tarefas que tocam 3+ arquivos ou qualquer golden path: entrar em `/plan` e aguardar aprovação antes de codar.
- Antes de mudanças grandes: verificar se o working tree está limpo. Sugerir `git stash` ou nova branch se houver risco de rollback.
- Não fazer commits automaticamente. O usuário revisa e commita.
- Nunca dar push em main.

### Checklist obrigatório antes de declarar uma tarefa concluída

Claude **não deve** dizer "pronto" nem propor commit sem passar por este checklist:

- [ ] **Testes automatizados**: `npm test` passa sem falhas (`backend/**/*.test.js` via Vitest)
- [ ] **Lint**: `npm run lint` sem erros (warns de `no-unused-vars` são aceitáveis; erros de `no-undef` não)
- [ ] **Feature alterada funciona**: testar no browser local (`npm run dev` → `http://localhost:3001`) ou em produção
- [ ] **Golden paths intactos** (checar mentalmente os 6 da seção 4 — qualquer dúvida, testar no browser):
  - Login Google → dashboard
  - Lição: teoria/quiz/simulação em ≤ 15s, sem "formato inválido"
  - Cache: 1ª visita busca Firestore/IA; 2ª visita gera novo conteúdo
  - Progressão bloqueada: Feynman → Quiz Fácil → Quiz Médio → ...
  - Concluir lição → XP + celebração + dashboard atualizado
  - Dashboard: 90 dias, dias marcados, XP e streak corretos
- [ ] **Sem erros no console do browser** nas páginas afetadas

Se `npm` não estiver disponível (computador do trabalho), registrar explicitamente quais itens ficaram pendentes e adicionar à seção de ações pendentes do CLAUDE.md.

## 8. O que NÃO fazer (regras duras de anti-retrocesso)

- **Não remover código aparentemente "não usado"** sem fazer Grep no projeto inteiro. Se houver qualquer referência, não remover.
- **Não alterar assinatura de função pública** (parâmetros, retorno) sem listar todos os callers e mostrar o impacto antes.
- **Não alterar schema de API, formato de resposta JSON, nem nome de campo** sem confirmação.
- **Não remover try/catch, validações, fallbacks ou checagens defensivas** — podem estar lá por bug histórico.
- **Não "simplificar" código que está funcionando** se não foi pedido.
- **Não substituir bibliotecas por equivalentes** sem pedido explícito.
- **Não instalar dependências novas** sem perguntar.
- **Não deletar arquivos** sem confirmação explícita.
- **Não modificar** `firestore.rules`, `firebase.json`, `package.json`, `package-lock.json`, `.env*`, `.firebaserc`, `firebase-service-account.json` — sem avisar antes o que muda e por quê.
- **Não criar README, docs ou arquivos auxiliares** que não foram pedidos.
- **Não logar nem expor** conteúdo de `.env*` ou `firebase-service-account.json`.

## 9. Disciplina de contexto e economia de créditos

- Não releia arquivos já lidos na mesma conversa. Referencie por `caminho:linha`.
- Use Grep/Glob para localizar antes de abrir arquivos grandes na íntegra.
- Prefira `Edit` a `Write` em arquivos existentes. `Write` reescreve o arquivo inteiro — usar só para arquivos novos ou rewrite total intencional.
- Para buscas amplas (3+ rodadas de grep esperadas), use Agent com `subagent_type=Explore` em vez de poluir a conversa principal.
- Para tarefas longas, sugerir `/compact` antes de iniciar tarefa nova não-relacionada.
- Não cole diffs longos no chat após aplicar Edit — o usuário vê o diff na UI.
- Não repita no chat trechos de código que acabou de ler.
- Resumir o final da tarefa em 1-3 linhas. Sem narrativa do passo a passo.

## 10. Plan mode e checkpoints

- Tarefa que toca 3+ arquivos ou golden path: plan mode obrigatório antes de codar.
- Tarefa longa (> 30 min estimados): parar a cada marco lógico e pedir confirmação antes de seguir.
- Se durante a execução o escopo se revelar maior que o esperado: PARAR e avisar antes de expandir.

## 11. Comunicação

- Respostas em português do Brasil, diretas. Sem "claro, vou fazer isso".
- Se encontrar algo inesperado no código, avisar antes de mexer.
- Em dúvida sobre escopo, perguntar. Melhor perguntar do que refazer.

## 12. Estado atual e próximos passos

**Última sessão (maio 2026):**
- Implementados todos os itens pendentes do README: ESLint, DOMPurify, página de perfil, Custom Claims e suíte de testes Vitest.
- ESLint: `eslint.config.js` criado (flat config v9), scripts `lint`/`test`/`test:watch` adicionados ao `package.json`, devDeps `eslint globals vitest supertest` declaradas.
- DOMPurify: XSS fechados no chat do coach (`lesson.js`) e no painel admin (`admin.js` + `admin.html`).
- Página de perfil: `frontend/pages/profile.html` + `frontend/js/profile.js` (mostra XP, streak, dias, progresso; edita nome e avatar). Guard de auth adicionado em `auth.js`.
- Custom Claims Firebase Auth: `auth.js` agora lê `role` do token (sem GET no Firestore); fallback + migração gradual para usuários antigos. `users.js` chama `setCustomUserClaims` no registro e na troca de role.
- Testes Vitest: `backend/utils/extractJson.js` (util extraído de `claude.js`), `backend/utils/extractJson.test.js` (11 testes), `backend/routes/claude.test.js`, `backend/routes/progress.test.js`.
- Leaderboard: já estava implementado (backend + frontend) — só verificação visual necessária.

**Próximos passos possíveis:**
- Domínio customizado (configuração manual no Firebase Console, não é código).
- GitHub Actions para rodar `npm test` automaticamente no push (CI).
- Possíveis melhorias futuras: Firestore emulator para testes de integração, página de perfil com foto do Google, leaderboard com posição própria além do top 10.

**Decisões importantes:**
- Cache em dois níveis: localStorage (por usuário/sessão) + Firestore `lessons/day_X` (global). 2ª visita do mesmo usuário sempre gera conteúdo novo via IA (`forceNew: true`).
- Progressão é linear e bloqueada — não é possível pular etapas. Feynman é sempre o primeiro passo desbloqueado após a teoria.
- Modelo para lições: Claude Haiku 4.5 com `max_tokens: 8000` (equilíbrio custo/qualidade).
- Extração de JSON robusta no backend: tenta parse direto → markdown fence → primeiro/último `{ }`.
