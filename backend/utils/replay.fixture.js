// Simulação válida usada pelos testes de replay (não é um arquivo de teste).
export function makeValidSim() {
  return {
    heroHand: 'A♠K♦',
    narrative: 'Narrativa corrida da mão.',
    question: 'Qual é sua ação?',
    options: ['Fold', 'Check', 'Bet 3bb'],
    correct: 2,
    table: {
      seats: [
        { pos: 'UTG', stack: 98 }, { pos: 'HJ', stack: 120 }, { pos: 'CO', stack: 75 },
        { pos: 'BTN', stack: 100, hero: true }, { pos: 'SB', stack: 60 }, { pos: 'BB', stack: 91 },
      ],
    },
    replay: [
      { street: 'preflop', board: '', actor: 'SB',  action: 'post',  amount: 0.5, pot: 0.5, narration: 'SB posta o small blind.' },
      { street: 'preflop', board: '', actor: 'BB',  action: 'post',  amount: 1,   pot: 1.5, narration: 'BB posta o big blind.' },
      { street: 'preflop', board: '', actor: 'UTG', action: 'fold',  amount: 0,   pot: 1.5, narration: 'UTG folda.' },
      { street: 'preflop', board: '', actor: 'HJ',  action: 'fold',  amount: 0,   pot: 1.5, narration: 'HJ folda.' },
      { street: 'preflop', board: '', actor: 'CO',  action: 'fold',  amount: 0,   pot: 1.5, narration: 'CO folda.' },
      { street: 'preflop', board: '', actor: 'BTN', action: 'raise', amount: 2.5, pot: 4,   narration: 'Você dá raise para 2.5bb.' },
      { street: 'preflop', board: '', actor: 'SB',  action: 'fold',  amount: 0,   pot: 4,   narration: 'SB folda.' },
      { street: 'preflop', board: '', actor: 'BB',  action: 'call',  amount: 2.5, pot: 5.5, narration: 'BB paga.' },
      { street: 'flop', board: 'A♥7♣2♦', actor: null,  action: 'deal',     amount: 0, pot: 5.5, narration: 'Flop A♥7♣2♦.' },
      { street: 'flop', board: 'A♥7♣2♦', actor: 'BB',  action: 'check',    amount: 0, pot: 5.5, narration: 'BB dá check.' },
      { street: 'flop', board: 'A♥7♣2♦', actor: 'BTN', action: 'decision', amount: 0, pot: 5.5, narration: 'Sua vez.' },
    ],
  };
}
