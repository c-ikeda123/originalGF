import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeHandOrder, moveHandCard } from './handOrder.js';

test('ドラッグした神器を差し込み位置へ移動する', () => {
  assert.deepEqual(moveHandCard(['a', 'b', 'c', 'd'], 'b', 'd'), ['a', 'c', 'd', 'b']);
  assert.deepEqual(moveHandCard(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
});

test('手札補充時も並び順を保って新しい神器を末尾へ追加する', () => {
  const hand = [{ instanceId: 'a' }, { instanceId: 'b' }, { instanceId: 'c' }, { instanceId: 'new' }];
  assert.deepEqual(mergeHandOrder(['c', 'a', 'b'], hand), ['c', 'a', 'b', 'new']);
});

test('使用済み神器を並び順から取り除く', () => {
  const hand = [{ instanceId: 'a' }, { instanceId: 'c' }];
  assert.deepEqual(mergeHandOrder(['c', 'b', 'a'], hand), ['c', 'a']);
});
