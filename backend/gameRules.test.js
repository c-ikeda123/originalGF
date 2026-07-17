const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyAilment,
  areEnemies,
  combineAttackCards,
  canDefendAttribute,
  clearFieldIfCurrent,
  createAttackQueue,
  createCounterAttackCard,
  createDyingAttackCard,
  createInitialHand,
  createMoonAssistantAttack,
  cureAilments,
  getAssistantAction,
  getEarthArtifactMode,
  getDamageResolutionDelay,
  getNextAlivePlayerId,
  getWinningSide,
  isActionLocked,
  isDefenseCard,
  processEndOfTurnAilments,
  resolveDamageSequence,
  resolveDefenseCard,
  rollAttack,
  shouldAssistantAct,
  shouldAssistantLeave,
  validateCardPlay,
} = require('./gameRules');

test('ダメージ演出中は次の行動を待機する', () => {
  assert.equal(getDamageResolutionDelay(0), 1500);
  assert.equal(getDamageResolutionDelay(10), 2150);
  assert.equal(isActionLocked({ actionLockedUntil: 2500 }, 2499), true);
  assert.equal(isActionLocked({ actionLockedUntil: 2500 }, 2500), false);
});

test('古い盤面の消去予約は新しい敵攻撃を消さない', () => {
  const oldField = { attackCard: { name: '前の行動' } };
  const newField = { attackCard: { name: '敵の攻撃' }, defenderId: 'player' };
  const room = { field: newField };
  assert.equal(clearFieldIfCurrent(room, oldField), false);
  assert.equal(room.field, newField);
  assert.equal(clearFieldIfCurrent(room, newField), true);
  assert.equal(room.field, null);
});

test('冥攻撃は通常ダメージ後の残りHPを追加ダメージにする', () => {
  assert.deepEqual(resolveDamageSequence(20, 6, true), {
    primaryDamage: 6,
    darkDamage: 14,
    remainingHp: 0,
  });
});

test('通常攻撃と致死済みの冥攻撃には余分な追加ダメージを出さない', () => {
  assert.deepEqual(resolveDamageSequence(20, 6, false), {
    primaryDamage: 6,
    darkDamage: 0,
    remainingHp: 14,
  });
  assert.deepEqual(resolveDamageSequence(5, 8, true), {
    primaryDamage: 5,
    darkDamage: 0,
    remainingHp: 0,
  });
});

test('初期手札は両替と売るを先頭に固定して9枚配る', () => {
  const deck = [
    { id: 'random_1' },
    { id: 'gf_trade_236', name: '売る' },
    { id: 'random_2' },
    { id: 'gf_trade_235', name: '両替' },
  ];
  const hand = createInitialHand(deck, () => 0);

  assert.equal(hand.length, 9);
  assert.deepEqual(hand.slice(0, 2).map(card => card.id), ['gf_trade_235', 'gf_trade_236']);
  assert.deepEqual(hand.slice(2).map(card => card.id), Array(7).fill('random_1'));
});

test('火星と土星の指輪は通常の防御可能な反撃を生成する', () => {
  const fire = createCounterAttackCard('counter_damage_all', 8, { id: 'fire-ring', name: '火星の指輪' });
  assert.deepEqual({ attack: fire.attack, hitRate: fire.hitRate, target: fire.target, sourceType: fire.sourceType }, {
    attack: 8, hitRate: 75, target: 'all', sourceType: 'ring',
  });
  const earth = createCounterAttackCard('counter_double_damage', 8, { id: 'earth-ring', name: '土星の指輪' });
  assert.deepEqual({ attack: earth.attack, hitRate: earth.hitRate, target: earth.target }, {
    attack: 16, hitRate: 100, target: 'single',
  });
});

test('昇天弓は元の神器情報を保った防御可能な全体攻撃を生成する', () => {
  const attack = createDyingAttackCard({
    id: 'bow', name: '昇天弓', type: 'weapon', attribute: 'light', imageUrl: '/bow.png',
    dyingAttack: { attack: 30, hitRate: 75, target: 'all' },
  });
  assert.deepEqual({ attack: attack.attack, hitRate: attack.hitRate, target: attack.target, sourceType: attack.sourceType }, {
    attack: 30, hitRate: 75, target: 'all', sourceType: 'weapon',
  });
});

test('地球の守護神は引いた神器の種類に応じて行動を選ぶ', () => {
  assert.equal(getEarthArtifactMode({ type: 'weapon', attack: 4 }), 'attack');
  assert.equal(getEarthArtifactMode({ type: 'trade', effect: 'sell' }), 'sell');
  assert.equal(getEarthArtifactMode({ type: 'trade', effect: 'buy' }), 'buy');
  assert.equal(getEarthArtifactMode({ type: 'miracle', healHp: 10 }), 'add_and_use');
});

test('月の守護神は攻撃10にオーラと蜃気楼を合成する', () => {
  const doubled = createMoonAssistantAttack({ name: 'オーラ', type: 'miracle', supportEffect: 'double_attack' });
  assert.equal(doubled.attack, 20);
  assert.equal(doubled.target, 'single');
  const wide = createMoonAssistantAttack({ name: '蜃気楼', type: 'miracle', supportEffect: 'wide_attack' });
  assert.equal(wide.attack, 10);
  assert.equal(wide.hitRate, 100);
  assert.equal(wide.target, 'all');
});

test('チーム戦では同陣営を攻撃対象とせず最後の生存陣営が勝つ', () => {
  const red1 = { id: 'A', team: 'red', hp: 20, ascended: false };
  const red2 = { id: 'B', team: 'red', hp: 10, ascended: false };
  const blue = { id: 'C', team: 'blue', hp: 0, ascended: true };
  assert.equal(areEnemies(red1, red2), false);
  assert.equal(areEnemies(red1, blue), true);
  assert.deepEqual(getWinningSide({ A: red1, B: red2, C: blue }), {
    ended: true, winnerId: null, winnerTeam: 'red',
  });
});

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

test('追加攻撃・倍化・全体化をFlash版の順序で合成する', () => {
  const result = combineAttackCards([
    { name: '剣', type: 'weapon', attack: 5, hitRate: 75, attribute: 'fire' },
    { name: '弓', type: 'weapon', attack: 3, attackBonus: 3, additive: true, attribute: 'light' },
    { name: 'オーラ', type: 'miracle', attack: 0, supportEffect: 'double_attack', attribute: 'none' },
    { name: '蜃気楼', type: 'miracle', attack: 0, supportEffect: 'wide_attack', attribute: 'none' },
  ]);
  assert.equal(result.attack, 16);
  assert.equal(result.hitRate, 100);
  assert.equal(result.target, 'all');
  assert.equal(result.attribute, 'none');
});

test('通常武器も防御値または特殊防御があれば防御に使える', () => {
  assert.equal(isDefenseCard({ type: 'weapon', defense: 3 }), true);
  assert.equal(isDefenseCard({ type: 'weapon', defenseEffect: 'reflect_weapon' }), true);
  assert.equal(validateCardPlay([{ type: 'weapon', defense: 3 }], 'defense').valid, true);
});

test('属性相性と特殊防御を解決する', () => {
  assert.equal(canDefendAttribute('fire', 'water'), true);
  assert.equal(canDefendAttribute('fire', 'earth'), false);
  assert.equal(canDefendAttribute('light', 'dark'), false);
  const attack = { amount: 10, attribute: 'fire', sourceType: 'weapon' };
  assert.deepEqual(resolveDefenseCard(attack, { defenseEffect: 'reflect_weapon', attribute: 'water' }), { action: 'reflect', amount: 10 });
  assert.deepEqual(resolveDefenseCard(attack, { defenseEffect: 'reflect_weapon', attribute: 'earth' }), { action: 'invalid_attribute', amount: 10 });
  assert.deepEqual(resolveDefenseCard(attack, { defenseEffect: 'block_weapon', attribute: 'water' }), { action: 'block', amount: 0 });
  assert.deepEqual(resolveDefenseCard(attack, { defenseEffect: 'remove_attribute' }), { action: 'remove_attribute', amount: 10, attribute: 'none' });
  assert.deepEqual(resolveDefenseCard(attack, { defense: 4, attribute: 'earth' }), { action: 'invalid_attribute', amount: 10 });
});

test('攻撃補助雑貨とMP無料化雑貨を攻撃に組み合わせられる', () => {
  const weapon = { name: '剣', type: 'weapon', attack: 5, hitRate: 100, attribute: 'none' };
  const powder = { name: '粉', type: 'item', attack: 0, additive: true, supportEffect: 'increase_attack', supportValue: 10 };
  const free = { name: '人形', type: 'item', attack: 0, supportEffect: 'magic_free' };
  assert.equal(validateCardPlay([weapon, powder], 'main').valid, true);
  assert.equal(validateCardPlay([weapon, free], 'main').valid, true);
  assert.equal(combineAttackCards([weapon, powder]).attack, 15);
});

test('全体・複数回攻撃は各対象を回数分だけ順番に処理する', () => {
  assert.deepEqual(createAttackQueue(['B', 'C'], 2), [
    { targetId: 'B', repeat: 1 },
    { targetId: 'C', repeat: 1 },
    { targetId: 'B', repeat: 2 },
    { targetId: 'C', repeat: 2 },
  ]);
  const repeated = combineAttackCards([{ name: '連撃', type: 'weapon', attack: 3, repeatCount: 2 }]);
  assert.equal(repeated.repeatCount, 2);
});

test('守護神の行動をFlash版の重みで抽選する', () => {
  assert.deepEqual(getAssistantAction('mars', () => 0), {
    kind: 'attack', attack: 2, hitRate: 75, attribute: 'fire', weight: 6,
  });
  assert.deepEqual(getAssistantAction('mars', () => 0.999), {
    kind: 'attack', attack: 6, hitRate: 75, attribute: 'fire', weight: 2,
  });
  assert.equal(getAssistantAction('unknown', () => 0), null);
});

test('属性を染める追加神器は元の攻撃属性を上書きする', () => {
  const weapon = { name: '水武器', type: 'weapon', attack: 5, attribute: 'water' };
  const fireDye = { name: '発火', type: 'weapon', attack: 2, attackBonus: 2, additive: true, attribute: 'fire', supportEffect: 'set_attribute' };
  assert.equal(combineAttackCards([weapon, fireDye]).attribute, 'fire');
});

test('攻撃補助神器は単独使用できない', () => {
  for (const supportEffect of ['double_attack', 'wide_attack', 'magic_free', 'increase_attack', 'set_attribute']) {
    assert.equal(validateCardPlay([{ type: 'item', attack: 0, supportEffect }], 'main').valid, false);
  }
});

test('属性不適合の防具は消費前に拒否する', () => {
  const pendingDamage = { amount: 10, attribute: 'fire', sourceType: 'weapon' };
  const armor = { type: 'armor', defense: 5, attribute: 'earth' };
  assert.equal(validateCardPlay([armor], 'defense', [], pendingDamage).valid, false);
});

test('閃光中は既に防御済みなら追加の防具を使えない', () => {
  const pendingDamage = { amount: 10, attribute: 'none', sourceType: 'weapon' };
  const armor = { type: 'armor', defense: 5, attribute: 'none' };
  assert.equal(validateCardPlay([armor], 'defense', ['flash'], pendingDamage, 1).valid, false);
});

test('守護神の行動率と被弾離脱率を判定する', () => {
  const assistant = { hp: 10, actionRate: 30, leaveOnDamageRate: 10 };
  assert.equal(shouldAssistantAct(assistant, () => 0.299), true);
  assert.equal(shouldAssistantAct(assistant, () => 0.3), false);
  assert.equal(shouldAssistantLeave(assistant, () => 0.099), true);
  assert.equal(shouldAssistantLeave(assistant, () => 0.1), false);
  assert.equal(shouldAssistantLeave({ ...assistant, hp: 0 }, () => 0), false);
});

test('MP無料神器は習得済み奇跡の攻撃値や種類を上書きしない', () => {
  const staff = { name: '杖', type: 'weapon', attack: 12, hitRate: 100, supportEffect: 'magic_free' };
  const miracle = { name: '奇跡', type: 'miracle', attack: 5, hitRate: 75, costMp: 10 };
  const combined = combineAttackCards([staff, miracle]);
  assert.equal(combined.type, 'miracle');
  assert.equal(combined.attack, 5);
  assert.equal(combined.hitRate, 75);
});

test('防御奇跡はMP無料神器と組み合わせて使用できる', () => {
  const free = { type: 'item', supportEffect: 'magic_free' };
  const miracle = { type: 'miracle', defenseEffect: 'block_weapon' };
  assert.equal(validateCardPlay([free, miracle], 'defense').valid, true);
});

test('複数人の手番は昇天者を飛ばして循環する', () => {
  const players = {
    A: { hp: 40, ascended: false },
    B: { hp: 0, ascended: true },
    C: { hp: 20, ascended: false },
  };
  assert.equal(getNextAlivePlayerId(['A', 'B', 'C'], players, 'A'), 'C');
  assert.equal(getNextAlivePlayerId(['A', 'B', 'C'], players, 'C'), 'A');
});
