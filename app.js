// Quadshif Omaha Hi-Lo - Main Application
(function() {
  const screens = {};
  let game = null;
  let online = null;
  let aiTimers = [];
  let myId = 'local_player';

  function init() {
    document.querySelectorAll('.screen').forEach(s => {
      screens[s.id.replace('-screen', '')] = s;
    });

    // Menu buttons
    document.getElementById('btn-single-player').addEventListener('click', () => showScreen('sp-setup'));
    document.getElementById('btn-play-online').addEventListener('click', () => showScreen('online'));
    document.getElementById('btn-rules').addEventListener('click', () => showScreen('rules'));
    document.getElementById('btn-back-rules').addEventListener('click', () => showScreen('menu'));
    document.getElementById('btn-back-sp').addEventListener('click', () => showScreen('menu'));
    document.getElementById('btn-back-online').addEventListener('click', () => showScreen('menu'));

    // Single player setup
    document.getElementById('sp-minus').addEventListener('click', () => adjustAI(-1));
    document.getElementById('sp-plus').addEventListener('click', () => adjustAI(1));
    document.getElementById('btn-start-sp').addEventListener('click', startSinglePlayer);

    // Online
    document.getElementById('btn-create-room').addEventListener('click', createOnlineRoom);
    document.getElementById('btn-join-room').addEventListener('click', () => {
      document.getElementById('join-code-group').style.display = 'block';
      document.getElementById('btn-confirm-join').style.display = 'block';
    });
    document.getElementById('btn-confirm-join').addEventListener('click', joinOnlineRoom);
    document.getElementById('btn-leave-room').addEventListener('click', leaveOnlineRoom);
    document.getElementById('btn-add-ai').addEventListener('click', addOnlineAI);
    document.getElementById('btn-start-online').addEventListener('click', startOnlineGame);

    // Game
    document.getElementById('btn-leave-game').addEventListener('click', leaveGame);
    document.getElementById('btn-next-hand').addEventListener('click', nextHand);
  }

  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(name + '-screen');
    if (el) el.classList.add('active');
  }

  function adjustAI(delta) {
    const el = document.getElementById('sp-ai-count');
    const val = Math.max(1, Math.min(8, parseInt(el.textContent) + delta));
    el.textContent = val;
  }

  // ============ SINGLE PLAYER ============

  function startSinglePlayer() {
    const name = document.getElementById('sp-name').value || 'Player';
    const aiCount = parseInt(document.getElementById('sp-ai-count').textContent);
    const chips = parseInt(document.getElementById('sp-chips').value);
    const mode = document.getElementById('sp-mode').value;

    game = new OmahaGame(mode);
    myId = 'local_player';
    game.addPlayer({ id: myId, name, chips });
    for (let i = 0; i < aiCount; i++) {
      const ai = createAI(i, chips);
      game.addPlayer(ai);
    }

    game.startHand();
    showScreen('game');
    const modeLabels = { hilo: 'Hi-Lo', high: 'High Only', low: 'Low Only' };
    document.getElementById('game-mode-badge').textContent = modeLabels[mode] || 'Hi-Lo';
    renderGame();
    scheduleAI();
  }

  function scheduleAI() {
    clearAITimers();
    if (game.state !== 'playing') return;
    const active = game.players[game.activeIdx];
    if (!active || !active.isAI) return;

    const delay = 800 + Math.random() * 1200;
    const timer = setTimeout(() => {
      if (game.state !== 'playing') return;
      const decision = getAIDecision(active, game);
      const result = game.doAction(game.activeIdx, decision.action, decision.amount);
      if (result.valid) {
        renderGame();
        if (result.handDone) {
          showResults();
        } else {
          scheduleAI();
        }
      }
    }, delay);
    aiTimers.push(timer);
  }

  function clearAITimers() {
    aiTimers.forEach(t => clearTimeout(t));
    aiTimers = [];
  }

  function nextHand() {
    document.getElementById('results-overlay').classList.remove('active');
    if (game.players.filter(p => p.chips > 0).length < 2) {
      alert('Game over! Not enough players with chips.');
      showScreen('menu');
      return;
    }
    game.startHand();
    renderGame();
    scheduleAI();
  }

  function leaveGame() {
    clearAITimers();
    if (online) { online.leaveRoom(); online = null; }
    showScreen('menu');
  }

  // ============ ONLINE ============

  async function createOnlineRoom() {
    const name = document.getElementById('online-player-name').value || 'Player';
    online = new OnlineOmaha();
    try {
      const code = await online.createRoom(name);
      myId = online.playerId;
      document.getElementById('lobby-room-code').textContent = code;
      document.getElementById('btn-add-ai').style.display = 'block';
      document.getElementById('btn-start-online').style.display = 'block';
      showScreen('lobby');
      online.onStateChange(onRoomUpdate);
    } catch (e) {
      document.getElementById('online-status').textContent = e.message;
    }
  }

  async function joinOnlineRoom() {
    const name = document.getElementById('online-player-name').value || 'Player';
    const code = document.getElementById('join-code-input').value;
    if (!code) { document.getElementById('online-status').textContent = 'Enter a room code'; return; }
    online = new OnlineOmaha();
    try {
      await online.joinRoom(code, name);
      myId = online.playerId;
      document.getElementById('lobby-room-code').textContent = code;
      document.getElementById('btn-add-ai').style.display = 'none';
      document.getElementById('btn-start-online').style.display = 'none';
      showScreen('lobby');
      online.onStateChange(onRoomUpdate);
    } catch (e) {
      document.getElementById('online-status').textContent = e.message;
    }
  }

  async function addOnlineAI() {
    if (online) await online.addAI(1000);
  }

  async function startOnlineGame() {
    if (online) await online.startGame();
  }

  function leaveOnlineRoom() {
    if (online) { online.leaveRoom(); online = null; }
    showScreen('menu');
  }

  let aiProcessing = false;
  function onRoomUpdate(data) {
    if (data.state === 'lobby') {
      renderLobby(data);
    } else if (data.state === 'playing' || data.state === 'gameOver') {
      showScreen('game');
      renderOnlineGame(data);
      // Process AI turns if host
      if (online.isHost && data.gameState && data.gameState.phase !== 'showdown' && !aiProcessing) {
        const activeId = data.gameState.playerOrder[data.gameState.activeIdx];
        if (data.players[activeId]?.isAI) {
          aiProcessing = true;
          setTimeout(async () => {
            await online.processAITurn(data);
            aiProcessing = false;
          }, 1000 + Math.random() * 1000);
        }
      }
    }
  }

  function renderLobby(data) {
    const container = document.getElementById('lobby-players');
    container.innerHTML = '';
    for (const [id, p] of Object.entries(data.players || {})) {
      const div = document.createElement('div');
      div.className = 'lobby-player' + (p.connected ? '' : ' disconnected');
      div.innerHTML = `<span class="lobby-player-name">${p.name}${p.isAI ? ' 🤖' : ''}</span><span class="lobby-player-chips">$${p.chips}</span>`;
      container.appendChild(div);
    }
  }

  function renderOnlineGame(data) {
    const gs = data.gameState;
    if (!gs) return;

    document.getElementById('game-phase').textContent = (gs.phase || '').toUpperCase();
    document.getElementById('game-pot').textContent = 'Pot: $' + (gs.pot || 0);

    // Community cards
    renderCommunityCards(gs.community || []);

    // My info
    const myState = gs.playerStates?.[myId];
    const myData = data.players?.[myId];
    if (myData && myState) {
      document.getElementById('my-name').textContent = myData.name;
      document.getElementById('my-chips').textContent = '$' + myState.chips;
    }

    // My hand
    const myCards = gs.hands?.[myId] || [];
    renderMyHand(myCards);

    // Opponents
    renderOpponents(gs, data, myId);

    // Actions
    renderOnlineActions(gs, myState);

    // History
    renderHistory(gs.history || []);

    // Results
    if (gs.phase === 'showdown' && gs.lastResult) {
      showOnlineResults(gs.lastResult);
    } else {
      document.getElementById('results-overlay').classList.remove('active');
    }
  }

  function renderOnlineActions(gs, myState) {
    const bar = document.getElementById('actions-bar');
    bar.innerHTML = '';

    if (!gs || gs.phase === 'showdown') {
      if (online?.isHost && gs?.phase === 'showdown') {
        document.getElementById('btn-next-hand').style.display = 'block';
        document.getElementById('btn-next-hand').onclick = async () => {
          document.getElementById('results-overlay').classList.remove('active');
          document.getElementById('btn-next-hand').style.display = 'none';
          await online.dealNewHand();
        };
      }
      return;
    }

    const isMyTurn = gs.playerOrder[gs.activeIdx] === myId;
    if (!isMyTurn || !myState || myState.folded || myState.allIn) {
      bar.innerHTML = `<span class="wait-msg">${myState?.allIn ? 'All in - waiting...' : myState?.folded ? 'Folded' : 'Waiting for your turn...'}</span>`;
      return;
    }

    const toCall = gs.currentBet - myState.bet;
    buildActionButtons(bar, toCall, myState.chips, gs.pot, gs.currentBet, gs.minRaise, myState.bet, (action, amount) => {
      online.submitAction(action, amount);
    });
  }

  function showOnlineResults(result) {
    const overlay = document.getElementById('results-overlay');
    overlay.classList.add('active');
    let html = '<div class="results-title">Hand Complete</div><div class="results-details">';
    if (result.high?.length > 0) {
      html += '<div><strong>High:</strong> ' + result.high.map(w => `<span class="winner">${w.name}</span> ${w.hand || ''} ($${w.amount})`).join(', ') + '</div>';
    }
    if (result.low?.length > 0) {
      html += '<div><strong>Low:</strong> ' + result.low.map(w => `<span class="winner">${w.name}</span> ${w.hand} ($${w.amount})`).join(', ') + '</div>';
    }
    if (result.noLow) html += '<div class="no-low">No qualifying low - high takes all</div>';
    html += '</div>';
    document.getElementById('results-content').innerHTML = html;
  }

  // ============ RENDERING (SINGLE PLAYER) ============

  function renderGame() {
    document.getElementById('game-phase').textContent = (game.phase || '').toUpperCase();
    document.getElementById('game-pot').textContent = 'Pot: $' + game.pot;

    renderCommunityCards(game.community);

    const me = game.players.find(p => p.id === myId);
    if (me) {
      document.getElementById('my-name').textContent = me.name;
      document.getElementById('my-chips').textContent = '$' + me.chips;
      renderMyHand(me.cards);
    }

    renderOpponentsSP();
    renderActionsSP();
    renderHistory(game.history);
  }

  function renderCommunityCards(cards) {
    const container = document.getElementById('community-cards');
    container.innerHTML = '';
    for (const c of cards) {
      container.appendChild(makeCard(c));
    }
  }

  function renderMyHand(cards) {
    const container = document.getElementById('my-hand');
    container.innerHTML = '';
    for (const c of cards) {
      container.appendChild(makeCard(c, 'my-card'));
    }
  }

  function makeCard(cardStr, extraClass = '') {
    const div = document.createElement('div');
    const red = isRed(cardStr);
    div.className = `card ${red ? 'red' : 'black'} ${extraClass}`;
    div.textContent = cardDisplay(cardStr);
    return div;
  }

  function makeCardBack() {
    const div = document.createElement('div');
    div.className = 'card card-back';
    return div;
  }

  function renderOpponentsSP() {
    const container = document.getElementById('opponents-row');
    container.innerHTML = '';
    const opponents = game.players.filter(p => p.id !== myId);

    for (let i = 0; i < opponents.length; i++) {
      const p = opponents[i];
      const el = document.createElement('div');
      el.className = `opponent ${p.folded ? 'folded' : ''} ${game.players.indexOf(p) === game.activeIdx ? 'active-turn' : ''}`;

      let cardsHtml = '';
      if (game.phase === 'showdown' && !p.folded) {
        cardsHtml = p.cards.map(c => `<span class="opp-card ${isRed(c) ? 'red' : 'black'}">${cardDisplay(c)}</span>`).join('');
      } else if (!p.folded) {
        cardsHtml = '<span class="opp-card back">?</span>'.repeat(4);
      }

      const badges = [];
      const pIdx = game.players.indexOf(p);
      if (pIdx === game.dealerIdx) badges.push('<span class="badge dealer">D</span>');
      const sbIdx = (game.dealerIdx + 1) % game.players.length;
      const bbIdx = (game.dealerIdx + 2) % game.players.length;
      if (pIdx === sbIdx) badges.push('<span class="badge sb">SB</span>');
      if (pIdx === bbIdx) badges.push('<span class="badge bb">BB</span>');

      el.innerHTML = `
        <div class="opp-cards">${cardsHtml}</div>
        <div class="opp-info">
          <span class="opp-name">${p.name}${p.isAI ? ' 🤖' : ''}</span>
          <span class="opp-chips">$${p.chips}</span>
          ${p.bet > 0 ? `<span class="opp-bet">Bet: $${p.bet}</span>` : ''}
          ${p.folded ? '<span class="opp-status">Folded</span>' : ''}
          ${p.allIn ? '<span class="opp-status allin">ALL IN</span>' : ''}
          ${badges.join('')}
        </div>
      `;
      container.appendChild(el);
    }
  }

  function renderActionsSP() {
    const bar = document.getElementById('actions-bar');
    bar.innerHTML = '';

    if (game.state !== 'playing') return;

    const me = game.players.find(p => p.id === myId);
    const isMyTurn = game.players[game.activeIdx]?.id === myId;

    if (!isMyTurn || me.folded || me.allIn) {
      bar.innerHTML = `<span class="wait-msg">${me.allIn ? 'All in - waiting...' : me.folded ? 'Folded' : 'Waiting...'}</span>`;
      return;
    }

    const toCall = game.currentBet - me.bet;
    buildActionButtons(bar, toCall, me.chips, game.pot, game.currentBet, game.minRaise, me.bet, (action, amount) => {
      const result = game.doAction(game.activeIdx, action, amount);
      if (result.valid) {
        renderGame();
        if (result.handDone) {
          showResults();
        } else {
          scheduleAI();
        }
      }
    });
  }

  function buildActionButtons(bar, toCall, chips, pot, currentBet, minRaise, myBet, onAction) {
    const foldBtn = document.createElement('button');
    foldBtn.className = 'btn-action fold';
    foldBtn.textContent = 'Fold';
    foldBtn.addEventListener('click', () => onAction('fold'));
    bar.appendChild(foldBtn);

    if (toCall === 0) {
      const checkBtn = document.createElement('button');
      checkBtn.className = 'btn-action check';
      checkBtn.textContent = 'Check';
      checkBtn.addEventListener('click', () => onAction('check'));
      bar.appendChild(checkBtn);
    } else {
      const callBtn = document.createElement('button');
      callBtn.className = 'btn-action call';
      callBtn.textContent = `Call $${Math.min(toCall, chips)}`;
      callBtn.addEventListener('click', () => onAction('call'));
      bar.appendChild(callBtn);
    }

    if (chips > toCall) {
      const raiseMin = currentBet + minRaise;

      const raiseDiv = document.createElement('div');
      raiseDiv.className = 'raise-group';

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'raise-input';
      input.min = raiseMin;
      input.max = chips + myBet;
      input.value = raiseMin;

      const raiseBtn = document.createElement('button');
      raiseBtn.className = 'btn-action raise';
      raiseBtn.textContent = 'Raise';
      raiseBtn.addEventListener('click', () => onAction('raise', parseInt(input.value)));

      const presets = document.createElement('div');
      presets.className = 'presets';
      [['Min', raiseMin], ['½P', Math.max(raiseMin, Math.floor(pot/2) + currentBet)], ['Pot', Math.max(raiseMin, pot + currentBet)]].forEach(([label, val]) => {
        const btn = document.createElement('button');
        btn.className = 'btn-preset';
        btn.textContent = label;
        btn.addEventListener('click', () => { input.value = Math.min(val, chips + myBet); });
        presets.appendChild(btn);
      });

      raiseDiv.appendChild(input);
      raiseDiv.appendChild(raiseBtn);
      raiseDiv.appendChild(presets);
      bar.appendChild(raiseDiv);
    }

    const allInBtn = document.createElement('button');
    allInBtn.className = 'btn-action allin';
    allInBtn.textContent = `All In $${chips}`;
    allInBtn.addEventListener('click', () => onAction('allin'));
    bar.appendChild(allInBtn);
  }

  function renderHistory(history) {
    const panel = document.getElementById('history-panel');
    const list = document.getElementById('history-list');
    if (!history || history.length === 0) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    list.innerHTML = history.slice(-12).map(h => `<div class="history-entry">${h.name}: ${h.action}${h.amount ? ' $' + h.amount : ''}</div>`).join('');
    list.scrollTop = list.scrollHeight;
  }

  function showResults() {
    if (!game.lastResult) return;
    const overlay = document.getElementById('results-overlay');
    overlay.classList.add('active');

    const r = game.lastResult;
    const modeLabel = r.mode === 'high' ? 'High Only' : r.mode === 'low' ? 'Low Only' : 'Hi-Lo';
    let html = `<div class="results-title">Hand Complete <span class="mode-tag">${modeLabel}</span></div><div class="results-details">`;
    if (r.high?.length > 0) {
      const label = r.mode === 'hilo' ? 'High' : 'Winner';
      html += `<div><strong>${label}:</strong> ` + r.high.map(w => `<span class="winner">${w.name}</span> ${w.hand || ''} ($${w.amount})`).join(', ') + '</div>';
    }
    if (r.low?.length > 0) {
      const label = r.mode === 'hilo' ? 'Low' : 'Winner';
      html += `<div><strong>${label}:</strong> ` + r.low.map(w => `<span class="winner">${w.name}</span> ${w.hand} ($${w.amount})`).join(', ') + '</div>';
    }
    if (r.noLow && r.mode === 'hilo') html += '<div class="no-low">No qualifying low - high takes all</div>';
    if (r.noLow && r.mode === 'low') html += '<div class="no-low">No qualifying low - high hand wins as fallback</div>';
    html += '</div>';
    document.getElementById('results-content').innerHTML = html;
    document.getElementById('btn-next-hand').style.display = 'block';
  }

  init();
})();
