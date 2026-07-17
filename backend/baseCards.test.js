const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cards = require('../shared/baseCards.json');
const flashSounds = require('../shared/flashSounds.json');
const publicDir = path.join(__dirname, '..', 'frontend', 'public');

test('基礎神器247種のFlash版画像がすべて存在する', () => {
  assert.equal(cards.length, 247);
  assert.equal(new Set(cards.map(card => card.imageUrl)).size, cards.length);

  for (const card of cards) {
    assert.match(card.imageUrl, /^\/godfield-flash\/cards\/.+\.png$/);
    assert.equal(fs.existsSync(path.join(publicDir, card.imageUrl)), true, `${card.name}: ${card.imageUrl}`);
  }
});

test('基礎神器の総枚数と主要な固有効果を保持する', () => {
  assert.equal(cards.reduce((total, card) => total + card.copies, 0), 500);
  const byId = Object.fromEntries(cards.map(card => [card.id, card]));

  assert.equal(byId.gf_weapon_041.attackEffect, 'magical');
  assert.equal(byId.gf_weapon_063.attackEffect, 'pestle');
  assert.deepEqual(byId.gf_weapon_106.dyingAttack, { attack: 30, hitRate: 75, target: 'all' });
  assert.equal(byId.gf_weapon_107.lethalOnDamage, true);
  assert.equal(byId.gf_armor_166.redrawHand, true);
  assert.equal(byId.gf_miracle_215.setAssistant, true);
  assert.equal(byId.gf_item_226.setAssistant, true);
  assert.equal(byId.gf_item_232.mystery, true);
  assert.equal(byId.gf_item_234.mortar, true);
});

test('Flash版の効果音46種がすべて存在する', () => {
  assert.equal(flashSounds.length, 46);
  assert.equal(new Set(flashSounds).size, flashSounds.length);
  for (const sound of flashSounds) {
    const file = path.join(publicDir, 'godfield-flash', 'sounds', `${sound}.mp3`);
    assert.equal(fs.existsSync(file), true, file);
    assert.ok(fs.statSync(file).size > 0, file);
  }
});
