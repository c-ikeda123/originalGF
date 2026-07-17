import test from 'node:test';
import assert from 'node:assert/strict';
import { canAddCardToSelection } from './cardSelection.js';

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
