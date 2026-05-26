const SUITS = ['h', 'd', 'c', 's'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
const LOW_RANK_VALUES = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8 };
const SUIT_SYMBOLS = { h: '♥', d: '♦', c: '♣', s: '♠' };
const HIGH_HAND_NAMES = ['High Card', 'One Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseCard(str) {
  return { rank: str[0], suit: str[1] };
}

function cardDisplay(str) {
  const c = parseCard(str);
  const r = c.rank === 'T' ? '10' : c.rank;
  return r + SUIT_SYMBOLS[c.suit];
}

function isRed(str) {
  return str[1] === 'h' || str[1] === 'd';
}

function getCombinations(arr, k) {
  const results = [];
  function combine(start, combo) {
    if (combo.length === k) { results.push([...combo]); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  combine(0, []);
  return results;
}

function evaluateHighHand(fiveCards) {
  const cards = fiveCards.map(parseCard);
  const ranks = cards.map(c => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);

  let isStraight = false, straightHigh = 0;
  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) { isStraight = true; straightHigh = uniqueRanks[0]; }
    if (uniqueRanks[0] === 14 && uniqueRanks[1] === 5 && uniqueRanks[4] === 2) { isStraight = true; straightHigh = 5; }
  }

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([rank, count]) => ({ rank: parseInt(rank), count })).sort((a, b) => b.count - a.count || b.rank - a.rank);

  let category, tiebreakers;

  if (isStraight && isFlush) {
    category = straightHigh === 14 ? 9 : 8;
    tiebreakers = [straightHigh];
  } else if (groups[0].count === 4) {
    category = 7;
    tiebreakers = [groups[0].rank, groups[1].rank];
  } else if (groups[0].count === 3 && groups[1].count === 2) {
    category = 6;
    tiebreakers = [groups[0].rank, groups[1].rank];
  } else if (isFlush) {
    category = 5;
    tiebreakers = ranks;
  } else if (isStraight) {
    category = 4;
    tiebreakers = [straightHigh];
  } else if (groups[0].count === 3) {
    category = 3;
    tiebreakers = [groups[0].rank, ...groups.slice(1).map(g => g.rank)];
  } else if (groups[0].count === 2 && groups[1].count === 2) {
    category = 2;
    const pairs = groups.filter(g => g.count === 2).map(g => g.rank).sort((a, b) => b - a);
    tiebreakers = [...pairs, groups.find(g => g.count === 1).rank];
  } else if (groups[0].count === 2) {
    category = 1;
    tiebreakers = [groups[0].rank, ...groups.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a)];
  } else {
    category = 0;
    tiebreakers = ranks;
  }

  return { category, tiebreakers };
}

function compareHighHands(a, b) {
  if (a.category !== b.category) return b.category - a.category;
  for (let i = 0; i < Math.min(a.tiebreakers.length, b.tiebreakers.length); i++) {
    if (a.tiebreakers[i] !== b.tiebreakers[i]) return b.tiebreakers[i] - a.tiebreakers[i];
  }
  return 0;
}

function evaluateLowHand(fiveCards) {
  const cards = fiveCards.map(parseCard);
  const ranks = cards.map(c => LOW_RANK_VALUES[c.rank]);
  if (ranks.includes(undefined)) return null;
  const unique = [...new Set(ranks)];
  if (unique.length !== 5) return null;
  if (Math.max(...unique) > 8) return null;
  return unique.sort((a, b) => b - a);
}

function compareLowHands(a, b) {
  for (let i = 0; i < 5; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function getBestHigh(holeCards, communityCards) {
  const holeCombos = getCombinations(holeCards, 2);
  const commCombos = getCombinations(communityCards, 3);
  let best = null;
  for (const hole of holeCombos) {
    for (const comm of commCombos) {
      const ev = evaluateHighHand([...hole, ...comm]);
      if (!best || compareHighHands(ev, best) < 0) best = ev;
    }
  }
  return best;
}

function getBestLow(holeCards, communityCards) {
  const holeCombos = getCombinations(holeCards, 2);
  const commCombos = getCombinations(communityCards, 3);
  let best = null;
  for (const hole of holeCombos) {
    for (const comm of commCombos) {
      const ev = evaluateLowHand([...hole, ...comm]);
      if (ev && (!best || compareLowHands(ev, best) < 0)) best = ev;
    }
  }
  return best;
}

function getHighHandName(evaluation) {
  return HIGH_HAND_NAMES[evaluation.category];
}

function getLowDescription(lowValue) {
  if (!lowValue) return 'No qualifying low';
  return lowValue.join('-') + ' low';
}

class OmahaGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = [];
    this.deck = [];
    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = 20;
    this.phase = null;
    this.dealerIdx = -1;
    this.activeIdx = -1;
    this.lastRaiserIdx = -1;
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.history = [];
    this.lastResult = null;
    this.state = 'waiting';
  }

  addPlayer(player) {
    this.players.push({
      id: player.id,
      name: player.name,
      chips: player.chips || 1000,
      cards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      isAI: player.isAI || false,
      style: player.style || null
    });
  }

  startHand() {
    if (this.players.filter(p => p.chips > 0).length < 2) return false;

    this.community = [];
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.history = [];
    this.lastResult = null;
    this.state = 'playing';

    this.deck = shuffle(createDeck());

    for (const p of this.players) {
      p.cards = [];
      p.bet = 0;
      p.totalBet = 0;
      p.folded = p.chips <= 0;
      p.allIn = false;
    }

    this.dealerIdx = this.nextActive(this.dealerIdx);
    this.dealCards();
    this.postBlinds();
    this.phase = 'preflop';

    const bbIdx = this.nextActive(this.nextActive(this.dealerIdx));
    this.activeIdx = this.nextActive(bbIdx);
    this.lastRaiserIdx = bbIdx;

    return true;
  }

  dealCards() {
    for (const p of this.players) {
      if (!p.folded) {
        p.cards = [this.deck.pop(), this.deck.pop(), this.deck.pop(), this.deck.pop()];
      }
    }
  }

  postBlinds() {
    const sbIdx = this.nextActive(this.dealerIdx);
    const bbIdx = this.nextActive(sbIdx);
    this.placeBet(sbIdx, Math.min(this.smallBlind, this.players[sbIdx].chips));
    this.placeBet(bbIdx, Math.min(this.bigBlind, this.players[bbIdx].chips));
    this.currentBet = this.bigBlind;
  }

  nextActive(from) {
    let idx = (from + 1) % this.players.length;
    let count = 0;
    while (count < this.players.length) {
      if (!this.players[idx].folded && !this.players[idx].allIn && this.players[idx].chips > 0) return idx;
      idx = (idx + 1) % this.players.length;
      count++;
    }
    return -1;
  }

  placeBet(idx, amount) {
    const p = this.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet += actual;
    p.totalBet += actual;
    this.pot += actual;
    if (p.chips === 0) p.allIn = true;
    return actual;
  }

  getActivePlayers() { return this.players.filter(p => !p.folded); }
  getActiveNonAllIn() { return this.players.filter(p => !p.folded && !p.allIn); }

  doAction(playerIdx, action, amount) {
    const p = this.players[playerIdx];
    if (p.folded || p.allIn) return { valid: false };

    const toCall = this.currentBet - p.bet;

    switch (action) {
      case 'fold':
        p.folded = true;
        this.history.push({ name: p.name, action: 'fold' });
        break;
      case 'check':
        if (toCall > 0) return { valid: false };
        this.history.push({ name: p.name, action: 'check' });
        break;
      case 'call':
        const called = this.placeBet(playerIdx, toCall);
        this.history.push({ name: p.name, action: 'call', amount: called });
        break;
      case 'raise': {
        const target = Math.max(amount, this.currentBet + this.minRaise);
        const needed = target - p.bet;
        if (needed >= p.chips) {
          const allIn = this.placeBet(playerIdx, p.chips);
          if (p.bet > this.currentBet) { this.minRaise = p.bet - this.currentBet; this.currentBet = p.bet; }
          this.lastRaiserIdx = playerIdx;
          this.history.push({ name: p.name, action: 'all-in', amount: allIn });
        } else {
          this.placeBet(playerIdx, needed);
          this.minRaise = target - this.currentBet;
          this.currentBet = target;
          this.lastRaiserIdx = playerIdx;
          this.history.push({ name: p.name, action: 'raise', amount: target });
        }
        break;
      }
      case 'allin': {
        const allIn = this.placeBet(playerIdx, p.chips);
        if (p.bet > this.currentBet) { this.minRaise = p.bet - this.currentBet; this.currentBet = p.bet; }
        this.lastRaiserIdx = playerIdx;
        this.history.push({ name: p.name, action: 'all-in', amount: allIn });
        break;
      }
      default: return { valid: false };
    }

    if (this.getActivePlayers().length === 1) {
      this.awardToLast();
      return { valid: true, handDone: true };
    }

    const next = this.nextActive(playerIdx);
    if (next === -1 || next === this.lastRaiserIdx || this.getActiveNonAllIn().length <= 1) {
      if (this.getActiveNonAllIn().length <= 1 && this.getActivePlayers().length > 1) {
        this.dealRemaining();
        this.showdown();
        return { valid: true, handDone: true };
      }
      this.advancePhase();
      return { valid: true, phaseAdvanced: true, handDone: this.phase === 'showdown' };
    }

    this.activeIdx = next;
    return { valid: true };
  }

  advancePhase() {
    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const idx = phases.indexOf(this.phase);
    this.phase = phases[idx + 1];

    for (const p of this.players) p.bet = 0;
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

    switch (this.phase) {
      case 'flop':
        this.deck.pop();
        this.community.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
        break;
      case 'turn':
        this.deck.pop();
        this.community.push(this.deck.pop());
        break;
      case 'river':
        this.deck.pop();
        this.community.push(this.deck.pop());
        break;
      case 'showdown':
        this.showdown();
        return;
    }

    const first = this.nextActive(this.dealerIdx);
    if (first === -1) { this.showdown(); return; }
    this.activeIdx = first;
    this.lastRaiserIdx = first;
  }

  dealRemaining() {
    while (this.community.length < 5) {
      this.deck.pop();
      this.community.push(this.deck.pop());
    }
  }

  awardToLast() {
    const winner = this.getActivePlayers()[0];
    winner.chips += this.pot;
    this.lastResult = {
      high: [{ name: winner.name, amount: this.pot }],
      low: [],
      noLow: true,
      hands: {}
    };
    this.pot = 0;
    this.state = 'handDone';
    this.phase = 'showdown';
  }

  showdown() {
    const active = this.getActivePlayers();
    const hands = {};

    for (const p of active) {
      hands[p.id] = {
        high: getBestHigh(p.cards, this.community),
        low: getBestLow(p.cards, this.community),
        cards: p.cards
      };
    }

    const highWinners = this.findHighWinners(active, hands);
    const lowWinners = this.findLowWinners(active, hands);

    let highPot, lowPot;
    if (lowWinners.length > 0) {
      highPot = Math.floor(this.pot / 2);
      lowPot = this.pot - highPot;
    } else {
      highPot = this.pot;
      lowPot = 0;
    }

    const highShare = Math.floor(highPot / highWinners.length);
    const highRem = highPot - highShare * highWinners.length;
    for (let i = 0; i < highWinners.length; i++) {
      highWinners[i].chips += highShare + (i === 0 ? highRem : 0);
    }

    if (lowWinners.length > 0) {
      const lowShare = Math.floor(lowPot / lowWinners.length);
      const lowRem = lowPot - lowShare * lowWinners.length;
      for (let i = 0; i < lowWinners.length; i++) {
        lowWinners[i].chips += lowShare + (i === 0 ? lowRem : 0);
      }
    }

    this.lastResult = {
      high: highWinners.map(p => ({
        name: p.name,
        amount: highShare,
        hand: getHighHandName(hands[p.id].high)
      })),
      low: lowWinners.map(p => ({
        name: p.name,
        amount: Math.floor(lowPot / lowWinners.length),
        hand: getLowDescription(hands[p.id].low)
      })),
      noLow: lowWinners.length === 0,
      hands
    };

    this.pot = 0;
    this.state = 'handDone';
    this.phase = 'showdown';
  }

  findHighWinners(players, hands) {
    let best = null, winners = [];
    for (const p of players) {
      const h = hands[p.id].high;
      if (!best || compareHighHands(h, best) < 0) { best = h; winners = [p]; }
      else if (compareHighHands(h, best) === 0) winners.push(p);
    }
    return winners;
  }

  findLowWinners(players, hands) {
    let best = null, winners = [];
    for (const p of players) {
      const l = hands[p.id].low;
      if (!l) continue;
      if (!best || compareLowHands(l, best) < 0) { best = l; winners = [p]; }
      else if (compareLowHands(l, best) === 0) winners.push(p);
    }
    return winners;
  }
}
