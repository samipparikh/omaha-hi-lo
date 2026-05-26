class OnlineOmaha {
  constructor() {
    this.db = firebase.database();
    this.roomRef = null;
    this.roomCode = null;
    this.playerId = null;
    this.playerName = null;
    this.isHost = false;
    this.listeners = [];
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async createRoom(name) {
    this.roomCode = this.generateCode();
    this.playerName = name;
    this.playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    this.isHost = true;
    this.roomRef = this.db.ref('omaha-rooms/' + this.roomCode);

    await this.roomRef.set({
      host: this.playerId,
      state: 'lobby',
      settings: { smallBlind: 10, bigBlind: 20, startingChips: 1000 },
      players: {
        [this.playerId]: { name, chips: 1000, connected: true, isAI: false }
      },
      created: Date.now()
    });

    this.roomRef.child('players/' + this.playerId + '/connected').onDisconnect().set(false);
    return this.roomCode;
  }

  async joinRoom(code, name) {
    this.roomCode = code.toUpperCase();
    this.playerName = name;
    this.playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    this.roomRef = this.db.ref('omaha-rooms/' + this.roomCode);

    const snapshot = await this.roomRef.once('value');
    if (!snapshot.exists()) throw new Error('Room not found');

    const data = snapshot.val();
    if (data.state !== 'lobby') throw new Error('Game already in progress');

    const playerCount = Object.keys(data.players || {}).length;
    if (playerCount >= 9) throw new Error('Room is full');

    await this.roomRef.child('players/' + this.playerId).set({
      name, chips: data.settings.startingChips || 1000, connected: true, isAI: false
    });

    this.roomRef.child('players/' + this.playerId + '/connected').onDisconnect().set(false);
    return this.roomCode;
  }

  async addAI(chips) {
    if (!this.isHost) return;
    const snapshot = await this.roomRef.child('players').once('value');
    const players = snapshot.val() || {};
    const aiCount = Object.values(players).filter(p => p.isAI).length;
    const aiId = 'ai_' + aiCount;
    const ai = createAI(aiCount, chips || 1000);
    await this.roomRef.child('players/' + aiId).set({
      name: ai.name, chips: ai.chips, connected: true, isAI: true, style: ai.style
    });
  }

  async startGame() {
    if (!this.isHost) return;
    await this.roomRef.child('state').set('playing');
    await this.dealNewHand();
  }

  async dealNewHand() {
    const snapshot = await this.roomRef.once('value');
    const data = snapshot.val();
    const playerIds = Object.keys(data.players).filter(id => (data.players[id].chips || 0) > 0);

    if (playerIds.length < 2) {
      await this.roomRef.child('state').set('gameOver');
      return;
    }

    const deck = shuffle(createDeck());
    const dealerIdx = ((data.gameState?.dealerIdx ?? -1) + 1) % playerIds.length;
    const sbIdx = (dealerIdx + 1) % playerIds.length;
    const bbIdx = (dealerIdx + 2) % playerIds.length;

    const sb = data.settings?.smallBlind || 10;
    const bb = data.settings?.bigBlind || 20;

    const hands = {};
    const playerStates = {};

    for (let i = 0; i < playerIds.length; i++) {
      const pid = playerIds[i];
      const pData = data.players[pid];
      hands[pid] = [deck.pop(), deck.pop(), deck.pop(), deck.pop()];
      let bet = 0, chips = pData.chips;
      if (i === sbIdx) { bet = Math.min(sb, chips); chips -= bet; }
      if (i === bbIdx) { bet = Math.min(bb, chips); chips -= bet; }
      playerStates[pid] = { chips, bet, totalBet: bet, folded: false, allIn: chips === 0 };
    }

    const pot = (playerStates[playerIds[sbIdx]]?.bet || 0) + (playerStates[playerIds[bbIdx]]?.bet || 0);
    const utgIdx = (bbIdx + 1) % playerIds.length;

    await this.roomRef.child('gameState').set({
      phase: 'preflop',
      community: [],
      pot,
      currentBet: bb,
      minRaise: bb,
      dealerIdx,
      activeIdx: utgIdx,
      lastRaiserIdx: bbIdx,
      playerOrder: playerIds,
      playerStates,
      hands,
      deck: deck.slice(0, 20),
      history: [],
      lastResult: null
    });
  }

  async submitAction(action, amount) {
    const gs = (await this.roomRef.child('gameState').once('value')).val();
    if (!gs || gs.playerOrder[gs.activeIdx] !== this.playerId) return;

    const pid = this.playerId;
    const ps = gs.playerStates[pid];
    const toCall = gs.currentBet - ps.bet;

    let updates = {};
    let historyEntry = { name: this.playerName, action };

    switch (action) {
      case 'fold':
        updates[`playerStates/${pid}/folded`] = true;
        break;
      case 'check':
        if (toCall > 0) return;
        break;
      case 'call': {
        const amt = Math.min(toCall, ps.chips);
        updates[`playerStates/${pid}/chips`] = ps.chips - amt;
        updates[`playerStates/${pid}/bet`] = ps.bet + amt;
        updates[`playerStates/${pid}/totalBet`] = ps.totalBet + amt;
        updates[`playerStates/${pid}/allIn`] = ps.chips - amt === 0;
        updates['pot'] = gs.pot + amt;
        historyEntry.amount = amt;
        break;
      }
      case 'raise': {
        const target = Math.max(amount, gs.currentBet + gs.minRaise);
        const needed = target - ps.bet;
        const actual = Math.min(needed, ps.chips);
        updates[`playerStates/${pid}/chips`] = ps.chips - actual;
        updates[`playerStates/${pid}/bet`] = ps.bet + actual;
        updates[`playerStates/${pid}/totalBet`] = ps.totalBet + actual;
        updates[`playerStates/${pid}/allIn`] = ps.chips - actual === 0;
        updates['pot'] = gs.pot + actual;
        const newBet = ps.bet + actual;
        if (newBet > gs.currentBet) {
          updates['minRaise'] = newBet - gs.currentBet;
          updates['currentBet'] = newBet;
        }
        updates['lastRaiserIdx'] = gs.activeIdx;
        historyEntry.action = ps.chips - actual === 0 ? 'all-in' : 'raise';
        historyEntry.amount = actual;
        break;
      }
    }

    const history = gs.history || [];
    history.push(historyEntry);
    updates['history'] = history;

    const activePlayers = gs.playerOrder.filter(id => {
      if (id === pid && action === 'fold') return false;
      return !gs.playerStates[id].folded;
    });

    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      const winnerState = id === pid ? { ...gs.playerStates[winner] } : gs.playerStates[winner];
      updates[`playerStates/${winner}/chips`] = (updates[`playerStates/${winner}/chips`] ?? gs.playerStates[winner].chips) + (updates['pot'] ?? gs.pot);
      updates['pot'] = 0;
      updates['phase'] = 'showdown';
      updates['lastResult'] = { high: [{ name: gs.playerStates[winner] ? this.getPlayerName(winner) : winner, amount: gs.pot }], low: [], noLow: true };
      await this.roomRef.child('gameState').update(updates);
      return;
    }

    const nonAllIn = activePlayers.filter(id => {
      const s = id === pid ? { ...gs.playerStates[id], ...this.extractPlayerUpdates(updates, id) } : gs.playerStates[id];
      return !s.allIn && !s.folded;
    });

    let nextIdx = this.findNextActive(gs, gs.activeIdx, updates, action === 'fold' ? pid : null);
    const lastRaiser = updates['lastRaiserIdx'] ?? gs.lastRaiserIdx;

    if (nextIdx === -1 || nextIdx === lastRaiser || nonAllIn.length <= 1) {
      if (nonAllIn.length <= 1 && activePlayers.length > 1) {
        this.advanceToShowdown(gs, updates);
      } else {
        this.advancePhaseOnline(gs, updates);
      }
    } else {
      updates['activeIdx'] = nextIdx;
    }

    await this.roomRef.child('gameState').update(updates);
  }

  extractPlayerUpdates(updates, pid) {
    const result = {};
    for (const [key, val] of Object.entries(updates)) {
      if (key.startsWith(`playerStates/${pid}/`)) {
        const field = key.split('/').pop();
        result[field] = val;
      }
    }
    return result;
  }

  findNextActive(gs, fromIdx, updates, foldedId) {
    const order = gs.playerOrder;
    let idx = (fromIdx + 1) % order.length;
    let count = 0;
    while (count < order.length) {
      const pid = order[idx];
      const ps = { ...gs.playerStates[pid], ...this.extractPlayerUpdates(updates, pid) };
      if (pid === foldedId) { idx = (idx + 1) % order.length; count++; continue; }
      if (!ps.folded && !ps.allIn) return idx;
      idx = (idx + 1) % order.length;
      count++;
    }
    return -1;
  }

  advancePhaseOnline(gs, updates) {
    const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const phaseIdx = phases.indexOf(gs.phase);
    const nextPhase = phases[phaseIdx + 1];
    updates['phase'] = nextPhase;

    for (const pid of gs.playerOrder) {
      updates[`playerStates/${pid}/bet`] = 0;
    }
    updates['currentBet'] = 0;
    updates['minRaise'] = gs.minRaise;

    const deck = gs.deck || [];
    let community = [...(gs.community || [])];

    switch (nextPhase) {
      case 'flop':
        deck.shift();
        community.push(deck.shift(), deck.shift(), deck.shift());
        break;
      case 'turn':
        deck.shift();
        community.push(deck.shift());
        break;
      case 'river':
        deck.shift();
        community.push(deck.shift());
        break;
      case 'showdown':
        this.resolveShowdownOnline(gs, updates, community);
        return;
    }

    updates['community'] = community;
    updates['deck'] = deck;

    const first = this.findNextActive(gs, gs.dealerIdx, updates, null);
    if (first === -1) {
      this.resolveShowdownOnline(gs, updates, community);
      return;
    }
    updates['activeIdx'] = first;
    updates['lastRaiserIdx'] = first;
  }

  advanceToShowdown(gs, updates) {
    let community = [...(gs.community || [])];
    const deck = [...(gs.deck || [])];
    while (community.length < 5) { deck.shift(); community.push(deck.shift()); }
    updates['community'] = community;
    updates['deck'] = deck;
    this.resolveShowdownOnline(gs, updates, community);
  }

  resolveShowdownOnline(gs, updates, community) {
    updates['phase'] = 'showdown';
    const activePlayers = gs.playerOrder.filter(id => !(updates[`playerStates/${id}/folded`] ?? gs.playerStates[id].folded));

    const hands = {};
    for (const pid of activePlayers) {
      const cards = gs.hands[pid];
      hands[pid] = { high: getBestHigh(cards, community), low: getBestLow(cards, community) };
    }

    let bestHigh = null, highWinners = [];
    for (const pid of activePlayers) {
      const h = hands[pid].high;
      if (!bestHigh || compareHighHands(h, bestHigh) < 0) { bestHigh = h; highWinners = [pid]; }
      else if (compareHighHands(h, bestHigh) === 0) highWinners.push(pid);
    }

    let bestLow = null, lowWinners = [];
    for (const pid of activePlayers) {
      const l = hands[pid].low;
      if (!l) continue;
      if (!bestLow || compareLowHands(l, bestLow) < 0) { bestLow = l; lowWinners = [pid]; }
      else if (compareLowHands(l, bestLow) === 0) lowWinners.push(pid);
    }

    const pot = updates['pot'] ?? gs.pot;
    let highPot, lowPot;
    if (lowWinners.length > 0) { highPot = Math.floor(pot / 2); lowPot = pot - highPot; }
    else { highPot = pot; lowPot = 0; }

    const highShare = Math.floor(highPot / highWinners.length);
    for (const pid of highWinners) {
      const current = updates[`playerStates/${pid}/chips`] ?? gs.playerStates[pid].chips;
      updates[`playerStates/${pid}/chips`] = current + highShare;
    }

    if (lowWinners.length > 0) {
      const lowShare = Math.floor(lowPot / lowWinners.length);
      for (const pid of lowWinners) {
        const current = updates[`playerStates/${pid}/chips`] ?? gs.playerStates[pid].chips;
        updates[`playerStates/${pid}/chips`] = current + lowShare;
      }
    }

    updates['pot'] = 0;
    updates['lastResult'] = {
      high: highWinners.map(pid => ({ name: this.getPlayerName(pid), amount: highShare, hand: getHighHandName(hands[pid].high) })),
      low: lowWinners.map(pid => ({ name: this.getPlayerName(pid), amount: Math.floor(lowPot / lowWinners.length), hand: getLowDescription(hands[pid].low) })),
      noLow: lowWinners.length === 0,
      playerCards: Object.fromEntries(activePlayers.map(pid => [pid, gs.hands[pid]]))
    };
  }

  getPlayerName(pid) {
    return this._playerNames?.[pid] || pid;
  }

  onStateChange(callback) {
    if (!this.roomRef) return;
    const listener = this.roomRef.on('value', snap => {
      const data = snap.val();
      if (data) {
        this._playerNames = {};
        for (const [id, p] of Object.entries(data.players || {})) {
          this._playerNames[id] = p.name;
        }
        callback(data);
      }
    });
    this.listeners.push(listener);
  }

  async processAITurn(roomData) {
    if (!this.isHost) return;
    const gs = roomData.gameState;
    if (!gs || gs.phase === 'showdown') return;

    const activeId = gs.playerOrder[gs.activeIdx];
    const playerData = roomData.players[activeId];
    if (!playerData?.isAI) return;

    const ps = gs.playerStates[activeId];
    const decision = getAIDecision(
      { ...ps, cards: gs.hands[activeId], style: playerData.style },
      { currentBet: gs.currentBet, pot: gs.pot, minRaise: gs.minRaise, community: gs.community || [] }
    );

    // Simulate the action as host
    this.playerId = activeId;
    this.playerName = playerData.name;
    await this.submitAction(decision.action, decision.amount);
    this.playerId = Object.keys(roomData.players).find(id => !roomData.players[id].isAI && roomData.players[id].connected);
    this.playerName = roomData.players[this.playerId]?.name;
  }

  async leaveRoom() {
    if (this.roomRef && this.playerId) {
      await this.roomRef.child('players/' + this.playerId + '/connected').set(false);
    }
    this.listeners = [];
    this.roomRef = null;
  }
}
