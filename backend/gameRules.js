const DISEASES = ['cold', 'fever', 'hell', 'heaven'];
const ASSISTANT_ACTIONS = {
  mars: [
    { kind: 'attack', attack: 2, hitRate: 75, attribute: 'fire', weight: 6 },
    { kind: 'attack', attack: 3, hitRate: 75, attribute: 'fire', weight: 5 },
    { kind: 'attack', attack: 4, hitRate: 75, attribute: 'fire', weight: 4 },
    { kind: 'attack', attack: 5, hitRate: 75, attribute: 'fire', weight: 3 },
    { kind: 'attack', attack: 6, hitRate: 75, attribute: 'fire', weight: 2 },
  ],
  mercury: [
    { kind: 'attack', attack: 1, hitRate: 50, attribute: 'water', ailment: 'fog', weight: 6 },
    { kind: 'attack', attack: 2, hitRate: 100, attribute: 'water', ailment: 'fog', weight: 5 },
    { kind: 'attack', attack: 2, hitRate: 50, attribute: 'water', weight: 4 },
    { kind: 'attack', attack: 3, hitRate: 100, attribute: 'water', weight: 3 },
    { kind: 'attack', attack: 6, hitRate: 50, attribute: 'water', weight: 2 },
  ],
  jupiter: [
    { kind: 'attack', attack: 1, hitRate: 100, attribute: 'wood', weight: 6 },
    { kind: 'attack', attack: 2, hitRate: 100, attribute: 'wood', weight: 5 },
    { kind: 'attack', attack: 1, hitRate: 75, attribute: 'wood', attackEffect: 'absorb_hp', weight: 4 },
    { kind: 'ailment', ailment: 'dream', weight: 3 },
    { kind: 'attack', attack: 2, hitRate: 75, attribute: 'wood', ailment: 'dream', weight: 2 },
  ],
  saturn: [3, 5, 7, 10, 16].map((attack, index) => ({ kind: 'attack', attack, hitRate: 100, attribute: 'earth', weight: 6 - index })),
  uranus: [
    { kind: 'attack', attack: 2, hitRate: 100, attribute: 'light', weight: 6 },
    { kind: 'attack', attack: 4, hitRate: 25, attribute: 'light', weight: 5 },
    { kind: 'ailment', ailment: 'flash', weight: 4 },
    { kind: 'attack', attack: 5, hitRate: 100, attribute: 'light', attackEffect: 'absorb_hp', weight: 3 },
    { kind: 'attack', attack: 10, hitRate: 75, attribute: 'light', weight: 2 },
  ],
  pluto: [
    { kind: 'attack', attack: 1, hitRate: 25, attribute: 'dark', ailment: 'darkcloud', weight: 6 },
    { kind: 'attack', attack: 1, hitRate: 100, attribute: 'dark', weight: 5 },
    { kind: 'attack', attack: 2, hitRate: 100, attribute: 'dark', weight: 4 },
    { kind: 'attack', attack: 4, hitRate: 100, attribute: 'dark', weight: 3 },
    { kind: 'attack', attack: 8, hitRate: 100, attribute: 'dark', weight: 2 },
  ],
  neptune: [
    { kind: 'cure', weight: 6 }, { kind: 'recover_mp', value: 5, weight: 5 },
    { kind: 'recover_hp', value: 5, weight: 4 }, { kind: 'recover_mp', value: 10, weight: 3 },
    { kind: 'recover_hp', value: 10, weight: 2 },
  ],
  venus: [
    { kind: 'scatter_money', value: 1, weight: 6 }, { kind: 'give_enemy_money', value: 5, weight: 5 },
    { kind: 'absorb_money', value: 3, weight: 4 }, { kind: 'recover_money', value: 8, weight: 3 },
    { kind: 'recover_money', value: 20, weight: 2 },
  ],
  earth: [{ kind: 'add_item', weight: 1 }],
  moon: [{ kind: 'random_miracle', weight: 1 }],
};

function getAssistantAction(type, random = Math.random) {
  const actions = ASSISTANT_ACTIONS[type] || [];
  const total = actions.reduce((sum, action) => sum + action.weight, 0);
  if (!total) return null;
  let roll = random() * total;
  for (const action of actions) {
    roll -= action.weight;
    if (roll < 0) return { ...action };
  }
  return { ...actions.at(-1) };
}

function shouldAssistantAct(assistant, random = Math.random) {
  return Boolean(assistant) && random() * 100 < (assistant.actionRate ?? 25);
}

function shouldAssistantLeave(assistant, random = Math.random) {
  return Boolean(assistant) && assistant.hp > 0 && random() * 100 < (assistant.leaveOnDamageRate ?? 10);
}

function isDefenseCard(card) {
  return Boolean(card && (
    (card.defense || 0) > 0
    || card.defenseEffect
    || card.reactiveEffect
    || ['ring', 'defense_item', 'accessory'].includes(card.type)
  ));
}

function validateCardPlay(cards, phase, ailments = [], pendingDamage = null, defensesUsed = 0) {
  if (!cards.length) return { valid: false, message: 'カードを選択してください。' };

  if (phase === 'defense') {
    if (ailments.includes('flash') && defensesUsed + cards.length > 1) {
      return { valid: false, message: '閃光状態では防御神器を1つしか使えません。' };
    }
    const hasDefenseCard = cards.some(isDefenseCard);
    const onlyDefenseAndMagicFree = cards.every(card => isDefenseCard(card) || card.supportEffect === 'magic_free');
    if (!hasDefenseCard || !onlyDefenseAndMagicFree) {
      return { valid: false, message: '防御中に使用できる神器を選んでください。' };
    }
    if (pendingDamage) {
      const resolution = resolveDefenseCard(pendingDamage, combineAttackCards(cards));
      if (resolution.action === 'invalid_attribute') {
        return { valid: false, message: 'この属性では攻撃を防げません。' };
      }
    }
    return { valid: true };
  }

  if (phase !== 'main') return { valid: false, message: '現在は神器を使用できません。' };

  const isSell = cards.length === 2 && cards.some(card => card.effect === 'sell');
  if (isSell) return { valid: true };
  if (cards.some(card => ['armor', 'ring', 'defense_item'].includes(card.type))) {
    return { valid: false, message: '防具は攻撃を受けた防御時にだけ使用できます。' };
  }
  if (cards.length === 1) {
    const [card] = cards;
    const isModifierOnly = card.attack <= 0 && ['double_attack', 'wide_attack', 'magic_free', 'increase_attack', 'set_attribute'].includes(card.supportEffect);
    const isDefenseOnlyMiracle = card.type === 'miracle' && card.attack <= 0 && card.defenseEffect;
    return isModifierOnly || isDefenseOnlyMiracle
      ? { valid: false, message: 'この神器は攻撃または奇跡と組み合わせてください。' }
      : { valid: true };
  }

  const combinationTypes = new Set(['weapon', 'accessory', 'miracle', 'item']);
  const baseAttacks = cards.filter(card => card.attack > 0 && !card.additive && card.supportEffect !== 'magic_free');
  const hasAttack = baseAttacks.length > 0 || cards.some(card => card.additive && card.attack > 0);
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
  const base = cards.find(card => card.attack > 0 && !card.additive && card.supportEffect !== 'magic_free')
    || cards.find(card => card.attack > 0 && card.supportEffect !== 'magic_free')
    || cards.find(card => card.type === 'miracle')
    || cards.find(card => card.type === 'weapon')
    || cards[0];
  const attackingCards = cards.filter(card => card.attack > 0 && card.supportEffect !== 'magic_free');
  let attack = base.attack || 0;
  for (const card of cards) {
    if (card === base) continue;
    if (card.additive) attack += card.attackBonus || card.attack || card.supportValue || 0;
  }
  if (cards.some(card => card.supportEffect === 'double_attack')) attack *= 2;
  const wide = cards.some(card => card.supportEffect === 'wide_attack');
  const attributeSetter = cards.findLast(card => card.supportEffect === 'set_attribute');
  return {
    ...base,
    name: cards.map(card => card.name).join(' + '),
    attack,
    defense: cards.reduce((sum, card) => sum + (card.defense || 0), 0),
    hitRate: wide ? 100 : (attackingCards.length ? Math.min(...attackingCards.map(card => card.hitRate ?? 100)) : (base.hitRate ?? 100)),
    attribute: wide ? 'none' : (attributeSetter?.attribute || combineAttributes(cards)),
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

function createAttackQueue(targetIds, repeatCount = 1) {
  const queue = [];
  for (let repeat = 1; repeat <= Math.max(1, repeatCount); repeat++) {
    targetIds.forEach(targetId => queue.push({ targetId, repeat }));
  }
  return queue;
}

function resolveDefenseCard(pendingDamage, card) {
  const effects = new Set([card.defenseEffect, ...(card.defenseEffects || [])].filter(Boolean));
  const sourceType = pendingDamage.sourceType;
  const matchesWeapon = sourceType === 'weapon';
  const matchesMagic = sourceType === 'miracle';
  const attributeValid = canDefendAttribute(pendingDamage.attribute, card.attribute);
  const weaponSpecial = matchesWeapon && [...effects].some(effect => ['reflect_weapon', 'flick_weapon', 'block_weapon'].includes(effect));
  if (weaponSpecial && !attributeValid) return { action: 'invalid_attribute', amount: pendingDamage.amount };
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
  if (!attributeValid) {
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
  createAttackQueue,
  cureAilments,
  getAssistantAction,
  isDefenseCard,
  processEndOfTurnAilments,
  resolveDefenseCard,
  rollAttack,
  shouldAssistantAct,
  shouldAssistantLeave,
  validateCardPlay,
};
