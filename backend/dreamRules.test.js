const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getDreamCardGroup,
  isDreamAffected,
  resolveDreamCard,
} = require('../shared/dreamRules.cjs');

test('夢の対象判定は固定操作と習得済み奇跡を除外する', () => {
  assert.equal(isDreamAffected({ id: 'weapon', instanceId: 'b', type: 'weapon' }), true);
  assert.equal(isDreamAffected({ id: 'sell', instanceId: 'b', effect: 'sell' }), false);
  assert.equal(isDreamAffected({ id: 'miracle', instanceId: 'b', _learnedCast: true }), false);
});

test('夢の変化先を攻撃・防御・回復など同じ役割に限定する', () => {
  assert.equal(getDreamCardGroup({ type: 'weapon', attack: 5 }), 'attack:weapon:base');
  assert.equal(getDreamCardGroup({ type: 'miracle', attack: 2, additive: true }), 'attack:miracle:additive');
  assert.equal(getDreamCardGroup({ type: 'item', healHp: 10 }), 'item:heal_hp');
  assert.equal(getDreamCardGroup({ type: 'armor', defense: 5, attribute: 'fire' }, 'defense'), 'defense:armor:fire');
  assert.equal(getDreamCardGroup({ type: 'armor', defense: 5, attribute: 'water' }, 'defense'), 'defense:armor:water');
});

test('夢の対象神器は同系統のままか別神器に確定する', () => {
  const original = { id: 'sword', instanceId: 'b', name: '剣', type: 'weapon', attack: 5 };
  const axe = { id: 'axe', name: '斧', type: 'weapon', attack: 8 };
  const armor = { id: 'armor', name: '鎧', type: 'armor', defense: 8 };
  assert.equal(resolveDreamCard(original, [axe, armor], 'main', () => 0.25).card.name, '剣');
  const changed = resolveDreamCard(original, [axe, armor], 'main', () => 0.75);
  assert.equal(changed.card.name, '斧');
  assert.equal(changed.card.instanceId, 'b');
  assert.equal(changed.changed, true);
});
