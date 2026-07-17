const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const {
  applyAilment,
  combineAttackCards,
  cureAilments,
  createAttackQueue,
  isDefenseCard,
  processEndOfTurnAilments,
  resolveDefenseCard,
  rollAttack,
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

// Stores active rooms
// rooms[roomName] = { players: { socketId: { name, ready, ...gameState } }, state: 'waiting' | 'playing' }
const rooms = {};

function emitRoomUpdate(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  io.to(roomName).emit('roomUpdate', {
    hostId: room.hostId,
    state: room.state,
    players: Object.values(room.players).map(player => ({ id: player.id, name: player.name, ready: player.ready })),
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

  socket.on('joinRoom', ({ password, playerName, customCards = [], baseCardsEdits = {} }) => {
    let room = rooms[password];
    if (!room) {
      room = {
        players: {},
        hostId: socket.id,
        baseCardsEdits: { ...baseCardsEdits },
        editLocks: {},
        customCards: [...customCards],
        state: 'waiting', // waiting, playing, ended
        turn: null, // socket.id of the active player
        phase: 'main', // main, defense
        log: [],
        field: null,
        lastDamage: null,
        lastAction: null,
        winnerId: null,
        deck: [] // The shared deck
      };
      rooms[password] = room;
    }
    
    room.players[socket.id] = {
      id: socket.id,
      name: playerName,
      deck: [], // This will be ignored in favor of shared room deck
      ready: true,
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

  socket.on('lockBaseCard', ({ roomName, cardId }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'waiting' || !GF_BASE_CARDS.some(card => card.id === cardId)) return;
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
    if (!room || room.state !== 'waiting' || room.editLocks[cardId] !== socket.id) return;
    const allowed = {};
    for (const key of ['name', 'description', 'imageUrl']) {
      if (typeof patch?.[key] === 'string') allowed[key] = patch[key];
    }
    room.baseCardsEdits[cardId] = { ...(room.baseCardsEdits[cardId] || {}), ...allowed };
    emitBaseEditorState(roomName);
  });

  socket.on('importRoomBaseEdits', ({ roomName, edits }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'waiting' || !edits || typeof edits !== 'object') return;
    for (const [cardId, patch] of Object.entries(edits)) {
      if (room.editLocks[cardId] && room.editLocks[cardId] !== socket.id) continue;
      if (!GF_BASE_CARDS.some(card => card.id === cardId)) continue;
      const allowed = {};
      for (const key of ['name', 'description', 'imageUrl']) {
        if (typeof patch?.[key] === 'string') allowed[key] = patch[key];
      }
      room.baseCardsEdits[cardId] = { ...(room.baseCardsEdits[cardId] || {}), ...allowed };
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
    room.winnerId = null;
    room.pendingBuy = null;
    room.editLocks = {};
    room.log = [];
    Object.values(room.players).forEach(player => {
      player.hp = 40;
      player.mp = 0;
      player.money = 0;
      player.hand = [];
      player.learnedMiracles = [];
      player.ailments = [];
      player.pendingDamage = null;
      player.ascended = false;
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
      if (room.players[socket.id]) {
        for (const [cardId, ownerId] of Object.entries(room.editLocks || {})) {
          if (ownerId === socket.id) delete room.editLocks[cardId];
        }
        delete room.players[socket.id];
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomName]; // Clean up empty room
        } else {
          if (room.hostId === socket.id) room.hostId = Object.keys(room.players)[0];
          emitRoomUpdate(roomName);
          emitBaseEditorState(roomName);
          io.to(roomName).emit('playerDisconnected', socket.id);
        }
      }
    }
  });

  // --- Game Actions ---
  const handlePlayCard = ({ roomName, cardIndex, cardIndices, targetId }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'playing') return;
    
    const player = room.players[socket.id];
    if (room.turn !== socket.id) return; // Not their turn
    
    const requestedIndices = Array.isArray(cardIndices) && cardIndices.length
      ? [...new Set(cardIndices)].filter(Number.isInteger).sort((a, b) => a - b)
      : [cardIndex];
    const cards = requestedIndices.map(index => player.hand[index]).filter(Boolean);
    const card = cards.find(c => c.type === 'weapon' || c.type === 'miracle') || cards[0];
    if (!card) return;

    const isSell = room.phase === 'main' && cards.length === 2 && cards.some(c => c.effect === 'sell');
    const isSingleTrade = room.phase === 'main' && cards.length === 1 && cards[0].type === 'trade';
    if (isSingleTrade && cards[0].effect === 'sell') {
      socket.emit('errorMsg', '「売る」と売却する神器を2枚選択してください。');
      return;
    }
    const validation = validateCardPlay(cards, room.phase, player.ailments);
    if (!validation.valid || cards.length !== requestedIndices.length) {
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

    // Draw a replacement card (up to 18)
    const replacementCount = isSingleTrade && card.effect === 'buy' ? 0 : consumedIndices.length;
    for (let i = 0; i < replacementCount && room.deck.length > 0 && player.hand.length < 18; i++) {
       player.hand.push(drawArtifact(room));
    }

    const opponentId = targetId || Object.keys(room.players).find(id => id !== socket.id);
    const opponent = room.players[opponentId];

    cards.forEach(usedCard => {
      if (usedCard.selfAilment) {
        const applied = applyAilment(player, usedCard.selfAilment);
        room.log.push(`${player.name} は ${applied} になった。`);
      }
      if (usedCard.cureAilments) {
        const cured = cureAilments(player, usedCard.cureAilments);
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
      endTurnInternal(room, opponentId);
      checkDeath(room);
      emitGameState(roomName);
      return;
    }

    if (isSingleTrade) {
      if (card.effect === 'exchange') {
        room.phase = 'exchange';
        room.log.push(`${player.name} used Exchange.`);
      } else if (card.effect === 'buy') {
        const offered = opponent.hand[Math.floor(Math.random() * opponent.hand.length)];
        if (!offered) {
          endTurnInternal(room, opponentId);
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

    room.log.push(`${player.name} played ${combinedCard.name}!`);
    room.lastAction = createActionEvent(player, opponent, combinedCard, 'use');

    if (room.phase === 'main') {
       // Ailment: Hallucination causes random wrong card to be played sometimes? 
       // In GF, Hallucination just makes cards look like other cards, but when you play it, it uses the real card.
       // We can just handle this visually on frontend, backend doesn't need to change play logic.
       
       if (combinedCard.type === 'weapon') {
         queueAttackSequence(room, player, opponentId, combinedCard, cards, roomName);
       } else if (card.type === 'item') {
         if (card.healHp) player.hp = Math.min(99, player.hp + card.healHp);
         if (card.healMp) player.mp = Math.min(99, player.mp + card.healMp);
         if (card.moneyGain) player.money = Math.min(99, player.money + card.moneyGain);
         if (card.randomHp) {
           const change = Math.random() < 0.5 ? card.randomHp : -card.randomHp;
           player.hp = Math.min(99, player.hp + change);
           room.log.push(`${card.name}: HP ${change > 0 ? '+' : ''}${change}`);
         }
         if (card.removeItems) {
           const removed = removeRandomEntries(opponent.hand, card.removeItems);
           room.log.push(`${card.name} が ${opponent.name} の神器を ${removed.length} 個掃き飛ばした。`);
         }
         if (card.removeMiracles) {
           const removed = removeRandomEntries(opponent.learnedMiracles, card.removeMiracles);
           room.log.push(`${card.name} が ${opponent.name} の奇跡を ${removed.length} 個忘れさせた。`);
         }
         if (card.setAssistant) setRandomAssistant(player, room);
         if (card.mystery) resolveMystery(room, player);
         room.log.push(`${player.name} は ${card.name} の効果を受けた。`);
         endTurnInternal(room, opponentId);
       } else if (combinedCard.type === 'miracle') {
         if (combinedCard.attack > 0) {
           queueAttackSequence(room, player, opponentId, combinedCard, cards, roomName);
         } else {
            if (card.ailmentInflict && card.ailmentTrigger === 'use') {
              const applied = applyAilment(opponent, card.ailmentInflict);
              room.log.push(`${opponent.name} は ${applied} になった。`);
            }
            if (card.healHp) player.hp = Math.min(99, player.hp + card.healHp);
            if (card.moneyGain) player.money = Math.min(99, player.money + card.moneyGain);
            if (card.setAssistant) setRandomAssistant(player, room);
            room.field = { attackerId: player.id, attackCard: card };
            clearFieldLater(roomName);
            endTurnInternal(room, opponentId);
         }
       }
    } else if (room.phase === 'defense') {
       // Defense logic
       if (isDefenseCard(combinedCard)) {
         const pDamage = player.pendingDamage;
         if (!pDamage) return;

         const hasFlash = player.ailments.includes('flash');
         const resolution = resolveDefenseCard(pDamage, combinedCard);
         room.field.defenseCards.push(combinedCard);
         if (resolution.action === 'reflect' || resolution.action === 'flick') {
           const candidates = Object.values(room.players).filter(candidate => candidate.id !== player.id && !candidate.ascended && candidate.hp > 0);
           const target = resolution.action === 'reflect'
             ? room.players[pDamage.attackerId]
             : candidates[Math.floor(Math.random() * candidates.length)];
           player.pendingDamage = null;
           if (!target) {
             player.pendingDamage = pDamage;
             applyDamageAndClearField(room, player, 0, roomName);
           } else {
             target.pendingDamage = { ...pDamage, amount: resolution.amount };
             room.turn = target.id;
             room.field.defenderId = target.id;
             room.field.defenseCards = [];
             room.log.push(`${combinedCard.name} が攻撃を${resolution.action === 'reflect' ? 'はね返した' : '弾き飛ばした'}！`);
           }
         } else if (resolution.action === 'block') {
           room.log.push(`${combinedCard.name} が攻撃を完全に止めた！`);
           applyDamageAndClearField(room, player, 0, roomName);
         } else if (resolution.action === 'remove_attribute') {
           pDamage.attribute = 'none';
           room.log.push(`${combinedCard.name} が攻撃の属性を取り除いた。`);
           if (hasFlash) applyDamageAndClearField(room, player, pDamage.amount, roomName);
         } else if (resolution.action === 'reduce') {
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

  socket.on('castMiracle', ({ roomName, miracleIndex, targetId }) => {
    const room = rooms[roomName];
    const player = room?.players[socket.id];
    const miracle = player?.learnedMiracles[miracleIndex];
    if (!miracle || room.turn !== socket.id || !['main', 'defense'].includes(room.phase)) return;
    if (player.mp < (miracle.costMp || 0)) return socket.emit('errorMsg', 'MPが足りません。');
    player.hand.push(withInstanceId({ ...miracle, _learnedCast: true }));
    handlePlayCard({ roomName, cardIndex: player.hand.length - 1, targetId });
  });

  socket.on('completeExchange', ({ roomName, hp, mp, money }) => {
    const room = rooms[roomName];
    const player = room?.players[socket.id];
    const values = [hp, mp, money].map(Number);
    const total = player ? player.hp + player.mp + player.money : -1;
    if (!player || room.phase !== 'exchange' || room.turn !== socket.id || values.some(v => !Number.isInteger(v) || v < 0 || v > 99) || values.reduce((a, b) => a + b, 0) !== total) {
      return socket.emit('errorMsg', 'Keep the same total and set each value from 0 to 99.');
    }
    [player.hp, player.mp, player.money] = values;
    room.log.push(`${player.name} redistributed HP / MP / money.`);
    const next = Object.keys(room.players).find(id => id !== socket.id);
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
      seller.money += price;
      buyer.hand.push(seller.hand.splice(index, 1)[0]);
      room.log.push(`${buyer.name} bought ${offered.name} for money ${price}.`);
    } else if (accept && offered && buyer.money < price) {
      socket.emit('errorMsg', 'Not enough money.');
      return;
    } else {
      room.log.push(`${buyer.name} declined the purchase.`);
    }
    room.pendingBuy = null;
    for (let i = 0; i < (offer.drawAfter || 0) && buyer.hand.length < 18; i++) buyer.hand.push(drawArtifact(room));
    const next = Object.keys(room.players).find(id => id !== socket.id);
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

  socket.on('endTurn', ({ roomName }) => {
    const room = rooms[roomName];
    if (!room || room.state !== 'playing') return;
    if (room.turn !== socket.id || room.phase !== 'main') return;
    
    const opponentId = Object.keys(room.players).find(id => id !== socket.id);
    endTurnInternal(room, opponentId);
    emitGameState(roomName);
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
    for (let i = 0; i < discarded.length && player.hand.length < 18; i++) player.hand.push(drawArtifact(room));
    if (discarded.length) room.log.push(`${player.name} は ${discarded.map(discardedCard => discardedCard.name).join('、')} を捨てた。`);
    const next = Object.keys(room.players).find(id => id !== socket.id);
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
    const hasWeapon = player.hand.some(c => c.type === 'weapon' && c.attack > 0);
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

    const opponentId = Object.keys(room.players).find(id => id !== socket.id);
    endTurnInternal(room, opponentId);
    emitGameState(roomName);
  });
});

function applyDamageAndClearField(room, player, amount, roomName) {
   const pendingDamage = player.pendingDamage;
   const isDarkAttack = pendingDamage?.attribute === 'dark' && amount > 0;
   let actualDamage = isDarkAttack ? 999 : Math.max(0, amount);
   if (actualDamage > 0 && player.assistant?.hp > 0) {
     const absorbed = Math.min(actualDamage, player.assistant.hp);
     player.assistant.hp -= absorbed;
     actualDamage -= absorbed;
     room.log.push(`${player.name} の守護神が ${absorbed} ダメージを引き受けた。`);
     if (player.assistant.hp <= 0) {
       room.log.push(`${player.name} の守護神は去った。`);
       player.assistant = null;
     }
   }
   player.hp = Math.max(0, player.hp - actualDamage);
   if (pendingDamage?.lethalOnDamage && actualDamage > 0) {
     player.hp = 0;
     room.log.push(`${player.name} は即死攻撃を受けた。`);
   }
   room.log.push(isDarkAttack && actualDamage > 0
     ? `${player.name} took dark damage and ascended!`
     : `${player.name} took ${actualDamage} damage!`);
   if (actualDamage > 0) {
     for (const ailment of pendingDamage?.ailments || []) {
       const applied = applyAilment(player, ailment);
       room.log.push(`${player.name} は ${applied} になった。`);
     }
     const attacker = room.players[pendingDamage?.attackerId];
     if (attacker && pendingDamage?.absorbHp) {
       attacker.hp = Math.min(99, attacker.hp + actualDamage);
       room.log.push(`${attacker.name} はHPを ${actualDamage} 吸収した。`);
     }
     if (attacker && pendingDamage?.selfDamage) {
       attacker.hp -= actualDamage;
       room.log.push(`${attacker.name} も ${actualDamage} ダメージを受けた。`);
     }
     for (const defenseCard of room.field?.defenseCards || []) {
       if (attacker && defenseCard.retaliateAilment) {
         const applied = applyAilment(attacker, defenseCard.retaliateAilment);
         room.log.push(`${attacker.name} は ${defenseCard.name} により ${applied} になった。`);
       }
       for (const reactiveEffect of new Set([defenseCard.reactiveEffect, ...(defenseCard.reactiveEffects || [])].filter(Boolean))) {
         if (!attacker) continue;
         if (reactiveEffect === 'counter_damage_all') attacker.hp -= actualDamage;
         if (reactiveEffect === 'counter_double_damage') attacker.hp -= actualDamage * 2;
         if (reactiveEffect === 'recover_double_mp') player.mp = Math.min(99, player.mp + actualDamage * 2);
         if (reactiveEffect === 'absorb_money') {
           const amountToSteal = Math.min(actualDamage, attacker.money);
           attacker.money -= amountToSteal;
           player.money = Math.min(99, player.money + amountToSteal);
         }
       }
     }
   }
   player.pendingDamage = null;
   
   // Store last damage to trigger UI animation
   room.lastDamage = { amount: actualDamage, targetId: player.id, timestamp: Date.now() };

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
  setTimeout(() => {
    const room = rooms[roomName];
    if (!room || room.state === 'waiting') return;
    room.field = null;
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

function queueAttackSequence(room, attacker, nextTurnId, card, cards, roomName) {
  const targets = card.target === 'all'
    ? Object.values(room.players).filter(player => player.id !== attacker.id && !player.ascended && player.hp > 0)
    : [room.players[card.forcedTargetId || nextTurnId]].filter(Boolean);
  room.attackQueue = createAttackQueue(targets.map(target => target.id), card.repeatCount || 1);
  room.attackContext = {
    attackerId: attacker.id,
    nextTurnId,
    card,
    ailments: cards.filter(usedCard => usedCard.ailmentTrigger === 'damage').map(usedCard => usedCard.ailmentInflict).filter(Boolean),
  };
  startNextQueuedAttack(room, roomName);
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
      room.log.push(`${target.name} は ${context.card.name}（${queued.repeat}回目）を回避！`);
      continue;
    }
    target.pendingDamage = {
      amount: context.card.attack,
      attribute: context.card.attribute,
      source: attacker.name,
      attackerId: attacker.id,
      sourceType: context.card.sourceType || context.card.type,
      absorbHp: context.card.absorbHp,
      selfDamage: context.card.selfDamage,
      lethalOnDamage: context.card.lethalOnDamage,
      nextTurnId: context.nextTurnId,
      ailments: context.ailments,
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
    room.attackQueue = [];
    room.attackContext = null;
    clearFieldLater(roomName);
    endTurnInternal(room, nextTurnId);
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
  player.assistant = { type, hp: 20 };
  room.log.push(`${player.name} に ${type} の守護神が宿った。`);
}

function resolveMystery(room, actor) {
  const type = ASSISTANT_TYPES[Math.floor(Math.random() * ASSISTANT_TYPES.length)];
  const players = Object.values(room.players).filter(player => !player.ascended && player.hp > 0);
  if (type === 'mars') players.forEach(player => applyAilment(player, 'fever'));
  if (type === 'mercury') players.forEach(player => applyAilment(player, 'fog'));
  if (type === 'jupiter') players.forEach(player => applyAilment(player, 'dream'));
  if (type === 'saturn') players.forEach(player => { player.hp = 1; });
  if (type === 'uranus' && players.length) players[Math.floor(Math.random() * players.length)].hp -= 60;
  if (type === 'pluto') players.filter(player => player.id !== actor.id).forEach(player => {
    if (Math.random() < 0.75) player.hp = 0;
  });
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
  seller.money = Math.min(99, seller.money + price);
  if (buyer.hand.length < 18) buyer.hand.push(withInstanceId(card));
  room.log.push(`${seller.name} forced ${buyer.name} to buy ${card.name} for money ${price}.`);
}

function processAilments(player, room) {
  const result = processEndOfTurnAilments(player);
  if (result.hpChange) room.log.push(`${player.name} の病気効果: HP ${result.hpChange > 0 ? '+' : ''}${result.hpChange}`);
  if (result.progressedTo) room.log.push(`${player.name} の病気が ${result.progressedTo} に悪化した。`);
  if (result.fatal) room.log.push(`${player.name} は天国病の発作でHPが0になった。`);
}

function endTurnInternal(room, nextTurnId) {
   const endingPlayer = room.players[room.mainTurnOwner];
   if (endingPlayer && endingPlayer.id !== nextTurnId) processAilments(endingPlayer, room);
   checkDeath(room);
   if (room.state === 'ended') return;
   room.turn = nextTurnId;
   room.mainTurnOwner = nextTurnId;
   room.phase = 'main';
   const player = room.players[nextTurnId];
   room.log.push(`--- ${player.name}'s Turn ---`);
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
      if (player.hp <= 0 && !player.ascended) {
         const reviveIndex = player.hand.findIndex(card => card.reviveHp > 0);
         if (reviveIndex >= 0) {
           const [reviver] = player.hand.splice(reviveIndex, 1);
           player.hp = reviver.reviveHp;
           if (player.hand.length < 18) player.hand.push(drawArtifact(room));
           room.log.push(`${reviver.name} により ${player.name} はHP${player.hp}で復活した。`);
           return;
         }
         const dyingAttackIndex = player.hand.findIndex(card => card.dyingAttack);
         if (dyingAttackIndex >= 0) {
           const [dyingCard] = player.hand.splice(dyingAttackIndex, 1);
           players.filter(target => target.id !== player.id && !target.ascended && target.hp > 0).forEach(target => {
             if (Math.random() * 100 < dyingCard.dyingAttack.hitRate) {
               target.hp = Math.max(0, target.hp - dyingCard.dyingAttack.attack);
               room.log.push(`${player.name} の ${dyingCard.name} が ${target.name} に ${dyingCard.dyingAttack.attack} ダメージ！`);
             }
           });
         }
         player.ascended = true;
         room.log.push(`${player.name} has ascended (died)!`);
      }
   });
   const survivors = players.filter(player => !player.ascended && player.hp > 0);
   if (room.state === 'playing' && players.length > 1 && survivors.length <= 1) {
      room.state = 'ended';
      room.phase = 'ended';
      room.turn = null;
      room.winnerId = survivors[0]?.id || null;
      room.log.push(survivors[0] ? `${survivors[0].name} wins!` : 'The battle ended in a draw.');
   }
}

function startGame(roomName) {
  const room = rooms[roomName];
  room.state = 'playing';
  room.winnerId = null;
  room.lastDamage = null;
  room.lastAction = null;
  room.field = null;
  room.attackQueue = [];
  room.attackContext = null;
  
  const playerIds = Object.keys(room.players);
  
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
    
    // Draw initial 9 cards from the shared room deck
    player.hand = [];
    for (let i = 0; i < 9; i++) {
       if (room.deck.length > 0) {
          player.hand.push(drawArtifact(room));
       }
    }
  });
  
  // Decide starting player randomly
  const startingPlayer = playerIds[Math.floor(Math.random() * playerIds.length)];
  room.turn = startingPlayer;
  room.mainTurnOwner = startingPlayer;
  room.phase = 'main'; // main or defense
  room.log = [`Game started! ${room.players[startingPlayer].name} goes first.`];
  
  console.log(`Game started in room ${roomName}. Turn: ${startingPlayer}`);
  
  // Emit game state to players (masking opponent's hand)
  emitGameState(roomName);
}

function emitGameState(roomName) {
  const room = rooms[roomName];
  if (!room) return;
  
  const playerIds = Object.keys(room.players);
  
  playerIds.forEach(id => {
    // Construct player-specific view
    const stateView = {
      turn: room.turn,
      phase: room.phase,
      log: room.log,
      field: room.field,
      lastDamage: room.lastDamage,
      lastAction: room.lastAction,
      me: room.players[id],
      opponent: room.players[playerIds.find(p => p !== id)],
      gameStateStr: room.state,
      winner: room.winnerId ? { id: room.winnerId, name: room.players[room.winnerId]?.name } : null,
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
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
