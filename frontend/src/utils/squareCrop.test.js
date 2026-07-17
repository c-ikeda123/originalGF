import test from 'node:test';
import assert from 'node:assert/strict';
import { clampCropPosition, getCropMetrics } from './squareCrop.js';

test('横長画像を正方形全体に敷き詰める', () => {
  const metrics = getCropMetrics(720, 360, 1);
  assert.equal(metrics.renderedWidth, 720);
  assert.equal(metrics.renderedHeight, 360);
  assert.equal(metrics.maxX, 180);
  assert.equal(metrics.maxY, 0);
});

test('ドラッグ位置を画像の余白が出ない範囲に制限する', () => {
  const metrics = getCropMetrics(720, 360, 1);
  assert.deepEqual(clampCropPosition({ x: 300, y: -20 }, metrics), { x: 180, y: 0 });
});

test('拡大率に応じてドラッグ可能範囲を広げる', () => {
  const metrics = getCropMetrics(360, 360, 2);
  assert.equal(metrics.maxX, 180);
  assert.equal(metrics.maxY, 180);
});
