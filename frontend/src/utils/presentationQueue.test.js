import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLatestFieldPresentationId,
  getLatestPresentationId,
  getNewPresentationEvents,
  getPresentationDuration,
  shouldApplyFieldClear,
} from './presentationQueue.js';

test('未再生の戦闘演出をサーバー順に取り出す', () => {
  const events = [
    { id: 5, type: 'damage' },
    { id: 3, type: 'card_enter' },
    { id: 4, type: 'hit_result' },
  ];

  assert.deepEqual(getNewPresentationEvents(events, 3).map(event => event.id), [4, 5]);
  assert.equal(getLatestPresentationId(events), 5);
});

test('複数神器は一枚ずつ置く時間を確保する', () => {
  const single = getPresentationDuration({ type: 'card_enter', cards: [{}] });
  const triple = getPresentationDuration({ type: 'card_enter', cards: [{}, {}, {}] });

  assert.ok(triple > single);
  assert.equal(getPresentationDuration({ type: 'damage' }), 1200);
  assert.ok(getPresentationDuration({ type: 'initial_deal', cardCount: 9 }) > 900);
});

test('戦場に関係する最新の神器登場番号を取得する', () => {
  const events = [
    { id: 8, type: 'card_enter', phase: 'main' },
    { id: 9, type: 'effect' },
    { id: 12, type: 'card_enter', phase: 'defense' },
  ];
  assert.equal(getLatestFieldPresentationId(events), 12);
});

test('新しい戦場より古い消去演出を適用しない', () => {
  assert.equal(shouldApplyFieldClear(10, 12), false);
  assert.equal(shouldApplyFieldClear(12, 12), true);
  assert.equal(shouldApplyFieldClear(13, 12), true);
});
