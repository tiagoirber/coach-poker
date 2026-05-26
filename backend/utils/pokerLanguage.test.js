import { describe, it, expect } from 'vitest';
import { validatePokerLanguage, normalizePokerLanguage } from './pokerLanguage.js';

describe('normalizePokerLanguage — casos obrigatórios', () => {
  it('substitui fracasso, grande cego e verificou', () => {
    const input    = 'No fracasso, o grande cego verificou.';
    const expected = 'No flop, o big blind deu check.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui rio por river', () => {
    const input    = 'O rio trouxe uma carta ruim para o herói.';
    const expected = 'O river trouxe uma carta ruim para o herói.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui pequeno cego e chamou', () => {
    const input    = 'O pequeno cego chamou a aposta.';
    const expected = 'O small blind pagou a aposta.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('não altera texto correto em poker brasileiro', () => {
    const input = 'Hero está no button, dá raise pré-flop e recebe call do big blind.';
    expect(normalizePokerLanguage(input)).toBe(input);
  });

  it('substitui mão cheia e rio simultaneamente', () => {
    const input    = 'Vilão tinha mão cheia no rio.';
    const expected = 'Vilão tinha full house no river.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui virada por turn', () => {
    const input    = 'Na virada veio o Rei de Ouros.';
    const expected = 'Na turn veio o Rei de Ouros.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui botão do negociante por button', () => {
    const input    = 'Hero estava no botão do negociante com K♠Q♠.';
    const expected = 'Hero estava no button com K♠Q♠.';
    expect(normalizePokerLanguage(input)).toBe(expected);
  });

  it('substitui verificar (infinitivo) por dar check', () => {
    const input    = 'A decisão era verificar ou apostar.';
    const expected = 'A decisão era dar check ou apostar.';
    expect(normalizePokerLanguage(input)).toBe(expected);
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

  it('detecta rio com severity high', () => {
    const { isValid, issues } = validatePokerLanguage('O rio foi uma carta ruim.');
    expect(isValid).toBe(false);
    expect(issues.some(i => i.severity === 'high')).toBe(true);
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
});
