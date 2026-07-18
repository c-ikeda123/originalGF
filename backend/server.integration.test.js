const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { io } = require('../frontend/node_modules/socket.io-client');

function waitFor(socket, event, predicate = () => true, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`${event} timed out`));
    }, timeout);
    const listener = value => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(value);
    };
    socket.on(event, listener);
  });
}

test('準備・チームチャット・観戦・途中参加拒否を実サーバーで処理する', { timeout: 15000 }, async t => {
  const port = 32000 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  t.after(() => server.kill());
  await new Promise(resolve => setTimeout(resolve, 500));

  const url = `http://127.0.0.1:${port}`;
  const host = io(url, { transports: ['websocket'] });
  const guest = io(url, { transports: ['websocket'] });
  const spectator = io(url, { transports: ['websocket'] });
  t.after(() => [host, guest, spectator].forEach(socket => socket.disconnect()));
  await Promise.all([host, guest, spectator].map(socket => waitFor(socket, 'connect')));

  const roomName = `integration_${Date.now()}`;
  host.emit('joinRoom', { password: roomName, playerName: 'Host' });
  guest.emit('joinRoom', { password: roomName, playerName: 'Guest' });
  spectator.emit('joinRoom', { password: roomName, playerName: 'Watcher', role: 'spectator' });
  const joined = await waitFor(host, 'roomUpdate', state => state.players.length === 2 && state.spectators.length === 1);
  assert.equal(joined.players.every(player => !player.ready), true);

  host.emit('setTeam', { roomName, team: 'red' });
  guest.emit('setTeam', { roomName, team: 'blue' });
  host.emit('toggleReady', { roomName });
  guest.emit('toggleReady', { roomName });
  await waitFor(host, 'roomUpdate', state => state.players.every(player => player.ready));

  const publicMessage = waitFor(spectator, 'chatMessage', message => message.text === 'public');
  host.emit('sendChat', { roomName, text: 'public' });
  assert.equal((await publicMessage).teamOnly, false);

  let leaked = false;
  const leakListener = message => { if (message.text === 'secret') leaked = true; };
  spectator.on('chatMessage', leakListener);
  host.emit('sendChat', { roomName, text: 'secret', teamOnly: true });
  await new Promise(resolve => setTimeout(resolve, 150));
  spectator.off('chatMessage', leakListener);
  assert.equal(leaked, false);

  const spectatorGame = waitFor(spectator, 'gameState', state => state.spectator === true);
  host.emit('startGame', { roomName });
  const watched = await spectatorGame;
  assert.equal(watched.opponents.length, 2);
  assert.deepEqual(watched.effectEvents, []);
  assert.ok(watched.actionLockedUntil > Date.now());
  assert.deepEqual(watched.presentationEvents.map(event => event.type), ['game_start', 'initial_deal', 'turn_start']);
  assert.deepEqual(watched.usableDefenseInstanceIds, []);
  assert.deepEqual(watched.usableDefenseMiracleIndices, []);
  assert.deepEqual(watched.selectableDefenseSupportInstanceIds, []);
  assert.equal(watched.opponents.every(player => player.hand.every(card => card.hidden)), true);

  const late = io(url, { transports: ['websocket'] });
  t.after(() => late.disconnect());
  await waitFor(late, 'connect');
  const rejected = waitFor(late, 'errorMsg');
  late.emit('joinRoom', { password: roomName, playerName: 'Late' });
  assert.equal(typeof await rejected, 'string');

  const botHost = io(url, { transports: ['websocket'] });
  t.after(() => botHost.disconnect());
  await waitFor(botHost, 'connect');
  const botRoom = `bot_${Date.now()}`;
  botHost.emit('joinRoom', { password: botRoom, playerName: 'BotHost' });
  await waitFor(botHost, 'roomUpdate', state => state.players.length === 1);
  botHost.emit('addBot', { roomName: botRoom });
  const withBot = await waitFor(botHost, 'roomUpdate', state => state.players.some(player => player.isBot));
  const botId = withBot.players.find(player => player.isBot).id;
  botHost.emit('toggleReady', { roomName: botRoom });
  await waitFor(botHost, 'roomUpdate', state => state.players.every(player => player.ready));
  botHost.emit('startGame', { roomName: botRoom });
  const initialBotGame = await waitFor(botHost, 'gameState', state => state.gameStateStr === 'playing');
  await new Promise(resolve => setTimeout(resolve, Math.max(0, initialBotGame.actionLockedUntil - Date.now()) + 30));
  if (initialBotGame.turn !== botId) {
    const discardIndex = initialBotGame.me.hand.findIndex(card => !card.mortar);
    assert.notEqual(discardIndex, -1);
    botHost.emit('discardCards', { roomName: botRoom, cardIndices: [discardIndex] });
    await waitFor(botHost, 'gameState', state => state.turn === botId && state.phase === 'main');
  }
  const afterBot = await waitFor(botHost, 'gameState', state => !(state.turn === botId && state.phase === 'main'));
  assert.equal(afterBot.gameStateStr, 'playing');
});
