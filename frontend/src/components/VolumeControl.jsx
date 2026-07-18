import React, { useState } from 'react';
import { getMasterVolume, setMasterVolume } from '../soundEffects';

export default function VolumeControl() {
  const [volume, setVolume] = useState(() => Math.round(getMasterVolume() * 100));

  const updateVolume = event => {
    const nextVolume = Number(event.target.value);
    setVolume(nextVolume);
    setMasterVolume(nextVolume / 100);
  };

  return (
    <label className="global-volume-control" title="音量">
      <span aria-hidden="true">{volume === 0 ? '🔇' : '🔊'}</span>
      <input
        type="range"
        min="0"
        max="100"
        step="5"
        value={volume}
        onChange={updateVolume}
        aria-label="音量"
      />
      <span>{volume}%</span>
    </label>
  );
}
