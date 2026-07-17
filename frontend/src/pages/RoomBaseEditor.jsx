import React, { useEffect, useMemo, useState } from 'react';
import { GF_BASE_CARDS } from '../data/baseCards';

const labels = {
  all: 'すべて', weapon: '武器', armor: '防具', ring: '指輪', defense_item: '防御雑貨',
  miracle: '奇跡', item: '雑貨', trade: '取引', incarnation: '化身',
};

const encodeEdits = edits => {
  const bytes = new TextEncoder().encode(JSON.stringify(edits));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

const decodeEdits = code => {
  const binary = atob(code.trim());
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
};

export default function RoomBaseEditor({ socket, roomName, editorState, myId }) {
  const [category, setCategory] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const edits = useMemo(() => editorState?.edits || {}, [editorState?.edits]);
  const locks = useMemo(() => editorState?.locks || {}, [editorState?.locks]);
  const selectedBase = GF_BASE_CARDS.find(card => card.id === selectedId);
  const ownsLock = selectedId && locks[selectedId]?.ownerId === myId;

  const cards = useMemo(() => GF_BASE_CARDS.filter(card => category === 'all' || card.category === category), [category]);

  useEffect(() => () => {
    if (selectedId) socket.emit('unlockBaseCard', { roomName, cardId: selectedId });
  }, [roomName, selectedId, socket]);

  useEffect(() => {
    if (!draft || !selectedId || !ownsLock) return;
    const savedCard = { ...selectedBase, ...(edits[selectedId] || {}) };
    if (['name', 'description', 'imageUrl'].every(key => (draft[key] || '') === (savedCard[key] || ''))) return;
    socket.emit('updateRoomBaseCard', {
      roomName,
      cardId: selectedId,
      patch: { name: draft.name, description: draft.description, imageUrl: draft.imageUrl || '' },
    });
  }, [draft, edits, ownsLock, roomName, selectedBase, selectedId, socket]);

  useEffect(() => {
    if (selectedBase && !ownsLock) setDraft({ ...selectedBase, ...(edits[selectedId] || {}) });
  }, [edits, ownsLock, selectedBase, selectedId]);

  const selectCard = card => {
    if (selectedId && selectedId !== card.id && ownsLock) socket.emit('unlockBaseCard', { roomName, cardId: selectedId });
    setSelectedId(card.id);
    setDraft({ ...card, ...(edits[card.id] || {}) });
    socket.emit('lockBaseCard', { roomName, cardId: card.id });
  };

  const exportCode = async () => {
    const value = encodeEdits(edits);
    setCode(value);
    try {
      await navigator.clipboard.writeText(value);
      setMessage('設定コードをコピーしました。');
    } catch {
      setMessage('設定コードを下の欄からコピーしてください。');
    }
  };

  const importCode = () => {
    try {
      const imported = decodeEdits(code);
      socket.emit('importRoomBaseEdits', { roomName, edits: imported });
      setMessage('設定コードを部屋へ反映しました。ロック中のカードは除外されます。');
    } catch {
      setMessage('設定コードを読み取れませんでした。');
    }
  };

  const uploadImage = event => {
    const file = event.target.files?.[0];
    if (!file || !ownsLock) return;
    const reader = new FileReader();
    reader.onload = loadEvent => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 320 / image.width, 480 / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        setDraft(card => ({ ...card, imageUrl: canvas.toDataURL('image/jpeg', 0.7) }));
      };
      image.src = loadEvent.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="room-base-editor glass-panel">
      <div className="room-editor-toolbar">
        <h3>共有 基礎カード設定 <span className="edited-card-count">編集済み {Object.keys(edits).length}件</span></h3>
        <div className="room-category-tabs" role="tablist" aria-label="神器の分類">
          {Object.entries(labels).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={category === value}
              className={category === value ? 'active' : ''}
              onClick={() => setCategory(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="room-editor-body">
        <div className="room-card-list">
          {cards.map(card => {
            const lock = locks[card.id];
            return (
              <button key={card.id} className={`room-card-row ${selectedId === card.id ? 'active' : ''} ${edits[card.id] ? 'edited' : ''}`} onClick={() => selectCard(card)} disabled={lock && lock.ownerId !== myId}>
                <img className="room-card-thumbnail" src={edits[card.id]?.imageUrl || card.imageUrl} alt="" />
                <span className="room-card-summary">
                  <span className="card-list-name">
                    {edits[card.id]?.name || card.name}
                    {edits[card.id] && <span className="edited-card-badge">編集済み</span>}
                  </span>
                  <small>{lock ? `${lock.ownerName} が編集中` : labels[card.category]}</small>
                </span>
              </button>
            );
          })}
        </div>
        <div className="room-card-form">
          {draft ? (
            <>
              <div className="lock-status">{ownsLock ? '編集中・変更は自動保存されます' : locks[selectedId] ? `${locks[selectedId].ownerName} が編集中です` : '編集権を取得中…'}</div>
              <label>名前<input className="input-field" value={draft.name} disabled={!ownsLock} onChange={event => setDraft(card => ({ ...card, name: event.target.value }))} /></label>
              <label>画像URL<input className="input-field" value={draft.imageUrl || ''} disabled={!ownsLock} onChange={event => setDraft(card => ({ ...card, imageUrl: event.target.value }))} /></label>
              <label>画像ファイル<input className="input-field" type="file" accept="image/*" disabled={!ownsLock} onChange={uploadImage} /></label>
              <div className="room-card-image-preview">
                {draft.imageUrl ? <img src={draft.imageUrl} alt={`${draft.name} preview`} /> : <span>画像未設定</span>}
              </div>
              <label>説明<textarea className="input-field" rows="4" value={draft.description || ''} disabled={!ownsLock} onChange={event => setDraft(card => ({ ...card, description: event.target.value }))} /></label>
            </>
          ) : <p>左からカードを選択してください。</p>}
          <div className="room-code-panel">
            <div><button className="btn btn-secondary" onClick={exportCode}>設定コードを作成・コピー</button> <button className="btn btn-secondary" onClick={importCode}>コードを読み込む</button></div>
            <textarea className="input-field" rows="3" value={code} onChange={event => setCode(event.target.value)} placeholder="設定コード" />
            {message && <small>{message}</small>}
          </div>
        </div>
      </div>
    </div>
  );
}
