import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save, Plus, Minus } from 'lucide-react';
import '../index.css';

export default function DeckBuilder() {
  const [availableCards, setAvailableCards] = useState([]);
  const [deck, setDeck] = useState({}); // { cardId: count }

  useEffect(() => {
    const savedCards = localStorage.getItem('gf_custom_cards');
    if (savedCards) {
      setAvailableCards(JSON.parse(savedCards));
    }
    const savedDeck = localStorage.getItem('gf_custom_deck');
    if (savedDeck) {
      setDeck(JSON.parse(savedDeck));
    }
  }, []);

  const handleSaveDeck = () => {
    localStorage.setItem('gf_custom_deck', JSON.stringify(deck));
    alert('Deck Saved!');
  };

  const addCard = (id) => {
    setDeck(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeCard = (id) => {
    setDeck(prev => {
      const newDeck = { ...prev };
      if (newDeck[id] > 1) {
        newDeck[id]--;
      } else {
        delete newDeck[id];
      }
      return newDeck;
    });
  };

  const totalCards = Object.values(deck).reduce((sum, count) => sum + count, 0);

  return (
    <div className="editor-container">
      <div className="header-nav">
        <Link to="/" className="btn btn-secondary no-underline">
          <ArrowLeft size={18} /> Back to Home
        </Link>
        <h2 className="title-gradient">Deck Builder ({totalCards} Cards)</h2>
        <button onClick={handleSaveDeck} className="btn btn-success ml-auto">
          <Save size={18} /> Save Deck
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="glass-panel p-4">
          <h3 className="mb-4">Available Cards</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
            {availableCards.map(card => (
              <div key={card.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div className={`gf-card-field attr-border-${card.attribute}`} style={{ transform: 'scale(0.8)', transformOrigin: 'top center', marginBottom: '-10px' }}>
                  {card.imageUrl ? (
                     <div className="image-area" style={{backgroundImage: `url(${card.imageUrl})`}}></div>
                  ) : (
                     <div className="image-area">{card.type.charAt(0).toUpperCase()}</div>
                  )}
                  <div className="details">
                     <div className="card-name">{card.name}</div>
                     <div className="card-stat-text">
                       {card.attack > 0 ? `攻${card.attack} ` : ''}
                       {card.defense > 0 ? `守${card.defense} ` : ''}
                     </div>
                  </div>
                </div>
                <button onClick={() => addCard(card.id)} className="btn btn-secondary mt-2" style={{ padding: '0.25rem 1rem', zIndex: 2 }}>
                  <Plus size={16} /> Add
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-4">
          <h3 className="mb-4">Your Deck</h3>
          {Object.keys(deck).length === 0 ? (
            <p className="text-text-muted">No cards in deck.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {Object.entries(deck).map(([id, count]) => {
                const card = availableCards.find(c => c.id === id);
                if (!card) return null;
                return (
                  <li key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', marginBottom: '0.5rem', borderRadius: '4px' }}>
                    <span>{card.name} (x{count})</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => addCard(id)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }}><Plus size={14} /></button>
                      <button onClick={() => removeCard(id)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }}><Minus size={14} /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
