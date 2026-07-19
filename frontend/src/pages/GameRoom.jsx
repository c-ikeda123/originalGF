import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import '../index.css';
import RoomBaseEditor from './RoomBaseEditor';
import { playSound } from '../soundEffects';
import { canAddCardToSelection, getDefenseTotal, getNextCardSelection } from '../utils/cardSelection';
import { getDreamDisplayedCard, isDreamAffectedCard } from '../utils/dreamCards';
import { getHandDetailLeft, mergeHandOrder, moveHandCard } from '../utils/handOrder';
import {
  getLatestFieldPresentationId,
  getLatestPresentationId,
  getNewPresentationEvents,
  getPresentationDuration,
  shouldApplyFieldClear,
} from '../utils/presentationQueue';

let socket;
const serverUrl = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);
const RESOURCE_EFFECT_TYPES = new Set(['hp_increase', 'mp_increase', 'yen_increase']);
const ASSISTANT_EFFECT_TYPES = new Set(['assistant_add', 'assistant_action', 'assistant_remove']);
const PRESENTATION_MANAGED_SOUNDS = new Set([
  'card', 'hit', 'miss', 'damage', 'damage_dark', 'client_turn', 'dead',
  'hp_increase', 'mp_increase', 'yen_increase', 'harm_remove', 'harm_add', 'disease',
  'illusion_item', 'reflect', 'flick', 'block', 'seizure', 'no_change',
  'assistant_add', 'assistant', 'assistant_remove', 'game_start', 'game_draw', 'item_remove', 'exchange',
]);
const EFFECT_SOUNDS = {
  hp_increase: 'hp_increase', mp_increase: 'mp_increase', yen_increase: 'yen_increase',
  harm_remove: 'harm_remove', reflect: 'reflect', flick: 'flick', block: 'block',
  seizure: 'seizure', no_change: 'no_change', illusion: 'illusion_item',
  cold: 'disease', fever: 'disease', hell: 'disease', heaven: 'disease', fog: 'disease',
  glory: 'disease', dark_cloud: 'disease', assistant_add: 'assistant_add',
  assistant_action: 'assistant', assistant_remove: 'assistant_remove',
};
const EFFECT_LABELS = {
  cold: '風邪', fever: '熱病', hell: '地獄病', heaven: '天国病', fog: '霧',
  glory: '閃光', illusion: '夢', dark_cloud: '暗雲', harm_remove: '災い解除',
  reflect: '反射', flick: '弾き', block: '防御', seizure: '奇跡消去', no_change: '効果なし',
  assistant_add: '守護神降臨', assistant_action: '守護神行動', assistant_remove: '守護神離脱',
};

export default function GameRoom() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const playerName = location.state?.playerName || 'Player';
  const role = location.state?.role || 'player';
  
  const [gameState, setGameState] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [baseEditorState, setBaseEditorState] = useState({ edits: {}, locks: {} });
  const [socketId, setSocketId] = useState('');
  const [error, setError] = useState('');
  const [damageAnim, setDamageAnim] = useState(null);
  const [actionAnim, setActionAnim] = useState(null);
  const [startAnim, setStartAnim] = useState(false);
  const [ascensionAnim, setAscensionAnim] = useState(null);
  const [effectAnim, setEffectAnim] = useState(null);
  const [cardEnterAnim, setCardEnterAnim] = useState(null);
  const [turnAnim, setTurnAnim] = useState(null);
  const [fieldClearing, setFieldClearing] = useState(false);
  const [visibleField, setVisibleField] = useState(null);
  const [handRefillAnim, setHandRefillAnim] = useState(null);
  const [miracleStockAnim, setMiracleStockAnim] = useState(null);
  const [presentationBusy, setPresentationBusy] = useState(false);
  const [pendingMiracleIds, setPendingMiracleIds] = useState([]);
  const [initialDealAnim, setInitialDealAnim] = useState(null);
  const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
  const [hoveredMiracleIndex, setHoveredMiracleIndex] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const [playPending, setPlayPending] = useState(false);
  const [handOrder, setHandOrder] = useState([]);
  const [draggedCardId, setDraggedCardId] = useState(null);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [teamChat, setTeamChat] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [exchangeValues, setExchangeValues] = useState({ hp: 0, mp: 0, money: 0 });
  const [battleScale, setBattleScale] = useState(() => Math.min(window.innerWidth / 1024, window.innerHeight / 768));
  const handInstanceKey = gameState?.me?.hand.map(card => card.instanceId).join('|') || '';
  const lastSoundEventId = useRef(0);
  const lastPresentationEventId = useRef(0);
  const visibleFieldPresentationId = useRef(0);
  const hasReceivedPresentationState = useRef(false);
  const presentationQueue = useRef([]);
  const presentationActive = useRef(false);
  const presentationTimer = useRef(null);
  const soundTimers = useRef([]);
  const handOrderRef = useRef([]);
  const suppressCardClick = useRef(false);
  const chatMessagesRef = useRef(null);
  const activePlayRequest = useRef(0);
  useEffect(() => {
    const updateBattleScale = () => setBattleScale(Math.min(window.innerWidth / 1024, window.innerHeight / 768));
    window.addEventListener('resize', updateBattleScale);
    return () => window.removeEventListener('resize', updateBattleScale);
  }, []);

  useEffect(() => {
    const activeSoundTimers = soundTimers.current;
    const clearPresentation = () => {
      setDamageAnim(null);
      setActionAnim(null);
      setStartAnim(false);
      setAscensionAnim(null);
      setEffectAnim(null);
      setCardEnterAnim(null);
      setTurnAnim(null);
      setFieldClearing(false);
      setHandRefillAnim(null);
      setMiracleStockAnim(null);
      setInitialDealAnim(null);
    };
    const playPresentationSound = event => {
      if (event.type === 'game_start') playSound('game_start');
      if (event.type === 'card_enter') {
        const cardCount = Math.max(1, event.cards?.length || 0);
        const soundDelays = cardCount === 1
          ? [80, 260]
          : Array.from({ length: cardCount }, (_, index) => index * 260 + 220);
        soundDelays.forEach(delayMs => {
          const timer = setTimeout(() => playSound('card'), delayMs);
          activeSoundTimers.push(timer);
        });
      }
      if (event.type === 'initial_deal') {
        for (let index = 0; index < (event.cardCount || 0); index += 1) {
          const timer = setTimeout(() => playSound('card'), index * 90);
          activeSoundTimers.push(timer);
        }
      }
      if (event.type === 'action') {
        const actionSound = { discard: 'item_remove', trade: 'exchange' }[event.actionType];
        if (actionSound) playSound(actionSound);
      }
      if (event.type === 'hit_result') playSound(event.outcome === 'evade' ? 'miss' : 'hit');
      if (event.type === 'damage') playSound(event.dark ? 'damage_dark' : 'damage');
      if (event.type === 'effect' && EFFECT_SOUNDS[event.effectType]) playSound(EFFECT_SOUNDS[event.effectType]);
      if (event.type === 'ascension') playSound('dead');
      if (event.type === 'turn_start' && event.playerId === socket.id) playSound('client_turn');
    };
    const playNextPresentation = () => {
      const event = presentationQueue.current.shift();
      if (!event) {
        presentationActive.current = false;
        setPresentationBusy(false);
        clearPresentation();
        return;
      }
      presentationActive.current = true;
      setPresentationBusy(true);
      clearPresentation();
      playPresentationSound(event);
      if (event.type === 'game_start') setStartAnim(true);
      if (event.type === 'initial_deal') setInitialDealAnim(event);
      if (event.type === 'card_enter') setCardEnterAnim(event);
      if (event.type === 'action' || event.type === 'hit_result') setActionAnim({
        ...event,
        type: event.actionType || event.type,
        outcome: event.outcome || 'use',
      });
      if (event.type === 'damage') setDamageAnim({
        ...event,
        targetId: event.playerId,
        timestamp: event.id,
        isDarkFollowUp: Boolean(event.dark),
      });
      if (event.type === 'effect') setEffectAnim({ ...event, type: event.effectType });
      if (event.type === 'ascension') setAscensionAnim(event);
      if (event.type === 'field_clear' && shouldApplyFieldClear(event.id, visibleFieldPresentationId.current)) {
        setFieldClearing(true);
      }
      if (event.type === 'hand_refill') setHandRefillAnim(event);
      if (event.type === 'miracle_stock') setMiracleStockAnim(event);
      if (event.type === 'turn_start') setTurnAnim(event);
      clearTimeout(presentationTimer.current);
      presentationTimer.current = setTimeout(() => {
        if (event.type === 'field_clear' && shouldApplyFieldClear(event.id, visibleFieldPresentationId.current)) {
          visibleFieldPresentationId.current = 0;
          setVisibleField(null);
        }
        if (event.type === 'miracle_stock') {
          setPendingMiracleIds(current => current.filter(cardId => cardId !== event.card?.id));
        }
        playNextPresentation();
      }, getPresentationDuration(event));
    };
    socket = io(serverUrl);
    socket.on('connect', () => setSocketId(socket.id));

    const savedCards = JSON.parse(localStorage.getItem('gf_custom_cards') || '[]');
    const baseCardsEdits = JSON.parse(localStorage.getItem('gf_base_cards_edits') || '{}');
    
    // Send all created cards to be mixed into the common deck
    socket.emit('joinRoom', { 
       password: id, 
       playerName, 
       customCards: savedCards,
       baseCardsEdits,
       role,
    });

    socket.on('roomUpdate', (data) => {
      setRoomState(data);
      setChatMessages(current => current.length ? current : (data.chatMessages || []));
    });

    socket.on('gameState', (data) => {
      setGameState(data);
      const presentationEvents = data.presentationEvents || [];
      if (data.field) {
        visibleFieldPresentationId.current = getLatestFieldPresentationId(
          presentationEvents,
          visibleFieldPresentationId.current,
        );
        setVisibleField(data.field);
      }
      if (data.chatMessages) setChatMessages(data.chatMessages);
      if (!hasReceivedPresentationState.current) {
        hasReceivedPresentationState.current = true;
        lastPresentationEventId.current = getLatestPresentationId(presentationEvents);
        const recentEvents = presentationEvents.filter(event => Date.now() - event.timestamp < 5000);
        if (recentEvents.length) {
          setPendingMiracleIds(recentEvents.filter(event => event.type === 'miracle_stock').map(event => event.card?.id).filter(Boolean));
          presentationQueue.current.push(...recentEvents);
          playNextPresentation();
        }
      } else {
        const newPresentationEvents = getNewPresentationEvents(presentationEvents, lastPresentationEventId.current);
        if (newPresentationEvents.length) {
          const pendingIds = newPresentationEvents.filter(event => event.type === 'miracle_stock').map(event => event.card?.id).filter(Boolean);
          if (pendingIds.length) setPendingMiracleIds(current => [...new Set([...current, ...pendingIds])]);
          lastPresentationEventId.current = getLatestPresentationId(newPresentationEvents, lastPresentationEventId.current);
          presentationQueue.current.push(...newPresentationEvents);
          if (!presentationActive.current) playNextPresentation();
        }
      }
      const newSoundEvents = (data.soundEvents || []).filter(event => event.id > lastSoundEventId.current);
      if (newSoundEvents.length) {
        lastSoundEventId.current = Math.max(...newSoundEvents.map(event => event.id));
        newSoundEvents.filter(event => !PRESENTATION_MANAGED_SOUNDS.has(event.name)).forEach(event => {
          const timer = setTimeout(() => playSound(event.name), event.delayMs || 0);
          activeSoundTimers.push(timer);
        });
      }
    });

    socket.on('baseEditorState', data => setBaseEditorState(data));
    socket.on('chatMessage', message => {
      setChatMessages(current => current.some(existing => existing.id === message.id)
        ? current
        : [...current, message].slice(-100));
    });

    socket.on('gameStateCleared', () => {
      activePlayRequest.current += 1;
      setGameState(null);
      setSelectedCards([]);
      setPlayPending(false);
      setDamageAnim(null);
      setActionAnim(null);
      setStartAnim(false);
      lastSoundEventId.current = 0;
      lastPresentationEventId.current = 0;
      visibleFieldPresentationId.current = 0;
      hasReceivedPresentationState.current = false;
      presentationQueue.current = [];
      presentationActive.current = false;
      setPresentationBusy(false);
      setPendingMiracleIds([]);
      clearTimeout(presentationTimer.current);
      clearPresentation();
      setVisibleField(null);
    });

    socket.on('errorMsg', (msg) => {
      playSound('alert');
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      clearTimeout(presentationTimer.current);
      presentationQueue.current = [];
      presentationActive.current = false;
      activeSoundTimers.forEach(clearTimeout);
      socket.disconnect();
    };
  }, [id, playerName, role, navigate]);

  useEffect(() => {
    if (gameState?.phase === 'exchange' && gameState.me) {
      setExchangeValues({ hp: gameState.me.hp, mp: gameState.me.mp, money: gameState.me.money });
    }
  }, [gameState?.phase, gameState?.me]);

  useEffect(() => {
    if (!gameState?.turnDeadline && !gameState?.actionLockedUntil) return undefined;
    const timer = setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (!gameState?.turnDeadline && (gameState?.actionLockedUntil || 0) <= currentTime) clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [gameState?.turnDeadline, gameState?.actionLockedUntil]);

  useEffect(() => {
    activePlayRequest.current += 1;
    setSelectedCards([]);
    setPlayPending(false);
    setHoveredCardIndex(null);
  }, [gameState?.turn, gameState?.phase, gameState?.actionLockedUntil, handInstanceKey]);

  useEffect(() => {
    const hand = gameState?.me?.hand || [];
    setHandOrder(current => {
      const nextOrder = mergeHandOrder(current, hand);
      handOrderRef.current = nextOrder;
      return nextOrder;
    });
  }, [handInstanceKey, gameState?.me?.hand]);

  useEffect(() => {
    const chatElement = chatMessagesRef.current;
    if (chatElement) chatElement.scrollTop = chatElement.scrollHeight;
  }, [chatMessages]);

  const myTeam = gameState?.me?.team
    || roomState?.players?.find(player => player.id === socketId)?.team;
  const submitChat = event => {
    event.preventDefault();
    if (!chatText.trim()) return;
    socket.emit('sendChat', { roomName: id, text: chatText, teamOnly: teamChat && Boolean(myTeam) });
    setChatText('');
  };
  const renderChat = (className = '') => (
    <div className={`chat-panel ${className}`.trim()}>
      <div className="chat-messages" ref={chatMessagesRef}>
        {chatMessages.slice(-30).map(message => (
          <div key={message.id} className={message.teamOnly ? 'team-message' : ''}>
            <strong>{message.senderName}</strong>{message.teamOnly ? ' [チーム]' : ''}: {message.text}
          </div>
        ))}
      </div>
      <form onSubmit={submitChat} className="chat-form">
        <input value={chatText} maxLength={200} onChange={event => setChatText(event.target.value)} placeholder="メッセージ" />
        {myTeam && role === 'player' && (
          <label><input type="checkbox" checked={teamChat} onChange={event => setTeamChat(event.target.checked)} />チーム</label>
        )}
        <button type="submit" className="btn btn-secondary">送信</button>
      </form>
    </div>
  );

  if (!gameState) {
    return (
      <div className="room-lobby">
        {error && <div style={{color: 'red', marginBottom: '10px'}}>{error}</div>}
        <div className="glass-panel lobby-header">
          <div><h2>Room: {id}</h2><p>{roomState?.players?.length || 0}人参加中</p></div>
          <div className="lobby-players">{roomState?.players?.map(player => <span key={player.id}>{player.name}{player.id === roomState.hostId ? '（部屋主）' : ''}</span>)}</div>
          {role === 'player' && <button className="btn btn-secondary" onClick={() => socket.emit('toggleReady', { roomName: id })}>
            {roomState?.players?.find(player => player.id === socketId)?.ready ? '準備を取り消す' : '準備完了'}
          </button>}
          {role === 'player' && <label>
            チーム
            <select
              value={roomState?.players?.find(player => player.id === socketId)?.team || ''}
              onChange={event => socket.emit('setTeam', { roomName: id, team: event.target.value || null })}
            >
              <option value="">個人戦</option>
              <option value="red">赤</option>
              <option value="blue">青</option>
            </select>
          </label>}
          <div className="ready-status-list">
            {roomState?.players?.map(player => (
              <span key={player.id}>
                {player.name}: {player.ready ? '準備完了' : '準備中'}
                {player.isBot && socketId === roomState?.hostId && (
                  <>
                    <select
                      value={player.team || ''}
                      onChange={event => socket.emit('setTeam', {
                        roomName: id, playerId: player.id, team: event.target.value || null,
                      })}
                    >
                      <option value="">個人</option>
                      <option value="red">赤</option>
                      <option value="blue">青</option>
                    </select>
                    <button type="button" onClick={() => socket.emit('removeBot', { roomName: id, botId: player.id })}>削除</button>
                  </>
                )}
              </span>
            ))}
          </div>
          {(roomState?.spectators?.length || 0) > 0 && (
            <div>観戦: {roomState.spectators.map(spectator => spectator.name).join('、')}</div>
          )}
          {socketId === roomState?.hostId && (
            <button type="button" className="btn btn-secondary" onClick={() => socket.emit('addBot', { roomName: id })}>
              Botを追加
            </button>
          )}
          {socketId === roomState?.hostId && (
            <label>
              制限時間
              <select
                value={roomState?.timeLimitSeconds || 0}
                onChange={event => socket.emit('setTimeLimit', { roomName: id, seconds: Number(event.target.value) })}
              >
                <option value={0}>無制限</option>
                <option value={30}>30秒</option>
                <option value={60}>60秒</option>
                <option value={120}>120秒</option>
              </select>
            </label>
          )}
          {socketId === roomState?.hostId && (
            <button className="btn" disabled={(roomState?.players?.length || 0) < 2} onClick={() => socket.emit('startGame', { roomName: id })}>対戦を開始</button>
          )}
        </div>
        {role === 'player' && <RoomBaseEditor socket={socket} roomName={id} editorState={baseEditorState} myId={socketId} />}
        {renderChat('lobby-chat-panel')}
      </div>
    );
  }

  const { me, opponent: firstOpponent, turn, phase, field: serverField } = gameState;
  const field = visibleField || serverField;
  const opponents = gameState.opponents?.length ? gameState.opponents : [firstOpponent].filter(Boolean);
  const selectedRealCards = selectedCards.map(index => me.hand[index]).filter(Boolean);
  const selectedCardsPreferSelf = selectedRealCards.length > 0 && selectedRealCards.every(card => (
    card.type === 'item' && (card.healHp || card.healMp || card.moneyGain || card.randomHp)
  ) || (card.type === 'miracle' && card.attack <= 0 && (card.healHp || card.moneyGain)));
  const selfTargetBlocked = selectedRealCards.some(card => card.effect === 'sell')
    || (selectedRealCards.length === 1 && selectedRealCards[0].type === 'trade' && selectedRealCards[0].effect === 'buy');
  const targetablePlayers = [...opponents, me].filter(player => (
    !player.ascended && player.hp > 0 && (!selfTargetBlocked || player.id !== me.id)
  ));
  const opponent = targetablePlayers.find(player => player.id === selectedTargetId)
    || (selectedCardsPreferSelf ? targetablePlayers.find(player => player.id === me.id) : null)
    || targetablePlayers.find(player => player.id !== me.id)
    || targetablePlayers[0]
    || firstOpponent;
  const displayHandOrder = mergeHandOrder(handOrder, me.hand);
  const orderedHandEntries = displayHandOrder.map(instanceId => {
    const serverIndex = me.hand.findIndex(card => card.instanceId === instanceId);
    return { card: me.hand[serverIndex], serverIndex };
  }).filter(entry => entry.card);
  const playerNameById = playerId => playerId === me.id
    ? me.name
    : opponents.find(player => player.id === playerId)?.name;
  const presentationFieldStyle = playerId => ({
    '--presentation-column-left': field?.defenderId === playerId ? '308px' : '0px',
  });
  const isResolvingDamage = (gameState.actionLockedUntil || 0) > now;
  const isMyTurn = turn === me.id && !isResolvingDamage && !presentationBusy;
  const remainingSeconds = gameState.turnDeadline
    ? Math.max(0, Math.ceil((gameState.turnDeadline - now) / 1000))
    : null;
  const hasFog = me.ailments.includes('fog');
  const hasDream = me.ailments.includes('dream');

  const isCardUsable = (card) => {
    if (!isMyTurn || !card) return false;
    if (phase === 'main') return !['ring', 'defense_item'].includes(card.type)
      && (card.type !== 'armor' || card.attackBonus > 0);
    if (phase === 'defense') {
      return (gameState.usableDefenseInstanceIds || []).includes(card.instanceId)
        || (gameState.selectableDefenseSupportInstanceIds || []).includes(card.instanceId);
    }
    return false;
  };

  const getDisplayedCard = (card, index) => {
    return getDreamDisplayedCard(me.hand, index) || card;
  };

  const renderSelectedCard = (index, className) => {
    const realCard = me.hand[index];
    if (!realCard) return null;
    return (
      <div key={realCard.instanceId} className={className}>
        {renderFieldCard(getDisplayedCard(realCard, index))}
      </div>
    );
  };

  const selectedDefenseCards = phase === 'defense'
    ? selectedCards.map(index => getDisplayedCard(me.hand[index], index)).filter(Boolean)
    : [];
  const displayedDefenseTotal = getDefenseTotal([
    ...(field?.defenseCards || []),
    ...selectedDefenseCards,
  ]);
  const selectedAttackCards = selectedCards.map(index => getDisplayedCard(me.hand[index], index)).filter(Boolean);
  let selectedAttackTotal = selectedAttackCards.reduce((sum, card) => sum + (
    card.additive || card.attackBonus > 0
      ? (card.attackBonus || card.attack || card.supportValue || 0)
      : (card.attack || 0)
  ), 0);
  if (selectedAttackCards.some(card => card.supportEffect === 'double_attack')) selectedAttackTotal *= 2;
  const commandLabel = phase === 'defense'
    ? `守${displayedDefenseTotal}`
    : (selectedAttackTotal > 0 ? `攻${selectedAttackTotal}` : '使う');

  const handlePlayCard = (cardIndex) => {
    if (playPending || (!isCardUsable(me.hand[cardIndex]) && !selectedCards.includes(cardIndex))) return;
    const cardIndices = selectedCards.includes(cardIndex) ? selectedCards : [cardIndex];
    const requestId = activePlayRequest.current + 1;
    activePlayRequest.current = requestId;
    setPlayPending(true);
    socket.timeout(4000).emit(
      'playCard',
      { roomName: id, cardIndices, targetId: opponent?.id },
      (timeoutError, response) => {
        if (activePlayRequest.current !== requestId) return;
        setPlayPending(false);
        if (timeoutError) {
          const message = '操作の応答がありません。もう一度OKを押してください。';
          setError(message);
          setTimeout(() => setError(current => current === message ? '' : current), 3000);
          return;
        }
        if (response?.ok) setSelectedCards([]);
      },
    );
  };

  const toggleCard = (index) => {
    const canSelectForDiscard = isMyTurn && phase === 'main';
    if (!selectedCards.includes(index) && !isCardUsable(me.hand[index]) && !canSelectForDiscard) return;
    setSelectedCards(current => getNextCardSelection(
      current,
      index,
      me.hand,
      phase,
      me.ailments.includes('flash'),
    ));
  };

  const updateHandOrder = updater => {
    setHandOrder(current => {
      const nextOrder = updater(current);
      handOrderRef.current = nextOrder;
      return nextOrder;
    });
  };

  const handleCardDragStart = (event, instanceId) => {
    if (selectedCards.length > 0 || playPending) {
      event.preventDefault();
      return;
    }
    suppressCardClick.current = true;
    setDraggedCardId(instanceId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', instanceId);
  };

  const handleCardDragEnter = targetId => {
    if (!draggedCardId || draggedCardId === targetId) return;
    updateHandOrder(current => moveHandCard(mergeHandOrder(current, me.hand), draggedCardId, targetId));
  };

  const handleCardDragEnd = () => {
    const instanceIds = mergeHandOrder(handOrderRef.current, me.hand);
    setDraggedCardId(null);
    setTimeout(() => { suppressCardClick.current = false; }, 0);
    socket.timeout(4000).emit('reorderHand', { roomName: id, instanceIds }, (timeoutError, response) => {
      if (!timeoutError && response?.ok) return;
      const serverOrder = me.hand.map(card => card.instanceId);
      handOrderRef.current = serverOrder;
      setHandOrder(serverOrder);
      const message = timeoutError ? '並び替えを保存できませんでした。' : '手札が更新されたため並び替えを戻しました。';
      setError(message);
      setTimeout(() => setError(current => current === message ? '' : current), 3000);
    });
  };

  // Render a small square card for the hand
  const renderSquareCard = (realCard, index, displayIndex = index) => {
    const selected = selectedCards.includes(index);
    const usable = isCardUsable(realCard);
    const selectableForDiscard = isMyTurn && phase === 'main';
    const selectedRealCards = selectedCards.map(cardIndex => me.hand[cardIndex]).filter(Boolean);
    const compatibleWithSelection = selected
      || selectedCards.length === 0
      || canAddCardToSelection(selectedRealCards, realCard, phase, me.ailments.includes('flash'));
    const visuallyAvailable = selected || (usable && compatibleWithSelection);
    const selectable = usable || selectableForDiscard || selected;
    const card = getDisplayedCard(realCard, index);
    const dreamAffected = isDreamAffectedCard(realCard, hasDream);
    const cardTitle = dreamAffected
      ? `${card.name}（夢の影響中）`
      : (!compatibleWithSelection
        ? `${card.name}（同時には選択できません。選ぶと選択を切り替えます）`
        : (visuallyAvailable
          ? card.name
          : (phase === 'main'
            ? `${card.name}（防御時に使用。捨てる場合は選択できます）`
            : `${card.name}（現在は使用できません）`)));

    let statText = '';
    if (card.attackBonus > 0 && card.type === 'armor') statText = `攻+${card.attackBonus} 守${card.defense || 0}`;
    else if (card.attack > 0) statText = card.additive ? `攻+${card.attackBonus || card.attack}` : `攻${card.attack}`;
    else if (card.defense > 0) statText = `守${card.defense}`;
    else if (card.healHp > 0) statText = `HP+${card.healHp}`;
    
    // Convert attributes to class for color
    const attrClass = `attr-bg-${card.attribute}`;
    const borderClass = `attr-border-${card.attribute}`;

    return (
      <div 
         key={realCard.instanceId} 
         className={`gf-card-square attr-card-${card.attribute || 'none'} ${borderClass} ${selected ? 'selected' : ''} ${draggedCardId === realCard.instanceId ? 'dragging' : ''} ${dreamAffected ? 'dream-affected' : ''} ${initialDealAnim?.playerIds?.includes(me.id) ? 'initial-deal-card' : ''} ${handRefillAnim?.playerId === me.id && index >= me.hand.length - handRefillAnim.count ? 'refill-new' : ''} ${visuallyAvailable ? '' : 'unavailable'}`}
         style={{ '--deal-index': displayIndex }}
         aria-disabled={!selectable}
         aria-grabbed={draggedCardId === realCard.instanceId}
         draggable={selectedCards.length === 0 && !playPending}
         title={cardTitle}
         onClick={() => {
           if (!suppressCardClick.current) toggleCard(index);
         }}
         onDoubleClick={() => visuallyAvailable && handlePlayCard(index)}
         onDragStart={event => handleCardDragStart(event, realCard.instanceId)}
         onDragEnter={() => handleCardDragEnter(realCard.instanceId)}
         onDragOver={event => event.preventDefault()}
         onDragEnd={handleCardDragEnd}
         onMouseEnter={() => {
           setHoveredMiracleIndex(null);
           setHoveredCardIndex(index);
         }}
         onMouseLeave={() => setHoveredCardIndex(null)}
      >
         {card.imageUrl ? (
            <div className="image-area" style={{backgroundImage: `url(${card.imageUrl})`}} />
         ) : (
            <div className="image-area" style={{backgroundColor: '#e2e8f0'}}>{card.type.charAt(0).toUpperCase()}</div>
         )}
         {statText && <div className={`stat-bar ${attrClass}`}>{statText}</div>}
      </div>
    );
  };

  // Render a detailed field card
  const renderFieldCard = (card) => {
    if (!card) return null;
    let statText = '';
    if (card.attackBonus > 0 && card.type === 'armor') statText += `攻+${card.attackBonus} `;
    if (card.attack > 0) {
      statText += `${card.additive ? '攻+' : '攻'}${card.attackBonus || card.attack} `;
      if (card.hitRate > 0 && card.hitRate < 100) statText += `命中${card.hitRate}% `;
    }
    if (card.defense > 0) statText += `守${card.defense} `;
    if (card.healHp > 0) statText += `HP+${card.healHp} `;

    return (
      <div className={`gf-card-field type-${card.type} attr-card-${card.attribute || 'none'} attr-border-${card.attribute}`}>
        {card.imageUrl ? (
          <div className="image-area" style={{backgroundImage: `url(${card.imageUrl})`}}></div>
        ) : (
          <div className="image-area">{card.type.charAt(0).toUpperCase()}</div>
        )}
        <div className="details">
           <div className="card-name">{card.name}</div>
           <div className="card-stat-text">{statText}</div>
           <div className="card-description-text">{card.description}</div>
        </div>
        {card.costMoney > 0 && <div className="card-price">¥{card.costMoney}</div>}
      </div>
    );
  };

  const renderAilments = (player) => {
    const names = { cold: '風邪', fever: '熱病', hell: '地獄病', heaven: '天国病', fog: '霧', flash: '閃光', dream: '夢', darkcloud: '暗雲' };
    const files = { flash: 'glory', dream: 'illusion', darkcloud: 'dark_cloud' };
    return player.ailments.map(ailment => (
      <img
        key={ailment}
        className="ailment-icon"
        src={`/godfield-flash/ui/game/status/harm/${files[ailment] || ailment}.png`}
        alt={names[ailment] || ailment}
        title={names[ailment] || ailment}
      />
    ));
  };

  const hasSelectedDefense = selectedCards.some(index => (
    gameState.usableDefenseInstanceIds || []
  ).includes(me.hand[index]?.instanceId));
  const hasSelectedUsableCard = selectedCards.some(index => isCardUsable(me.hand[index]));

  const renderAssistant = (assistant) => assistant && (
    <div className="assistant-status">
      <img src={`/godfield-flash/ui/game/status/assistant/${assistant.type}.png`} alt="" />
      <span>守護神 {assistant.type}（HP {assistant.hp}）</span>
    </div>
  );

  const renderPlayerStatus = (player, isSelf = false) => player && (
    <div
      className={`battle-player ${isSelf ? 'self' : 'opponent'} team-${player.team || 'single'} ${isMyTurn && phase === 'main' && opponent?.id === player.id ? 'selected-target' : ''} ${turn === player.id && !isResolvingDamage ? 'active' : ''} ${player.hp <= 0 ? 'defeated' : ''}`}
      role={isMyTurn && phase === 'main' && targetablePlayers.some(target => target.id === player.id) ? 'button' : undefined}
      tabIndex={isMyTurn && phase === 'main' && targetablePlayers.some(target => target.id === player.id) ? 0 : undefined}
      onClick={() => {
        if (isMyTurn && phase === 'main' && targetablePlayers.some(target => target.id === player.id)) {
          setSelectedTargetId(player.id);
        }
      }}
      onKeyDown={event => {
        if ((event.key === 'Enter' || event.key === ' ')
          && isMyTurn
          && phase === 'main'
          && targetablePlayers.some(target => target.id === player.id)) {
          setSelectedTargetId(player.id);
        }
      }}
    >
      <span className="battle-player-marker">●</span>
      <span className="battle-player-name">{player.name}{isSelf ? ' (You)' : ''}</span>
      {hasFog && !isSelf ? (
        <span className="battle-player-fog">[霧]</span>
      ) : (
        <span className="battle-player-stats">
          <span>HP <b>{player.hp}</b></span>
          <span>MP <b>{player.mp}</b></span>
          <span>￥ <b>{player.money}</b></span>
        </span>
      )}
      {player.ailments.length > 0 && <span className="battle-player-ailments">{renderAilments(player)}</span>}
      {isSelf && isMyTurn && phase === 'main' && <span className="battle-turn-label" role="status">あなたの番</span>}
    </div>
  );

  const actionEffect = actionAnim?.outcome === 'evade' ? 'miss' : 'hit';
  const renderDamageNumber = (amount, isDark = false) => String(Math.max(0, amount)).split('').map((digit, index) => (
    <img
      key={`${digit}-${index}`}
      src={`/godfield-flash/ui/game/effect/${isDark ? 'damage_dark' : 'damage'}_${digit}.png`}
      alt={digit}
    />
  ));
  const renderEffectNumber = (type, amount) => {
    const prefix = type === 'yen_increase' ? 'yen' : type.split('_')[0];
    return String(Math.max(0, amount)).split('').map((digit, index) => (
      <img key={`${digit}-${index}`} src={`/godfield-flash/ui/game/effect/${prefix}_${digit}.png`} alt={digit} />
    ));
  };

  return (
    <div className="gf-game-viewport">
      <div className="gf-game-frame" style={{ width: 1024 * battleScale, height: 768 * battleScale }}>
        <div className="gf-game-screen" style={{ transform: `scale(${battleScale})` }}>
      {gameState.spectator && <div className="spectator-banner">観戦中（操作はできません）</div>}

      <div className="gf-battle-header">
        <button type="button" onClick={() => navigate('/')}>修行</button>
        <span>部屋 {id}</span>
        <strong className="gf-battle-title">God Field</strong>
        {phase === 'resolving' && <span>ダメージ処理中</span>}
        {remainingSeconds !== null && <span className={remainingSeconds <= 10 ? 'timer-warning' : ''}>残り {remainingSeconds}秒</span>}
        <button type="button">教典</button>
      </div>

        <div className={`gf-battle-shell ${fieldClearing ? 'field-clearing' : ''} ${cardEnterAnim ? 'card-enter-active' : ''} ${handRefillAnim ? 'hand-refill-active' : ''}`}>
        {ascensionAnim && (
          <div key={ascensionAnim.id} className="ascension-overlay" role="status" aria-label={`${ascensionAnim.playerName}が昇天`}>
            <div className="ascension-screen-flash" />
            <div className="ascension-light-column" />
            <div className="ascension-soul" />
            <img className="ascension-title" src="/godfield-flash/ui/game-ja/effect/dead.png" alt="昇天" />
            <div className="ascension-player-name">{ascensionAnim.playerName}</div>
          </div>
        )}
        {effectAnim && (
          effectAnim.dreamReveal ? (
            <div
              key={effectAnim.id}
              className={`dream-reveal-overlay ${effectAnim.playerId === me.id ? 'target-me' : 'target-opponent'}`}
              style={presentationFieldStyle(effectAnim.playerId)}
              role="status"
              aria-label={effectAnim.changed ? '夢の影響で神器が変化' : '夢の影響を受けたが神器はそのまま'}
            >
              <img className="dream-reveal-title" src="/godfield-flash/ui/game-ja/effect/illusion.png" alt="夢" />
              <div className="dream-reveal-cards">
                {effectAnim.fromCards.map((fromCard, index) => (
                  <div className="dream-reveal-pair" key={`${fromCard.name}-${index}`}>
                    <div className="dream-reveal-card">
                      {fromCard.imageUrl && <img src={fromCard.imageUrl} alt="" />}
                      <span>{fromCard.name}</span>
                    </div>
                    <strong>{effectAnim.toCards[index]?.name === fromCard.name ? 'そのまま' : '→'}</strong>
                    {effectAnim.toCards[index]?.name !== fromCard.name && (
                      <div className="dream-reveal-card changed">
                        {effectAnim.toCards[index]?.imageUrl && <img src={effectAnim.toCards[index].imageUrl} alt="" />}
                        <span>{effectAnim.toCards[index]?.name}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : RESOURCE_EFFECT_TYPES.has(effectAnim.type) ? (
            <div
              key={effectAnim.id}
              className={`resource-effect-overlay ${effectAnim.type} ${effectAnim.playerId === me.id ? 'target-me' : 'target-opponent'}`}
              style={presentationFieldStyle(effectAnim.playerId)}
              role="status"
              aria-label={`${effectAnim.playerName}の${effectAnim.type}が${effectAnim.amount}増加`}
            >
              <img className="resource-effect-label" src={`/godfield-flash/ui/game/effect/${effectAnim.type}.png`} alt="" />
              <div className="resource-effect-number">{renderEffectNumber(effectAnim.type, effectAnim.amount)}</div>
              {effectAnim.revived && <span className="revive-effect-label">復活</span>}
            </div>
          ) : ASSISTANT_EFFECT_TYPES.has(effectAnim.type) ? (
            <div
              key={effectAnim.id}
              className={`assistant-effect-overlay ${effectAnim.type} ${effectAnim.playerId === me.id ? 'target-me' : 'target-opponent'}`}
              style={presentationFieldStyle(effectAnim.playerId)}
              role="status"
              aria-label={`${effectAnim.playerName}の${EFFECT_LABELS[effectAnim.type]}`}
            >
              <img src={`/godfield-flash/ui/game/assistant/${effectAnim.assistantType}.png`} alt="" />
              <strong>{EFFECT_LABELS[effectAnim.type]}</strong>
              <span>{effectAnim.playerName}</span>
            </div>
          ) : (
            <div
              key={effectAnim.id}
              className={`status-effect-overlay ${effectAnim.playerId === me.id ? 'target-me' : 'target-opponent'}`}
              style={presentationFieldStyle(effectAnim.playerId)}
              role="status"
              aria-label={`${effectAnim.playerName}に${EFFECT_LABELS[effectAnim.type] || effectAnim.type}`}
            >
              <img src={`/godfield-flash/ui/game-ja/effect/${effectAnim.type}.png`} alt={EFFECT_LABELS[effectAnim.type] || effectAnim.type} />
              {effectAnim.playerName && <span>{effectAnim.playerName}</span>}
            </div>
          )
        )}
        {damageAnim && (
          <div
            key={`${damageAnim.timestamp}-${damageAnim.isDarkFollowUp ? 'dark' : 'normal'}`}
            className={`damage-overlay ${damageAnim.targetId === me.id ? 'target-me' : 'target-opponent'} ${damageAnim.isDarkFollowUp ? 'dark-follow-up' : ''}`}
            style={presentationFieldStyle(damageAnim.targetId)}
            aria-label={`${playerNameById(damageAnim.targetId)}に${damageAnim.amount}ダメージ`}
          >
            <div className="gf-damage-number">{renderDamageNumber(damageAnim.amount, damageAnim.isDarkFollowUp)}</div>
            <img className="gf-damage-label" src={`/godfield-flash/ui/game-ja/effect/${damageAnim.isDarkFollowUp ? 'damage_dark' : 'damage'}.png`} alt={damageAnim.isDarkFollowUp ? '冥ダメージ' : 'ダメージ'} />
          </div>
        )}

        {startAnim && <img className="gf-game-start-effect" src="/godfield-flash/ui/game-ja/effect/game_start.png" alt="ゲーム開始" />}

        {actionAnim && !damageAnim && actionAnim.outcome === 'use' && actionAnim.type !== 'card' && (
          <div
            className={`activity-action-overlay ${actionAnim.attackerId === me.id ? 'actor-me' : 'actor-opponent'}`}
            style={presentationFieldStyle(actionAnim.attackerId)}
            role="status"
            aria-label={`${actionAnim.attackerName || playerNameById(actionAnim.attackerId)}が${actionAnim.label || `${actionAnim.card?.name}を使用`}`}
          >
            <div className={`activity-action-card ${actionAnim.type === 'pray' ? 'pray' : ''}`}>
              {actionAnim.card?.imageUrl
                ? <img src={actionAnim.card.imageUrl} alt="" />
                : <span>{actionAnim.type === 'pray' ? '祈' : '効'}</span>}
            </div>
            <div>
              <strong>{actionAnim.attackerName || playerNameById(actionAnim.attackerId)}</strong>
              <span>{actionAnim.label || `${actionAnim.card?.name || '神器'}を使用`}</span>
            </div>
          </div>
        )}

        {actionAnim && !damageAnim && actionAnim.outcome !== 'use' && (
          <div className={`combat-action-overlay outcome-${actionAnim.outcome} ${actionAnim.defenderId === me.id ? 'target-me' : 'target-opponent'}`} style={presentationFieldStyle(actionAnim.defenderId)}>
            <img src={`/godfield-flash/ui/game-ja/effect/${actionEffect}.png`} alt={actionEffect === 'miss' ? '回避' : '命中'} />
          </div>
        )}

        {turnAnim && (
          <div className="turn-start-overlay" style={presentationFieldStyle(turnAnim.playerId)} role="status">
            <span>{turnAnim.playerId === me.id ? 'あなたの番' : `${turnAnim.playerName}の番`}</span>
          </div>
        )}

        {cardEnterAnim && (
          <div className={`presentation-card-stack phase-${cardEnterAnim.phase} ${cardEnterAnim.playerId === socketId ? 'actor-self' : 'actor-remote'}`}>
            <div className="gf-field-owner">{cardEnterAnim.playerName}</div>
            {cardEnterAnim.cards.map((card, index) => (
              <div
                key={`${card.id}-${index}`}
                className="presentation-enter-card"
                style={{
                  '--card-enter-index': index,
                  '--card-source-x': `${3 + ((cardEnterAnim.handIndices?.[index] || 0) % 8) * 83}px`,
                  '--card-source-y': `${467 + Math.floor((cardEnterAnim.handIndices?.[index] || 0) / 8) * 101}px`,
                  '--card-target-x': cardEnterAnim.phase === 'defense' ? '308px' : '0px',
                  '--card-target-y': `${40 + index * 100}px`,
                }}
              >
                {renderFieldCard(card)}
              </div>
            ))}
          </div>
        )}

        {miracleStockAnim && miracleStockAnim.playerId === me.id && (
          <div className="miracle-stock-flight" style={{ '--miracle-slot-index': miracleStockAnim.slotIndex }}>
            <img src={miracleStockAnim.card.imageUrl} alt={miracleStockAnim.card.name} />
          </div>
        )}

        <main className="gf-battle-stage">
          <div className="gf-field-cards">
            {field && (
              <section className="gf-field-group attacker">
                <div className="gf-field-owner">{playerNameById(field.attackerId) || '---'}</div>
                {(field.attackCards?.length ? field.attackCards : [field.attackCard]).map((card, index) => (
                  <div key={`${card.instanceId || card.id || card.name}-${index}`}>{renderFieldCard(card)}</div>
                ))}
                {phase !== 'defense' && selectedCards.map(index => renderSelectedCard(index, 'pending-defense-card'))}
              </section>
            )}
            {field?.defenderId && (
              <img className="gf-field-target-arrow" src="/godfield-flash/ui/game/commander/target_arrow_right.png" alt="攻撃対象" />
            )}
            {field?.defenderId && (
              <section className="gf-field-group defender">
                <div className="gf-field-owner">{playerNameById(field.defenderId) || '---'}</div>
                {(field.defenseDisplayCards || field.defenseCards || []).map((card, index) => <div key={index}>{renderFieldCard(card)}</div>)}
                {phase === 'defense' && selectedCards.map(index => renderSelectedCard(index, 'pending-defense-card'))}
              </section>
            )}
            {!field && selectedCards.length > 0 && (
              <>
                <section className="gf-field-group attacker selection-preview">
                  <div className="gf-field-owner">{me.name}</div>
                  {selectedCards.map(index => renderSelectedCard(index, 'pending-selection-card'))}
                </section>
                {opponent && (
                  <img className="gf-field-target-arrow" src="/godfield-flash/ui/game/commander/target_arrow_right.png" alt="攻撃対象" />
                )}
                {opponent && (
                  <section className="gf-field-group defender selection-preview target-only">
                    <div className="gf-field-owner">{opponent.name}</div>
                  </section>
                )}
              </>
            )}
          </div>
          {field?.defenderId && (
            <div className="gf-combat-totals">
              <span>攻{field.attackCard.attack || 0}</span>
              <span>守{displayedDefenseTotal}</span>
            </div>
          )}
        </main>

        <aside className="gf-battle-sidebar">
          <div className="battle-player-list">
            {opponents.map(player => <div key={player.id}>{renderPlayerStatus(player)}{renderAssistant(player.assistant)}</div>)}
            {renderPlayerStatus(me, true)}
            {renderAssistant(me.assistant)}
          </div>
          <div className="gf-battle-chat-frame">
            <div className="gf-battle-log">
              {gameState.log.slice(-12).map((line, index) => <div key={index}>{line}</div>)}
            </div>
            {renderChat()}
          </div>
        </aside>

        <section className="gf-hand-dock">
          {error && <div className="battle-error-toast">{error}</div>}
          {hoveredCardIndex !== null && me.hand[hoveredCardIndex] && (
            <div className="hovered-card-detail" style={{ left: `${getHandDetailLeft(orderedHandEntries.findIndex(entry => entry.serverIndex === hoveredCardIndex))}px` }}>
              {renderFieldCard(getDisplayedCard(me.hand[hoveredCardIndex], hoveredCardIndex))}
            </div>
          )}
          {hoveredMiracleIndex !== null && me.learnedMiracles?.[hoveredMiracleIndex] && (
            <div className="hovered-card-detail" style={{ left: `${getHandDetailLeft(hoveredMiracleIndex)}px` }}>
              {renderFieldCard(me.learnedMiracles[hoveredMiracleIndex])}
            </div>
          )}
          <div className={`gf-hand-cards ${draggedCardId ? 'reordering' : ''}`}>
            {orderedHandEntries.map(({ card, serverIndex }, displayIndex) => renderSquareCard(card, serverIndex, displayIndex))}
          </div>
          <div className="learned-miracles" aria-label="使用済み奇跡ストック">
            {Array.from({ length: 6 }, (_, index) => {
              const miracle = me.learnedMiracles?.[index];
              if (!miracle) return <div key={`miracle-slot-${index}`} className="miracle-stock-slot empty" aria-hidden="true" />;
              const disabled = !isMyTurn
                || !['main', 'defense'].includes(phase)
                || (phase === 'defense' && !(gameState.usableDefenseMiracleIndices || []).includes(index))
                || (me.mp < (miracle.costMp || 0) && !selectedCards.some(cardIndex => me.hand[cardIndex]?.supportEffect === 'magic_free'));
              return (
               <button
                  type="button"
                 key={`${miracle.id}-${index}`}
                  className={`miracle-stock-slot ${pendingMiracleIds.includes(miracle.id) ? 'stock-arriving' : ''}`}
                  disabled={disabled}
                  aria-label={`${miracle.name}を使用（MP${miracle.costMp || 0}）`}
                  title={`${miracle.name}（MP${miracle.costMp || 0}）`}
                  onMouseEnter={() => {
                    setHoveredCardIndex(null);
                    setHoveredMiracleIndex(index);
                  }}
                  onMouseLeave={() => setHoveredMiracleIndex(null)}
                  onClick={() => {
                    socket.emit('castMiracle', { roomName: id, miracleIndex: index, cardIndices: selectedCards, targetId: opponent?.id });
                    setSelectedCards([]);
                  }}
                >
                  <img src={miracle.imageUrl} alt="" />
                  <span>MP{miracle.costMp || 0}</span>
                </button>
              );
            })}
          </div>
          <div className="gf-hand-actions">
            {isMyTurn && selectedCards.length > 0 && ((phase === 'main' && hasSelectedUsableCard) || (phase === 'defense' && hasSelectedDefense)) && (
               <button className="btn gf-command-button" disabled={playPending} aria-label={`選択した神器${selectedCards.length}枚を使用`} onClick={() => handlePlayCard(selectedCards[0])}>{commandLabel}</button>
            )}
            {isMyTurn && phase === 'defense' && selectedCards.length === 0 && (
               <button className="btn gf-command-button forgive-command" aria-label="防御せずダメージを受ける" onClick={() => socket.emit('finishDefense', { roomName: id })}>許す</button>
            )}
            {isMyTurn && phase === 'main' && (
               <button
                 className="btn gf-fixed-action pray-action"
                 disabled={!gameState.canPray}
                 onClick={() => socket.emit('pray', { roomName: id })}
                 title={gameState.canPray ? '祈って神器を1枚引く' : '攻撃可能な武器があるため祈れません'}
               >祈る (ドロー)</button>
            )}
            {isMyTurn && phase === 'main' && selectedCards.length === 1 && (
               <button className="btn btn-secondary gf-fixed-action discard-action" onClick={() => { socket.emit('discardCards', { roomName: id, cardIndices: selectedCards }); setSelectedCards([]); }}>捨てる</button>
            )}
          </div>
        </section>
      </div>

      <footer className="gf-battle-footer">
        <button type="button" className="gf-back-button" onClick={() => navigate('/')}>Back</button>
      </footer>

      {isMyTurn && phase === 'exchange' && (
        <div className="shrine-overlay">
          <div className="glass-panel shrine-panel">
            <h2>両替</h2>
            <p>HP・MP・￥の合計を保ったまま、自由に配分します。</p>
            <div className="exchange-fields">
              {['hp', 'mp', 'money'].map(key => (
                <label key={key}>
                  {key === 'money' ? '￥' : key.toUpperCase()}
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={exchangeValues[key]}
                    onChange={event => setExchangeValues(values => ({ ...values, [key]: Number(event.target.value) }))}
                  />
                </label>
              ))}
            </div>
            <p>配分合計: {exchangeValues.hp + exchangeValues.mp + exchangeValues.money} / {me.hp + me.mp + me.money}</p>
            <button className="btn" onClick={() => socket.emit('completeExchange', { roomName: id, ...exchangeValues })}>この配分で決定</button>
          </div>
        </div>
      )}

      {isMyTurn && phase === 'buy_offer' && gameState.buyOffer && (
        <div className="shrine-overlay">
          <div className="glass-panel shrine-panel">
            <h2>買う</h2>
            <p>相手の手札から無作為に選ばれました。</p>
            {renderFieldCard(gameState.buyOffer)}
            <p>価格: ￥{gameState.buyOffer.type === 'miracle' ? 0 : gameState.buyOffer.costMoney || 0}</p>
            <div className="buy-actions">
              <button className="btn" onClick={() => socket.emit('resolveBuy', { roomName: id, accept: true })}>買う</button>
              <button className="btn btn-secondary" onClick={() => socket.emit('resolveBuy', { roomName: id, accept: false })}>買わない</button>
            </div>
          </div>
        </div>
      )}

      {gameState.gameStateStr === 'ended' && !presentationBusy && !ascensionAnim && (
        <div className="game-end-overlay">
          <div className="glass-panel game-end-panel">
            <img
              className="gf-result-effect"
              src={`/godfield-flash/ui/game-ja/effect/${gameState.winner ? 'game_win' : 'game_draw'}.png`}
              alt={gameState.winner ? '決着' : '引き分け'}
            />
            <p>
              {gameState.winner
                ? (gameState.winner.id === me.id || (gameState.winner.team && gameState.winner.team === me.team)
                  ? 'あなたの勝利です！'
                  : `${gameState.winner.name} の勝利です。`)
                : '生存者なしで決着しました。'}
            </p>
            <button className="btn" onClick={() => gameState.spectator
              ? navigate('/')
              : socket.emit('returnToLobby', { roomName: id })}
            >{gameState.spectator ? 'トップへ戻る' : '待機画面に戻る'}</button>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
