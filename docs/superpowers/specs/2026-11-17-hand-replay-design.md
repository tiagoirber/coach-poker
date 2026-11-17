# Replay animado da mão — design

**Data:** 2026-11-17 · **Status:** aprovado no brainstorming, aguardando plano de implementação

## Objetivo

Trocar a mesa estática das simulações por um replay animado da mão, sincronizado com a narração: cada lance aparece na mesa (cartas, fichas, folds, pote) enquanto o texto daquele lance é destacado. O replay para no momento da decisão do Hero, e só então as opções aparecem. Junto, melhorar a qualidade visual da mesa e das cartas.

Vale para as 3 simulações da lição (fácil/médio/difícil) e para o Treino Infinito.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Controle | Toca sozinho, com play/pause, voltar, avançar, velocidade (1x/1.5x/2x), barra clicável por lance e botão "Ir para a decisão" |
| Narração | Só texto sincronizado (sem áudio) |
| Mesa | 6-max completa: 6 assentos com posição e stack, folds apagados, assento ativo com brilho, dealer button |
| Fonte do roteiro | A IA gera o roteiro estruturado (`table` + `replay`) junto com a simulação |
| Visual | Protótipo v3 aprovado: board 70×98px, cartas do Hero 60×84px, verso do vilão 46×65px |

## 1. Formato dos dados

Campos novos em cada simulação (`handSimulations.easy|medium|hard` e no `sim` do `/practice-hand`). Os campos atuais continuam iguais: `heroHand`, `board`, `pot`, `stack`, `position`, `villainPosition`, `streets`, `narrative`, `situation`, `question`, `options`, `correct` e `analysis`.

```json
"table": {
  "seats": [
    { "pos": "UTG", "stack": 98 }, { "pos": "HJ", "stack": 120 },
    { "pos": "CO",  "stack": 75 }, { "pos": "BTN", "stack": 100, "hero": true },
    { "pos": "SB",  "stack": 60 }, { "pos": "BB",  "stack": 91 }
  ]
},
"replay": [
  { "street": "preflop", "board": "", "actor": "SB",  "action": "post",  "amount": 0.5, "pot": 0.5, "narration": "..." },
  { "street": "preflop", "board": "", "actor": "BB",  "action": "post",  "amount": 1,   "pot": 1.5, "narration": "..." },
  { "street": "preflop", "board": "", "actor": "UTG", "action": "fold",  "amount": 0,   "pot": 1.5, "narration": "..." },
  { "street": "preflop", "board": "", "actor": "BTN", "action": "raise", "amount": 2.5, "pot": 4,   "narration": "..." },
  { "street": "flop", "board": "A♥7♣2♦", "actor": null, "action": "deal", "amount": 0, "pot": 5.5, "narration": "..." },
  { "street": "flop", "board": "A♥7♣2♦", "actor": "BB", "action": "check", "amount": 0, "pot": 5.5, "narration": "..." },
  { "street": "flop", "board": "A♥7♣2♦", "actor": "BTN", "action": "decision", "amount": 0, "pot": 5.5, "narration": "..." }
]
```

Regras:
- **Assentos**: sempre 6, com `pos` único em `UTG, HJ, CO, BTN, SB, BB`, e exatamente 1 assento com `hero: true`. O `stack` é numérico, em bb, e é o valor **antes** dos blinds.
- **Street**: `street` ∈ `preflop | flop | turn | river`.
- **Ação**: `action` ∈ `post | fold | check | call | bet | raise | allin | deal | decision`.
  - `post`: blind posto (SB e BB no início da mão).
  - `deal`: revela cartas do board e tem `actor: null`.
  - `decision`: é **sempre o último passo** e o `actor` é o Hero.
- **Valores**: `amount` é o total apostado pelo ator **na street atual** (raise para 2.5bb dá `amount: 2.5`). Em `fold`, `check`, `deal` e `decision`, `amount: 0`. `pot` é o pote depois do lance.
- **Board**: `board` é o board acumulado até aquele lance.
- **Tamanho**: entre 6 e 20 passos.
- **Narração**: `narration` é o trecho que acompanha o lance, com 1 a 3 frases. Passa pelo `normalizePokerLanguage` como a `narrative`.
- **Narrativa corrida**: `narrative` continua sendo gerado. É o fallback quando não há replay.

**Sem bump de `LESSON_CACHE_VER`.** Os campos são apenas acrescentados, o frontend trata a ausência deles, e o cache local da lição só é lido pelos flashcards, que não usam simulações.

## 2. Backend — `backend/routes/claude.js` e novo `backend/utils/replay.js`

- **Prompts**: o prompt da fase 2 (`/lesson-exercises`) e o do `/practice-hand` passam a pedir `table` e `replay` com as regras acima, usando o próprio exemplo A♠K♦ como modelo no JSON de resposta.
- **`max_tokens`**: fase 2 vai de 12000 para 16000; `/practice-hand` vai de 4500 para 6000.
- **Validação**: `validateReplay(sim)` em `backend/utils/replay.js` é uma função pura que devolve `{ ok, reason }`. Ela confere:
  - `table.seats`: são 6, com posições únicas e válidas, exatamente 1 hero e stacks numéricos positivos.
  - `replay`: é um array com 6 a 20 passos.
  - Cada passo tem `street`, `action` e números válidos. O `actor` existe em `seats`, exceto em `deal`, que exige `actor: null`.
  - O último passo é `decision`, com o actor sendo o Hero.
  - Nenhum `decision` aparece antes do último passo.
- **Normalização**: `normalizePokerLanguage` é aplicado em cada `replay[].narration`. O `validatePokerLanguage` loga como já faz com a `narrative`.
- **Replay inválido**:
  - Loga `[replay] inválido day=X level=Y: <reason>` e remove `table` e `replay` daquela simulação.
  - A resposta ao cliente sai normalmente, sem animação nela; nunca vira 502 por causa do replay.
  - A fase 2 **não grava** no Firestore se qualquer das 3 simulações teve replay removido. Assim a próxima visita tenta de novo.
- **Cache**: em `/lesson-exercises`, o cache do Firestore só é aceito se `handSimulations.easy.replay` existir. As lições cacheadas antes da mudança regeneram os exercícios uma vez.

## 3. Frontend — novo `frontend/js/handReplay.js` + `frontend/css/replay.css`

**`handReplay.js`** é um módulo isolado, sem dependência de `lesson.js`. Exporta:
- `stateAt(sim, i)`: função pura. Aplica os passos `0..i` e devolve `{ folded, bets, stacks, pot, board, street, actor, action, amount, deciding, streetChanged }`.
- `mountReplay(container, sim, { onDecision })`: monta a mesa, a narração e os controles dentro de `container` e devolve `{ destroy }`.

Comportamento:
- **Mesa 6-max**:
  - O Hero fica sempre embaixo, no centro, e os outros 5 assentos seguem a ordem da mesa no sentido horário.
  - Cada assento mostra posição, stack (vai diminuindo) e cartas: as do Hero abertas, as do vilão viradas, e nenhuma depois do fold.
  - A aposta aparece como ficha na frente do assento. Na troca de street, as fichas deslizam para o pote. O dealer button fica junto ao BTN.
- **Badge da ação**: aparece sobre o assento a cada lance ("RAISE 2.5bb", "FOLD", "BLIND 1bb").
- **Narração**: mostra os lances até o atual, com o atual destacado e rolagem automática. Fica ao lado da mesa no desktop e embaixo no celular (<768px).
- **Ritmo**: cada lance dura `min(7000, 1500 + 35 × caracteres da narration) / velocidade` ms.
- **Controles**: ⏮ (volta sem animar), ⏯, ⏭, barra clicável por lance, velocidade e "Ir para a decisão". O ▶ no último lance reinicia do começo.
- **Decisão**:
  - O replay pausa, o assento do Hero pulsa e `onDecision()` é chamado.
  - Quem chama exibe as opções, que ficam ocultas até esse momento. Com o aluno voltando no replay, as opções continuam visíveis depois da primeira vez.
- **Segurança**: os dados chegam já passados pelo `sanitizeAiData`. O módulo usa só `textContent`, `createElement` e `addEventListener`; nenhum HTML é montado com texto da IA.
- **Acessibilidade**: com `prefers-reduced-motion`, nada se anima e os estados apenas trocam. Os botões têm `aria-label`.
- **Limpeza**: `destroy()` cancela o timer. Gerar uma nova mão no Treino Infinito chama `destroy()` antes de montar a próxima.

**`replay.css`** reúne os estilos do protótipo v3 (feltro, assentos, cartas, fichas, badges, controles e responsivo). É carregado em `pages/lesson.html`.

**Integração em `lesson.js`**:
- `simBodyHtml` deixa um contêiner `<div id="replay-{suffix}">` quando `sim.replay` existe e mantém a mesa estática atual quando não existe.
- `renderSimLevel` e `renderInfiniteHand` chamam `mountReplay` depois de inserir o HTML.
- Com replay, as opções `#sim-actions-{suffix}` começam com `hidden`, e `onDecision` remove o `hidden`.
- Sem replay, o comportamento é o de hoje.

## 4. Testes

- **`backend/utils/replay.test.js`**, com `validateReplay`:
  - válido;
  - 5 assentos;
  - 2 heroes;
  - `action` fora do enum;
  - actor inexistente;
  - `deal` com actor;
  - sem `decision` no fim;
  - `decision` no meio;
  - mais de 20 passos.
- **`backend/routes/claude.test.js`**:
  - replay inválido devolve 200, sem `replay` e sem gravar no Firestore;
  - replay válido é gravado;
  - cache sem `replay` é ignorado.
- **`stateAt` (frontend)**: função pura, mas o Vitest está configurado só para `backend/**`. Fica sem teste automatizado e a validação é manual no browser. Ver "Fora de escopo".
- **Manual**:
  - as 3 simulações e o Treino Infinito em desktop e celular;
  - "Ir para a decisão";
  - voltar após a decisão;
  - `prefers-reduced-motion`;
  - lição antiga sem replay mostrando a mesa estática.

## Fora de escopo

- Narração em áudio (voz do navegador ou TTS).
- Revelar as cartas do vilão no showdown ou depois da resposta.
- Testes automatizados de frontend (exigem configurar o jsdom no Vitest; pode virar tarefa à parte).
- Rotacionar a mesa para mesas com menos de 6 jogadores.

## Riscos

- **Qualidade do roteiro gerado pela IA**: o Haiku 5.5 com effort `low` pode errar a coerência do pote e dos stacks. A validação confere a estrutura, não a aritmética. A mitigação é o prompt explícito com exemplo e a revisão manual de algumas mãos após o deploy. Se o erro for frequente, a opção é subir o effort só na fase 2.
- **Tempo da fase 2**: cerca de 30-40% mais tokens de saída. É preciso medir depois do deploy (meta ≤ 60s; o limite da função é 120s).
