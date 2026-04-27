// glossary.js — Dicionário de termos de poker com tooltips

const GLOSSARY = {
  'GTO': 'Game Theory Optimal — estratégia matematicamente impossível de explorar.',
  'EV': 'Expected Value (Valor Esperado) — lucro médio esperado de uma ação ao longo do tempo.',
  'Pot Odds': 'Relação entre o tamanho do pote e o custo de uma call.',
  'Equity': 'Porcentagem de chance de ganhar a mão no showdown.',
  'Range': 'O conjunto de todas as mãos possíveis que um jogador pode ter em determinada situação.',
  'C-Bet': 'Continuation Bet — aposta feita pelo pré-flop aggressor no flop.',
  'VPIP': 'Voluntarily Put money In Pot — % de mãos em que o jogador entra voluntariamente.',
  'PFR': 'Pre-Flop Raise — % de mãos em que o jogador faz raise pré-flop.',
  'ICM': 'Independent Chip Model — modelo que converte fichas em valor monetário em torneios.',
  'SPR': 'Stack-to-Pot Ratio — relação entre o stack efetivo e o tamanho do pote.',
  'MDF': 'Minimum Defense Frequency — frequência mínima para não ser explorado por blefes.',
  'Fold Equity': 'Valor adicional de uma aposta proveniente da chance do oponente dobrar.',
  'Blocker': 'Carta na sua mão que reduz as combinações de certas mãos do oponente.',
  'Polarizado': 'Range composto por mãos muito fortes e blefes, sem meio-termo.',
  'Linear': 'Range composto por mãos fortes de forma contínua (sem blefes puros).',
  'Nut': 'A melhor mão possível dado o board.',
  'Overbet': 'Aposta maior que o tamanho do pote.',
  'Donk Bet': 'Aposta feita pelo não-agressor (quem não fez raise pré-flop) no flop.',
  'Float': 'Chamar uma aposta com mão fraca planejando roubar o pote numa rua futura.',
  'Semi-Bluff': 'Blefe com uma mão que tem outs para melhorar (ex: draw).',
  'Board': 'As cartas comunitárias na mesa (flop + turn + river).',
  'Flop': 'As três primeiras cartas comunitárias reveladas.',
  'Turn': 'A quarta carta comunitária.',
  'River': 'A quinta e última carta comunitária.',
  'BTN': 'Button — melhor posição pós-flop; age por último em todas as ruas.',
  'BB': 'Big Blind — posição que posta a aposta grande forçada.',
  'SB': 'Small Blind — posição que posta metade da aposta grande.',
  'UTG': 'Under the Gun — primeira posição a agir pré-flop (pior posição).',
  'CO': 'Cutoff — segunda melhor posição, à direita do BTN.',
  'HJ': 'Hijack — terceira posição a partir do BTN.',
  'OESD': 'Open-Ended Straight Draw — 8 outs para completar a sequência por qualquer ponta.',
  'Gutshot': 'Straight draw interno — 4 outs para completar a sequência pelo meio.',
  'Slow Play': 'Jogar mão muito forte de forma passiva para disfarçar sua força.',
  'Value Bet': 'Aposta feita com mão forte esperando ser chamado por mãos piores.',
  'Bluff': 'Aposta feita com mão fraca esperando o oponente dobrar.',
  'Check-Raise': 'Checar e depois re-raise quando o oponente aposta.',
  'Downswing': 'Período de resultados negativos causado por má sorte ou erro.',
  'Winrate': 'Taxa de lucro, geralmente medida em bb/100 mãos.',
  'Squeeze': '3-bet feito em posição com caller(s) entre você e o raiser original.',
};

export function applyGlossary(text) {
  if (!text) return text;
  // Sort longest terms first to avoid partial matches (e.g. "Pot Odds" before "Odds")
  const terms   = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\w♠♥♦♣-])(${escaped.join('|')})(?![\\w-])`, 'g');
  return text.replace(pattern, (match) => {
    const def = GLOSSARY[match];
    if (!def) return match;
    return `<span class="gl-term" tabindex="0" data-tip="${def.replace(/"/g, '&quot;')}">${match}</span>`;
  });
}
