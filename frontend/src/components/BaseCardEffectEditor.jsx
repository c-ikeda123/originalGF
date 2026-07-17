import React, { useEffect, useState } from 'react';
import {
  getSpecialEffects,
  enumEffectFields,
  primaryEffectFields,
  sanitizeBaseCardValue,
  specialEffectFields,
} from '../data/baseCardEdits';

const primaryLabels = {
  attack: '攻撃力',
  defense: '守備力',
  hitRate: '命中率（%）',
  healHp: 'HP回復量',
  healMp: 'MP回復量',
  costMoney: '￥消費・価格',
  costMp: 'MP消費',
  attribute: '属性',
  target: '対象',
};

const enumOptions = {
  attribute: [['none', '無'], ['fire', '火'], ['water', '水'], ['wood', '木'], ['earth', '土'], ['light', '光'], ['dark', '闇']],
  target: [['single', '単体'], ['all', '全体']],
};

const specialLabels = {
  actionRate: '行動率', attackBonus: '攻撃加算', leaveOnDamageRate: '被ダメージ時の離脱率',
  moneyGain: '獲得金額', randomHp: 'HPランダム値', removeItems: 'アイテム除去数',
  removeMiracles: '奇跡除去数', repeatCount: '反復回数', reviveHp: '蘇生HP', supportValue: '支援値',
  additive: '加算式', lethalOnDamage: '被ダメージ時に致死', mortar: '迫撃', mystery: '正体不明',
  redrawHand: '手札引き直し', setAssistant: 'アシスタント設定', ailmentInflict: '付与状態異常',
  ailmentTrigger: '状態異常の発動条件', attackEffect: '攻撃効果', defenseEffect: '防御効果',
  effect: '効果識別子', reactiveEffect: '反応効果', retaliateAilment: '反撃状態異常',
  selfAilment: '自身への状態異常', supportEffect: '支援効果', weaponKind: '武器種',
  cureAilments: '治療する状態異常', dyingAttack: '瀕死時攻撃',
};

const formatSpecialEffects = card => JSON.stringify(getSpecialEffects(card), null, 2);

export default function BaseCardEffectEditor({ baseCard, card, disabled = false, onChange }) {
  const [specialText, setSpecialText] = useState(() => formatSpecialEffects(card));
  const [error, setError] = useState('');

  useEffect(() => {
    setSpecialText(formatSpecialEffects(card));
    setError('');
  }, [card]);

  const changeNumber = (key, rawValue) => {
    const value = rawValue === '' ? 0 : Number(rawValue);
    const maximum = key === 'hitRate' ? 100 : 999;
    if (!Number.isInteger(value) || value < 0 || value > maximum) return;
    onChange({ ...card, [key]: value });
  };

  const applySpecialEffects = () => {
    try {
      const parsed = JSON.parse(specialText || '{}');
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('JSONオブジェクトを入力してください。');
      for (const [key, value] of Object.entries(parsed)) {
        if (!specialEffectFields.includes(key)) throw new Error(`未対応の効果名です: ${key}`);
        if (sanitizeBaseCardValue(key, value) === undefined) throw new Error(`値の形式または範囲が不正です: ${key}`);
      }
      const next = { ...card };
      for (const key of specialEffectFields) {
        if (Object.hasOwn(baseCard, key)) next[key] = null;
        else delete next[key];
      }
      Object.assign(next, parsed);
      onChange(next);
      setSpecialText(formatSpecialEffects(next));
      setError('特殊効果を反映しました。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '特殊効果を読み取れませんでした。');
    }
  };

  return (
    <section className="base-effect-editor">
      <h4>カードの効果</h4>
      <div className="base-effect-grid">
        {primaryEffectFields.map(key => (
          <label key={key}>
            <span>{primaryLabels[key]}</span>
            <input
              className="input-field"
              type="number"
              min="0"
              max={key === 'hitRate' ? 100 : 999}
              step="1"
              value={card[key] ?? 0}
              disabled={disabled}
              onChange={event => changeNumber(key, event.target.value)}
            />
          </label>
        ))}
        {enumEffectFields.map(key => (
          <label key={key}>
            <span>{primaryLabels[key]}</span>
            <select className="input-field" value={card[key] ?? enumOptions[key][0][0]} disabled={disabled} onChange={event => onChange({ ...card, [key]: event.target.value })}>
              {enumOptions[key].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="special-effect-editor">
        <label>
          <span>その他の特殊効果（JSON）</span>
          <textarea
            className="input-field"
            rows="9"
            value={specialText}
            disabled={disabled}
            spellCheck="false"
            onChange={event => { setSpecialText(event.target.value); setError(''); }}
          />
        </label>
        <button type="button" className="btn btn-secondary" disabled={disabled} onClick={applySpecialEffects}>特殊効果を反映</button>
        {error && <span className="special-effect-message">{error}</span>}
        <details>
          <summary>使用できる特殊効果名</summary>
          <div className="special-effect-key-list">
            {specialEffectFields.map(key => <code key={key} title={specialLabels[key]}>{key}（{specialLabels[key]}）</code>)}
          </div>
          <small>既存の効果を無効にする場合は値を null にしてください。</small>
        </details>
      </div>
    </section>
  );
}
