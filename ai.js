const AI_NAMES = ['Ali', 'Darius', 'Cyrus', 'Roxana', 'Parisa', 'Kaveh', 'Shirin', 'Babak'];
const AI_STYLES = {
  tight: { foldThreshold: 0.45, raiseThreshold: 0.75, bluffFreq: 0.05 },
  loose: { foldThreshold: 0.2, raiseThreshold: 0.6, bluffFreq: 0.15 },
  aggressive: { foldThreshold: 0.3, raiseThreshold: 0.55, bluffFreq: 0.2 },
  passive: { foldThreshold: 0.35, raiseThreshold: 0.85, bluffFreq: 0.02 }
};

function createAI(index, chips) {
  const styles = Object.keys(AI_STYLES);
  return {
    id: 'ai_' + index,
    name: AI_NAMES[index % AI_NAMES.length],
    chips: chips || 1000,
    isAI: true,
    style: styles[Math.floor(Math.random() * styles.length)]
  };
}

function getAIDecision(player, game) {
  const style = AI_STYLES[player.style];
  const toCall = game.currentBet - player.bet;
  const strength = assessStrength(player.cards, game.community);
  const potOdds = toCall > 0 ? toCall / (game.pot + toCall) : 0;
  const noise = (Math.random() - 0.5) * 0.2;
  const adj = Math.min(1, Math.max(0, strength + noise));

  if (toCall === 0) {
    if (adj > style.raiseThreshold || Math.random() < style.bluffFreq) {
      const amt = Math.max(game.currentBet + game.minRaise, Math.floor(game.pot * (0.5 + adj * 0.5)));
      return { action: 'raise', amount: Math.min(amt, player.chips + player.bet) };
    }
    return { action: 'check' };
  }

  if (adj < style.foldThreshold && potOdds > adj) {
    if (Math.random() < style.bluffFreq) {
      return { action: 'raise', amount: Math.min(Math.floor(game.pot * 0.6) + game.currentBet, player.chips + player.bet) };
    }
    return { action: 'fold' };
  }

  if (adj > style.raiseThreshold) {
    const amt = Math.max(game.currentBet + game.minRaise, Math.floor(game.pot * (0.5 + adj * 0.5)));
    return { action: 'raise', amount: Math.min(amt, player.chips + player.bet) };
  }

  return { action: 'call' };
}

function assessStrength(holeCards, community) {
  let highScore = 0, lowScore = 0;

  if (community.length >= 3) {
    const high = getBestHigh(holeCards, community);
    if (high) highScore = (high.category / 9) * 0.7 + (high.tiebreakers[0] / 14) * 0.3;
    const low = getBestLow(holeCards, community);
    if (low) lowScore = 1 - (Math.max(...low) - 1) / 7;
  } else {
    const cards = holeCards.map(parseCard);
    const lowCards = cards.filter(c => LOW_RANK_VALUES[c.rank] !== undefined);
    const uniqueLow = new Set(lowCards.map(c => LOW_RANK_VALUES[c.rank]));
    if (uniqueLow.size >= 2) {
      lowScore = 0.3 + (uniqueLow.has(1) ? 0.2 : 0) + (uniqueLow.has(2) ? 0.1 : 0);
    }
    const hasAce = cards.some(c => c.rank === 'A');
    const hasPair = cards.some((c, i) => cards.findIndex(x => x.rank === c.rank) !== i);
    const hasSuited = cards.some((c, i) => cards.filter(x => x.suit === c.suit).length >= 2);
    highScore = 0.2 + (hasAce ? 0.15 : 0) + (hasPair ? 0.15 : 0) + (hasSuited ? 0.1 : 0);
  }

  return (highScore + lowScore) / 2;
}
