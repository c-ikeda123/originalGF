const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const {
  applyAilment,
  cureAilments,
  processEndOfTurnAilments,
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
    const totalMp = isSell ? 0 : cards.reduce((sum, c) => sum + (c.costMp || 0), 0);
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

    const combinedCard = cards.length > 1 ? {
      ...card,
      name: cards.map(c => c.name).join(' + '),
      attack: cards.reduce((sum, c) => sum + (c.attack || 0), 0),
      defense: cards.reduce((sum, c) => sum + (c.defense || 0), 0),
      hitRate: Math.min(...cards.filter(c => c.attack > 0).map(c => c.hitRate || 100)),
      attribute: combineAttributes(cards),
      description: `Combined: ${cards.map(c => c.name).join(', ')}`
    } : card;

    room.log.push(`${player.name} played ${combinedCard.name}!`);

    if (room.phase === 'main') {
       // Ailment: Hallucination causes random wrong card to be played sometimes? 
       // In GF, Hallucination just makes cards look like other cards, but when you play it, it uses the real card.
       // We can just handle this visually on frontend, backend doesn't need to change play logic.
       
       if (combinedCard.type === 'weapon') {
         // Attack logic
         const hitResult = rollAttack(combinedCard, opponent.ailments);
         room.lastAction = createActionEvent(player, opponent, combinedCard, hitResult.outcome);
         if (hitResult.hit) {
           room.log.push(hitResult.outcome === 'unavoidable' ? `${combinedCard.name} は不可避！` : `${combinedCard.name} が命中！`);

           room.phase = 'defense';
           room.turn = opponentId; // Opponent's turn to defend
           room.players[opponentId].pendingDamage = {
             amount: combinedCard.attack,
             attribute: combinedCard.attribute,
             source: player.name,
             attackerId: player.id,
             ailments: cards.filter(usedCard => usedCard.ailmentTrigger === 'damage').map(usedCard => usedCard.ailmentInflict).filter(Boolean),
           };
           room.field = {
             attackerId: player.id,
             attackCard: combinedCard,
             defenderId: opponentId,
             defenseCards: []
           };
           room.log.push(`${opponent.name} is defending...`);
         } else {
           room.log.push(`${opponent.name} は ${combinedCard.name} を回避！`);
           room.field = { attackerId: player.id, attackCard: combinedCard, missed: true };
           clearFieldLater(roomName);
           endTurnInternal(room, opponentId);
         }
       } else if (card.type === 'item') {
         // Item logic (heal)
         if (card.healHp) player.hp += card.healHp;
         if (card.healMp) player.mp += card.healMp;
         room.log.push(`${player.name} recovered stats.`);
         endTurnInternal(room, opponentId);
       } else if (combinedCard.type === 'miracle') {
         if (combinedCard.attack > 0) {
           const hitResult = rollAttack(combinedCard, opponent.ailments);
           room.lastAction = createActionEvent(player, opponent, combinedCard, hitResult.outcome);
           if (hitResult.hit) {
             room.phase = 'defense';
             room.turn = opponentId;
             opponent.pendingDamage = {
               amount: combinedCard.attack,
               attribute: combinedCard.attribute,
               source: player.name,
               attackerId: player.id,
               ailments: cards.filter(usedCard => usedCard.ailmentTrigger === 'damage').map(usedCard => usedCard.ailmentInflict).filter(Boolean),
             };
             room.field = { attackerId: player.id, attackCard: combinedCard, defenderId: opponentId, defenseCards: [] };
             room.log.push(hitResult.outcome === 'unavoidable' ? `${combinedCard.name} は不可避！` : `${combinedCard.name} が命中！`);
           } else {
             room.field = { attackerId: player.id, attackCard: combinedCard, missed: true };
             room.log.push(`${opponent.name} は ${combinedCard.name} を回避！`);
             clearFieldLater(roomName);
             endTurnInternal(room, opponentId);
           }
         } else {
            if (card.ailmentInflict && card.ailmentTrigger === 'use') {
              const applied = applyAilment(opponent, card.ailmentInflict);
              room.log.push(`${opponent.name} は ${applied} になった。`);
            }
            if (card.healHp) player.hp += card.healHp;
            room.field = { attackerId: player.id, attackCard: card };
            clearFieldLater(roomName);
            endTurnInternal(room, opponentId);
         }
       }
    } else if (room.phase === 'defense') {
       // Defense logic
       if (['armor', 'ring', 'defense_item', 'accessory'].includes(combinedCard.type) || (combinedCard.type === 'miracle' && combinedCard.defense > 0)) {
         const pDamage = player.pendingDamage;
         if (!pDamage) return;

         // Attribute check
         let blocks = true;
         if (pDamage.attribute === 'light') blocks = false;
         else if (pDamage.attribute === 'fire' && !['water', 'light'].includes(combinedCard.attribute)) blocks = false;
         else if (pDamage.attribute === 'water' && !['fire', 'light'].includes(combinedCard.attribute)) blocks = false;
         else if (pDamage.attribute === 'wood' && !['earth', 'light'].includes(combinedCard.attribute)) blocks = false;
         else if (pDamage.attribute === 'earth' && !['wood', 'light'].includes(combinedCard.attribute)) blocks = false;
         else if (pDamage.attribute === 'dark') blocks = true; // Dark can be blocked by anything, but if unblocked it hits hard
         
         // Ailment: Flash limits defense to 1 card. (We'll enforce this by immediately ending defense phase if they have flash and play a card)
         const hasFlash = player.ailments.includes('flash');

         if (blocks) {
            pDamage.amount -= combinedCard.defense;
            room.field.defenseCards.push(combinedCard);
            room.log.push(`${player.name} defended with ${combinedCard.name}! Reduced damage by ${combinedCard.defense}.`);
            if (pDamage.amount <= 0) {
               room.log.push(`Damage was completely blocked!`);
               player.pendingDamage = null;
               
               // Resolve field after a short delay
               clearFieldLater(roomName);
               endTurnInternal(room, player.id); // It becomes player's turn to attack now
            } else if (hasFlash) {
               room.log.push(`${player.name} is blinded by Flash and cannot play more defense cards!`);
               applyDamageAndClearField(room, player, pDamage.amount, roomName);
            }
         } else {
            room.field.defenseCards.push(card);
            room.log.push(`${card.name} (${card.attribute}) cannot block ${pDamage.attribute} attribute!`);
            if (hasFlash) {
               room.log.push(`${player.name} is blinded by Flash and cannot play more defense cards!`);
               applyDamageAndClearField(room, player, pDamage.amount, roomName);
            }
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
   const actualDamage = Math.max(0, amount);
   const pendingDamage = player.pendingDamage;
   const isDarkLethal = pendingDamage?.attribute === 'dark' && actualDamage > 0;
   player.hp = isDarkLethal ? 0 : player.hp - actualDamage;
   room.log.push(isDarkLethal
     ? `${player.name} took dark damage and ascended!`
     : `${player.name} took ${actualDamage} damage!`);
   if (actualDamage > 0) {
     for (const ailment of pendingDamage?.ailments || []) {
       const applied = applyAilment(player, ailment);
       room.log.push(`${player.name} は ${applied} になった。`);
     }
     const attacker = room.players[pendingDamage?.attackerId];
     for (const defenseCard of room.field?.defenseCards || []) {
       if (attacker && defenseCard.retaliateAilment) {
         const applied = applyAilment(attacker, defenseCard.retaliateAilment);
         room.log.push(`${attacker.name} は ${defenseCard.name} により ${applied} になった。`);
       }
     }
   }
   player.pendingDamage = null;
   
   // Store last damage to trigger UI animation
   room.lastDamage = { amount: actualDamage, targetId: player.id, timestamp: Date.now() };

   clearFieldLater(roomName);

   endTurnInternal(room, player.id);
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

function combineAttributes(cards) {
  const attributes = [...new Set(cards.map(c => c.attribute).filter(a => a && a !== 'none'))];
  if (attributes.length === 0) return 'none';
  if (attributes.length === 1) return attributes[0];
  const nonLight = attributes.filter(a => a !== 'light');
  return nonLight.length === 1 ? nonLight[0] : 'none';
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
