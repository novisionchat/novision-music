import React, { useState, useEffect } from 'react';
import usePlayerStore from '../store/usePlayerStore';
import { MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious } from 'react-icons/md';

const formatTime = (time) => {
  if (!time || isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const PlayerBar = () => {
  const { currentSong, isPlaying, togglePlay, currentTime, duration, seekTo, togglePanel, playNext, playPrev, downloadedSongs, isPanelOpen } = usePlayerStore();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!currentSong) return null;

  if (isMobile && isPanelOpen) return null;

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const localData = downloadedSongs[currentSong.id];
  
  // FOTOĞRAF DÜZELTMESİ (Zoom iptali, siyah bar engeli)
  const displayThumb = (localData?.localThumbUrl || currentSong.thumbnail || '')
                       .replace('hqdefault.jpg', 'mqdefault.jpg')
                       .replace('sddefault.jpg', 'mqdefault.jpg');

  if (isMobile) {
    return (
      <footer 
        className="player-bar-container" 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: '0 15px', 
          height: '75px', 
          cursor: 'pointer',
          boxShadow: '0 -4px 15px rgba(0,0,0,0.6)',
          position: 'fixed', 
          bottom: '58px', 
          left: 0, 
          width: '100%',
          background: '#121212', 
          borderTop: '1px solid #282828',
          zIndex: 99
        }} 
        onClick={togglePanel}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', overflow: 'hidden', minWidth: '100px' }}>
          <div className="track-thumb-wrapper" style={{ width: '48px', height: '48px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--bg-hover)' }}>
             <img src={displayThumb} alt="cover" className="track-thumb" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'white', textOverflow: 'ellipsis', overflow: 'hidden' }}>{currentSong.title}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden' }}>{currentSong.channel}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: '0 0 auto', justifyContent: 'flex-end', marginLeft: '10px' }}>
          <button 
            className="icon-btn" 
            onClick={(e) => { e.stopPropagation(); playPrev(); }} 
            style={{ padding: 0 }}
          >
            <MdSkipPrevious size={32} color="white" />
          </button>
          
          <button 
            className="play-pause-btn" 
            onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
            style={{ width: '45px', height: '45px', background: 'white', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none', cursor: 'pointer' }}
          >
            {isPlaying ? <MdPause size={26} color="black" /> : <MdPlayArrow size={26} color="black" />}
          </button>
          
          <button 
            className="icon-btn" 
            onClick={(e) => { e.stopPropagation(); playNext(); }} 
            style={{ padding: 0 }}
          >
            <MdSkipNext size={32} color="white" />
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="player-bar-container">
      <div className="now-playing-info clickable" onClick={togglePanel} style={{ cursor: 'pointer' }}>
        <div className="track-thumb-wrapper" style={{ width: '56px', height: '56px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--bg-hover)' }}>
          <img src={displayThumb} alt="cover" className="track-thumb" />
        </div>
        <div className="track-details">
          <div className="track-title">{currentSong.title}</div>
          <div className="track-artist">{currentSong.channel}</div>
        </div>
      </div>

      <div className="player-controls">
        <div className="main-buttons">
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); playPrev(); }}><MdSkipPrevious size={28} /></button>
          <button className="play-pause-btn" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
            {isPlaying ? <MdPause size={32} color="black" /> : <MdPlayArrow size={32} color="black" />}
          </button>
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); playNext(); }}><MdSkipNext size={28} /></button>
        </div>
        
        <div className="progress-container" onClick={(e) => e.stopPropagation()}>
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