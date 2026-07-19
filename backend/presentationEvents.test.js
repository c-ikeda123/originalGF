const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_PRESENTATION_EVENTS,
  addPresentationEvent,
  getCardPresentationLockMs,
  getInitialPresentationLockMs,
  resetPresentationEvents,
  shouldPresentDamage,
} = require('./presentationEvents');

test('演出イベントには部屋内で単調増加する順序番号が付く', () => {
  const room = {};

  const first = addPresentationEvent(room, 'card_enter', { playerId: 'p1' });
  const second = addPresentationEvent(room, 'damage', { playerId: 'p2', amount: 7 });

  assert.equal(first.id, 1);
  assert.equal(second.id, 2);
  assert.deepEqual(room.presentationEvents.map(event => event.type), ['card_enter', 'damage']);
});

test('完全防御時は0ダメージ文字を表示しない', () => {
  assert.equal(shouldPresentDamage(0), false);
  assert.equal(shouldPresentDamage(7), true);
});

test('神器登場と命中表示が終わるまで操作をロックする', () => {
  assert.ok(getCardPresentationLockMs(2) > getCardPresentationLockMs(1));
  assert.equal(getCardPresentationLockMs(1, 1) - getCardPresentationLockMs(1), 650);
});

test('開始文字と初期配布と最初の手番表示が終わるまで操作をロックする', () => {
  assert.equal(getInitialPresentationLockMs(9), 3360);
  assert.ok(getInitialPresentationLockMs(18) > getInitialPresentationLockMs(9));
});

test('演出イベントは再接続用の上限を超えて蓄積しない', () => {
  const room = {};
  for (let index = 0; index < MAX_PRESENTATION_EVENTS + 5; index += 1) {
    addPresentationEvent(room, 'effect', { index });
  }

  assert.equal(room.presentationEvents.length, MAX_PRESENTATION_EVENTS);
  assert.equal(room.presentationEvents[0].index, 5);
  assert.equal(room.presentationEvents.at(-1).id, MAX_PRESENTATION_EVENTS + 5);
});

test('新しい対戦開始時に演出イベント列を初期化できる', () => {
  const room = {};
  addPresentationEvent(room, 'turn_start');

  resetPresentationEvents(room);

  assert.equal(room.presentationSeq, 0);
  assert.deepEqual(room.presentationEvents, []);
});
