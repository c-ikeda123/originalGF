const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyAilment,
  cureAilments,
  processEndOfTurnAilments,
  rollAttack,
  validateCardPlay,
} = require('./gameRules');

test('防具はメインフェーズで使用できず、防御フェーズで使用できる', () => {
  const armor = { type: 'armor', defense: 5 };
  assert.equal(validateCardPlay([armor], 'main').valid, false);
  assert.equal(validateCardPlay([armor], 'defense').valid, true);
});

test('閃光状態では防御神器を複数使用できない', () => {
  const armors = [{ type: 'armor' }, { type: 'ring' }];
  assert.equal(validateCardPlay(armors, 'defense', ['flash']).valid, false);
});

test('防御効果のない奇跡は防御フェーズで使用できない', () => {
  assert.equal(validateCardPlay([{ type: 'miracle', defense: 0 }], 'defense').valid, false);
});

test('暗雲状態の対象への全体攻撃は不可避になる', () => {
  const attack = { target: 'all', hitRate: 25 };
  assert.deepEqual(rollAttack(attack, ['darkcloud'], () => 0.99), { hit: true, outcome: 'unavoidable', roll: null });
  assert.equal(rollAttack(attack, [], () => 0.99).outcome, 'evade');
});

test('病気の重複付与は一段階悪化する', () => {
  const player = { ailments: ['cold'] };
  assert.equal(applyAilment(player, 'cold'), 'fever');
  assert.deepEqual(player.ailments, ['fever']);
});

test('ターン終了時に病気のHP変化と5%の悪化を処理する', () => {
  const player = { hp: 40, ailments: ['fever'] };
  const result = processEndOfTurnAilments(player, () => 0.01);
  assert.equal(player.hp, 38);
  assert.equal(result.progressedTo, 'hell');
  assert.deepEqual(player.ailments, ['hell']);
});

test('指定された災いだけを治癒する', () => {
  const player = { ailments: ['cold', 'fog', 'dream'] };
  assert.deepEqual(cureAilments(player, ['cold', 'fog']), ['cold', 'fog']);
  assert.deepEqual(player.ailments, ['dream']);
});
