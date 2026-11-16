import { describe, it, expect } from 'vitest';
import { validatePokerLanguage, normalizePokerLanguage } from './pokerLanguage.js';

describe('normalizePokerLanguage — casos obrigatórios', () => {
  it('substitui fracasso, grande cego e verificou', () => {
    const input    = 'No fracasso, o grande cego verificou.';
    const expected = 'No flop, o big blind deu check.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui pequeno cego', () => {
    const input    = 'O pequeno cego pagou a aposta.';
    const expected = 'O small blind pagou a aposta.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('não altera texto correto em poker brasileiro', () => {
    const input = 'Hero está no button, dá raise pré-flop e recebe call do big blind.';
    expect(normalizePokerLanguage(input)).toBe(input);
  });

  it('substitui mão cheia', () => {
    const input    = 'Vilão tinha mão cheia no river.';
    const expected = 'Vilão tinha full house no river.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui botão do negociante por button', () => {
    const input    = 'Hero estava no botão do negociante com K♠Q♠.';
    const expected = 'Hero estava no button com K♠Q♠.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui sets por trinca', () => {
    expect(normalizePokerLanguage('Ele tem muitos sets no range.')).toBe('Ele tem muitos trinca no range.');
  });

  it('preserva maiúscula inicial na substituição', () => {
    expect(normalizePokerLanguage('Verificou o flop. Fracasso seco.')).toBe('Deu check o flop. Flop seco.');
  });

  // Termos ambíguos fora do contexto de poker só são sinalizados pelo validate —
  // auto-substituir geraria "river de Janeiro", "pagou a atenção", "turn no torneio",
  // "dar check as pot odds".
  it('não auto-substitui rio, virada, chamou, chamaram e verificar (ambíguos)', () => {
    const input = 'Ele mora no Rio. Foi uma virada no torneio. Isso chamou a atenção; chamaram o floor. Vale verificar as pot odds.';
    expect(normalizePokerLanguage(input)).toBe(input);
  });
});

describe('validatePokerLanguage — detecção de issues', () => {
  it('retorna isValid:true para texto correto', () => {
    const text = 'Hero está no button, dá raise pré-flop e recebe call do big blind.';
    const { isValid, issues } = validatePokerLanguage(text);
    expect(isValid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('detecta fracasso com severity high', () => {
    const { isValid, issues } = validatePokerLanguage('No fracasso ele apostou.');
    expect(isValid).toBe(false);
    expect(issues.some(i => i.forbiddenTerm === 'fracasso' && i.severity === 'high')).toBe(true);
  });

  it('detecta rio e virada com severity high mesmo sem auto-substituir', () => {
    const { isValid, issues } = validatePokerLanguage('O rio foi uma carta ruim. Na virada veio um Rei.');
    expect(isValid).toBe(false);
    expect(issues.some(i => i.forbiddenTerm === 'rio (street)' && i.severity === 'high')).toBe(true);
    expect(issues.some(i => i.forbiddenTerm === 'virada' && i.severity === 'high')).toBe(true);
  });

  it('detecta múltiplos problemas e os lista todos', () => {
    const text = 'No fracasso o grande cego verificou e no rio o pequeno cego chamou.';
    const { isValid, issues } = validatePokerLanguage(text);
    expect(isValid).toBe(false);
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });

  it('retorna suggestedReplacement em cada issue', () => {
    const { issues } = validatePokerLanguage('fracasso virada rio');
    for (const issue of issues) {
      expect(issue.suggestedReplacement).toBeDefined();
      expect(issue.explanation).toBeDefined();
    }
  });

  it('detecta chamou com severity medium', () => {
    const { issues } = validatePokerLanguage('Ele chamou a aposta.');
    expect(issues.some(i => i.forbiddenTerm === 'chamou (call)' && i.severity === 'medium')).toBe(true);
  });

  it('detecta verificar (infinitivo) com severity high', () => {
    const { issues } = validatePokerLanguage('A decisão era verificar ou apostar.');
    expect(issues.some(i => i.forbiddenTerm === 'verificar' && i.severity === 'high')).toBe(true);
  });
});
