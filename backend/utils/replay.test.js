import { describe, it, expect } from 'vitest';
import { validateReplay, applyReplay } from './replay.js';
import { makeValidSim } from './replay.fixture.js';

describe('validateReplay', () => {
  it('aceita uma simulação válida', () => {
    expect(validateReplay(makeValidSim())).toEqual({ ok: true, reason: null });
  });

  it('rejeita sem table/replay', () => {
    const sim = makeValidSim();
    delete sim.table;
    expect(validateReplay(sim).ok).toBe(false);
  });

  it('rejeita 5 assentos', () => {
    const sim = makeValidSim();
    sim.table.seats.pop();
    expect(validateReplay(sim)).toMatchObject({ ok: false, reason: expect.stringMatching(/6 assentos/) });
  });

  it('rejeita posição duplicada ou desconhecida', () => {
    const dup = makeValidSim();
    dup.table.seats[0].pos = 'HJ';
    expect(validateReplay(dup).ok).toBe(false);
    const bad = makeValidSim();
    bad.table.seats[0].pos = 'MP';
    expect(validateReplay(bad).ok).toBe(false);
  });

  it('rejeita dois heroes e nenhum hero', () => {
    const two = makeValidSim();
    two.table.seats[0].hero = true;
    expect(validateReplay(two)).toMatchObject({ ok: false, reason: expect.stringMatching(/hero/) });
    const none = makeValidSim();
    delete none.table.seats[3].hero;
    expect(validateReplay(none)).toMatchObject({ ok: false, reason: expect.stringMatching(/hero/) });
  });

  it('rejeita action fora do enum', () => {
    const sim = makeValidSim();
    sim.replay[2].action = 'muck';
    expect(validateReplay(sim)).toMatchObject({ ok: false, reason: expect.stringMatching(/action/) });
  });

  it('rejeita actor inexistente e deal com actor', () => {
    const ghost = makeValidSim();
    ghost.replay[2].actor = 'MP';
    expect(validateReplay(ghost).ok).toBe(false);
    const deal = makeValidSim();
    deal.replay[8].actor = 'BB';
    expect(validateReplay(deal)).toMatchObject({ ok: false, reason: expect.stringMatching(/deal/) });
  });

  it('rejeita amount/pot não numéricos', () => {
    const sim = makeValidSim();
    sim.replay[5].amount = '2.5';
    expect(validateReplay(sim).ok).toBe(false);
  });

  it('rejeita quando o último passo não é decision do hero', () => {
    const noDecision = makeValidSim();
    noDecision.replay.pop();
    expect(validateReplay(noDecision)).toMatchObject({ ok: false, reason: expect.stringMatching(/último passo/) });
    const villain = makeValidSim();
    villain.replay.at(-1).actor = 'BB';
    expect(validateReplay(villain).ok).toBe(false);
  });

  it('rejeita decision antes do último passo', () => {
    const sim = makeValidSim();
    sim.replay[3].action = 'decision';
    expect(validateReplay(sim)).toMatchObject({ ok: false, reason: expect.stringMatching(/decision/) });
  });

  it('rejeita menos de 6 ou mais de 20 passos', () => {
    const short = makeValidSim();
    short.replay = short.replay.slice(-5);
    expect(validateReplay(short).ok).toBe(false);
    const long = makeValidSim();
    const fold = { street: 'preflop', board: '', actor: 'UTG', action: 'fold', amount: 0, pot: 1.5, narration: 'x' };
    long.replay = [...Array(20).fill(fold), long.replay.at(-1)];
    expect(validateReplay(long).ok).toBe(false);
  });
});

describe('applyReplay', () => {
  it('mantém replay válido e normaliza a narração de cada passo', () => {
    const sim = makeValidSim();
    sim.replay[2].narration = 'No fracasso o grande cego pensou.';
    expect(applyReplay(sim, 'teste')).toBe(true);
    expect(sim.replay[2].narration).toBe('No flop o big blind pensou.');
    expect(sim.table).toBeDefined();
  });

  it('remove table e replay quando inválido e retorna false', () => {
    const sim = makeValidSim();
    sim.replay.pop();
    expect(applyReplay(sim, 'teste')).toBe(false);
    expect(sim.replay).toBeUndefined();
    expect(sim.table).toBeUndefined();
    expect(sim.narrative).toBe('Narrativa corrida da mão.');
  });

  it('retorna false quando a IA não mandou replay', () => {
    const sim = makeValidSim();
    delete sim.replay;
    delete sim.table;
    expect(applyReplay(sim, 'teste')).toBe(false);
  });

  it('retorna false para sim ausente', () => {
    expect(applyReplay(undefined, 'teste')).toBe(false);
  });
});
