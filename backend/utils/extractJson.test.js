import { describe, it, expect } from 'vitest';
import { extractJson } from './extractJson.js';

describe('extractJson', () => {
  it('parseia JSON direto', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('extrai de markdown fence json', () => {
    expect(extractJson('```json\n{"b":2}\n```')).toEqual({ b: 2 });
  });

  it('extrai de markdown fence sem especificador', () => {
    expect(extractJson('```\n{"c":3}\n```')).toEqual({ c: 3 });
  });

  it('extrai JSON com texto antes e depois', () => {
    expect(extractJson('Aqui vai o JSON: {"d":4} e texto depois')).toEqual({ d: 4 });
  });

  it('extrai JSON com quebras de linha no valor', () => {
    const obj = { theory: 'linha1\nlinha2', keyPoints: ['p1', 'p2'] };
    expect(extractJson(JSON.stringify(obj))).toEqual(obj);
  });

  it('extrai objeto aninhado complexo', () => {
    const obj = { quiz: { easy: [{ question: 'q?', correct: 0 }] } };
    expect(extractJson(JSON.stringify(obj))).toEqual(obj);
  });

  it('retorna null para texto sem JSON', () => {
    expect(extractJson('isso não é json')).toBeNull();
  });

  it('retorna null para string vazia', () => {
    expect(extractJson('')).toBeNull();
  });

  it('retorna null para JSON mal formado', () => {
    expect(extractJson('{ sem fecha')).toBeNull();
  });

  it('prefere parse direto ao invés de fence quando ambos válidos', () => {
    const direct = '{"source":"direct"}';
    expect(extractJson(direct)).toEqual({ source: 'direct' });
  });

  it('extrai da fence quando JSON direto falha', () => {
    const text = 'texto inválido ```json\n{"source":"fence"}\n``` mais texto';
    expect(extractJson(text)).toEqual({ source: 'fence' });
  });
});
