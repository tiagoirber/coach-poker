import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const glossary = require('./poker-glossary.json');

// true quando STRICT_POKER_LANGUAGE=true no ambiente — ativa revisão por IA
// após normalização quando ainda houver issues de severity high.
export const strictPokerLanguageMode = process.env.STRICT_POKER_LANGUAGE === 'true';

// ── validatePokerLanguage ────────────────────────────────────────────────────
// Verifica se o texto contém termos proibidos segundo o glossário canônico.
export function validatePokerLanguage(text) {
  const issues = [];
  for (const entry of glossary.forbidden) {
    const regex = new RegExp(entry.pattern, 'gi');
    if (regex.test(text)) {
      issues.push({
        forbiddenTerm:       entry.term,
        suggestedReplacement: entry.replacement,
        explanation:         entry.explanation,
        severity:            entry.severity,
      });
    }
  }
  return { isValid: issues.length === 0, issues };
}

// ── normalizePokerLanguage ───────────────────────────────────────────────────
// Substitui automaticamente os termos com safeToAutoReplace:true.
// Termos ambíguos (ex: "dobrar", "chamar") são apenas sinalizados pelo validate.
export function normalizePokerLanguage(text) {
  let result = text;
  for (const entry of glossary.forbidden) {
    if (entry.safeToAutoReplace) {
      result = result.replace(new RegExp(entry.pattern, 'gi'), entry.replacement);
    }
  }
  return result;
}

// ── POKER_BR_NARRATIVE_PROMPT ────────────────────────────────────────────────
// Injetado no system prompt de geração de narrativas (lesson-exercises,
// practice-hand). Complementa as regras gerais de JSON/contexto já existentes.
export const POKER_BR_NARRATIVE_PROMPT = `
LINGUAGEM POKER BRASILEIRO — REGRAS OBRIGATÓRIAS PARA NARRATIVAS:
Escreva como alguém que joga e ensina poker no Brasil, nunca como tradutor automático.

PROIBIDO em narrativas:
- "fracasso" para flop — use "flop"
- "virada" para turn — use "turn"
- "rio" para river — use "river"
- "grande cego" para big blind — use "big blind"
- "pequeno cego" para small blind — use "small blind"
- "verificar/verificou" para check — use "deu check", "checou" ou "dá check"
- "chamar/chamou" para call — use "pagou", "deu call" ou "pagou a aposta"
- "tábua" para board — use "board" ou "mesa"
- "botão do negociante" para button — use "button" ou "botão"
- "mão cheia" para full house — use "full house"
- "sequência reta" para straight — use "straight" ou "sequência"
- "dobrar" como sinônimo de raise — use "deu raise", "aumentou" ou "relançou"
- "cor" para flush — use "flush"

VERBOS CORRETOS em português brasileiro para ações de poker:
- call: "paga", "pagou", "dá call", "deu call"
- raise: "aumenta", "aumentou", "dá raise", "deu raise", "relança", "relançou"
- fold: "desiste", "desistiu", "folda", "foldou"
- check: "dá check", "deu check", "checa", "checou"
- bet: "aposta", "apostou"

USE "Hero" para o jogador principal e "Vilão" para o adversário.
USE "board" ou "mesa" para cartas comunitárias. Seja consistente dentro da mesma narrativa.
`.trim();

// ── POKER_BR_REVIEW_PROMPT_TEMPLATE ─────────────────────────────────────────
// Template para revisão por IA (usado apenas quando strictPokerLanguageMode=true
// e ainda houver issues de severity high após a normalização automática).
// Substitua {{NARRATIVE}} pelo texto a revisar antes de enviar.
export const POKER_BR_REVIEW_PROMPT_TEMPLATE = `Revise a narrativa abaixo como editor de poker brasileiro.

Tarefas:
1. Identifique termos traduzidos literalmente do inglês.
2. Substitua por vocabulário natural usado por jogadores brasileiros.
3. Preserve o sentido técnico da mão — não altere cartas, posições, stacks, tamanhos de aposta nem sequência de ação.
4. Retorne apenas a versão revisada, sem comentários.

Termos proibidos (substitua pelos indicados):
- "fracasso" → "flop"
- "virada" → "turn"
- "rio" (street) → "river"
- "grande cego" → "big blind"
- "pequeno cego" → "small blind"
- "verificou/verificar" → "deu check" / "dar check"
- "chamou/chamar" (call) → "pagou" / "pagar" / "deu call"
- "tábua" (board) → "board"
- "botão do negociante" → "button"
- "mão cheia" → "full house"
- "sequência reta" → "straight"
- "dobrar a aposta" (raise) → "deu raise" / "aumentou"

Narrativa:
{{NARRATIVE}}`;
