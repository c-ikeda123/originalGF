import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLatestPresentationId,
  getNewPresentationEvents,
  getPresentationDuration,
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
});
