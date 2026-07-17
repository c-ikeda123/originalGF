const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeBaseCardEdit, normalizeBaseCardEdits } = require('./baseCardEdits');

const baseCard = { id: 'card-1', name: '既定名', description: '既定説明', imageUrl: '/default.png' };

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
