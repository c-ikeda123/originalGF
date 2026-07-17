import fields from '../../../shared/baseCardEditableFields.json';

export const primaryEffectFields = fields.primaryNumberFields;
export const specialEffectFields = [
  ...fields.specialNumberFields,
  ...fields.specialBooleanFields,
  ...fields.specialStringFields,
  ...fields.specialJsonFields,
];
export const effectFields = [...primaryEffectFields, ...specialEffectFields];
export const editableKeys = [...fields.textFields, ...effectFields];

const valuesEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const numberFields = new Set([...fields.primaryNumberFields, ...fields.specialNumberFields]);
const booleanFields = new Set(fields.specialBooleanFields);
const stringFields = new Set([...fields.textFields, ...fields.specialStringFields]);
const jsonFields = new Set(fields.specialJsonFields);

export function sanitizeBaseCardValue(key, value) {
  if (numberFields.has(key)) {
    if (value === null && fields.specialNumberFields.includes(key)) return null;
    const maximum = key === 'hitRate' ? 100 : 999;
    return Number.isInteger(value) && value >= 0 && value <= maximum ? value : undefined;
  }
  if (booleanFields.has(key)) return typeof value === 'boolean' || value === null ? value : undefined;
  if (stringFields.has(key)) {
    if (value === null && fields.specialStringFields.includes(key)) return null;
    if (typeof value !== 'string') return undefined;
    const maximum = key === 'imageUrl' ? 1_500_000 : key === 'description' ? 2_000 : 100;
    return value.length <= maximum ? value : undefined;
  }
  if (jsonFields.has(key)) {
    if (value === null) return null;
    if (key === 'cureAilments' && !(typeof value === 'string' || Array.isArray(value))) return undefined;
    if (key === 'dyingAttack' && (!value || typeof value !== 'object' || Array.isArray(value))) return undefined;
    return JSON.stringify(value).length <= 2_000 ? value : undefined;
  }
  return undefined;
}

export function normalizeBaseCardEdit(baseCard, edit) {
  if (!baseCard || !edit || typeof edit !== 'object') return {};
  return Object.fromEntries(editableKeys.flatMap(key => {
    if (!Object.hasOwn(edit, key)) return [];
    const value = sanitizeBaseCardValue(key, edit[key]);
    if (value === undefined) return [];
    const defaultValue = baseCard[key];
    const inactiveAddition = defaultValue === undefined
      && (value === null || value === false || value === 0 || value === '' || (Array.isArray(value) && value.length === 0));
    return !inactiveAddition && !valuesEqual(value, defaultValue) ? [[key, value]] : [];
  }));
}

export const hasEffectChanges = edit => effectFields.some(key => Object.hasOwn(edit || {}, key));

export const getSpecialEffects = card => Object.fromEntries(
  specialEffectFields.flatMap(key => Object.hasOwn(card || {}, key) ? [[key, card[key]]] : []),
);

export function normalizeBaseCardEdits(baseCards, edits) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return {};
  const byId = new Map(baseCards.map(card => [card.id, card]));
  return Object.fromEntries(Object.entries(edits).flatMap(([cardId, edit]) => {
    const normalized = normalizeBaseCardEdit(byId.get(cardId), edit);
    return Object.keys(normalized).length > 0 ? [[cardId, normalized]] : [];
  }));
}
