# Guia de Linguagem — Poker Brasileiro

## Objetivo

As lições e narrativas do Poker Coach 90d devem soar como escritas por alguém que
**joga e ensina poker no Brasil**, não como tradução automática do inglês.

O glossário canônico (`backend/utils/poker-glossary.json`) é a fonte única de verdade.
As funções `validatePokerLanguage` e `normalizePokerLanguage` em `backend/utils/pokerLanguage.js`
aplicam as regras automaticamente em todas as narrativas geradas por IA.

---

## Termos que DEVEM permanecer em inglês

Estes são os jargões consagrados da comunidade brasileira de poker.
Jogadores brasileiros os usam em inglês em partidas, lives e fóruns.

| Termo | Nunca traduzir como |
|-------|---------------------|
| call | chamar, pagar (só "pagar" é aceito em PT-BR — ver seção abaixo) |
| raise | aumentar, subir |
| fold | desistir, dobrar |
| check | verificar, passar |
| bet | apostar (quando for jargão) |
| all-in | tudo dentro |
| flop | fracasso, falha |
| turn | virada |
| river | rio |
| showdown | revelação |
| stack | fichas (em sentido técnico) |
| short stack / deep stack | — |
| blind / small blind / big blind | pequeno cego / grande cego |
| button | botão do negociante |
| cutoff / hijack / UTG | — |
| pot | pulo (nunca), pote é aceito |
| range | faixa |
| draw / flush draw / straight draw | cor, sequência incompleta |
| overpair / top pair / set / trips | — |
| full house | mão cheia |
| nuts | mão perfeita |
| blocker / kicker | — |
| c-bet / 3-bet / 4-bet | — |
| squeeze / limp / donk bet | — |
| check-raise / value bet | — |
| bluff / semi-bluff / hero call | — |
| bad beat / cooler / tilt | — |
| bankroll / ICM | — |

---

## Termos que PODEM aparecer em português natural

Estes termos em português soam naturais para jogadores brasileiros e são aceitos.

- **pagar** — sinônimo aceitável de "dar call" (ex: "ele pagou a aposta")
- **apostar** — quando não for jargão técnico (ex: "Hero apostou 10bb")
- **aumentar** — sinônimo de dar raise (ex: "aumentou para 30bb")
- **desistir / foldou** — ambos aceitos
- **fichas** — em contexto informal ("perdeu todas as fichas")
- **mão** — a combinação de cartas do jogador
- **mesa** — as cartas comunitárias (sinônimo de board)
- **pote** — sinônimo de pot (ambos aceitos)
- **posição** — position (pode usar em PT)
- **leitura** — read de oponente
- **equidade** — sinônimo de equity (ambos aceitos)
- **pré-flop / pós-flop** — aceitos (com hífen)
- **Hero / Vilão** — uso obrigatório para os personagens da mão

---

## Termos PROIBIDOS

| Proibido | Causa | Substituto correto |
|----------|-------|--------------------|
| fracasso | tradução literal de flop | **flop** |
| virada | tradução literal de turn | **turn** |
| rio | tradução literal de river | **river** |
| grande cego | tradução literal de big blind | **big blind** |
| pequeno cego | tradução literal de small blind | **small blind** |
| verificar / verificou | tradução literal de check | **deu check** / **checou** |
| chamar / chamou (call) | tradução literal de call | **pagou** / **deu call** |
| tábua | tradução literal de board | **board** / **mesa** |
| botão do negociante | tradução literal de button | **button** / **botão** |
| mão cheia | tradução literal de full house | **full house** |
| sequência reta | tradução literal de straight | **straight** / **sequência** |
| dobrar a aposta (raise) | ambíguo com dobrar o valor | **deu raise** / **aumentou** |
| cor (flush) | genérico demais | **flush** |

---

## Exemplos — Certo vs Errado

### Certo ✅

```
Hero está no cutoff com A♠K♦ e 80bb efetivos. A ação passa para ele, que dá raise
para 2,5bb. O big blind paga e os dois vão ao flop com 5,5bb.

O flop vem J♥7♣2♠. Hero tem overcards e um backdoor flush draw. O big blind deu check.
Hero aposta 3bb para começar a construir o pote. O big blind pagou.

O turn traz 9♦, uma carta neutra. O big blind deu check novamente. Hero apostou 8bb.
O big blind foldou.
```

### Errado ❌

```
Hero está no cutoff com A♠K♦ e 80 fichas. A ação passa para ele, que aumenta para
2,5 fichas. O grande cego chamou e os dois foram ao fracasso com 5,5 fichas.

O fracasso veio J♥7♣2♠. Hero tem overcards. O grande cego verificou. Hero apostou.
O grande cego chamou.

A virada trouxe 9♦. O grande cego verificou. Hero apostou. O grande cego desistiu.
```

---

## Como expandir o glossário

Edite `backend/utils/poker-glossary.json`. Cada entrada em `forbidden` tem os campos:

```json
{
  "term": "nome descritivo do problema",
  "replacement": "texto de substituição",
  "pattern": "regex válida (lembre de escapar: \\b para word boundary)",
  "explanation": "por que esse termo é problemático",
  "severity": "high | medium | low",
  "safeToAutoReplace": true
}
```

- `severity: "high"` — bloqueia em `strictPokerLanguageMode=true`
- `safeToAutoReplace: true` — `normalizePokerLanguage` substitui automaticamente
- `safeToAutoReplace: false` — apenas sinaliza como issue no log; não substitui

**Após expandir**, adicione casos de teste em `backend/utils/pokerLanguage.test.js`.

---

## Modo estrito

Para ativar revisão por IA quando ainda houver termos proibidos de severity high
após a normalização automática:

```bash
# .env ou variável de ambiente da Cloud Function
STRICT_POKER_LANGUAGE=true
```

Por padrão `false` — a normalização automática basta para a maioria dos casos.
