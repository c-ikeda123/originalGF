import test from 'node:test';
import assert from 'node:assert/strict';
import { canAddCardToSelection, getNextCardSelection } from './cardSelection.js';

const weapon = { type: 'weapon', attack: 5 };
const otherWeapon = { type: 'weapon', attack: 8 };
const additive = { type: 'miracle', attack: 2, additive: true };
const healItem = { type: 'item', attack: 0, healHp: 10 };
const sell = { type: 'trade', effect: 'sell' };

test('単独使用の神器には後から別の神器を追加選択しない', () => {
  assert.equal(canAddCardToSelection([healItem], weapon, 'main'), false);
  assert.equal(canAddCardToSelection([{ type: 'trade', effect: 'exchange' }], weapon, 'main'), false);
  assert.equal(canAddCardToSelection([weapon], otherWeapon, 'main'), false);
});

test('攻撃補助と売る組み合わせは必要な枚数だけ選択できる', () => {
  assert.equal(canAddCardToSelection([weapon], additive, 'main'), true);
  assert.equal(canAddCardToSelection([sell], weapon, 'main'), true);
  assert.equal(canAddCardToSelection([sell, weapon], additive, 'main'), false);
});

test('防御神器は重ねられるが閃光中は1枚だけにする', () => {
  const armor = { type: 'armor', defense: 5 };
  const otherArmor = { type: 'armor', defense: 3 };
  assert.equal(canAddCardToSelection([armor], otherArmor, 'defense'), true);
  assert.equal(canAddCardToSelection([armor], otherArmor, 'defense', true), false);
});

test('組み合わせられない神器を押すと新しい1枚へ選択を切り替える', () => {
  const hand = [weapon, otherWeapon, additive, healItem];
  assert.deepEqual(getNextCardSelection([0], 1, hand, 'main'), [1]);
  assert.deepEqual(getNextCardSelection([0, 2], 3, hand, 'main'), [3]);
});

test('選択済みの神器を押すとその神器だけを選択解除する', () => {
  const hand = [weapon, additive];
  assert.deepEqual(getNextCardSelection([0, 1], 1, hand, 'main'), [0]);
});
