import test from 'node:test';
import assert from 'node:assert/strict';
import { getDreamDisplayedCard, isDreamAffectedCard } from './dreamCards.js';

test('夢の対象判定をサーバーと共有する', () => {
  const weapon = { id: 'weapon', instanceId: 'b', type: 'weapon' };
  const sell = { id: 'sell', instanceId: 'b', effect: 'sell' };

  assert.equal(isDreamAffectedCard(weapon, true), true);
  assert.equal(isDreamAffectedCard(weapon, false), false);
  assert.equal(isDreamAffectedCard(sell, true), false);
});

test('夢状態でも確定前の神器は元の姿で表示する', () => {
  const weapon = { id: 'weapon', instanceId: 'b', type: 'weapon', name: '武器' };
  const armor = { id: 'armor', instanceId: 'armor_1', type: 'armor', name: '防具' };

  assert.equal(getDreamDisplayedCard([weapon, armor], 0), weapon);
});
