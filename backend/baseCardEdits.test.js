const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBaseCardEdit, normalizeBaseCardEdits } = require('./baseCardEdits');

const baseCard = {
  id: 'card-1', name: '既定名', description: '既定説明', imageUrl: '/default.png',
  attack: 30, defense: 10, hitRate: 90, ailmentInflict: 'poison',
};

test('デフォルト設定と同じ値は編集差分に含めない', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, { ...baseCard }), {});
});

test('デフォルト設定と異なる項目だけを編集差分に残す', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, {
    name: '変更名', description: baseCard.description, imageUrl: baseCard.imageUrl,
  }), { name: '変更名' });
});

test('差分のない神器と存在しない神器を編集一覧から除外する', () => {
  assert.deepEqual(normalizeBaseCardEdits([baseCard], {
    'card-1': { name: baseCard.name },
    missing: { name: '変更名' },
  }), {});
});

test('攻撃力などの効果変更を編集差分に残す', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, {
    attack: 45, defense: baseCard.defense, hitRate: baseCard.hitRate,
  }), { attack: 45 });
});

test('属性と攻撃対象の変更を編集差分に残す', () => {
  assert.deepEqual(normalizeBaseCardEdit({ ...baseCard, attribute: 'fire', target: 'single' }, {
    attribute: 'water', target: 'all',
  }), { attribute: 'water', target: 'all' });
});

test('既定の効果と同じ値は編集差分に含めない', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, {
    attack: baseCard.attack, ailmentInflict: baseCard.ailmentInflict,
  }), {});
});

test('未知の効果と型や範囲が不正な効果を除外する', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, {
    attack: '999', hitRate: 101, unknownEffect: true,
  }), {});
});

test('不正な属性と不完全な瀕死時攻撃を除外する', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, {
    attribute: 'invalid', target: 'everyone', dyingAttack: { hitRate: 50 },
  }), {});
});

test('既存の特殊効果をnullで無効化できる', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, {
    ailmentInflict: null, attackBonus: null,
  }), { ailmentInflict: null });
});

test('効果がないカードへの空の追加は編集差分に含めない', () => {
  assert.deepEqual(normalizeBaseCardEdit(baseCard, {
    moneyGain: 0, mystery: false, dyingAttack: null,
  }), {});
});
