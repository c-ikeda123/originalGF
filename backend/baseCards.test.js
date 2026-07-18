const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cards = require('../shared/baseCards.json');
const flashSounds = require('../shared/flashSounds.json');
const publicDir = path.join(__dirname, '..', 'frontend', 'public');

test('基礎神器247種の名前に対応した画像がすべて存在する', () => {
  assert.equal(cards.length, 247);
  assert.equal(new Set(cards.map(card => card.imageUrl)).size, cards.length);

  for (const card of cards) {
    if (card.category === 'incarnation') {
      assert.match(card.imageUrl, /^\/godfield-flash\/cards\/assistant\/.+\.png$/);
    } else {
      assert.match(card.imageUrl, /^\/godfield-current\/images\/items\/.+\.webp$/);
    }
    assert.equal(fs.existsSync(path.join(publicDir, card.imageUrl)), true, `${card.name}: ${card.imageUrl}`);
    assert.ok(fs.statSync(path.join(publicDir, card.imageUrl)).size > 0, card.imageUrl);
  }

  const byName = Object.fromEntries(cards.map(card => [card.name, card.imageUrl]));
  assert.match(byName['ムチ'], /\/whip\.webp$/);
  assert.match(byName['パンチ'], /\/punch\.webp$/);
  assert.match(byName['のこぶんぶん'], /\/saw-boom-boom\.webp$/);
  assert.match(byName['革の帽子'], /\/leather-cap\.webp$/);
  assert.match(byName['スマイルのしずく'], /\/smile-dew\.webp$/);
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

test('Flash版の昇天画像が原寸で存在する', () => {
  const file = path.join(publicDir, 'godfield-flash', 'ui', 'game-ja', 'effect', 'dead.png');
  const png = fs.readFileSync(file);
  assert.equal(png.readUInt32BE(16), 330);
  assert.equal(png.readUInt32BE(20), 160);
});

test('戦闘アニメーションに使うFlash版画像がすべて存在する', () => {
  const japaneseEffects = [
    'block', 'cold', 'damage', 'damage_dark', 'dark_cloud', 'dead', 'fever', 'flick',
    'fog', 'glory', 'harm_remove', 'heaven', 'hell', 'illusion', 'no_change', 'reflect', 'seizure',
  ];
  const numericEffects = ['damage', 'damage_dark', 'hp', 'mp', 'yen'];
  for (const effect of japaneseEffects) {
    assert.equal(fs.existsSync(path.join(publicDir, 'godfield-flash', 'ui', 'game-ja', 'effect', `${effect}.png`)), true, effect);
  }
  for (const effect of numericEffects) {
    for (let digit = 0; digit <= 9; digit++) {
      assert.equal(fs.existsSync(path.join(publicDir, 'godfield-flash', 'ui', 'game', 'effect', `${effect}_${digit}.png`)), true, `${effect}_${digit}`);
    }
  }
  for (const assistant of ['mars', 'mercury', 'jupiter', 'saturn', 'uranus', 'pluto', 'neptune', 'venus', 'earth', 'moon']) {
    assert.equal(fs.existsSync(path.join(publicDir, 'godfield-flash', 'ui', 'game', 'assistant', `${assistant}.png`)), true, assistant);
  }
});

test('神器の購入では被害側に発作演出を出さない', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.equal((serverSource.match(/addSoundEvent\(room, 'seizure'/g) || []).length, 1);
  assert.equal((serverSource.match(/addEffectEvent\(room, 'seizure'/g) || []).length, 1);
});

test('ホバー音を除くFlash版効果音がゲームイベントまたは画面操作に割り当てられている', () => {
  const implementation = [
    fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'soundEffects.js'), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'pages', 'GameRoom.jsx'), 'utf8'),
  ].join('\n');

  const disabledHoverSounds = new Set(['entry_toggle_over', 'button_over', 'book_tab_over']);
  flashSounds
    .filter(sound => !disabledHoverSounds.has(sound))
    .forEach(sound => assert.match(implementation, new RegExp(`['\"]${sound}['\"]`), sound));
});

test('カーソルを重ねただけでは効果音を鳴らさない', () => {
  const implementation = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'soundEffects.js'), 'utf8');
  assert.doesNotMatch(implementation, /addEventListener\(['\"]pointerover['\"]/);
  assert.match(implementation, /addEventListener\(['\"]pointerdown['\"]/);
});

test('人間とBotの防御は同じ効果音演出を通る', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.equal((serverSource.match(/announceDefenseResolution\(room, (?:player|bot), resolution\.action\)/g) || []).length, 2);
});
