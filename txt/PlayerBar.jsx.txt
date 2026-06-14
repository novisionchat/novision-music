import React from 'react';
import usePlayerStore from '../store/usePlayerStore';
import { MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious } from 'react-icons/md';

const formatTime = (time) => {
  if (!time || isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const PlayerBar = () => {
  const { currentSong, isPlaying, togglePlay, currentTime, duration, seekTo, togglePanel, playNext, playPrev, downloadedSongs } = usePlayerStore();

  if (!currentSong) return null;

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  
  // Yerel veri (Base64) varsa ÖNCELİKLE YEREL kullan. İnternet olmasa da yüklenir!
  const localData = downloadedSongs[currentSong.id];
  const displayThumb = localData?.localThumbUrl || currentSong.thumbnail;

  return (
    <footer className="player-bar-container">
      <div className="now-playing-info clickable" onClick={togglePanel} style={{ cursor: 'pointer' }}>
        <img src={displayThumb} alt="cover" className="track-thumb" />
        <div className="track-details">
          <div className="track-title">{currentSong.title}</div>
          <div className="track-artist">{currentSong.channel}</div>
        </div>
      </div>

      <div className="player-controls">
        <div className="main-buttons">
          <button className="icon-btn" onClick={playPrev}><MdSkipPrevious size={28} /></button>
          <button className="play-pause-btn" onClick={togglePlay}>
            {isPlaying ? <MdPause size={32} color="black" /> : <MdPlayArrow size={32} color="black" />}
          </button>
          <button className="icon-btn" onClick={playNext}><MdSkipNext size={28} /></button>
        </div>
        
        <div className="progress-container">
          <span className="time-text">{formatTime(currentTime)}</span>
          <div className="seek-bar-wrapper">
            <input 
              type="range" min="0" max={duration || 100} value={currentTime} 
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              className="seek-bar"
              style={{ background: `linear-gradient(to right, #fff ${progressPercent}%, #4d4d4d ${progressPercent}%)` }}
            />
          </div>
          <span className="time-text">{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-actions"></div>
    </footer>
  );
};

export default PlayerBar;