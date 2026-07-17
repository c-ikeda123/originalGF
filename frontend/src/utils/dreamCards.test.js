import test from 'node:test';
import assert from 'node:assert/strict';
import { getDreamDisplayedCard } from './dreamCards.js';

test('夢状態でも両替と売るは別の神器に見せない', () => {
  const sell = { id: 'sell', instanceId: 'sell_2', effect: 'sell', name: '売る' };
  const armor = { id: 'armor', instanceId: 'armor_2', type: 'armor', name: '防具' };
  assert.equal(getDreamDisplayedCard([sell, armor], 0, true).name, '売る');
});

test('夢の偽物表示に両替と売るを使わない', () => {
  const weapon = { id: 'weapon', instanceId: 'b', type: 'weapon', name: '武器' };
  const sell = { id: 'sell', instanceId: 'sell_1', effect: 'sell', name: '売る' };
  const armor = { id: 'armor', instanceId: 'armor_1', type: 'armor', name: '防具' };
  assert.equal(getDreamDisplayedCard([weapon, sell, armor], 0, true).name, '防具');
});

test('夢状態でなければ実際の神器をそのまま表示する', () => {
  const weapon = { id: 'weapon', instanceId: 'weapon_2', type: 'weapon', name: '武器' };
  const armor = { id: 'armor', instanceId: 'armor_1', type: 'armor', name: '防具' };
  assert.equal(getDreamDisplayedCard([weapon, armor], 0, false), weapon);
});
