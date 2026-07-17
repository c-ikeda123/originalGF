import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import SquareImageCropper from '../components/SquareImageCropper';
import '../index.css';
import './editor.css'; // Add local CSS for editor layout

const initialCardState = {
  id: '',
  name: 'New Card',
  type: 'weapon', // weapon, armor, miracle, item, accessory
  attribute: 'none', // none, fire, water, wood, earth, light, dark
  attack: 0,
  hitRate: 100,
  defense: 0,
  healHp: 0,
  healMp: 0,
  costMoney: 0,
  costMp: 0,
  ailmentInflict: 'none', // none, cold, fever, hell, heaven, fog, flash, hallucination, darkcloud
  ailmentCure: 'none',
  target: 'single', // single, all
  description: '',
  imageUrl: '', // URL for custom image
};

const attributes = [
  { val: 'none', label: '無 (None)' },
  { val: 'fire', label: '火 (Fire)' },
  { val: 'water', label: '水 (Water)' },
  { val: 'wood', label: '木 (Wood)' },
  { val: 'earth', label: '土 (Earth)' },
  { val: 'light', label: '光 (Light)' },
  { val: 'dark', label: '闇 (Dark)' },
];

const ailments = [
  { val: 'none', label: 'None' },
  { val: 'cold', label: '風邪 (Cold)' },
  { val: 'fever', label: '熱病 (Fever)' },
  { val: 'hell', label: '地獄病 (Hell)' },
  { val: 'heaven', label: '天国病 (Heaven)' },
  { val: 'fog', label: '霧 (Fog)' },
  { val: 'flash', label: '閃光 (Flash)' },
  { val: 'hallucination', label: '幻覚 (Hallucination)' },
  { val: 'darkcloud', label: '暗雲 (Dark Clouds)' },
];

export default function Editor() {
  const [cards, setCards] = useState([]);
  const [currentCard, setCurrentCard] = useState({ ...initialCardState, id: uuidv4() });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('gf_custom_cards');
    if (saved) {
      setCards(JSON.parse(saved));
    }
  }, []);

  const saveCards = (newCards) => {
    setCards(newCards);
    localStorage.setItem('gf_custom_cards', JSON.stringify(newCards));
  };

  useEffect(() => {
    if (!dirty) return;
    const index = cards.findIndex(c => c.id === currentCard.id);
    const newCards = [...cards];
    if (index >= 0) {
      newCards[index] = currentCard;
    } else {
      newCards.push(currentCard);
    }
    saveCards(newCards);
    setDirty(false);
  }, [cards, currentCard, dirty]);

  const handleNewCard = () => {
    setCurrentCard({ ...initialCardState, id: uuidv4() });
    setDirty(false);
  };

  const handleDeleteCard = (id) => {
    const newCards = cards.filter(c => c.id !== id);
    saveCards(newCards);
    if (currentCard.id === id) {
      handleNewCard();
    }
  };

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    let parsedValue = value;
    if (type === 'number') {
      parsedValue = parseInt(value, 10) || 0;
    }
    setCurrentCard(prev => ({ ...prev, [name]: parsedValue }));
    setDirty(true);
  };

  return (
    <div className="editor-container">
      <div className="header-nav">
        <Link to="/" className="btn btn-secondary no-underline">
          <ArrowLeft size={18} /> Back to Home
        </Link>
        <h2 className="title-gradient">Card Editor</h2>
      </div>

      <div className="editor-layout">
        {/* Sidebar: Card List */}
        <div className="glass-panel sidebar">
          <button onClick={handleNewCard} className="btn w-full mb-4">
            <Plus size={18} /> New Card
          </button>
          <div className="card-list">
            {cards.map(card => (
              <div 
                key={card.id} 
                className={`card-list-item ${currentCard.id === card.id ? 'active' : ''}`}
                onClick={() => { setCurrentCard(card); setDirty(false); }}
              >
                <span>{card.name}</span>
                <button 
                  className="icon-btn text-danger" 
                  onClick={(e) => { e.stopPropagation(); handleDeleteCard(card.id); }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main: Form & Preview */}
        <div className="main-editor">
          <div className="glass-panel form-panel">
            <h3>Card Details</h3>
            <div className="form-grid">
              <div className="form-group-sm">
                <label>Name</label>
                <input type="text" name="name" className="input-field" value={currentCard.name} onChange={handleChange} />
              </div>
              <div className="form-group-sm">
                <label>Type</label>
                <select name="type" className="input-field" value={currentCard.type} onChange={handleChange}>
                  <option value="weapon">武器 (Weapon)</option>
                  <option value="armor">防具 (Armor)</option>
                  <option value="miracle">奇跡 (Miracle)</option>
                  <option value="item">道具 (Item)</option>
                  <option value="accessory">装飾品 (Accessory)</option>
                </select>
              </div>
              <div className="form-group-sm">
                <label>Attribute</label>
                <select name="attribute" className="input-field" value={currentCard.attribute} onChange={handleChange}>
                  {attributes.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                </select>
              </div>
              <div className="form-group-sm">
                <label>Target</label>
                <select name="target" className="input-field" value={currentCard.target} onChange={handleChange}>
                  <option value="single">単体 (Single)</option>
                  <option value="all">全体 (All)</option>
                </select>
              </div>
              <div className="form-group-sm" style={{ gridColumn: '1 / -1' }}>
                <label>Image</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                   <SquareImageCropper onCrop={imageUrl => { setCurrentCard(prev => ({ ...prev, imageUrl })); setDirty(true); }} />
                   <span style={{color: 'var(--text-muted)'}}>OR</span>
                   <input type="text" name="imageUrl" className="input-field" placeholder="URL (https://...)" value={currentCard.imageUrl || ''} onChange={handleChange} style={{ flex: 1 }} />
                </div>
                <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px'}}>
                   アップロードした画像は正方形にトリミングし、自動で圧縮して保存します。
                </div>
              </div>

              {/* Conditional Stats */}
              {(currentCard.type === 'weapon' || currentCard.type === 'miracle') && (
                <>
                  <div className="form-group-sm">
                    <label>Attack</label>
                    <input type="number" name="attack" className="input-field" value={currentCard.attack} onChange={handleChange} />
                  </div>
                  <div className="form-group-sm">
                    <label>Hit Rate (%)</label>
                    <input type="number" name="hitRate" className="input-field" value={currentCard.hitRate} onChange={handleChange} />
                  </div>
                </>
              )}
              
              {(currentCard.type === 'armor' || currentCard.type === 'miracle' || currentCard.type === 'accessory') && (
                <div className="form-group-sm">
                  <label>Defense</label>
                  <input type="number" name="defense" className="input-field" value={currentCard.defense} onChange={handleChange} />
                </div>
              )}

              {(currentCard.type === 'item' || currentCard.type === 'miracle') && (
                <>
                  <div className="form-group-sm">
                    <label>Heal HP</label>
                    <input type="number" name="healHp" className="input-field" value={currentCard.healHp} onChange={handleChange} />
                  </div>
                  <div className="form-group-sm">
                    <label>Heal MP</label>
                    <input type="number" name="healMp" className="input-field" value={currentCard.healMp} onChange={handleChange} />
                  </div>
                </>
              )}

              <div className="form-group-sm">
                <label>Price ¥ (売値)</label>
                <input type="number" name="costMoney" className="input-field" value={currentCard.costMoney} onChange={handleChange} />
              </div>
              <div className="form-group-sm">
                <label>Cost MP</label>
                <input type="number" name="costMp" className="input-field" value={currentCard.costMp} onChange={handleChange} />
              </div>

              <div className="form-group-sm">
                <label>Inflict Ailment</label>
                <select name="ailmentInflict" className="input-field" value={currentCard.ailmentInflict} onChange={handleChange}>
                  {ailments.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                </select>
              </div>
              <div className="form-group-sm">
                <label>Cure Ailment</label>
                <select name="ailmentCure" className="input-field" value={currentCard.ailmentCure} onChange={handleChange}>
                  {ailments.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                </select>
              </div>
            </div>
            
            <div className="form-group-sm mt-4">
              <label>Description</label>
              <textarea name="description" className="input-field" rows="3" value={currentCard.description} onChange={handleChange}></textarea>
            </div>

            <div className="autosave-status">{dirty ? '自動保存中…' : '変更は自動保存されます'}</div>
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
                   {currentCard.hitRate > 0 && currentCard.type !== 'armor' ? `${currentCard.hitRate}% ` : ''}
                   {currentCard.defense > 0 ? `守${currentCard.defense} ` : ''}
                   {currentCard.healHp > 0 ? `HP+${currentCard.healHp} ` : ''}
                 </div>
                 <div className="card-stat-text" style={{fontSize: '0.6rem'}}>{currentCard.description}</div>
              </div>
              {currentCard.costMoney > 0 && <div className="card-price">¥{currentCard.costMoney}</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
