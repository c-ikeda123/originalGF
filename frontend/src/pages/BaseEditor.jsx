import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BaseCardEffectEditor from '../components/BaseCardEffectEditor';
import SquareImageCropper from '../components/SquareImageCropper';
import { GF_BASE_CARDS, getBaseCardsWithEdits } from '../data/baseCards';
import { hasEffectChanges, normalizeBaseCardEdit, normalizeBaseCardEdits } from '../data/baseCardEdits';

const CATEGORY_LABELS = {
  all: 'すべて', weapon: '武器', armor: '防具', ring: '指輪',
  defense_item: '防御雑貨', miracle: '奇跡', item: '雑貨', trade: '取引', incarnation: '化身',
};

const encodeSettingCode = (edits) => {
  const bytes = new TextEncoder().encode(JSON.stringify(edits));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const decodeSettingCode = (code) => {
  const binary = atob(code.trim());
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

const getSavedEdits = () => normalizeBaseCardEdits(
  GF_BASE_CARDS,
  JSON.parse(localStorage.getItem('gf_base_cards_edits') || '{}'),
);

export default function BaseEditor() {
  const navigate = useNavigate();
  const [cards, setCards] = useState([]);
  const [currentCard, setCurrentCard] = useState(null);
  const [category, setCategory] = useState('all');
  const [dirty, setDirty] = useState(false);
  const [settingCode, setSettingCode] = useState('');
  const [codeMessage, setCodeMessage] = useState('');
  const [savedEdits, setSavedEdits] = useState(getSavedEdits);
  const editedIds = new Set(Object.keys(savedEdits));

  useEffect(() => {
    setCards(getBaseCardsWithEdits());
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCurrentCard(prev => ({ ...prev, [name]: value }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty || !currentCard) return;
    const edits = getSavedEdits();
    const baseCard = GF_BASE_CARDS.find(card => card.id === currentCard.id);
    const normalized = normalizeBaseCardEdit(baseCard, currentCard);
    if (Object.keys(normalized).length > 0) edits[currentCard.id] = normalized;
    else delete edits[currentCard.id];
    localStorage.setItem('gf_base_cards_edits', JSON.stringify(edits));
    setSavedEdits(edits);
    setCards(getBaseCardsWithEdits());
    setDirty(false);
  }, [currentCard, dirty]);

  const createSettingCode = async () => {
    const edits = getSavedEdits();
    const code = encodeSettingCode(edits);
    setSettingCode(code);
    try {
      await navigator.clipboard.writeText(code);
      setCodeMessage('設定コードを作成し、コピーしました。');
    } catch {
      setCodeMessage('設定コードを作成しました。テキスト欄からコピーしてください。');
    }
  };

  const importSettingCode = () => {
    try {
      const decoded = decodeSettingCode(settingCode);
      if (!decoded || Array.isArray(decoded) || typeof decoded !== 'object') throw new Error('invalid');
      const edits = normalizeBaseCardEdits(GF_BASE_CARDS, decoded);
      localStorage.setItem('gf_base_cards_edits', JSON.stringify(edits));
      setSavedEdits(edits);
      const nextCards = getBaseCardsWithEdits();
      setCards(nextCards);
      setCurrentCard(current => current ? nextCards.find(card => card.id === current.id) || null : null);
      setDirty(false);
      setCodeMessage('設定コードを読み込みました。');
    } catch {
      setCodeMessage('設定コードを読み込めませんでした。コードを確認してください。');
    }
  };

  return (
    <div className="editor-container">
      <div className="header-nav">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>← Back to Home</button>
        <h2 style={{margin: 0}}>Base Card Editor</h2>
        <div></div>
      </div>

      <div className="editor-layout">
        <div className="glass-panel sidebar">
          <h3 style={{padding: '1rem 1rem 0.5rem'}}>基礎カード ({cards.length})</h3>
          <div className="edited-card-summary">編集済み {editedIds.size}件</div>
          <select className="input-field" value={category} onChange={event => setCategory(event.target.value)} style={{margin: '0 1rem 0.75rem', width: 'calc(100% - 2rem)'}}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <div className="card-list">
            {cards.filter(card => category === 'all' || card.category === category).map(card => (
              <div 
                key={card.id} 
                className={`card-list-item ${currentCard?.id === card.id ? 'active' : ''} ${editedIds.has(card.id) ? 'edited' : ''}`}
                onClick={() => { setCurrentCard(card); setDirty(false); }}
              >
                <span className="card-list-name">
                  {card.name}
                  {editedIds.has(card.id) && (
                    <span className={hasEffectChanges(savedEdits[card.id]) ? 'effect-edit-badge' : 'edited-card-badge'}>
                      {hasEffectChanges(savedEdits[card.id]) ? '編集済み（効果変更有）' : '編集済み'}
                    </span>
                  )}
                </span>
                <span style={{fontSize: '0.7rem', color: '#94a3b8'}}>
                  {CATEGORY_LABELS[card.category] || card.type}{card.copies > 0 ? ` ×${card.copies}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="main-editor">
          {currentCard ? (
            <>
              <div className="glass-panel form-panel">
                <h3>Edit Details</h3>
                <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem'}}>
                  ※ 名前・画像・説明文・カード効果を編集できます。変更は自動保存されます。
                </p>
                {hasEffectChanges(savedEdits[currentCard.id]) && <div className="effect-change-banner">編集済み（効果変更有）</div>}
                <div className="form-grid">
                  <div className="form-group-sm">
                    <label>Name (名前)</label>
                    <input type="text" name="name" className="input-field" value={currentCard.name} onChange={handleChange} />
                  </div>
                  
                  <div className="form-group-sm" style={{ gridColumn: '1 / -1' }}>
                    <label>Image (画像)</label>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                       <SquareImageCropper onCrop={imageUrl => { setCurrentCard(prev => ({ ...prev, imageUrl })); setDirty(true); }} />
                       <span style={{color: 'var(--text-muted)'}}>OR</span>
                       <input type="text" name="imageUrl" className="input-field" placeholder="URL (https://...)" value={currentCard.imageUrl || ''} onChange={handleChange} style={{ flex: 1 }} />
                    </div>
                  </div>

                  <div className="form-group-sm" style={{ gridColumn: '1 / -1' }}>
                    <label>Description (説明文)</label>
                    <textarea name="description" className="input-field" rows="2" value={currentCard.description || ''} onChange={handleChange}></textarea>
                  </div>
                </div>

                <BaseCardEffectEditor
                  baseCard={GF_BASE_CARDS.find(card => card.id === currentCard.id)}
                  card={currentCard}
                  onChange={card => { setCurrentCard(card); setDirty(true); }}
                />

                <div className="autosave-status">{dirty ? '自動保存中…' : '変更は自動保存されます'}</div>

                <div className="room-code-panel">
                  <strong>基礎カード設定コード</strong>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={createSettingCode}>設定コードを作成・コピー</button>
                    <button type="button" className="btn btn-secondary" onClick={importSettingCode}>コードを読み込む</button>
                  </div>
                  <textarea
                    className="input-field"
                    rows="3"
                    placeholder="設定コード"
                    value={settingCode}
                    onChange={event => setSettingCode(event.target.value)}
                  />
                  {codeMessage && <span className="autosave-status">{codeMessage}</span>}
                </div>
              </div>

              <div className="preview-panel">
                <h3>Preview</h3>
                <div className={`gf-card-field attr-border-${currentCard.attribute}`}>
                  {currentCard.imageUrl ? (
                    <div className="image-area" style={{backgroundImage: `url(${currentCard.imageUrl})`}}></div>
                  ) : (
                    <div className="image-area">{currentCard.type.charAt(0).toUpperCase()}</div>
                  )}
                  <div className="details">
                     <div className="card-name">{currentCard.name}</div>
                     <div className="card-stat-text">
                       {currentCard.attack > 0 ? `攻${currentCard.attack} ` : ''}
                       {currentCard.defense > 0 ? `守${currentCard.defense} ` : ''}
                     </div>
                     <div className="card-stat-text" style={{fontSize: '0.6rem'}}>{currentCard.description}</div>
                  </div>
                  {currentCard.costMoney > 0 && <div className="card-price">¥{currentCard.costMoney}</div>}
                </div>
              </div>
            </>
          ) : (
            <div className="glass-panel" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)'}}>
              Select a base card from the left to edit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
