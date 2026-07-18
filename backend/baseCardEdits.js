const fields = require('../shared/baseCardEditableFields.json');

const NUMBER_FIELDS = new Set([...fields.primaryNumberFields, ...fields.specialNumberFields]);
const BOOLEAN_FIELDS = new Set(fields.specialBooleanFields);
const STRING_FIELDS = new Set([...fields.textFields, ...fields.primaryEnumFields, ...fields.specialStringFields]);
const JSON_FIELDS = new Set(fields.specialJsonFields);
const EDITABLE_KEYS = [...STRING_FIELDS, ...NUMBER_FIELDS, ...BOOLEAN_FIELDS, ...JSON_FIELDS];

function sanitizeValue(key, value) {
  if (NUMBER_FIELDS.has(key)) {
    if (value === null && fields.specialNumberFields.includes(key)) return null;
    const maximum = key === 'hitRate' ? 100 : 999;
    return Number.isInteger(value) && value >= 0 && value <= maximum ? value : undefined;
  }
  if (BOOLEAN_FIELDS.has(key)) return typeof value === 'boolean' || value === null ? value : undefined;
  if (STRING_FIELDS.has(key)) {
    if (value === null && fields.specialStringFields.includes(key)) return null;
    if (typeof value !== 'string') return undefined;
    if (key === 'attribute' && !['none', 'fire', 'water', 'wood', 'earth', 'light', 'dark'].includes(value)) return undefined;
    if (key === 'target' && !['single', 'all'].includes(value)) return undefined;
    const maximum = key === 'imageUrl' ? 1_500_000 : key === 'description' ? 2_000 : 100;
    return value.length <= maximum ? value : undefined;
  }
  if (JSON_FIELDS.has(key)) {
    if (value === null) return null;
    if (key === 'cureAilments' && !(typeof value === 'string' || Array.isArray(value))) return undefined;
    if (key === 'dyingAttack') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const allowedKeys = ['attack', 'hitRate', 'attribute', 'target'];
      if (Object.keys(value).some(nestedKey => !allowedKeys.includes(nestedKey))) return undefined;
      if (!Number.isInteger(value.attack) || value.attack < 0 || value.attack > 999) return undefined;
      if (value.hitRate !== undefined && (!Number.isInteger(value.hitRate) || value.hitRate < 0 || value.hitRate > 100)) return undefined;
      if (value.attribute !== undefined && !['none', 'fire', 'water', 'wood', 'earth', 'light', 'dark'].includes(value.attribute)) return undefined;
      if (value.target !== undefined && !['single', 'all'].includes(value.target)) return undefined;
    }
    return JSON.stringify(value).length <= 2_000 ? value : undefined;
  }
  return undefined;
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeBaseCardEdit(baseCard, edit) {
  if (!baseCard || !edit || typeof edit !== 'object') return {};
  const normalized = {};
  for (const key of EDITABLE_KEYS) {
    if (!Object.hasOwn(edit, key)) continue;
    const value = sanitizeValue(key, edit[key]);
    if (value === undefined) continue;
    const defaultValue = baseCard[key];
    const inactiveAddition = defaultValue === undefined
      && (value === null || value === false || value === 0 || value === '' || (Array.isArray(value) && value.length === 0));
    if (!inactiveAddition && !valuesEqual(value, defaultValue)) normalized[key] = value;
  }
  return normalized;
}

function normalizeBaseCardEdits(baseCards, edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return {};
  const byId = new Map(baseCards.map(card => [card.id, card]));
  const normalized = {};
  for (const [cardId, edit] of Object.entries(edits)) {
    const patch = normalizeBaseCardEdit(byId.get(cardId), edit);
    if (Object.keys(patch).length > 0) normalized[cardId] = patch;
  }
  return normalized;
}

module.exports = { normalizeBaseCardEdit, normalizeBaseCardEdits };
