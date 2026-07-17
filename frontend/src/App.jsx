import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import './index.css';
import './layout.css'; // Add a layout CSS file

import Editor from './pages/Editor';
import BaseEditor from './pages/BaseEditor';
import GameRoom from './pages/GameRoom';

function Home() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [playerName, setPlayerName] = useState('Player');
  const [role, setRole] = useState('player');

  const handleJoin = (e) => {
    e.preventDefault();
    if (password.trim() && playerName.trim()) {
      navigate(`/room/${password}`, { state: { playerName, role } });
    }
  };

  return (
    <div className="center-container">
      <div className="glass-panel main-panel animate-fade-in">
        <h1 className="title-gradient">GodField Orica</h1>
        <p className="subtitle">Play GodField with your own Custom Cards</p>

        <form onSubmit={handleJoin} className="form-group">
          <input 
            type="text" 
            placeholder="Player Name" 
            className="input-field"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            required
          />
          <select className="input-field" value={role} onChange={event => setRole(event.target.value)}>
            <option value="player">プレイヤーとして参加</option>
            <option value="spectator">観戦する</option>
          </select>
          <input 
            type="text" 
            placeholder="Room Password (合言葉)" 
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="btn w-full">
            <Play size={18} /> Join Match
          </button>
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/editor')}>
            オリカ作成 (Custom Card Editor)
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/base-editor')}>
            基礎カード設定 (Base Card Editor)
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/editor" element={<Editor />} />
        <Route path="/base-editor" element={<BaseEditor />} />
        <Route path="/room/:id" element={<GameRoom />} />
      </Routes>
    </Router>
  );
}

export default App;
