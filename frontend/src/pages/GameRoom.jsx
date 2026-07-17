import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import '../index.css';
import RoomBaseEditor from './RoomBaseEditor';
import { playSound } from '../soundEffects';

let socket;
const serverUrl = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);
const RESOURCE_EFFECT_TYPES = new Set(['hp_increase', 'mp_increase', 'yen_increase']);
const ASSISTANT_EFFECT_TYPES = new Set(['assistant_add', 'assistant_action', 'assistant_remove']);
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
  const [hoveredCardIndex, setHoveredCardIndex] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const [selectedTargetId, setSelectedTargetId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [teamChat, setTeamChat] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [exchangeValues, setExchangeValues] = useState({ hp: 0, mp: 0, money: 0 });
  const [battleScale, setBattleScale] = useState(() => Math.min(window.innerWidth / 1024, window.innerHeight / 768));
  const lastDamageTimestamp = useRef(null);
  const lastActionId = useRef(null);
  const lastSoundEventId = useRef(0);
  const lastAscensionEventId = useRef(0);
  const hasReceivedGameState = useRef(false);
  const ascensionQueue = useRef([]);
  const ascensionActive = useRef(false);
  const ascensionTimer = useRef(null);
  const lastEffectEventId = useRef(0);
  const hasReceivedEffectState = useRef(false);
  const effectQueue = useRef([]);
  const effectActive = useRef(false);
  const effectTimer = useRef(null);
  const soundTimers = useRef([]);
  const damageTimer = useRef(null);
  const actionTimer = useRef(null);
  useEffect(() => {
    const updateBattleScale = () => setBattleScale(Math.min(window.innerWidth / 1024, window.innerHeight / 768));
    window.addEventListener('resize', updateBattleScale);
    return () => window.removeEventListener('resize', updateBattleScale);
  }, []);

  useEffect(() => {
    const activeSoundTimers = soundTimers.current;
    const playNextAscension = () => {
      const event = ascensionQueue.current.shift();
      if (!event) {
        ascensionActive.current = false;
        setAscensionAnim(null);
        return;
      }
      ascensionActive.current = true;
      setAscensionAnim(event);
      clearTimeout(ascensionTimer.current);
      ascensionTimer.current = setTimeout(playNextAscension, 1900);
    };
    const playNextEffect = () => {
      const event = effectQueue.current.shift();
      if (!event) {
        effectActive.current = false;
        setEffectAnim(null);
        return;
      }
      effectActive.current = true;
      setEffectAnim(event);
      clearTimeout(effectTimer.current);
      effectTimer.current = setTimeout(playNextEffect, 1250);
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
      if (data.chatMessages) setChatMessages(data.chatMessages);
      const damage = data.lastDamage;
      if (damage && damage.timestamp !== lastDamageTimestamp.current) {
        lastDamageTimestamp.current = damage.timestamp;
        setDamageAnim(damage);
        clearTimeout(damageTimer.current);
        if (damage.followUpAmount > 0) {
          damageTimer.current = setTimeout(() => {
            setDamageAnim({ ...damage, amount: damage.followUpAmount, followUpAmount: 0, isDarkFollowUp: true });
            damageTimer.current = setTimeout(() => setDamageAnim(null), 1500);
          }, damage.followUpDelayMs || 650);
        } else {
          damageTimer.current = setTimeout(() => setDamageAnim(null), 1500);
        }
      }
      const action = data.lastAction;
      if (action && action.id !== lastActionId.current) {
        lastActionId.current = action.id;
        setActionAnim(action);
        clearTimeout(actionTimer.current);
        actionTimer.current = setTimeout(() => setActionAnim(null), 1400);
      }
      const newSoundEvents = (data.soundEvents || []).filter(event => event.id > lastSoundEventId.current);
      if (newSoundEvents.length) {
        lastSoundEventId.current = Math.max(...newSoundEvents.map(event => event.id));
        newSoundEvents.forEach(event => {
          const timer = setTimeout(() => playSound(event.name), event.delayMs || 0);
          activeSoundTimers.push(timer);
          if (event.name === 'game_start') {
            const showTimer = setTimeout(() => {
              setStartAnim(true);
              const hideTimer = setTimeout(() => setStartAnim(false), 1400);
              activeSoundTimers.push(hideTimer);
            }, event.delayMs || 0);
            activeSoundTimers.push(showTimer);
          }
        });
      }
      const ascensionEvents = data.ascensionEvents || [];
      if (!hasReceivedGameState.current) {
        hasReceivedGameState.current = true;
        lastAscensionEventId.current = Math.max(0, ...ascensionEvents.map(event => event.id));
      }
      const newAscensions = ascensionEvents.filter(event => event.id > lastAscensionEventId.current);
      if (newAscensions.length) {
        lastAscensionEventId.current = Math.max(...newAscensions.map(event => event.id));
        ascensionQueue.current.push(...newAscensions);
        if (!ascensionActive.current) playNextAscension();
      }
      const effectEvents = data.effectEvents || [];
      if (!hasReceivedEffectState.current) {
        hasReceivedEffectState.current = true;
        lastEffectEventId.current = Math.max(0, ...effectEvents.map(event => event.id));
      }
      const newEffects = effectEvents.filter(event => event.id > lastEffectEventId.current);
      if (newEffects.length) {
        lastEffectEventId.current = Math.max(...newEffects.map(event => event.id));
        effectQueue.current.push(...newEffects);
        if (!effectActive.current) playNextEffect();
      }
    });

    socket.on('baseEditorState', data => setBaseEditorState(data));
    socket.on('chatMessage', message => {
      setChatMessages(current => current.some(existing => existing.id === message.id)
        ? current
        : [...current, message].slice(-100));
    });

    socket.on('gameStateCleared', () => {
      setGameState(null);
      setSelectedCards([]);
      setDamageAnim(null);
      setActionAnim(null);
      setStartAnim(false);
      lastDamageTimestamp.current = null;
      lastActionId.current = null;
      lastSoundEventId.current = 0;
      lastAscensionEventId.current = 0;
      hasReceivedGameState.current = false;
      ascensionQueue.current = [];
      ascensionActive.current = false;
      clearTimeout(ascensionTimer.current);
      setAscensionAnim(null);
      lastEffectEventId.current = 0;
      hasReceivedEffectState.current = false;
      effectQueue.current = [];
      effectActive.current = false;
      clearTimeout(effectTimer.current);
      setEffectAnim(null);
    });

    socket.on('errorMsg', (msg) => {
      playSound('alert');
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      clearTimeout(damageTimer.current);
      clearTimeout(actionTimer.current);
      clearTimeout(ascensionTimer.current);
      ascensionQueue.current = [];
      ascensionActive.current = false;
      clearTimeout(effectTimer.current);
      effectQueue.current = [];
      effectActive.current = false;
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
    setSelectedCards([]);
  }, [gameState?.turn, gameState?.phase, gameState?.actionLockedUntil]);

  const myTeam = gameState?.me?.team
    || roomState?.players?.find(player => player.id === socketId)?.team;
  const submitChat = event => {
    event.preventDefault();
    if (!chatText.trim()) return;
    socket.emit('sendChat', { roomName: id, text: chatText, teamOnly: teamChat && Boolean(myTeam) });
    setChatText('');
  };
  const renderChat = () => (
    <div className="chat-panel">
      <div className="chat-messages">
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
        {renderChat()}
      </div>
    );
  }

  const { me, opponent: firstOpponent, turn, phase, field } = gameState;
  const opponents = gameState.opponents?.length ? gameState.opponents : [firstOpponent].filter(Boolean);
  const targetableOpponents = opponents.filter(player => !(me.team && player.team === me.team));
  const opponent = targetableOpponents.find(player => player.id === selectedTargetId && !player.ascended && player.hp > 0)
    || targetableOpponents.find(player => !player.ascended && player.hp > 0)
    || firstOpponent;
  const playerNameById = playerId => playerId === me.id
    ? me.name
    : opponents.find(player => player.id === playerId)?.name;
  const isResolvingDamage = (gameState.actionLockedUntil || 0) > now;
  const isMyTurn = turn === me.id && !isResolvingDamage;
  const remainingSeconds = gameState.turnDeadline
    ? Math.max(0, Math.ceil((gameState.turnDeadline - now) / 1000))
    : null;
  const hasFog = me.ailments.includes('fog');
  const hasDream = me.ailments.includes('dream');

  const isCardUsable = (card) => {
    if (!isMyTurn || !card) return false;
    if (phase === 'main') return !['armor', 'ring', 'defense_item'].includes(card.type);
    if (phase === 'defense') {
      return (gameState.usableDefenseInstanceIds || []).includes(card.instanceId)
        || (gameState.selectableDefenseSupportInstanceIds || []).includes(card.instanceId);
    }
    return false;
  };

  const isHiddenByDream = (card) => {
    if (!hasDream) return false;
    const value = [...String(card.instanceId || card.id)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return value % 2 === 0;
  };

  const getDisplayedCard = (card, index) => {
    if (!isHiddenByDream(card) || me.hand.length < 2) return card;
    const decoy = me.hand[(index + 1) % me.hand.length];
    return { ...decoy, instanceId: card.instanceId };
  };

  const handlePlayCard = (cardIndex) => {
    if (!isCardUsable(me.hand[cardIndex]) && !selectedCards.includes(cardIndex)) return;
    const cardIndices = selectedCards.includes(cardIndex) ? selectedCards : [cardIndex];
    socket.emit('playCard', { roomName: id, cardIndices, targetId: opponent?.id });
    setSelectedCards([]);
  };

  const toggleCard = (index) => {
    const canSelectForDiscard = isMyTurn && phase === 'main';
    if (!selectedCards.includes(index) && !isCardUsable(me.hand[index]) && !canSelectForDiscard) return;
    setSelectedCards(current => current.includes(index)
      ? current.filter(i => i !== index)
      : [...current, index].sort((a, b) => a - b));
  };

  // Render a small square card for the hand
  const renderSquareCard = (realCard, index) => {
    const usable = isCardUsable(realCard) || (isMyTurn && phase === 'main') || selectedCards.includes(index);
    const card = getDisplayedCard(realCard, index);

    let statText = '';
    if (card.attack > 0) statText = `攻${card.attack}`;
    else if (card.defense > 0) statText = `守${card.defense}`;
    else if (card.healHp > 0) statText = `HP+${card.healHp}`;
    
    // Convert attributes to class for color
    const attrClass = `attr-bg-${card.attribute}`;
    const borderClass = `attr-border-${card.attribute}`;

    return (
      <div 
         key={realCard.instanceId} 
         className={`gf-card-square ${borderClass} ${selectedCards.includes(index) ? 'selected' : ''} ${usable ? '' : 'disabled'}`}
         aria-disabled={!usable}
         title={usable ? realCard.name : (phase === 'main' ? 'この神器は防御時に使用します' : 'この攻撃には使用できません')}
         onClick={() => toggleCard(index)}
         onDoubleClick={() => usable && handlePlayCard(index)}
         onMouseEnter={() => setHoveredCardIndex(index)}
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
    if (card.attack > 0) {
      statText += `攻${card.attack} `;
      if (card.hitRate > 0) statText += `命中${card.hitRate}% `;
    }
    if (card.defense > 0) statText += `守${card.defense} `;
    if (card.healHp > 0) statText += `HP+${card.healHp} `;

    return (
      <div className={`gf-card-field type-${card.type} attr-border-${card.attribute}`}>
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

  const renderAssistant = (assistant) => assistant && (
    <div className="assistant-status">
      <img src={`/godfield-flash/ui/game/status/assistant/${assistant.type}.png`} alt="" />
      <span>守護神 {assistant.type}（HP {assistant.hp}）</span>
    </div>
  );

  const renderPlayerStatus = (player, isSelf = false) => player && (
    <div
      className={`battle-player ${isSelf ? 'self' : 'opponent'} team-${player.team || 'single'} ${isMyTurn && phase === 'main' && opponent?.id === player.id ? 'selected-target' : ''} ${turn === player.id && !isResolvingDamage ? 'active' : ''} ${player.hp <= 0 ? 'defeated' : ''}`}
      role={!isSelf && targetableOpponents.length > 1 ? 'button' : undefined}
      tabIndex={!isSelf && targetableOpponents.length > 1 ? 0 : undefined}
      onClick={() => !isSelf && targetableOpponents.length > 1 && player.hp > 0 && !player.ascended && setSelectedTargetId(player.id)}
      onKeyDown={event => {
        if ((event.key === 'Enter' || event.key === ' ') && !isSelf && targetableOpponents.length > 1 && player.hp > 0 && !player.ascended) {
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
      {isSelf && isMyTurn && <span className="battle-turn-label" role="status">あなたの番</span>}
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
        {isResolvingDamage && <span>ダメージ処理中</span>}
        {remainingSeconds !== null && <span className={remainingSeconds <= 10 ? 'timer-warning' : ''}>残り {remainingSeconds}秒</span>}
        <button type="button">教典</button>
      </div>

        <div className="gf-battle-shell">
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
          RESOURCE_EFFECT_TYPES.has(effectAnim.type) ? (
            <div
              key={effectAnim.id}
              className={`resource-effect-overlay ${effectAnim.playerId === me.id ? 'target-me' : 'target-opponent'}`}
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
            aria-label={`${playerNameById(damageAnim.targetId)}に${damageAnim.amount}ダメージ`}
          >
            <div className="gf-damage-number">{renderDamageNumber(damageAnim.amount, damageAnim.isDarkFollowUp)}</div>
            <img className="gf-damage-label" src={`/godfield-flash/ui/game-ja/effect/${damageAnim.isDarkFollowUp ? 'damage_dark' : 'damage'}.png`} alt={damageAnim.isDarkFollowUp ? '冥ダメージ' : 'ダメージ'} />
          </div>
        )}

        {startAnim && <img className="gf-game-start-effect" src="/godfield-flash/ui/game-ja/effect/game_start.png" alt="ゲーム開始" />}

        {actionAnim && !damageAnim && actionAnim.outcome !== 'use' && (
          <div className={`combat-action-overlay outcome-${actionAnim.outcome} ${actionAnim.defenderId === me.id ? 'target-me' : 'target-opponent'}`}>
            <img src={`/godfield-flash/ui/game-ja/effect/${actionEffect}.png`} alt={actionEffect === 'miss' ? '回避' : '命中'} />
          </div>
        )}

        <main className="gf-battle-stage">
          <div className="gf-field-cards">
            {field && (
              <section className="gf-field-group attacker">
                <div className="gf-field-owner">{playerNameById(field.attackerId) || '---'}</div>
                {renderFieldCard(field.attackCard)}
                {phase !== 'defense' && selectedCards.map(index => me.hand[index]).filter(Boolean).map(card => (
                  <div key={card.instanceId} className="pending-defense-card">{renderFieldCard(card)}</div>
                ))}
              </section>
            )}
            {field?.defenderId && (
              <img className="gf-field-target-arrow" src="/godfield-flash/ui/game/commander/target_arrow_right.png" alt="攻撃対象" />
            )}
            {field?.defenderId && (
              <section className="gf-field-group defender">
                <div className="gf-field-owner">{playerNameById(field.defenderId) || '---'}</div>
                {(field.defenseCards || []).map((card, index) => <div key={index}>{renderFieldCard(card)}</div>)}
                {phase === 'defense' && selectedCards.map(index => me.hand[index]).filter(Boolean).map(card => (
                  <div key={card.instanceId} className="pending-defense-card">{renderFieldCard(card)}</div>
                ))}
              </section>
            )}
            {!field && selectedCards.length > 0 && (
              <div className="selected-field-preview">
                <div className="selected-field-title">選択中 ({selectedCards.length})</div>
                <div className="selected-field-cards">
                  {selectedCards.map(index => me.hand[index]).filter(Boolean).map(card => <div key={card.instanceId}>{renderFieldCard(card)}</div>)}
                </div>
              </div>
            )}
          </div>
          {field?.defenderId && (
            <div className="gf-combat-totals">
              <span>攻{field.attackCard.attack || 0}</span>
              <span>守{field.defenseCards?.reduce((sum, card) => sum + (card.defense || 0), 0) || 0}</span>
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
            <div className="hovered-card-detail" style={{ left: `${(hoveredCardIndex % 8) * 83}px` }}>
              {renderFieldCard(getDisplayedCard(me.hand[hoveredCardIndex], hoveredCardIndex))}
            </div>
          )}
          <div className="gf-hand-cards">{me.hand.map((card, index) => renderSquareCard(card, index))}</div>
         {me.learnedMiracles?.length > 0 && (
           <div className="learned-miracles">
             <span>習得済み奇跡</span>
             {me.learnedMiracles.map((miracle, index) => (
               <button
                 key={`${miracle.id}-${index}`}
                 className="btn btn-secondary"
                 disabled={!isMyTurn
                   || !['main', 'defense'].includes(phase)
                   || (phase === 'defense' && !(gameState.usableDefenseMiracleIndices || []).includes(index))
                   || (me.mp < (miracle.costMp || 0) && !selectedCards.some(cardIndex => me.hand[cardIndex]?.supportEffect === 'magic_free'))}
                 onClick={() => {
                   socket.emit('castMiracle', { roomName: id, miracleIndex: index, cardIndices: selectedCards, targetId: opponent?.id });
                   setSelectedCards([]);
                 }}
               >
                 {miracle.name}（MP{miracle.costMp || 0}）
               </button>
             ))}
           </div>
         )}
          <div className="gf-hand-actions">
            {isMyTurn && selectedCards.length > 0 && (phase === 'main' || (phase === 'defense' && hasSelectedDefense)) && (
               <button className="btn gf-command-button" aria-label={`選択した神器${selectedCards.length}枚を使用`} onClick={() => handlePlayCard(selectedCards[0])}>使用する</button>
            )}
            {isMyTurn && phase === 'defense' && selectedCards.length === 0 && (
               <button className="btn gf-command-button" aria-label="防御せずダメージを受ける" onClick={() => socket.emit('finishDefense', { roomName: id })}>防御しない</button>
            )}
            {isMyTurn && phase === 'main' && (
               <button
                 className="btn gf-fixed-action pray-action"
                 disabled={!gameState.canPray}
                 onClick={() => socket.emit('pray', { roomName: id })}
                 title={gameState.canPray ? '祈って神器を1枚引く' : '攻撃可能な武器があるため祈れません'}
               >祈る (ドロー)</button>
            )}
            {isMyTurn && phase === 'main' && selectedCards.length > 0 && (
               <button className="btn btn-secondary gf-fixed-action discard-action" onClick={() => { socket.emit('discardCards', { roomName: id, cardIndices: selectedCards }); setSelectedCards([]); }}>捨てる ({selectedCards.length})</button>
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

      {gameState.gameStateStr === 'ended' && !ascensionAnim && (
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
