const DISEASES = ['cold', 'fever', 'hell', 'heaven'];

function isDefenseCard(card) {
  return Boolean(card && (
    (card.defense || 0) > 0
    || card.defenseEffect
    || card.reactiveEffect
    || ['ring', 'defense_item', 'accessory'].includes(card.type)
  ));
}

function validateCardPlay(cards, phase, ailments = []) {
  if (!cards.length) return { valid: false, message: 'カードを選択してください。' };

  if (phase === 'defense') {
    if (ailments.includes('flash') && cards.length > 1) {
      return { valid: false, message: '閃光状態では防御神器を1つしか使えません。' };
    }
    if (!cards.every(isDefenseCard)) {
      return { valid: false, message: '防御中に使用できる神器を選んでください。' };
    }
    return { valid: true };
  }

  if (phase !== 'main') return { valid: false, message: '現在は神器を使用できません。' };

  const isSell = cards.length === 2 && cards.some(card => card.effect === 'sell');
  if (isSell) return { valid: true };
  if (cards.some(card => ['armor', 'ring', 'defense_item'].includes(card.type))) {
    return { valid: false, message: '防具は攻撃を受けた防御時にだけ使用できます。' };
  }
  if (cards.length === 1) return { valid: true };

  const combinationTypes = new Set(['weapon', 'accessory', 'miracle', 'item']);
  const baseAttacks = cards.filter(card => card.attack > 0 && !card.additive);
  const hasAttack = cards.some(card => card.attack > 0);
  const actionMiracles = cards.filter(card => card.type === 'miracle' && card.attack <= 0 && !card.additive);
  const modifiersOnly = cards.every(card => card.attack > 0 || card.additive || card.supportEffect === 'magic_free');
  const validItemModifiers = cards.every(card => card.type !== 'item' || ['magic_free', 'increase_attack'].includes(card.supportEffect));
  const magicFreeAction = actionMiracles.length === 1 && cards.every(card => card === actionMiracles[0] || card.supportEffect === 'magic_free');
  return ((hasAttack && baseAttacks.length <= 1 && modifiersOnly) || magicFreeAction)
    && validItemModifiers && cards.every(card => combinationTypes.has(card.type))
    ? { valid: true }
    : { valid: false, message: 'この組み合わせでは使用できません。' };
}

function combineAttributes(cards) {
  const attributes = [...new Set(cards.map(card => card.attribute).filter(value => value && value !== 'none'))];
  if (attributes.length === 0) return 'none';
  if (attributes.length === 1) return attributes[0];
  const nonLight = attributes.filter(value => value !== 'light');
  return nonLight.length === 1 ? nonLight[0] : 'none';
}

function combineAttackCards(cards) {
  const base = cards.find(card => card.attack > 0 && !card.additive)
    || cards.find(card => card.attack > 0)
    || cards.find(card => ['weapon', 'miracle'].includes(card.type))
    || cards[0];
  const attackingCards = cards.filter(card => card.attack > 0);
  let attack = base.attack || 0;
  for (const card of cards) {
    if (card === base) continue;
    if (card.additive) attack += card.attackBonus || card.attack || card.supportValue || 0;
  }
  if (cards.some(card => card.supportEffect === 'double_attack')) attack *= 2;
  const wide = cards.some(card => card.supportEffect === 'wide_attack');
  return {
    ...base,
    name: cards.map(card => card.name).join(' + '),
    attack,
    defense: cards.reduce((sum, card) => sum + (card.defense || 0), 0),
    hitRate: wide ? 100 : (attackingCards.length ? Math.min(...attackingCards.map(card => card.hitRate ?? 100)) : (base.hitRate ?? 100)),
    attribute: wide ? 'none' : combineAttributes(cards),
    target: wide || cards.some(card => card.target === 'all') ? 'all' : 'single',
    sourceType: base.type,
    repeatCount: Math.max(1, ...cards.map(card => card.repeatCount || 1)),
    absorbHp: cards.some(card => card.attackEffect === 'absorb_hp'),
    selfDamage: cards.some(card => card.attackEffect === 'damage_to_self'),
    defenseEffects: cards.map(card => card.defenseEffect).filter(Boolean),
    reactiveEffects: cards.map(card => card.reactiveEffect).filter(Boolean),
    description: cards.length > 1 ? `Combined: ${cards.map(card => card.name).join(', ')}` : base.description,
  };
}

function canDefendAttribute(attackAttribute, defenseAttribute) {
  if (!attackAttribute || attackAttribute === 'none' || attackAttribute === 'dark') return true;
  if (attackAttribute === 'light') return false;
  const mapping = {
    fire: ['water', 'light'],
    water: ['fire', 'light'],
    wood: ['earth', 'light'],
    earth: ['wood', 'light'],
  };
  return mapping[attackAttribute]?.includes(defenseAttribute) || false;
}

function resolveDefenseCard(pendingDamage, card) {
  const effects = new Set([card.defenseEffect, ...(card.defenseEffects || [])].filter(Boolean));
  const sourceType = pendingDamage.sourceType;
  const matchesWeapon = sourceType === 'weapon';
  const matchesMagic = sourceType === 'miracle';
  if (effects.has('reflect_any')
    || (effects.has('reflect_weapon') && matchesWeapon)
    || (effects.has('reflect_magic') && matchesMagic)) return { action: 'reflect', amount: pendingDamage.amount };
  if ((effects.has('flick_weapon') && matchesWeapon) || (effects.has('flick_magic') && matchesMagic)) {
    return { action: 'flick', amount: pendingDamage.amount };
  }
  if ((effects.has('block_weapon') && matchesWeapon) || (effects.has('block_magic') && matchesMagic)) {
    return { action: 'block', amount: 0 };
  }
  if (effects.has('remove_attribute')) return { action: 'remove_attribute', amount: pendingDamage.amount, attribute: 'none' };
  if (!canDefendAttribute(pendingDamage.attribute, card.attribute)) {
    return { action: 'invalid_attribute', amount: pendingDamage.amount };
  }
  return { action: 'reduce', amount: Math.max(0, pendingDamage.amount - (card.defense || 0)) };
}

function rollAttack(card, defenderAilments = [], random = Math.random) {
  if (card.target === 'all' && defenderAilments.includes('darkcloud')) {
    return { hit: true, outcome: 'unavoidable', roll: null };
  }
  const roll = random() * 100;
  return { hit: roll < (card.hitRate ?? 100), outcome: roll < (card.hitRate ?? 100) ? 'hit' : 'evade', roll };
}

function applyAilment(player, ailment) {
  if (!ailment) return null;
  if (DISEASES.includes(ailment)) {
    const currentIndex = DISEASES.findIndex(value => player.ailments.includes(value));
    const incomingIndex = DISEASES.indexOf(ailment);
    const nextIndex = currentIndex < 0 ? incomingIndex : Math.min(DISEASES.length - 1, Math.max(incomingIndex, currentIndex + 1));
    player.ailments = player.ailments.filter(value => !DISEASES.includes(value));
    player.ailments.push(DISEASES[nextIndex]);
    return DISEASES[nextIndex];
  }
  if (!player.ailments.includes(ailment)) player.ailments.push(ailment);
  return ailment;
}

function cureAilments(player, ailments) {
  const cured = ailments === 'all' ? [...player.ailments] : player.ailments.filter(value => ailments.includes(value));
  player.ailments = ailments === 'all' ? [] : player.ailments.filter(value => !ailments.includes(value));
  return cured;
}

function processEndOfTurnAilments(player, random = Math.random) {
  const result = { hpChange: 0, progressedTo: null, fatal: false };
  const diseaseIndex = DISEASES.findIndex(value => player.ailments.includes(value));
  if (diseaseIndex < 0 || player.hp <= 0) return result;

  const hpChanges = [-1, -2, -5, 5];
  result.hpChange = hpChanges[diseaseIndex];
  player.hp += result.hpChange;

  if (random() < 0.05) {
    if (diseaseIndex === DISEASES.length - 1) {
      player.hp = 0;
      result.fatal = true;
    } else {
      player.ailments = player.ailments.filter(value => !DISEASES.includes(value));
      result.progressedTo = DISEASES[diseaseIndex + 1];
      player.ailments.push(result.progressedTo);
    }
  }
  return result;
}

module.exports = {
  applyAilment,
  combineAttackCards,
  canDefendAttribute,
  cureAilments,
  isDefenseCard,
  processEndOfTurnAilments,
  resolveDefenseCard,
  rollAttack,
  validateCardPlay,
};
