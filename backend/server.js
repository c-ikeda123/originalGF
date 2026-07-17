const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const {
  applyAilment,
  areEnemies,
  combineAttackCards,
  cureAilments,
  clearFieldIfCurrent,
  createAttackQueue,
  createCounterAttackCard,
  createDyingAttackCard,
  createInitialHand,
  createMoonAssistantAttack,
  getAssistantAction,
  getEarthArtifactMode,
  getNextAlivePlayerId,
  getWinningSide,
  isDefenseCard,
  processEndOfTurnAilments,
  resolveDamageSequence,
  resolveDefenseCard,
  rollAttack,
  shouldAssistantAct,
  shouldAssistantLeave,
  validateCardPlay,
} = require('./gameRules');

const app = express();
app.use(cors());

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(frontendDist, 'index.html'));
  }
  next();
});

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 10 * 1024 * 1024,
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const GF_BASE_CARDS = require('../shared/baseCards.json');
const FLASH_SOUNDS = new Set(require('../shared/flashSounds.json'));
const { normalizeBaseCardEdit, normalizeBaseCardEdits } = require('./baseCardEdits');

// Stores active rooms
// rooms[roomName] = { players: { socketId: { name, ready, ...gameState } }, state: 'waiting' | 'playing' }
const rooms = {};

function addSoundEvent(room, name, { targetId = null, delayMs = 0 } = {}) {
  if (!FLASH_SOUNDS.has(name)) return;
  room.soundSeq = (room.soundSeq || 0) + 1;
  room.soundEvents = [...(room.soundEvents || []), {
    id: room.soundSeq,
    name,
    targetId,
    delayMs,
  }].slice(-60);
}

function addAscensionEvent(room, player) {
  room.ascensionSeq = (room.ascensionSeq || 0) + 1;
  room.ascensionEvents = [...(room.ascensionEvents || []), {
    id: room.ascensionSeq,
    playerId: player.id,
    playerName: player.name,
    timestamp: Date.now(),
  }].slice(-20);
}

function addEffectEvent(room, type, player, amount = 0, details = {}) {
  room.effectSeq = (room.effectSeq || 0) + 1;
  room.effectEvents = [...(room.effectEvents || []), {
    id: room.effectSeq,
    type,
    playerId: player?.id || null,
    playerName: player?.name || '',
    amount,
    ...details,
  }].slice(-60);
}

const AILMENT_EFFECT_TYPES = {
  cold: 'cold', fever: 'fever', hell: 'hell', heaven: 'heaven',
  fog: 'fog', flash: 'glory', dream: 'illusion', darkcloud: 'dark_cloud',
};

function addAilmentEffect(room, player, ailment) {
  const type = AILMENT_EFFECT_TYPES[ailment];
  if (type) addEffectEvent(room, type, player, 0, { label: ailment });
}

function increasePlayerStat(room, player, stat, amount, { sound = true } = {}) {
  const before = player[stat] || 0;
  player[stat] = Math.min(99, before + Math.max(0, amount));
  const increased = player[stat] - before;
  if (increased <= 0) return 0;
  const effectTypes = { hp: 'hp_increase', mp: 'mp_increase', money: 'yen_increase' };
  addEffectEvent(room, effectTypes[stat], player, increased);
  if (sound) addSoundEvent(room, effectTypes[stat]);
  return increased;
}

function emitRoomUpdate(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  io.to(roomName).emit('roomUpdate', {
    hostId: room.hostId,
    state: room.state,
    players: Object.values(room.players).map(player => ({
      id: player.id, name: player.name, ready: player.ready, team: player.team || null, isBot: Boolean(player.isBot),
    })),
    spectators: Object.values(room.spectators || {}).map(spectator => ({ id: spectator.id, name: spectator.name })),
    chatMessages: (room.chatMessages || []).filter(message => !message.teamOnly),
    timeLimitSeconds: room.timeLimitSeconds || 0,
  });
}

function emitBaseEditorState(roomName) {
  const room = rooms[roomName];
  if (!room || room.state !== 'waiting') return;
  const locks = Object.fromEntries(Object.entries(room.editLocks).map(([cardId, ownerId]) => [cardId, {
    ownerId,
    ownerName: room.players[ownerId]?.name || 'Unknown',
  }]));
  io.to(roomName).emit('baseEditorState', { edits: room.baseCardsEdits, locks });
}


io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinRoom', ({ password, playerName, role = 'player', customCards = [], baseCardsEdits = {} }) => {
    let room = rooms[password];
    if (room && room.state !== 'waiting' && role !== 'spectator') {
      socket.emit('errorMsg', '対戦中の部屋にはプレイヤーとして参加できません。');
      return;
    }
    if (!room && role === 'spectator') {
      socket.emit('errorMsg', '観戦する部屋が見つかりません。');
      return;
    }
    if (!room) {
      room = {
        name: password,
        players: {},
        spectators: {},
        hostId: socket.id,
        baseCardsEdits: normalizeBaseCardEdits(GF_BASE_CARDS, baseCardsEdits),
        editLocks: {},
        customCards: [...customCards],
        state: 'waiting', // waiting, playing, ended
        turn: null, // socket.id of the active player
        phase: 'main', // main, defense
        log: [],
        chatMessages: [],
        timeLimitSeconds: 0,
        turnDeadline: null,
        field: null,
        lastDamage: null,
        lastAction: null,
        soundEvents: [],
        soundSeq: 0,
        ascensionEvents: [],
        ascensionSeq: 0,
        effectEvents: [],
        effectSeq: 0,
        winnerId: null,
        winnerTeam: null,
        followUpAttacks: [],
        deck: [] // The shared deck
      };
      rooms[password] = room;
    }
    if (role === 'spectator') {
      room.spectators ||= {};
      room.spectators[socket.id] = { id: socket.id, name: playerName };
      socket.join(password);
      emitRoomUpdate(password);
      if (room.state !== 'waiting') emitGameState(password);
      return;
    }
    
    room.players[socket.id] = {
      id: socket.id,
      name: playerName,
      deck: [], // This will be ignored in favor of shared room deck
      ready: false,
      team: null,
      // Game stats
      hp: 40,
      mp: 0,
      money: 0,
      hand: [],
      learnedMiracles: [],
      ailments: [],
      defending: false,
      ascended: false,
    };
    
    socket.join(password);
    console.log(`${playerName} (${socket.id}) joined room ${password}`);
    
    emitRoomUpdate(password);
    emitBaseEditorState(password);
  });

  socket.on('startGame', ({ roomName }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'waiting' || room.hostId !== socket.id) return;
    if (Object.values(room.players).some(player => !player.ready)) {
      return socket.emit('errorMsg', '全員が準備完了になるまで開始できません。');
    }
    const selectedTeams = Object.values(room.players).map(player => player.team).filter(Boolean);
    if (selectedTeams.length && (selectedTeams.length !== Object.keys(room.players).length || new Set(selectedTeams).size < 2)) {
      return socket.emit('errorMsg', 'チーム戦では全員を赤・青の2チームに分けてください。');
    }
    if (Object.keys(room.players).length < 2) return socket.emit('errorMsg', '対戦開始には2人以上必要です。');
    const baseCards = GF_BASE_CARDS.map(card => ({ ...card, ...(room.baseCardsEdits[card.id] || {}) }));
    const mergedCards = baseCards.concat(room.customCards.map(card => ({ ...card, copies: card.copies ?? 3 })));
    room.deck = mergedCards.flatMap(card => Array.from(
      { length: Math.max(0, Math.floor(card.copies ?? 1)) },
      () => ({ ...card })
    ));
    room.deck.sort(() => Math.random() - 0.5);
    room.editLocks = {};
    startGame(roomName);
    emitRoomUpdate(roomName);
  });

  socket.on('toggleReady', ({ roomName }) => {
    const room = rooms[roomName];
    const player = room?.players[socket.id];
    if (!player || room.state !== 'waiting') return;
    player.ready = !player.ready;
    emitRoomUpdate(roomName);
  });

  socket.on('setTeam', ({ roomName, team, playerId = socket.id }) => {
    const room = rooms[roomName];
    const player = room?.players[playerId];
    if (!player || room.state !== 'waiting' || ![null, 'red', 'blue'].includes(team)) return;
    if (playerId !== socket.id && (room.hostId !== socket.id || !player.isBot)) return;
    player.team = team;
    player.ready = Boolean(player.isBot);
    emitRoomUpdate(roomName);
  });

  socket.on('addBot', ({ roomName }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'waiting' || room.hostId !== socket.id || Object.keys(room.players).length >= 8) return;
    const botNumber = Object.values(room.players).filter(player => player.isBot).length + 1;
    const botId = `bot_${Date.now()}_${botNumber}`;
    room.players[botId] = {
      id: botId, name: `Bot ${botNumber}`, isBot: true, ready: true, team: null,
      hp: 40, mp: 0, money: 0, hand: [], learnedMiracles: [], ailments: [],
      defending: false, ascended: false,
    };
    emitRoomUpdate(roomName);
  });

  socket.on('removeBot', ({ roomName, botId }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'waiting' || room.hostId !== socket.id || !room.players[botId]?.isBot) return;
    delete room.players[botId];
    emitRoomUpdate(roomName);
  });

  socket.on('sendChat', ({ roomName, text, teamOnly = false }) => {
    const room = rooms[roomName];
    const player = room?.players[socket.id];
    const spectator = room?.spectators?.[socket.id];
    const messageText = typeof text === 'string' ? text.trim().slice(0, 200) : '';
    if (!room || (!player && !spectator) || !messageText) return;
    const isTeamMessage = Boolean(teamOnly && player?.team);
    const message = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      senderId: socket.id,
      senderName: player?.name || spectator.name,
      text: messageText,
      teamOnly: isTeamMessage,
      team: isTeamMessage ? player.team : null,
      timestamp: Date.now(),
    };
    room.chatMessages = [...(room.chatMessages || []), message].slice(-100);
    Object.values(room.players).forEach(recipient => {
      if (!isTeamMessage || recipient.team === message.team) io.to(recipient.id).emit('chatMessage', message);
    });
    if (!isTeamMessage) {
      Object.values(room.spectators || {}).forEach(recipient => io.to(recipient.id).emit('chatMessage', message));
    }
  });

  socket.on('setTimeLimit', ({ roomName, seconds }) => {
    const room = rooms[roomName];
    const value = Number(seconds);
    if (!room || room.state !== 'waiting' || room.hostId !== socket.id || ![0, 30, 60, 120].includes(value)) return;
    room.timeLimitSeconds = value;
    emitRoomUpdate(roomName);
  });

  socket.on('lockBaseCard', ({ roomName, cardId }) => {
    const room = rooms[roomName];
    if (!room || !room.players[socket.id] || room.state !== 'waiting' || !GF_BASE_CARDS.some(card => card.id === cardId)) return;
    const ownerId = room.editLocks[cardId];
    if (ownerId && ownerId !== socket.id) return socket.emit('errorMsg', 'このカードは他の参加者が編集中です。');
    room.editLocks[cardId] = socket.id;
    emitBaseEditorState(roomName);
  });

  socket.on('unlockBaseCard', ({ roomName, cardId }) => {
    const room = rooms[roomName];
    if (!room || room.editLocks[cardId] !== socket.id) return;
    delete room.editLocks[cardId];
    emitBaseEditorState(roomName);
  });

  socket.on('updateRoomBaseCard', ({ roomName, cardId, patch }) => {
    const room = rooms[roomName];
    if (!room || !room.players[socket.id] || room.state !== 'waiting' || room.editLocks[cardId] !== socket.id) return;
    const baseCard = GF_BASE_CARDS.find(card => card.id === cardId);
    const normalized = normalizeBaseCardEdit(baseCard, patch);
    if (Object.keys(normalized).length > 0) room.baseCardsEdits[cardId] = normalized;
    else delete room.baseCardsEdits[cardId];
    emitBaseEditorState(roomName);
  });

  socket.on('importRoomBaseEdits', ({ roomName, edits }) => {
    const room = rooms[roomName];
    if (!room || !room.players[socket.id] || room.state !== 'waiting' || !edits || typeof edits !== 'object') return;
    for (const [cardId, patch] of Object.entries(edits)) {
      if (room.editLocks[cardId] && room.editLocks[cardId] !== socket.id) continue;
      if (!GF_BASE_CARDS.some(card => card.id === cardId)) continue;
      const baseCard = GF_BASE_CARDS.find(card => card.id === cardId);
      const normalized = normalizeBaseCardEdit(baseCard, patch);
      if (Object.keys(normalized).length > 0) room.baseCardsEdits[cardId] = normalized;
      else delete room.baseCardsEdits[cardId];
    }
    emitBaseEditorState(roomName);
  });

  socket.on('returnToLobby', ({ roomName }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'ended' || !room.players[socket.id]) return;
    room.state = 'waiting';
    room.turn = null;
    room.phase = 'main';
    room.field = null;
    room.lastDamage = null;
    room.lastAction = null;
    room.soundEvents = [];
    room.soundSeq = 0;
    room.effectEvents = [];
    room.effectSeq = 0;
    room.winnerId = null;
    room.winnerTeam = null;
    room.pendingBuy = null;
    room.editLocks = {};
    room.log = [];
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.turnTimerKey = null;
    room.turnDeadline = null;
    Object.values(room.players).forEach(player => {
      player.hp = 40;
      player.mp = 0;
      player.money = 0;
      player.hand = [];
      player.learnedMiracles = [];
      player.ailments = [];
      player.pendingDamage = null;
      player.pendingDraws = 0;
      player.ascended = false;
      player.ready = Boolean(player.isBot);
    });
    io.to(roomName).emit('gameStateCleared');
    emitRoomUpdate(roomName);
    emitBaseEditorState(roomName);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Remove from room
    for (const roomName in rooms) {
      const room = rooms[roomName];
      if (room.spectators?.[socket.id]) {
        delete room.spectators[socket.id];
        emitRoomUpdate(roomName);
        continue;
      }
      if (room.players[socket.id]) {
        const disconnectedTurnIndex = room.turnOrder?.indexOf(socket.id) ?? -1;
        const wasActivePlayer = room.turn === socket.id || room.mainTurnOwner === socket.id;
        for (const [cardId, ownerId] of Object.entries(room.editLocks || {})) {
          if (ownerId === socket.id) delete room.editLocks[cardId];
        }
        delete room.players[socket.id];
        room.turnOrder = (room.turnOrder || []).filter(id => id !== socket.id);
        const hasHumanPresence = Object.values(room.players).some(player => !player.isBot)
          || Object.keys(room.spectators || {}).length > 0;
        if (!hasHumanPresence) {
          clearTimeout(room.turnTimer);
          clearTimeout(room.botTimer);
          delete rooms[roomName]; // Clean up rooms with no human participants or spectators.
        } else {
          if (room.hostId === socket.id) {
            room.hostId = Object.values(room.players).find(player => !player.isBot)?.id || Object.keys(room.players)[0];
          }
          if (room.state === 'playing') {
            checkDeath(room);
            if (wasActivePlayer && room.state === 'playing') {
              const fallbackIndex = Math.max(0, disconnectedTurnIndex) % room.turnOrder.length;
              const fallbackId = room.turnOrder[fallbackIndex] || room.turnOrder[0];
              room.attackQueue = [];
              room.attackContext = null;
              room.followUpAttacks = [];
              room.field = null;
              room.phase = 'main';
              room.turn = fallbackId;
              room.mainTurnOwner = fallbackId;
              room.log.push(`切断されたプレイヤーの手番を ${room.players[fallbackId].name} へ移しました。`);
              emitGameState(roomName);
            }
          }
          emitRoomUpdate(roomName);
          emitBaseEditorState(roomName);
          io.to(roomName).emit('playerDisconnected', socket.id);
        }
      }
    }
  });

  // --- Game Actions ---
  const handlePlayCard = ({ roomName, cardIndex, cardIndices, targetId, learnedMiracleIndex }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'playing') return;
    
    const player = room.players[socket.id];
    if (room.turn !== socket.id) return; // Not their turn
    
    const requestedIndices = Array.isArray(cardIndices)
      ? [...new Set(cardIndices)].filter(Number.isInteger).sort((a, b) => a - b)
      : (Number.isInteger(cardIndex) ? [cardIndex] : []);
    const cards = requestedIndices.map(index => player.hand[index]).filter(Boolean);
    const learnedMiracle = Number.isInteger(learnedMiracleIndex)
      ? player.learnedMiracles[learnedMiracleIndex]
      : null;
    if (learnedMiracle) cards.push({ ...learnedMiracle, _learnedCast: true });
    const card = cards.find(c => c.type === 'weapon' || c.type === 'miracle') || cards[0];
    if (!card) return;
    const defaultOpponent = room.phase === 'defense'
      ? room.players[player.pendingDamage?.attackerId]
      : Object.values(room.players).find(candidate => areEnemies(player, candidate) && !candidate.ascended && candidate.hp > 0);
    const opponent = room.phase === 'defense' ? defaultOpponent : (room.players[targetId] || defaultOpponent);
    if (!opponent || (room.phase === 'main' && (!areEnemies(player, opponent) || opponent.ascended || opponent.hp <= 0))) {
      socket.emit('errorMsg', 'その参加者は対象にできません。');
      return;
    }

    const isSell = room.phase === 'main' && cards.length === 2 && cards.some(c => c.effect === 'sell');
    const isSingleTrade = room.phase === 'main' && cards.length === 1 && cards[0].type === 'trade';
    if (isSingleTrade && cards[0].effect === 'sell') {
      socket.emit('errorMsg', '「売る」と売却する神器を2枚選択してください。');
      return;
    }
    const validation = validateCardPlay(
      cards,
      room.phase,
      player.ailments,
      player.pendingDamage,
      player.pendingDamage?.defensesUsed || 0,
    );
    if (!validation.valid || cards.length !== requestedIndices.length + (learnedMiracle ? 1 : 0)) {
      socket.emit('errorMsg', validation.message || '選択したカードを使用できません。');
      return;
    }

    // Check costs
    const hasMagicFree = cards.some(c => c.supportEffect === 'magic_free');
    const totalMp = isSell || hasMagicFree ? 0 : cards.reduce((sum, c) => sum + (c.costMp || 0), 0);
    if (player.mp < totalMp) {
       socket.emit('errorMsg', 'Not enough MP');
       return;
    }

    // Pay costs
    player.mp -= totalMp;

    // A miracle leaves the hand on first use and becomes reusable as a learned miracle.
    cards.filter(c => !isSell && c.type === 'miracle' && !c._learnedCast).forEach(miracle => {
      if (!player.learnedMiracles.some(m => m.id === miracle.id)) {
        const learned = { ...miracle };
        delete learned.instanceId;
        player.learnedMiracles.push(learned);
        if (player.learnedMiracles.length > 6) player.learnedMiracles.shift();
      }
    });
    const consumedIndices = [...requestedIndices];
    consumedIndices.sort((a, b) => b - a).forEach(index => player.hand.splice(index, 1));

    // Replacements are dealt after the whole action, so freshly drawn cards
    // cannot be used to defend against the attack that generated them.
    const replacementCount = isSingleTrade && card.effect === 'buy' ? 0 : consumedIndices.length + (learnedMiracle ? 1 : 0);
    queueReplacementDraws(player, replacementCount);

    const nextTurnId = getNextAlivePlayerId(room.turnOrder, room.players, socket.id);

    cards.forEach(usedCard => {
      if (usedCard.selfAilment) {
        const applied = applyAilment(player, usedCard.selfAilment);
        addSoundEvent(room, 'harm_add');
        addAilmentEffect(room, player, applied);
        room.log.push(`${player.name} は ${applied} になった。`);
      }
      if (usedCard.cureAilments) {
        const cured = cureAilments(player, usedCard.cureAilments);
        if (cured.length) addSoundEvent(room, 'harm_remove');
        if (cured.length) addEffectEvent(room, 'harm_remove', player, 0, { label: cured.join('、') });
        if (cured.length) room.log.push(`${player.name} の災い（${cured.join('、')}）が治った。`);
      }
      if (usedCard.redrawHand) {
        const handSize = player.hand.length;
        player.hand = [];
        for (let i = 0; i < handSize; i++) player.hand.push(drawArtifact(room));
        room.log.push(`${player.name} の手札が一新された。`);
      }
    });

    if (isSell) {
      const sellIndex = cards.findIndex(c => c.effect === 'sell');
      const soldCard = cards[sellIndex === 0 ? 1 : 0];
      forceSale(room, player, opponent, soldCard);
      endTurnInternal(room, nextTurnId);
      checkDeath(room);
      emitGameState(roomName);
      return;
    }

    if (isSingleTrade) {
      if (card.effect === 'exchange') {
        room.phase = 'exchange';
        addSoundEvent(room, 'exchange');
        room.log.push(`${player.name} used Exchange.`);
      } else if (card.effect === 'buy') {
        const offered = opponent.hand[Math.floor(Math.random() * opponent.hand.length)];
        if (!offered) {
          endTurnInternal(room, nextTurnId);
        } else {
          room.phase = 'buy_offer';
          room.pendingBuy = { buyerId: player.id, sellerId: opponent.id, instanceId: offered.instanceId, drawAfter: 1 };
          room.log.push(`${player.name} used Buy.`);
        }
      } else {
        socket.emit('errorMsg', '「売る」は売却する神器と一緒に選択してください。');
      }
      emitGameState(roomName);
      return;
    }

    const combinedCard = combineAttackCards(cards);
    if (combinedCard.attackEffect === 'magical') {
      combinedCard.attack = player.mp * 2;
      player.mp = 0;
    }
    if (combinedCard.attackEffect === 'pestle') {
      const alivePlayers = Object.values(room.players).filter(candidate => !candidate.ascended && candidate.hp > 0);
      const mortarOwner = alivePlayers.find(candidate => candidate.hand.some(heldCard => heldCard.mortar));
      const target = mortarOwner || alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      combinedCard.forcedTargetId = target?.id;
      if (mortarOwner) combinedCard.attack = 99;
    }
    if (combinedCard.target !== 'all' && !combinedCard.forcedTargetId) combinedCard.forcedTargetId = opponent.id;

    room.log.push(`${player.name} played ${combinedCard.name}!`);
    room.lastAction = createActionEvent(player, opponent, combinedCard, 'use');

    if (room.phase === 'main') {
       // Ailment: Hallucination causes random wrong card to be played sometimes? 
       // In GF, Hallucination just makes cards look like other cards, but when you play it, it uses the real card.
       // We can just handle this visually on frontend, backend doesn't need to change play logic.
       
       if (combinedCard.type === 'weapon') {
         queueAttackSequence(room, player, nextTurnId, combinedCard, cards, roomName);
       } else if (card.type === 'item') {
         if (card.healHp) {
           increasePlayerStat(room, player, 'hp', card.healHp);
         }
         if (card.healMp) {
           increasePlayerStat(room, player, 'mp', card.healMp);
         }
         if (card.moneyGain) {
           increasePlayerStat(room, player, 'money', card.moneyGain);
         }
         if (card.randomHp) {
           const beforeHp = player.hp;
           const change = Math.random() < 0.5 ? card.randomHp : -card.randomHp;
           player.hp = Math.min(99, player.hp + change);
           if (player.hp > beforeHp) {
             addEffectEvent(room, 'hp_increase', player, player.hp - beforeHp);
             addSoundEvent(room, 'hp_increase');
           }
           room.log.push(`${card.name}: HP ${change > 0 ? '+' : ''}${change}`);
         }
         if (card.removeItems) {
           const removed = removeRandomEntries(opponent.hand, card.removeItems);
           if (removed.length) addSoundEvent(room, 'item_remove');
           room.log.push(`${card.name} が ${opponent.name} の神器を ${removed.length} 個掃き飛ばした。`);
         }
         if (card.removeMiracles) {
           const removed = removeRandomEntries(opponent.learnedMiracles, card.removeMiracles);
           if (removed.length) addSoundEvent(room, 'seizure');
           if (removed.length) addEffectEvent(room, 'seizure', opponent, removed.length);
           room.log.push(`${card.name} が ${opponent.name} の奇跡を ${removed.length} 個忘れさせた。`);
         }
         if (card.setAssistant) setRandomAssistant(player, room);
         if (cards.some(usedCard => usedCard.mortar)) addSoundEvent(room, 'mortar');
         const mysteryQueuedAttack = card.mystery && resolveMystery(room, player, nextTurnId, roomName);
         room.log.push(`${player.name} は ${card.name} の効果を受けた。`);
         if (!mysteryQueuedAttack) endTurnInternal(room, nextTurnId);
       } else if (combinedCard.type === 'miracle') {
         if (combinedCard.attack > 0) {
           queueAttackSequence(room, player, nextTurnId, combinedCard, cards, roomName);
         } else {
            if (card.ailmentInflict && card.ailmentTrigger === 'use') {
              const applied = applyAilment(opponent, card.ailmentInflict);
              addSoundEvent(room, card.ailmentInflict === 'dream' ? 'illusion_item' : 'harm_add');
              addAilmentEffect(room, opponent, applied);
              room.log.push(`${opponent.name} は ${applied} になった。`);
            }
            if (card.healHp) {
              increasePlayerStat(room, player, 'hp', card.healHp);
            }
            if (card.moneyGain) {
              increasePlayerStat(room, player, 'money', card.moneyGain);
            }
            if (card.setAssistant) setRandomAssistant(player, room);
            room.field = { attackerId: player.id, attackCard: card };
            clearFieldLater(roomName);
            endTurnInternal(room, nextTurnId);
         }
       }
    } else if (room.phase === 'defense') {
       // Defense logic
       if (isDefenseCard(combinedCard)) {
         const pDamage = player.pendingDamage;
         if (!pDamage) return;

         const hasFlash = player.ailments.includes('flash');
         const resolution = resolveDefenseCard(pDamage, combinedCard);
         pDamage.defensesUsed = (pDamage.defensesUsed || 0) + cards.length;
         room.field.defenseCards.push(combinedCard);
         if (resolution.action === 'reflect' || resolution.action === 'flick') {
           addSoundEvent(room, resolution.action);
           addEffectEvent(room, resolution.action, player);
           const alivePlayers = Object.values(room.players).filter(candidate => !candidate.ascended && candidate.hp > 0);
           const target = resolution.action === 'reflect'
             ? room.players[pDamage.attackerId]
             : alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
           player.pendingDamage = null;
           if (!target) {
             player.pendingDamage = pDamage;
             applyDamageAndClearField(room, player, 0, roomName);
           } else {
             target.pendingDamage = {
               ...pDamage,
               amount: resolution.amount,
               attackerId: player.id,
               source: player.name,
               defensesUsed: 0,
             };
             room.turn = target.id;
             room.field.attackerId = player.id;
             room.field.defenderId = target.id;
             room.field.defenseCards = [];
             room.log.push(`${combinedCard.name} が攻撃を${resolution.action === 'reflect' ? 'はね返した' : '弾き飛ばした'}！`);
             if (target.id === player.id) applyDamageAndClearField(room, target, resolution.amount, roomName);
           }
        } else if (resolution.action === 'block') {
           addSoundEvent(room, 'block');
           addEffectEvent(room, 'block', player);
           room.log.push(`${combinedCard.name} が攻撃を完全に止めた！`);
           applyDamageAndClearField(room, player, 0, roomName);
        } else if (resolution.action === 'remove_attribute') {
           addSoundEvent(room, 'defense_harm');
           addEffectEvent(room, 'harm_remove', player, 0, { label: '属性解除' });
           pDamage.attribute = 'none';
           room.log.push(`${combinedCard.name} が攻撃の属性を取り除いた。`);
           if (hasFlash) applyDamageAndClearField(room, player, pDamage.amount, roomName);
        } else if (resolution.action === 'reduce') {
           addSoundEvent(room, 'block');
           addEffectEvent(room, 'block', player);
           pDamage.amount = resolution.amount;
           room.log.push(`${player.name} は ${combinedCard.name} で防御し、残りダメージは ${pDamage.amount}。`);
           if (pDamage.amount <= 0 || hasFlash) applyDamageAndClearField(room, player, pDamage.amount, roomName);
         } else {
           room.log.push(`${combinedCard.name} (${combinedCard.attribute}) では ${pDamage.attribute} 属性を防げない。`);
           if (hasFlash) applyDamageAndClearField(room, player, pDamage.amount, roomName);
         }
       }
    }
    
    checkDeath(room);
    emitGameState(roomName);
  };
  socket.on('playCard', handlePlayCard);

  socket.on('castMiracle', ({ roomName, miracleIndex, cardIndices = [], targetId }) => {
    const room = rooms[roomName];
    const player = room?.players[socket.id];
    const miracle = player?.learnedMiracles[miracleIndex];
    if (!miracle || room.turn !== socket.id || !['main', 'defense'].includes(room.phase)) return;
    handlePlayCard({ roomName, cardIndices, targetId, learnedMiracleIndex: miracleIndex });
  });

  socket.on('completeExchange', ({ roomName, hp, mp, money }) => {
    const room = rooms[roomName];
    const player = room?.players[socket.id];
    const values = [hp, mp, money].map(Number);
    const total = player ? player.hp + player.mp + player.money : -1;
    if (!player || room.phase !== 'exchange' || room.turn !== socket.id || values.some(v => !Number.isInteger(v) || v < 0 || v > 99) || values.reduce((a, b) => a + b, 0) !== total) {
      return socket.emit('errorMsg', 'Keep the same total and set each value from 0 to 99.');
    }
    const before = { hp: player.hp, mp: player.mp, money: player.money };
    [player.hp, player.mp, player.money] = values;
    for (const [stat, type] of [['hp', 'hp_increase'], ['mp', 'mp_increase'], ['money', 'yen_increase']]) {
      if (player[stat] > before[stat]) addEffectEvent(room, type, player, player[stat] - before[stat]);
    }
    addSoundEvent(room, 'exchange');
    room.log.push(`${player.name} redistributed HP / MP / money.`);
    const next = getNextAlivePlayerId(room.turnOrder, room.players, socket.id);
    endTurnInternal(room, next);
    checkDeath(room);
    emitGameState(roomName);
  });

  socket.on('resolveBuy', ({ roomName, accept }) => {
    const room = rooms[roomName];
    const offer = room?.pendingBuy;
    if (!room || room.phase !== 'buy_offer' || !offer || offer.buyerId !== socket.id) return;
    const buyer = room.players[offer.buyerId];
    const seller = room.players[offer.sellerId];
    const index = seller.hand.findIndex(c => c.instanceId === offer.instanceId);
    const offered = seller.hand[index];
    const price = offered?.type === 'miracle' ? 0 : Math.max(0, offered?.costMoney || 0);
    if (accept && offered && buyer.money >= price && buyer.hand.length < 18) {
      buyer.money -= price;
      increasePlayerStat(room, seller, 'money', price, { sound: false });
      buyer.hand.push(seller.hand.splice(index, 1)[0]);
      addSoundEvent(room, 'seizure');
      addEffectEvent(room, 'seizure', seller, 1);
      room.log.push(`${buyer.name} bought ${offered.name} for money ${price}.`);
    } else if (accept && offered && buyer.money < price) {
      socket.emit('errorMsg', 'Not enough money.');
      return;
    } else {
      room.log.push(`${buyer.name} declined the purchase.`);
    }
    room.pendingBuy = null;
    queueReplacementDraws(buyer, offer.drawAfter || 0);
    const next = getNextAlivePlayerId(room.turnOrder, room.players, socket.id);
    endTurnInternal(room, next);
    emitGameState(roomName);
  });

  socket.on('finishDefense', ({ roomName }) => {
     const room = rooms[roomName];
     if (!room || room.state !== 'playing') return;
     const player = room.players[socket.id];
     if (room.turn !== socket.id || room.phase !== 'defense') return;

     if (player.pendingDamage) {
        applyDamageAndClearField(room, player, player.pendingDamage.amount, roomName);
     } else {
        endTurnInternal(room, player.id);
        checkDeath(room);
        emitGameState(roomName);
     }
  });

  socket.on('discardCards', ({ roomName, cardIndices }) => {
    const room = rooms[roomName];
    const player = room?.players[socket.id];
    if (!player || room.state !== 'playing' || room.turn !== socket.id || room.phase !== 'main') return;
    const indices = [...new Set(Array.isArray(cardIndices) ? cardIndices : [])]
      .filter(index => Number.isInteger(index) && index >= 0 && index < player.hand.length)
      .sort((a, b) => b - a);
    if (!indices.length) return socket.emit('errorMsg', '捨てる神器を選択してください。');
    const discarded = [];
    indices.forEach(index => {
      const selectedCard = player.hand[index];
      if (selectedCard.mortar) {
        player.hp = Math.max(0, player.hp - 1);
        room.log.push(`${selectedCard.name} は戻ってきて ${player.name} に1ダメージ！`);
      } else {
        discarded.push(...player.hand.splice(index, 1));
      }
    });
    queueReplacementDraws(player, discarded.length);
    if (discarded.length) addSoundEvent(room, 'item_remove');
    if (discarded.length) room.log.push(`${player.name} は ${discarded.map(discardedCard => discardedCard.name).join('、')} を捨てた。`);
    const next = getNextAlivePlayerId(room.turnOrder, room.players, socket.id);
    checkDeath(room);
    if (room.state === 'ended') return emitGameState(roomName);
    endTurnInternal(room, next);
    emitGameState(roomName);
  });

  socket.on('pray', ({ roomName }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'playing') return;
    if (room.turn !== socket.id || room.phase !== 'main') return;
    
    const player = room.players[socket.id];
    
    // Check if player has any attack weapon
    const hasWeapon = player.hand.some(c => c.type === 'weapon');
    if (hasWeapon) {
       socket.emit('errorMsg', '攻撃可能な武器がある場合は「祈る」ことはできません');
       return;
    }

    // Pray: draw 1 card if below max
    if (room.deck.length > 0 && player.hand.length < 18) {
       player.hand.push(drawArtifact(room));
       room.log.push(`${player.name} は祈った... (カードを1枚ドロー)`);
    } else {
       room.log.push(`${player.name} は祈った... (しかし何も起きなかった)`);
    }

    const nextTurnId = getNextAlivePlayerId(room.turnOrder, room.players, socket.id);
    endTurnInternal(room, nextTurnId);
    emitGameState(roomName);
  });
});

function applyDamageAndClearField(room, player, amount, roomName) {
   const pendingDamage = player.pendingDamage;
   const isDarkAttack = pendingDamage?.attribute === 'dark' && amount > 0;
   const resolvedDamage = Math.max(0, amount);
   let hpDamage = resolvedDamage;
   if (hpDamage > 0 && player.assistant?.hp > 0) {
     const assistant = player.assistant;
     const absorbed = Math.min(hpDamage, assistant.hp);
     assistant.hp -= absorbed;
     hpDamage -= absorbed;
     room.log.push(`${player.name} の守護神が ${absorbed} ダメージを引き受けた。`);
     if (assistant.hp <= 0) {
       addSoundEvent(room, 'assistant_remove');
       addEffectEvent(room, 'assistant_remove', player, 0, { assistantType: assistant.type });
       room.log.push(`${player.name} の守護神は去った。`);
       player.assistant = null;
     } else if (shouldAssistantLeave(assistant)) {
       addSoundEvent(room, 'assistant_remove');
       addEffectEvent(room, 'assistant_remove', player, 0, { assistantType: assistant.type });
       room.log.push(`${player.name} の守護神は被弾して立ち去った。`);
       player.assistant = null;
     }
   }
   const damageSequence = resolveDamageSequence(player.hp, hpDamage, isDarkAttack);
   player.hp = damageSequence.remainingHp;
   if (pendingDamage?.lethalOnDamage && resolvedDamage > 0) {
     player.hp = 0;
     room.log.push(`${player.name} は即死攻撃を受けた。`);
   }
   room.log.push(`${player.name} は ${damageSequence.primaryDamage} ダメージを受けた。`);
   if (damageSequence.darkDamage > 0) {
     room.log.push(`${player.name} は続けて残りHP分の冥ダメージ ${damageSequence.darkDamage} を受けた。`);
   }
   if (resolvedDamage > 0) {
     addSoundEvent(room, 'damage');
     if (damageSequence.darkDamage > 0) addSoundEvent(room, 'damage_dark', { delayMs: 650 });
     for (const ailment of pendingDamage?.ailments || []) {
       const applied = applyAilment(player, ailment);
       addSoundEvent(room, ailment === 'dream' ? 'illusion_item' : 'disease');
       addAilmentEffect(room, player, applied);
       room.log.push(`${player.name} は ${applied} になった。`);
     }
     const attacker = room.players[pendingDamage?.attackerId];
     if (attacker && pendingDamage?.absorbHp) {
       increasePlayerStat(room, attacker, 'hp', resolvedDamage);
       room.log.push(`${attacker.name} はHPを ${resolvedDamage} 吸収した。`);
     }
     if (attacker && pendingDamage?.selfDamage) {
       attacker.hp -= resolvedDamage;
       room.log.push(`${attacker.name} も ${resolvedDamage} ダメージを受けた。`);
     }
     for (const defenseCard of room.field?.defenseCards || []) {
       if (attacker && defenseCard.retaliateAilment) {
         const applied = applyAilment(attacker, defenseCard.retaliateAilment);
         addSoundEvent(room, 'harm_add');
         addAilmentEffect(room, attacker, applied);
         room.log.push(`${attacker.name} は ${defenseCard.name} により ${applied} になった。`);
       }
       for (const reactiveEffect of new Set([defenseCard.reactiveEffect, ...(defenseCard.reactiveEffects || [])].filter(Boolean))) {
         if (!attacker) continue;
         if (reactiveEffect === 'counter_damage_all') {
           const counterCard = createCounterAttackCard(reactiveEffect, resolvedDamage, defenseCard);
           queueFollowUpAttack(room, player.id, pendingDamage.nextTurnId, counterCard);
           addSoundEvent(room, 'counter');
         }
         if (reactiveEffect === 'counter_double_damage') {
           const counterCard = createCounterAttackCard(reactiveEffect, resolvedDamage, defenseCard);
           counterCard.forcedTargetId = attacker.id;
           queueFollowUpAttack(room, player.id, pendingDamage.nextTurnId, counterCard);
           addSoundEvent(room, 'counter');
         }
         if (reactiveEffect === 'recover_double_mp') {
           increasePlayerStat(room, player, 'mp', resolvedDamage * 2);
         }
         if (reactiveEffect === 'absorb_money') {
           const amountToSteal = Math.min(resolvedDamage, attacker.money);
           attacker.money -= amountToSteal;
           player.money = Math.min(99, player.money + amountToSteal);
           addSoundEvent(room, 'yen_absorb');
         }
       }
     }
   }
   player.pendingDamage = null;
   
   // Store last damage to trigger UI animation
   room.lastDamage = {
     amount: damageSequence.primaryDamage,
     followUpAmount: damageSequence.darkDamage,
     followUpDelayMs: 650,
     targetId: player.id,
     isDark: isDarkAttack,
     timestamp: Date.now(),
   };

   checkDeath(room);
   if (room.state === 'ended') {
     emitGameState(roomName);
     return;
   }
   if (room.attackContext) {
     startNextQueuedAttack(room, roomName);
     emitGameState(roomName);
     return;
   }
   clearFieldLater(roomName);
   endTurnInternal(room, pendingDamage?.nextTurnId || player.id);
   checkDeath(room);
   emitGameState(roomName);
}

function clearFieldLater(roomName) {
  const scheduledField = rooms[roomName]?.field;
  if (!scheduledField) return;
  setTimeout(() => {
    const room = rooms[roomName];
    if (!room || room.state === 'waiting') return;
    if (!clearFieldIfCurrent(room, scheduledField)) return;
    emitGameState(roomName);
  }, 2000);
}

function withInstanceId(card) {
  return { ...card, instanceId: `${card.id || 'card'}_${Date.now()}_${Math.random().toString(36).slice(2)}` };
}

function drawArtifact(room) {
  if (!room.deck.length) return null;
  return withInstanceId(room.deck[Math.floor(Math.random() * room.deck.length)]);
}

function queueReplacementDraws(player, count) {
  player.pendingDraws = (player.pendingDraws || 0) + Math.max(0, count);
}

function flushReplacementDraws(room) {
  for (const player of Object.values(room.players)) {
    while ((player.pendingDraws || 0) > 0 && player.hand.length < 18 && room.deck.length > 0 && !player.ascended) {
      player.hand.push(drawArtifact(room));
      player.pendingDraws -= 1;
    }
    player.pendingDraws = 0;
  }
}

function queueAttackSequence(room, attacker, nextTurnId, card, cards, roomName, options = {}) {
  const targets = card.target === 'all'
    ? Object.values(room.players).filter(player => areEnemies(attacker, player) && !player.ascended && player.hp > 0)
    : [room.players[card.forcedTargetId || nextTurnId]].filter(Boolean);
  room.attackQueue = createAttackQueue(targets.map(target => target.id), card.repeatCount || 1);
  room.attackContext = {
    attackerId: attacker.id,
    nextTurnId,
    card,
    assistantAction: options.assistantAction || false,
    skipAssistantOpportunity: options.skipAssistantOpportunity || false,
    ailments: cards.filter(usedCard => usedCard.ailmentTrigger === 'damage').map(usedCard => usedCard.ailmentInflict).filter(Boolean),
  };
  startNextQueuedAttack(room, roomName);
}

function queueFollowUpAttack(room, attackerId, nextTurnId, card, options = {}) {
  room.followUpAttacks = [...(room.followUpAttacks || []), { attackerId, nextTurnId, card, options }];
}

function startNextFollowUpAttack(room, roomName) {
  const followUp = room.followUpAttacks?.shift();
  if (!followUp) return false;
  const attacker = room.players[followUp.attackerId];
  if (!attacker) return startNextFollowUpAttack(room, roomName);
  queueAttackSequence(room, attacker, followUp.nextTurnId, followUp.card, [followUp.card], roomName, followUp.options);
  return true;
}

function startNextQueuedAttack(room, roomName) {
  const context = room.attackContext;
  while (context && room.attackQueue.length) {
    const queued = room.attackQueue.shift();
    const attacker = room.players[context.attackerId];
    const target = room.players[queued.targetId];
    if (!attacker || !target || target.ascended || target.hp <= 0) continue;
    const hitResult = rollAttack(context.card, target.ailments);
    room.lastAction = createActionEvent(attacker, target, context.card, hitResult.outcome);
    if (!hitResult.hit) {
      addSoundEvent(room, 'miss');
      room.log.push(`${target.name} は ${context.card.name}（${queued.repeat}回目）を回避！`);
      continue;
    }
    addSoundEvent(room, 'hit');
    target.pendingDamage = {
      amount: context.card.attack,
      attribute: context.card.attribute,
      source: attacker.name,
      attackerId: attacker.id,
      sourceType: context.card.sourceType || context.card.type,
      absorbHp: context.card.absorbHp || context.card.attackEffect === 'absorb_hp',
      selfDamage: context.card.selfDamage,
      lethalOnDamage: context.card.lethalOnDamage,
      nextTurnId: context.nextTurnId,
      ailments: context.ailments,
      defensesUsed: 0,
    };
    room.phase = 'defense';
    room.turn = target.id;
    room.field = { attackerId: attacker.id, attackCard: context.card, defenderId: target.id, defenseCards: [] };
    room.log.push(hitResult.outcome === 'unavoidable'
      ? `${context.card.name} は ${target.name} に不可避！`
      : `${context.card.name}（${queued.repeat}回目）が ${target.name} に命中！`);
    return true;
  }
  if (context) {
    const nextTurnId = context.nextTurnId;
    const assistantAction = context.assistantAction;
    const skipAssistantOpportunity = context.skipAssistantOpportunity;
    room.attackQueue = [];
    room.attackContext = null;
    if (startNextFollowUpAttack(room, roomName)) return true;
    checkDeath(room);
    if (room.state === 'ended' || room.attackContext) return false;
    clearFieldLater(roomName);
    if (assistantAction) {
      room.turn = nextTurnId;
      room.mainTurnOwner = nextTurnId;
      room.phase = 'main';
      room.log.push(`${room.players[nextTurnId].name} の行動へ戻る。`);
    } else {
      endTurnInternal(room, nextTurnId, { skipAssistantOpportunity });
    }
  }
  return false;
}

const ASSISTANT_TYPES = ['mars', 'mercury', 'jupiter', 'saturn', 'uranus', 'pluto', 'neptune', 'venus', 'earth', 'moon'];

function removeRandomEntries(entries, count) {
  const removed = [];
  while (entries.length && removed.length < count) {
    removed.push(...entries.splice(Math.floor(Math.random() * entries.length), 1));
  }
  return removed;
}

function setRandomAssistant(player, room) {
  const type = ASSISTANT_TYPES[Math.floor(Math.random() * ASSISTANT_TYPES.length)];
  player.assistant = { type, hp: 20, actionRate: 30, leaveOnDamageRate: 10 };
  addSoundEvent(room, 'assistant_add');
  addEffectEvent(room, 'assistant_add', player, 0, { assistantType: type });
  room.log.push(`${player.name} に ${type} の守護神が宿った。`);
}

function runAssistantAction(room, player, roomName, { nextTurnId = player.id, deferAttack = false } = {}) {
  if (!shouldAssistantAct(player.assistant)) return;
  const action = getAssistantAction(player.assistant.type);
  const enemies = Object.values(room.players).filter(candidate => areEnemies(player, candidate) && !candidate.ascended && candidate.hp > 0);
  const enemy = enemies[Math.floor(Math.random() * enemies.length)];
  if (!action) return;
  addSoundEvent(room, 'assistant');
  addEffectEvent(room, 'assistant_action', player, 0, { assistantType: player.assistant.type });
  room.log.push(`${player.name} の守護神 ${player.assistant.type} が行動した。`);
  const scheduleAttack = card => {
    if (!enemy) return false;
    card.forcedTargetId = enemy.id;
    if (deferAttack) {
      queueFollowUpAttack(room, player.id, nextTurnId, card, { skipAssistantOpportunity: true });
    } else {
      queueAttackSequence(room, player, player.id, card, [card], roomName, { assistantAction: true });
    }
    return true;
  };
  if (action.kind === 'attack' && enemy) {
    const card = {
      id: `assistant_${player.assistant.type}`,
      name: `${player.assistant.type}の守護神`,
      type: 'incarnation',
      sourceType: 'incarnation',
      imageUrl: `/godfield-flash/cards/assistant/${player.assistant.type}.png`,
      attack: action.attack,
      hitRate: action.hitRate,
      attribute: action.attribute,
      target: 'single',
      forcedTargetId: enemy.id,
      attackEffect: action.attackEffect,
      ailmentInflict: action.ailment,
      ailmentTrigger: action.ailment ? 'damage' : null,
    };
    scheduleAttack(card);
    return;
  }
  if (action.kind === 'ailment' && enemy) {
    const applied = applyAilment(enemy, action.ailment);
    addSoundEvent(room, 'harm_add');
    addAilmentEffect(room, enemy, applied);
  }
  if (action.kind === 'cure') {
    const cured = cureAilments(player, 'all');
    addSoundEvent(room, 'harm_remove');
    if (cured.length) addEffectEvent(room, 'harm_remove', player, 0, { label: cured.join('、') });
  }
  if (action.kind === 'recover_hp') {
    increasePlayerStat(room, player, 'hp', action.value);
  }
  if (action.kind === 'recover_mp') {
    increasePlayerStat(room, player, 'mp', action.value);
  }
  if (action.kind === 'scatter_money') {
    Object.values(room.players).forEach(target => increasePlayerStat(room, target, 'money', action.value, { sound: false }));
    addSoundEvent(room, 'yen_increase');
  }
  if (action.kind === 'give_enemy_money' && enemy) increasePlayerStat(room, enemy, 'money', action.value);
  if (action.kind === 'absorb_money' && enemy) {
    const amount = Math.min(action.value, enemy.money);
    enemy.money -= amount;
    increasePlayerStat(room, player, 'money', amount, { sound: false });
    addSoundEvent(room, 'yen_absorb');
  }
  if (action.kind === 'recover_money') {
    increasePlayerStat(room, player, 'money', action.value);
  }
  if (action.kind === 'add_item') {
    const artifact = drawArtifact(room);
    const artifactMode = getEarthArtifactMode(artifact);
    if (artifactMode === 'attack') {
      scheduleAttack(artifact);
    } else if (artifactMode === 'sell' && enemy) {
      forceSale(room, player, enemy, drawArtifact(room));
    } else if (artifactMode === 'buy' && enemy) {
      const offered = enemy.hand[Math.floor(Math.random() * enemy.hand.length)];
      const price = offered?.type === 'miracle' ? 0 : Math.max(0, offered?.costMoney || 0);
      if (offered && player.money >= price && player.hand.length < 18) {
        player.money -= price;
        enemy.money = Math.min(99, enemy.money + price);
        player.hand.push(enemy.hand.splice(enemy.hand.indexOf(offered), 1)[0]);
        addSoundEvent(room, 'seizure');
        addEffectEvent(room, 'seizure', enemy, 1);
      } else {
        addSoundEvent(room, 'no_change');
        addEffectEvent(room, 'no_change', player);
      }
    } else {
      if (player.hand.length < 18) player.hand.push(drawArtifact(room));
      if (artifact?.healHp) increasePlayerStat(room, player, 'hp', artifact.healHp);
      if (artifact?.healMp) increasePlayerStat(room, player, 'mp', artifact.healMp);
      if (artifact?.moneyGain) increasePlayerStat(room, player, 'money', artifact.moneyGain);
      if (artifact?.cureAilments) {
        const cured = cureAilments(player, artifact.cureAilments);
        if (cured.length) addEffectEvent(room, 'harm_remove', player, 0, { label: cured.join('、') });
      }
      if (artifact?.ailmentInflict && enemy) {
        const applied = applyAilment(enemy, artifact.ailmentInflict);
        addAilmentEffect(room, enemy, applied);
      }
      if (artifact?.setAssistant) setRandomAssistant(player, room);
      if (artifact?.removeItems && enemy) removeRandomEntries(enemy.hand, artifact.removeItems);
      if (artifact?.removeMiracles && enemy) removeRandomEntries(enemy.learnedMiracles, artifact.removeMiracles);
      addSoundEvent(room, 'card');
    }
  }
  if (action.kind === 'random_miracle') {
    const miracles = GF_BASE_CARDS.filter(card => card.type === 'miracle'
      && !['flick_magic', 'block_weapon'].includes(card.defenseEffect));
    const miracle = { ...miracles[Math.floor(Math.random() * miracles.length)] };
    if (['wide_attack', 'double_attack'].includes(miracle.supportEffect)) {
      scheduleAttack(createMoonAssistantAttack(miracle));
    } else if (miracle.attack > 0 && enemy) {
      scheduleAttack(miracle);
    } else {
      if (miracle.ailmentInflict && enemy) {
        const applied = applyAilment(enemy, miracle.ailmentInflict);
        addAilmentEffect(room, enemy, applied);
      }
      if (miracle.cureAilments) {
        const cured = cureAilments(player, miracle.cureAilments);
        if (cured.length) addEffectEvent(room, 'harm_remove', player, 0, { label: cured.join('、') });
      }
      if (miracle.healHp) increasePlayerStat(room, player, 'hp', miracle.healHp);
      if (miracle.moneyGain) increasePlayerStat(room, player, 'money', miracle.moneyGain);
    }
  }
}

function resolveMystery(room, actor, nextTurnId, roomName) {
  addSoundEvent(room, 'mystery');
  const type = ASSISTANT_TYPES[Math.floor(Math.random() * ASSISTANT_TYPES.length)];
  const players = Object.values(room.players).filter(player => !player.ascended && player.hp > 0);
  if (type === 'mars') players.forEach(player => addAilmentEffect(room, player, applyAilment(player, 'fever')));
  if (type === 'mercury') players.forEach(player => addAilmentEffect(room, player, applyAilment(player, 'fog')));
  if (type === 'jupiter') players.forEach(player => addAilmentEffect(room, player, applyAilment(player, 'dream')));
  if (type === 'saturn') players.forEach(player => { player.hp = 1; });
  if (type === 'uranus' && players.length) {
    const target = players[Math.floor(Math.random() * players.length)];
    const card = {
      id: 'mystery_uranus', name: 'URANUS', type: 'item', sourceType: 'item',
      attack: 60, hitRate: 100, attribute: 'light', target: 'single', forcedTargetId: target.id,
    };
    queueAttackSequence(room, actor, nextTurnId, card, [card], roomName);
  }
  if (type === 'pluto') {
    const card = {
      id: 'mystery_pluto', name: 'PLUTO', type: 'item', sourceType: 'item',
      attack: 30, hitRate: 75, attribute: 'dark', target: 'all',
    };
    queueAttackSequence(room, actor, nextTurnId, card, [card], roomName);
  }
  if (type === 'neptune') actor.hp = Math.min(99, actor.hp + 60);
  if (type === 'venus') players.forEach(player => { player.money = 99; });
  if (type === 'earth') {
    const counts = players.map(player => player.hand.length);
    const artifacts = players.flatMap(player => player.hand.splice(0));
    for (let i = artifacts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [artifacts[i], artifacts[j]] = [artifacts[j], artifacts[i]];
    }
    players.forEach((player, index) => player.hand.push(...artifacts.splice(0, counts[index])));
  }
  if (type === 'moon') players.forEach(player => setRandomAssistant(player, room));
  room.log.push(`超常現象「${type}」が起こった。`);
  return type === 'uranus' || type === 'pluto';
}

function forceSale(room, seller, buyer, card) {
  const price = card.type === 'miracle' ? 0 : Math.max(0, card.costMoney || 0);
  let remaining = price;
  const paidMoney = Math.min(buyer.money, remaining);
  buyer.money -= paidMoney;
  remaining -= paidMoney;
  const paidMp = Math.min(buyer.mp, remaining);
  buyer.mp -= paidMp;
  remaining -= paidMp;
  buyer.hp = Math.max(0, buyer.hp - remaining);
  increasePlayerStat(room, seller, 'money', price, { sound: false });
  if (buyer.hand.length < 18) buyer.hand.push(withInstanceId(card));
  room.log.push(`${seller.name} forced ${buyer.name} to buy ${card.name} for money ${price}.`);
}

function processAilments(player, room) {
  const result = processEndOfTurnAilments(player);
  if (result.hpChange) addSoundEvent(room, 'disease');
  if (result.hpChange > 0) addEffectEvent(room, 'hp_increase', player, result.hpChange);
  if (result.progressedTo) addSoundEvent(room, 'worse');
  if (result.progressedTo) addAilmentEffect(room, player, result.progressedTo);
  if (result.hpChange) room.log.push(`${player.name} の病気効果: HP ${result.hpChange > 0 ? '+' : ''}${result.hpChange}`);
  if (result.progressedTo) room.log.push(`${player.name} の病気が ${result.progressedTo} に悪化した。`);
  if (result.fatal) room.log.push(`${player.name} は天国病の発作でHPが0になった。`);
}

function endTurnInternal(room, nextTurnId, { skipAssistantOpportunity = false } = {}) {
   if (!nextTurnId || !room.players[nextTurnId] || room.players[nextTurnId].ascended || room.players[nextTurnId].hp <= 0) {
     nextTurnId = getNextAlivePlayerId(room.turnOrder || Object.keys(room.players), room.players, room.mainTurnOwner);
   }
   if (!nextTurnId) return checkDeath(room);
   const endingPlayer = room.players[room.mainTurnOwner];
   if (endingPlayer && endingPlayer.id !== nextTurnId) processAilments(endingPlayer, room);
    checkDeath(room);
    if (room.state === 'ended' || room.attackContext) return;
    if (!skipAssistantOpportunity && endingPlayer && endingPlayer.id !== nextTurnId) {
      Object.values(room.players)
        .filter(player => areEnemies(endingPlayer, player) && !player.ascended && player.hp > 0 && player.assistant)
        .forEach(player => runAssistantAction(room, player, room.name, { nextTurnId, deferAttack: true }));
      checkDeath(room);
      if (room.state === 'ended' || room.attackContext) return;
      if (startNextFollowUpAttack(room, room.name)) return;
    }
   flushReplacementDraws(room);
   room.turn = nextTurnId;
   room.mainTurnOwner = nextTurnId;
   room.phase = 'main';
   const player = room.players[nextTurnId];
    room.log.push(`--- ${player.name}'s Turn ---`);
    addSoundEvent(room, 'client_turn', { targetId: nextTurnId });
 }

function createActionEvent(attacker, defender, card, outcome) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: 'attack',
    outcome,
    attackerId: attacker.id,
    defenderId: defender.id,
    card: { id: card.id, name: card.name, imageUrl: card.imageUrl || '', attribute: card.attribute, target: card.target },
    timestamp: Date.now(),
  };
}

function checkDeath(room) {
  const players = Object.values(room.players);
  players.forEach(player => {
    if (player.hp > 0 || player.ascended) return;
    const reviveIndex = player.hand.findIndex(card => card.reviveHp > 0);
    if (reviveIndex >= 0) {
      const [reviver] = player.hand.splice(reviveIndex, 1);
      player.hp = reviver.reviveHp;
      addSoundEvent(room, 'revive');
      addEffectEvent(room, 'hp_increase', player, player.hp, { revived: true });
      room.log.push(`${reviver.name}により${player.name}はHP ${player.hp}で復活した。`);
      return;
    }

    const dyingAttackIndex = player.hand.findIndex(card => card.dyingAttack);
    if (dyingAttackIndex >= 0) {
      const [dyingCard] = player.hand.splice(dyingAttackIndex, 1);
      const dyingAttack = createDyingAttackCard(dyingCard);
      const nextTurnId = getNextAlivePlayerId(room.turnOrder, room.players, player.id);
      queueFollowUpAttack(room, player.id, nextTurnId, dyingAttack);
      addSoundEvent(room, 'dying_attack');
      room.log.push(`${player.name}の${dyingCard.name}が昇天攻撃を開始した。`);
    }
    player.ascended = true;
    addAscensionEvent(room, player);
    addSoundEvent(room, 'dead');
    room.log.push(`${player.name}は昇天した。`);
  });

  if (room.followUpAttacks?.length && !room.attackContext) {
    startNextFollowUpAttack(room, room.name);
    return;
  }
  if (room.followUpAttacks?.length || room.attackContext) return;

  const winningSide = getWinningSide(room.players);
  if (room.state === 'playing' && players.length > 1 && winningSide.ended) {
    room.state = 'ended';
    room.phase = 'ended';
    room.turn = null;
    room.winnerId = winningSide.winnerId;
    room.winnerTeam = winningSide.winnerTeam;
    const winningPlayerIds = players
      .filter(player => player.id === room.winnerId || (room.winnerTeam && player.team === room.winnerTeam))
      .map(player => player.id);
    if (winningPlayerIds.length) {
      winningPlayerIds.forEach(targetId => addSoundEvent(room, 'game_win', { targetId }));
      winningPlayerIds.forEach(targetId => addSoundEvent(room, 'winner', { targetId, delayMs: 500 }));
    } else {
      addSoundEvent(room, 'game_draw');
    }
    const winnerName = room.winnerId ? room.players[room.winnerId]?.name : room.winnerTeam;
    room.log.push(winnerName ? `${winnerName}の勝利！` : '引き分けになった。');
  }
}

function startGame(roomName) {
  const room = rooms[roomName];
  room.state = 'playing';
  room.winnerId = null;
  room.winnerTeam = null;
  room.lastDamage = null;
  room.lastAction = null;
  room.soundEvents = [];
  room.soundSeq = 0;
  room.ascensionEvents = [];
  room.ascensionSeq = 0;
  room.effectEvents = [];
  room.effectSeq = 0;
  room.field = null;
  room.attackQueue = [];
  room.attackContext = null;
  room.followUpAttacks = [];
  
  const playerIds = Object.keys(room.players);
  room.turnOrder = [...playerIds].sort(() => Math.random() - 0.5);
  
  // Basic initialization
  playerIds.forEach(id => {
    const player = room.players[id];
    player.hp = 40;
    player.mp = 10;
    player.money = 20;
    player.ascended = false;
    player.learnedMiracles = [];
    player.ailments = [];
    player.assistant = null;
    player.pendingDamage = null;
    player.pendingDraws = 0;
    
    player.hand = createInitialHand(room.deck).map(withInstanceId);
  });
  
  // Decide starting player randomly
  const startingPlayer = room.turnOrder[0];
  room.turn = startingPlayer;
  room.mainTurnOwner = startingPlayer;
  room.phase = 'main'; // main or defense
  room.log = [`Game started! ${room.players[startingPlayer].name} goes first.`];
  addSoundEvent(room, 'game_start_number');
  addSoundEvent(room, 'game_start', { delayMs: 550 });
  addSoundEvent(room, 'client_turn', { targetId: startingPlayer, delayMs: 900 });
  
  console.log(`Game started in room ${roomName}. Turn: ${startingPlayer}`);
  
  // Emit game state to players (masking opponent's hand)
  emitGameState(roomName);
}

function armTurnTimer(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  const limit = room.timeLimitSeconds || 0;
  const timerKey = room.state === 'playing' && room.turn ? `${room.turn}:${room.phase}` : null;
  if (!limit || !timerKey) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
    room.turnTimerKey = null;
    room.turnDeadline = null;
    return;
  }
  if (room.turnTimerKey === timerKey && room.turnDeadline) return;
  clearTimeout(room.turnTimer);
  room.turnTimerKey = timerKey;
  room.turnDeadline = Date.now() + limit * 1000;
  room.turnTimer = setTimeout(() => {
    const current = rooms[roomName];
    if (!current || current.turnTimerKey !== timerKey || current.state !== 'playing') return;
    current.turnTimer = null;
    current.turnTimerKey = null;
    current.turnDeadline = null;
    const player = current.players[current.turn];
    if (!player) return;
    current.log.push(`${player.name}は時間切れになった。`);
    addSoundEvent(current, 'alert');
    if (current.phase === 'defense') {
      applyDamageAndClearField(current, player, player.pendingDamage?.amount || 0, roomName);
      return;
    }
    if (current.phase === 'buy_offer') current.pendingBuy = null;
    const nextTurnId = getNextAlivePlayerId(current.turnOrder, current.players, current.mainTurnOwner);
    endTurnInternal(current, nextTurnId);
    emitGameState(roomName);
  }, limit * 1000);
}

function scheduleBotTurn(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  clearTimeout(room.botTimer);
  const bot = room.players[room.turn];
  if (room.state !== 'playing' || !bot?.isBot || !['main', 'defense'].includes(room.phase)) return;
  room.botTimer = setTimeout(() => performBotTurn(roomName), 350);
}

function performBotTurn(roomName) {
  const room = rooms[roomName];
  const bot = room?.players[room.turn];
  if (!room || room.state !== 'playing' || !bot?.isBot) return;
  if (room.phase === 'defense') {
    const choiceIndex = bot.hand.findIndex(card => {
      const validation = validateCardPlay([card], 'defense', bot.ailments, bot.pendingDamage, bot.pendingDamage?.defensesUsed || 0);
      if (!validation.valid) return false;
      return ['reduce', 'block', 'remove_attribute'].includes(resolveDefenseCard(bot.pendingDamage, card).action);
    });
    if (choiceIndex >= 0) {
      const [card] = bot.hand.splice(choiceIndex, 1);
      queueReplacementDraws(bot, 1);
      const resolution = resolveDefenseCard(bot.pendingDamage, card);
      room.field.defenseCards.push(card);
      bot.pendingDamage.defensesUsed = (bot.pendingDamage.defensesUsed || 0) + 1;
      if (resolution.action === 'remove_attribute') bot.pendingDamage.attribute = 'none';
      applyDamageAndClearField(room, bot, resolution.amount, roomName);
    } else {
      applyDamageAndClearField(room, bot, bot.pendingDamage?.amount || 0, roomName);
    }
    return;
  }

  const enemies = Object.values(room.players).filter(player => areEnemies(bot, player) && !player.ascended && player.hp > 0);
  const target = enemies[Math.floor(Math.random() * enemies.length)];
  const cardIndex = bot.hand.findIndex(card => card.attack > 0
    && ['weapon', 'miracle'].includes(card.type)
    && bot.mp >= (card.costMp || 0));
  if (target && cardIndex >= 0) {
    const [card] = bot.hand.splice(cardIndex, 1);
    bot.mp -= card.costMp || 0;
    if (card.type === 'miracle' && !bot.learnedMiracles.some(miracle => miracle.id === card.id)) {
      const learned = { ...card };
      delete learned.instanceId;
      bot.learnedMiracles.push(learned);
      if (bot.learnedMiracles.length > 6) bot.learnedMiracles.shift();
    }
    queueReplacementDraws(bot, 1);
    card.forcedTargetId = target.id;
    const nextTurnId = getNextAlivePlayerId(room.turnOrder, room.players, bot.id);
    room.log.push(`${bot.name}は${card.name}を使用した。`);
    queueAttackSequence(room, bot, nextTurnId, card, [card], roomName);
    emitGameState(roomName);
    return;
  }

  if (!bot.hand.some(card => card.type === 'weapon') && bot.hand.length < 18) bot.hand.push(drawArtifact(room));
  const nextTurnId = getNextAlivePlayerId(room.turnOrder, room.players, bot.id);
  endTurnInternal(room, nextTurnId);
  emitGameState(roomName);
}

function emitGameState(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  armTurnTimer(roomName);
  
  const playerIds = Object.keys(room.players);
  
  playerIds.forEach(id => {
    const viewer = room.players[id];
    const usableDefenseInstanceIds = room.phase === 'defense' && room.turn === id
      ? viewer.hand.filter(card => validateCardPlay(
        [card], 'defense', viewer.ailments, viewer.pendingDamage, viewer.pendingDamage?.defensesUsed || 0,
      ).valid).map(card => card.instanceId)
      : [];
    const usableDefenseMiracleIndices = room.phase === 'defense' && room.turn === id
      ? viewer.learnedMiracles.flatMap((miracle, index) => validateCardPlay(
        [miracle], 'defense', viewer.ailments, viewer.pendingDamage, viewer.pendingDamage?.defensesUsed || 0,
      ).valid ? [index] : [])
      : [];
    const selectableDefenseSupportInstanceIds = room.phase === 'defense' && room.turn === id
      ? viewer.hand.filter(card => card.supportEffect === 'magic_free').map(card => card.instanceId)
      : [];
    // Construct player-specific view
    const stateView = {
      turn: room.turn,
      turnDeadline: room.turnDeadline,
      phase: room.phase,
      log: room.log,
      field: room.field,
      lastDamage: room.lastDamage,
      lastAction: room.lastAction,
      soundEvents: (room.soundEvents || []).filter(event => !event.targetId || event.targetId === id),
      ascensionEvents: room.ascensionEvents || [],
      effectEvents: room.effectEvents || [],
      usableDefenseInstanceIds,
      usableDefenseMiracleIndices,
      selectableDefenseSupportInstanceIds,
      chatMessages: (room.chatMessages || []).filter(message => !message.teamOnly || message.team === room.players[id].team),
      me: room.players[id],
      opponent: room.players[playerIds.find(p => p !== id)],
      opponents: playerIds.filter(playerId => playerId !== id).map(playerId => ({
        ...room.players[playerId],
        hand: room.players[playerId].hand.map(() => ({ hidden: true })),
      })),
      gameStateStr: room.state,
      winner: room.winnerId
        ? { id: room.winnerId, name: room.players[room.winnerId]?.name }
        : (room.winnerTeam ? { team: room.winnerTeam, name: `${room.winnerTeam}チーム` } : null),
      buyOffer: null
    };

    if (room.phase === 'buy_offer' && room.pendingBuy?.buyerId === id) {
      const seller = room.players[room.pendingBuy.sellerId];
      const offered = seller?.hand.find(c => c.instanceId === room.pendingBuy.instanceId);
      if (offered) stateView.buyOffer = offered;
    }
    
    // Hide opponent's hand
    if (stateView.opponent) {
      stateView.opponent = {
        ...stateView.opponent,
        hand: stateView.opponent.hand.map(() => ({ hidden: true }))
      };
    }
    
    io.to(id).emit('gameState', stateView);
  });
  Object.values(room.spectators || {}).forEach(spectator => {
    const visiblePlayers = playerIds.map(playerId => ({
      ...room.players[playerId],
      hand: room.players[playerId].hand.map(() => ({ hidden: true })),
    }));
    io.to(spectator.id).emit('gameState', {
      spectator: true,
      turn: room.turn,
      turnDeadline: room.turnDeadline,
      phase: room.phase,
      log: room.log,
      field: room.field,
      lastDamage: room.lastDamage,
      lastAction: room.lastAction,
      soundEvents: (room.soundEvents || []).filter(event => !event.targetId),
      ascensionEvents: room.ascensionEvents || [],
      effectEvents: room.effectEvents || [],
      usableDefenseInstanceIds: [],
      usableDefenseMiracleIndices: [],
      selectableDefenseSupportInstanceIds: [],
      chatMessages: (room.chatMessages || []).filter(message => !message.teamOnly),
      me: { id: spectator.id, name: spectator.name, hp: 0, mp: 0, money: 0, hand: [], learnedMiracles: [], ailments: [], ascended: true },
      opponent: visiblePlayers[0] || null,
      opponents: visiblePlayers,
      gameStateStr: room.state,
      winner: room.winnerId
        ? { id: room.winnerId, name: room.players[room.winnerId]?.name }
        : (room.winnerTeam ? { team: room.winnerTeam, name: `${room.winnerTeam}チーム` } : null),
      buyOffer: null,
    });
  });
  scheduleBotTurn(roomName);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
