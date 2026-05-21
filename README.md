# Poker Coach 90d

Plataforma web de coaching de poker com IA. O aluno segue um currículo de 90 dias (+ 1 bônus de Cash Game) que cobre matemática, preflop, postflop, mental game e ICM. Todo o conteúdo de cada lição — teoria, quizzes e simulações de mãos — é gerado sob demanda pela API da Anthropic (Claude), cacheado em dois níveis e servido como uma experiência de aprendizado progressiva e bloqueada.

**URL pública:** `https://poker-coach-ia.web.app`  
**Autor:** Tiago Irber  
**Status:** desenvolvimento solo ativo — sem usuários reais além do autor.

---

## O que o projeto faz

1. **Dashboard** — lista as 90 + 1 lições organizadas por semana, com indicação de dias concluídos, XP total e streak.
2. **Lição** — fluxo vertical e bloqueado:
   - Teoria gerada por IA (narrativa + glossário com tooltips)
   - Técnica Feynman (textarea livre — desbloqueio obrigatório antes do quiz)
   - Quiz Fácil → Quiz Médio → Quiz Difícil (1 pergunta por nível, geradas por IA)
   - Simulação Fácil → Simulação Média → Simulação Difícil (mesa de poker visual, narrativa de 4–5 parágrafos, feedback de acerto/erro)
   - Treinamento Infinito: FOCADO (tópico atual) ou GERAL (mix de dias concluídos), contexto MTT para dias 1–90 e Cash Game para o dia 91
3. **Flashcards** — revisão com spaced repetition simplificada (Anki-like) usando as perguntas de quiz das lições já visitadas.
4. **Chat com coach IA** — perguntas livres ao Claude Sonnet.
5. **Admin** — gerenciamento de usuários e roles.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML puro + Tailwind CSS (CDN) + Firebase Client SDK v9 compat |
| Backend | Node.js 20 + Express — Firebase Cloud Functions v2 |
| Banco | Cloud Firestore (sem ORM) |
| Auth | Firebase Authentication (Google OAuth) |
| IA — lições | Claude Haiku 4.5 (`max_tokens: 8000`) |
| IA — chat | Claude Sonnet 4.6 |
| Hosting | Firebase Hosting → `poker-coach-ia.web.app` |
| Secrets | Firebase Secret Manager (`CLAUDE_API_KEY`) |

---

## Decisões arquiteturais importantes

### Cache em dois níveis
- **Nível 1 — Firestore** (`lessons/day_X`): cache global compartilhado. Na primeira visita de qualquer usuário a uma lição, o conteúdo é gerado via IA e salvo aqui.
- **Nível 2 — localStorage** (`lesson_v8_<day>`): cache local por sessão/usuário. Na segunda visita do mesmo usuário, `forceNew: true` é enviado ao backend, gerando conteúdo novo e atualizando o Firestore.
- `LESSON_CACHE_VER` (atualmente `v8`) é exportado de `config.js` e usado em `lesson.js` e `flashcards.js`. **Bumpar só ao mudar o schema JSON da lição** — invalida o cache de todos os usuários.

### Progressão linear e bloqueada
Não é possível pular etapas. A ordem é estrita: Teoria → Feynman → Quiz E/M/D → Simulação E/M/D → Treinamento Infinito. Cada etapa só é habilitada após a anterior ser concluída. O stepper visual no topo da lição reflete o estado atual.

### Contexto MTT vs Cash Game
- Dias 1–90: prompt instrui a IA a usar contexto exclusivo de torneio (MTT): stacks em BBs, antes a partir do mid-stage, pressão de bubble/ICM. Nunca rake ou rebuy ilimitado.
- Dia 91 (bônus): lição e simulações em contexto Cash Game NL: deep stacks (100–200bb), rake, sem pressão de blinds crescentes, mindset de sessão longa.
- A flag `isCashGame = day === 91` no backend e `handContext = chosenTopic.day === 91 ? 'cash' : 'tournament'` no frontend controlam isso.

### Idempotência no progresso
`POST /api/progress/complete` usa `db.runTransaction()`: lê o documento da lição concluída e o documento do usuário atomicamente antes de escrever. Se a lição já existe, retorna 409. Isso previne crédito duplo de XP em double-click ou retry de rede.

### AbortController no Treinamento Infinito
Cliques rápidos em FOCADO/GERAL cancelam a requisição anterior via `AbortController`. Só a última requisição iniciada renderiza o resultado. `AbortError` é tratado silenciosamente (não exibe erro ao usuário).

### Extração de JSON robusta no backend
O response do Claude não é confiável quanto a markdown fences. O backend tenta, em ordem: `JSON.parse` direto → extrai de bloco ```json...``` → extrai do primeiro `{` ao último `}`. Só lança erro se tudo falhar.

### Segurança de auth
`backend/middleware/auth.js` verifica o token Firebase via Admin SDK e faz GET no Firestore para checar o role do usuário. **Não tocar sem autorização** — qualquer bug aqui expõe toda a API.

---

## Estado atual

### Completo e funcional
- [x] Login com Google / guard de auth em todas as páginas
- [x] Geração de lição via IA com cache Firestore + localStorage
- [x] Fluxo vertical bloqueado com stepper visual (Feynman → Quiz → Sim → Infinito)
- [x] Quiz reformulado: 1 pergunta por nível, sem tela intermediária de resultado
- [x] Mesa de poker visual: felt verde, hero/vilão, board, pot, narrativa de 4–5 parágrafos
- [x] Feedback de acerto/erro com banner ✅/❌ e nome da ação correta
- [x] Análise em tabs (Explicação / EV / GTO)
- [x] Treinamento Infinito FOCADO/GERAL com AbortController
- [x] Botões FOCADO/GERAL com estado visual ativo destacado
- [x] Contexto MTT (dias 1–90) vs Cash Game (dia 91) separados
- [x] Dia 91 (bônus Cash Game) no currículo e backend
- [x] Progressão bloqueada no backend (guard `day > 91`, transação Firestore)
- [x] Flashcards com spaced repetition — bug de versão de cache corrigido (`LESSON_CACHE_VER` centralizado)
- [x] Dashboard com currículo, XP, streak, dias restantes sem valor negativo
- [x] Chat com coach IA (Claude Sonnet)
- [x] Painel admin para gestão de usuários
- [x] `opusplan` configurado (Opus 4.7 em plan mode, Sonnet 4.6 no padrão)

### Pendente / próximos passos possíveis
- [ ] Suíte de testes formal (nenhum teste automatizado hoje)
- [ ] Lint (ESLint ainda não configurado)
- [ ] Sanitização de HTML com DOMPurify (todo `innerHTML` com conteúdo da IA)
- [ ] Custom Claims no Firebase Auth para evitar GET no Firestore em cada request
- [ ] Página de perfil do usuário
- [ ] Leaderboard funcional no dashboard
- [ ] Domínio customizado

---

## Comandos

```bash
# Dev local (Express na porta 3001)
npm run dev

# Deploy
npx firebase deploy --only hosting             # só frontend (rápido)
npx firebase deploy --only functions           # só backend
npx firebase deploy --only functions,hosting   # tudo
```

---

## Estrutura de pastas

```
backend/
  app.js                  → Express app (montagem de rotas)
  server.js               → entry point local
  config/firebase.js      → Firebase Admin SDK
  middleware/auth.js      → verificação de token (NÃO TOCAR)
  routes/
    claude.js             → /api/claude/lesson e /chat e /practice-hand
    progress.js           → complete, history, leaderboard
    users.js              → CRUD + roles
frontend/
  index.html              → login/auth
  css/glass.css           → glassmorphism custom
  js/
    config.js             → Firebase init + CURRICULUM + LESSON_CACHE_VER
    api.js                → wrapper fetch (userApi, progressApi, claudeApi)
    lesson.js             → lógica completa da lição
    dashboard.js          → currículo, progresso, XP, streak
    flashcards.js         → spaced repetition
  pages/                  → HTMLs das páginas internas
functions/index.js        → entry point da Cloud Function
firestore.rules           → regras de segurança (NÃO TOCAR sem avisar)
firebase.json             → config hosting/functions (NÃO TOCAR sem avisar)
CLAUDE.md                 → instruções detalhadas para o Claude Code
```

---

## Como trabalhar neste projeto (para o Claude Code)

> As instruções completas e vinculantes estão em `CLAUDE.md`. Este resumo é apenas um mapa rápido.

**Antes de qualquer mudança que toque 3+ arquivos ou um golden path: entrar em plan mode (`/plan`) e aguardar aprovação.**

### O que nunca tocar sem autorização explícita
- `backend/middleware/auth.js`
- `firestore.rules` e `firebase.json`
- Schema dos documentos Firestore (campos de `lessons/day_X` e `completedLessons`)
- `CURRICULUM` em `config.js` (ordem e IDs dos dias)
- `LESSON_CACHE_VER` em `config.js` (bumpar só ao mudar o schema JSON da lição)

### Convenções
- Código em inglês; comentários, commits e documentação em português.
- Termos de poker permanecem em inglês (fold, raise, equity, EV, GTO, c-bet…).
- Preferir `Edit` a `Write`. Preferir solução simples. Não refatorar o que não foi pedido.
- Não commitar automaticamente. O autor revisa e commita. Nunca dar push em main.

### Golden paths (não podem regredir)
1. Login com Google → redirect para dashboard
2. Geração de lição em ≤ 15s, sem "formato inválido"
3. Cache em dois níveis funcionando (sem erro de rede)
4. Progressão vertical bloqueada (não pular etapas)
5. Concluir lição → XP no Firestore, celebração, dashboard atualizado
6. Dashboard exibe 90 + 1 dias, dias concluídos marcados, XP e streak corretos
