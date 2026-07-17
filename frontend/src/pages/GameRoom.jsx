import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import '../index.css';
import RoomBaseEditor from './RoomBaseEditor';
import { playSound } from '../soundEffects';

let socket;
const serverUrl = import.meta.env.VITE_SERVER_URL
  || (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

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
        damageTimer.current = setTimeout(() => setDamageAnim(null), 1500);
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
      setGameState(null);
      setSelectedCards([]);
      setDamageAnim(null);
      setActionAnim(null);
      lastDamageTimestamp.current = null;
      lastActionId.current = null;
      lastSoundEventId.current = 0;
    });

    socket.on('errorMsg', (msg) => {
      playSound('alert');
      setError(msg);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      clearTimeout(damageTimer.current);
      clearTimeout(actionTimer.current);
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
    if (!gameState?.turnDeadline) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [gameState?.turnDeadline]);

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
  const isMyTurn = turn === me.id;
  const remainingSeconds = gameState.turnDeadline
    ? Math.max(0, Math.ceil((gameState.turnDeadline - now) / 1000))
    : null;
  const hasFog = me.ailments.includes('fog');
  const hasDream = me.ailments.includes('dream');

  const isCardUsable = (card) => {
    if (!isMyTurn || !card) return false;
    if (phase === 'main') return !['armor', 'ring', 'defense_item'].includes(card.type);
    if (phase === 'defense') {
      if (me.ailments.includes('flash') && selectedCards.length > 0) return false;
      return (card.defense || 0) > 0
        || Boolean(card.defenseEffect)
        || Boolean(card.reactiveEffect)
        || ['ring', 'defense_item', 'accessory'].includes(card.type);
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
    else if (card.healHp > 0) statText = `回${card.healHp}`;
    
    // Convert attributes to class for color
    const attrClass = `attr-bg-${card.attribute}`;
    const borderClass = `attr-border-${card.attribute}`;

    return (
      <div 
         key={realCard.instanceId} 
         className={`gf-card-square ${borderClass} ${selectedCards.includes(index) ? 'selected' : ''} ${usable ? '' : 'disabled'}`}
         aria-disabled={!usable}
         title={usable ? realCard.name : (phase === 'main' ? 'この神器は防御時に使用します' : '現在は使用できません')}
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
    if (card.attack > 0) statText += `攻${card.attack} `;
    if (card.hitRate > 0 && card.type !== 'armor') statText += `${card.hitRate}% `;
    if (card.defense > 0) statText += `守${card.defense} `;
    if (card.healHp > 0) statText += `HP+${card.healHp} `;

    return (
      <div className={`gf-card-field attr-border-${card.attribute}`}>
        {card.imageUrl ? (
          <div className="image-area" style={{backgroundImage: `url(${card.imageUrl})`}}></div>
        ) : (
          <div className="image-area">{card.type.charAt(0).toUpperCase()}</div>
        )}
        <div className="details">
           <div className="card-name">{card.name}</div>
           <div className="card-stat-text">{statText}</div>
           <div className="card-stat-text" style={{fontSize: '0.6rem'}}>{card.description}</div>
        </div>
        {card.costMoney > 0 && <div className="card-price">¥{card.costMoney}</div>}
      </div>
    );
  };

  const renderAilments = (player) => {
    const names = { cold: '風邪', fever: '熱病', hell: '地獄病', heaven: '天国病', fog: '霧', flash: '閃光', dream: '夢', darkcloud: '暗雲' };
    return player.ailments.map(a => {
      let icon = '';
      if(a === 'cold') icon = '🤧';
      if(a === 'fever') icon = '🤒';
      if(a === 'hell') icon = '🔥';
      if(a === 'heaven') icon = '👼';
      if(a === 'fog') icon = '🌫️';
      if(a === 'flash') icon = '✨';
      if(a === 'dream') icon = '🌀';
      if(a === 'darkcloud') icon = '☁️';
      return <span key={a} className="ailment-icon" title={names[a] || a}>{icon}</span>;
    });
  };

  const renderAssistant = (assistant) => assistant && (
    <div className="assistant-status">
      <img src={`/godfield-flash/cards/assistant/${assistant.type}.png`} alt="" />
      <span>守護神 {assistant.type}（HP {assistant.hp}）</span>
    </div>
  );

  const renderPlayerStatus = (player, isSelf = false) => player && (
    <div className={`battle-player ${turn === player.id ? 'active' : ''} ${player.hp <= 0 ? 'defeated' : ''}`}>
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
    </div>
  );

  const actionEffect = actionAnim?.outcome === 'evade' ? 'miss' : 'hit';
  const renderDamageNumber = amount => String(Math.max(0, amount)).split('').map((digit, index) => (
    <img
      key={`${digit}-${index}`}
      src={`/godfield-flash/ui/game/effect/damage_${digit}.png`}
      alt={digit}
    />
  ));

  return (
    <div className="gf-game-viewport">
      <div className="gf-game-frame" style={{ width: 1024 * battleScale, height: 768 * battleScale }}>
        <div className="gf-game-screen" style={{ transform: `scale(${battleScale})` }}>
      {gameState.spectator && <div className="spectator-banner">観戦中（操作はできません）</div>}

      <div className="gf-battle-header">
        <button type="button" onClick={() => navigate('/')}>修行</button>
        <span>部屋 {id}</span>
        <strong className="gf-battle-title">God Field</strong>
        {remainingSeconds !== null && <span className={remainingSeconds <= 10 ? 'timer-warning' : ''}>残り {remainingSeconds}秒</span>}
        <button type="button">教典</button>
      </div>

      <div className="gf-battle-shell">
        {damageAnim && (
          <div
            className={`damage-overlay ${damageAnim.targetId === me.id ? 'target-me' : 'target-opponent'}`}
            aria-label={`${playerNameById(damageAnim.targetId)}に${damageAnim.amount}ダメージ`}
          >
            <div className="gf-damage-number">{renderDamageNumber(damageAnim.amount)}</div>
            <img className="gf-damage-label" src="/godfield-flash/ui/game-ja/effect/damage.png" alt="ダメージ" />
          </div>
        )}

        {actionAnim && !damageAnim && (
          <div className={`combat-action-overlay outcome-${actionAnim.outcome} ${actionAnim.defenderId === me.id ? 'target-me' : 'target-opponent'}`}>
            <img src={`/godfield-flash/ui/game-ja/effect/${actionEffect}.png`} alt={actionEffect === 'miss' ? '回避' : '命中'} />
          </div>
        )}

        <main className="gf-battle-stage">
          <div className="gf-field-cards">
            {field && (
              <section className="gf-field-group attacker">
                <div className="gf-field-owner">{playerNameById(field.attackerId) || '---'} ▶</div>
                {renderFieldCard(field.attackCard)}
              </section>
            )}
            {field && field.defenseCards?.length > 0 && (
              <section className="gf-field-group defender">
                <div className="gf-field-owner">{playerNameById(field.defenderId) || '---'}</div>
                {field.defenseCards.map((card, index) => <div key={index}>{renderFieldCard(card)}</div>)}
              </section>
            )}
            {field && selectedCards.length > 0 && selectedCards.map(index => me.hand[index]).filter(Boolean).map(card => (
              <div key={card.instanceId} className="pending-defense-card">{renderFieldCard(card)}</div>
            ))}
            {!field && selectedCards.length > 0 && (
              <div className="selected-field-preview">
                <div className="selected-field-title">選択中 ({selectedCards.length})</div>
                <div className="selected-field-cards">
                  {selectedCards.map(index => me.hand[index]).filter(Boolean).map(card => <div key={card.instanceId}>{renderFieldCard(card)}</div>)}
                </div>
              </div>
            )}
          </div>
          {field && (
            <div className="gf-combat-totals">
              <span>Atk{field.attackCard.attack || 0}</span>
              <span>{field.defenderId ? `Dfs${field.defenseCards?.reduce((sum, card) => sum + (card.defense || 0), 0) || 0}` : '(No Defense)'}</span>
            </div>
          )}
        </main>

        <aside className="gf-battle-sidebar">
          <div className="battle-player-list">
            {targetableOpponents.length > 1 && (
              <div className="target-selector">
                <span>対象</span>
                {targetableOpponents.map(player => (
                  <button
                    key={player.id}
                    type="button"
                    className={`btn btn-secondary ${opponent?.id === player.id ? 'selected' : ''}`}
                    data-target={player.id}
                    disabled={player.ascended || player.hp <= 0}
                    onClick={() => setSelectedTargetId(player.id)}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            )}
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
            <div className="hovered-card-detail" style={{ left: `${Math.min(hoveredCardIndex * 58, window.innerWidth - 240)}px` }}>
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
                   || (phase === 'defense' && !((miracle.defense || 0) > 0 || miracle.defenseEffect || miracle.reactiveEffect))
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
            {isMyTurn && (phase === 'main' || phase === 'defense') && selectedCards.length > 0 && (
               <button className="btn" onClick={() => handlePlayCard(selectedCards[0])}>選択カードを使用 ({selectedCards.length})</button>
            )}
            {isMyTurn && phase === 'defense' && (
               <button className="btn" onClick={() => socket.emit('finishDefense', { roomName: id })}>ダメージを受ける</button>
            )}
            {isMyTurn && phase === 'main' && (
               <button className="btn" onClick={() => socket.emit('pray', { roomName: id })} title="手札に武器がない場合のみ可能">祈る (ドロー)</button>
            )}
            {isMyTurn && phase === 'main' && selectedCards.length > 0 && (
               <button className="btn btn-secondary" onClick={() => { socket.emit('discardCards', { roomName: id, cardIndices: selectedCards }); setSelectedCards([]); }}>捨てる ({selectedCards.length})</button>
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

      {gameState.gameStateStr === 'ended' && (
        <div className="game-end-overlay">
          <div className="glass-panel game-end-panel">
            <h2>{gameState.winner ? '決着' : '引き分け'}</h2>
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
