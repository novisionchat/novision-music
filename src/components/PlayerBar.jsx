import React, { useState, useEffect, useRef } from 'react';
import usePlayerStore from '../store/usePlayerStore';
import { 
  MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious, 
  MdShuffle, MdRepeat, MdFavorite, MdFavoriteBorder, 
  MdPlaylistAdd, MdShare, MdVolumeUp, MdVolumeDown, MdVolumeOff 
} from 'react-icons/md';
import toast from 'react-hot-toast';

// ÖNBELLEKLENMİŞ MARQUEE BİLEŞENİ (Performans Korumalı)
const MarqueeText = React.memo(({ text, style }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isMarquee, setIsMarquee] = useState(false);
  const [dist, setDist] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    setIsMarquee(false);

    const updateMarquee = () => {
      setIsMarquee(false);
      
      requestAnimationFrame(() => {
        const overflowDist = textEl.scrollWidth - container.clientWidth;
        if (overflowDist > 0) {
          setDist(-overflowDist - 20); 
          setIsMarquee(true);
        } else {
          setDist(0);
          setIsMarquee(false);
        }
      });
    };

    const observer = new ResizeObserver(() => {
      updateMarquee();
    });
    
    observer.observe(container);
    updateMarquee(); 

    return () => {
      observer.disconnect();
    };
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      className="marquee-container" 
      style={{ overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}
    >
      <span
        ref={textRef}
        className={isMarquee ? "marquee-text marquee-active" : "marquee-text"}
        style={{
          ...style,
          display: 'inline-block',
          whiteSpace: 'nowrap',
          willChange: 'transform',
          '--marquee-dist': `${dist}px`,
          '--marquee-duration': `${Math.max(6, Math.abs(dist) / 12)}s` 
        }}
      >
        {text}
      </span>
    </div>
  );
});

MarqueeText.displayName = 'MarqueeText';

const formatTime = (time) => {
  if (!time || isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

// SADECE PROGRESS DEĞİŞTİĞİNDE RENDER EDİLEN ALT BİLEŞEN
const TimelineProgress = () => {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const seekTo = usePlayerStore(s => s.seekTo);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="progress-container" onClick={(e) => e.stopPropagation()} style={{ width: '100%' }}>
      <span className="time-text">{formatTime(currentTime)}</span>
      <div className="seek-bar-wrapper">
        <input 
          type="range" 
          min="0" 
          max={duration || 100} 
          value={currentTime} 
          onChange={(e) => seekTo(parseFloat(e.target.value))}
          className="seek-bar"
          style={{ background: `linear-gradient(to right, #fff ${progressPercent}%, #4d4d4d ${progressPercent}%)` }}
        />
      </div>
      <span className="time-text">{formatTime(duration)}</span>
    </div>
  );
};

const PlayerBar = () => {
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const togglePanel = usePlayerStore(s => s.togglePanel);
  const playNext = usePlayerStore(s => s.playNext);
  const playPrev = usePlayerStore(s => s.playPrev);
  const downloadedSongs = usePlayerStore(s => s.downloadedSongs);
  const isPanelOpen = usePlayerStore(s => s.isPanelOpen);
  const isShuffle = usePlayerStore(s => s.isShuffle);
  const isRepeat = usePlayerStore(s => s.isRepeat);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
  const likedSongs = usePlayerStore(s => s.likedSongs);
  const toggleLike = usePlayerStore(s => s.toggleLike);
  const openAddModal = usePlayerStore(s => s.openAddModal);
  const volume = usePlayerStore(s => s.volume);
  const setVolume = usePlayerStore(s => s.setVolume);
  const isOfflineMode = usePlayerStore(s => s.isOfflineMode);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [touchStart, setTouchStart] = useState(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!currentSong) return null;
  if (isMobile && isPanelOpen) return null;

  const localData = downloadedSongs[currentSong.id];
  
  const displayThumb = (isOfflineMode && localData?.localThumbUrl)
                       ? localData.localThumbUrl
                       : (currentSong.thumbnail || '/icon.png')
                         .replace('hqdefault.jpg', 'mqdefault.jpg')
                         .replace('sddefault.jpg', 'mqdefault.jpg');

  const isLiked = currentSong ? likedSongs.some(s => s.id === currentSong.id) : false;

  const handleShare = (e) => {
    e.stopPropagation();
    if (!currentSong) return;
    navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${currentSong.id}`);
    toast.success("Şarkı bağlantısı kopyalandı!");
  };

  const handleTouchStart = (e) => {
    setTouchStart(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStart - touchEnd;

    if (diff > 50) {
      e.stopPropagation();
      e.preventDefault();
      togglePanel();
    }
    setTouchStart(null);
  };

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
          bottom: '65px', // Fixed from 58px to prevent overlap with bottom-nav (height 65px)
          left: 0, 
          width: '100%',
          background: '#121212', 
          borderTop: '1px solid #282828',
          zIndex: 99
        }} 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={togglePanel}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', overflow: 'hidden', minWidth: '100px' }}>
          <div className="track-thumb-wrapper" style={{ width: '48px', height: '48px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--bg-hover)' }}>
             <img src={displayThumb} alt="cover" className="track-thumb" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%', justifyContent: 'center' }}>
            <MarqueeText text={currentSong.title} style={{ fontSize: '14px', fontWeight: 'bold', color: 'white' }} />
            <MarqueeText text={currentSong.channel} style={{ fontSize: '12px', color: 'var(--text-muted)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: '0 0 auto', justifyContent: 'flex-end', marginLeft: '10px' }}>
          <button 
            className="icon-btn" 
            onClick={(e) => { e.stopPropagation(); playPrev(); }} 
            style={{ padding: 0, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <MdSkipPrevious size={32} color="white" />
          </button>
          
          <button 
            className="play-pause-btn" 
            onClick={(e) => { e.stopPropagation(); togglePlay(); }} 
            style={{ width: '42px', height: '42px', background: 'white', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none', cursor: 'pointer', padding: 0, margin: 0 }}
          >
            {isPlaying ? <MdPause size={26} color="black" /> : <MdPlayArrow size={26} color="black" />}
          </button>
          
          <button 
            className="icon-btn" 
            onClick={(e) => { e.stopPropagation(); playNext(); }} 
            style={{ padding: 0, margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <MdSkipNext size={32} color="white" />
          </button>
        </div>
      </footer>
    );
  }

  return (
    <footer className="player-bar-container">
      <div 
        className="now-playing-info clickable" 
        onClick={togglePanel} 
        style={{ 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '15px', 
          width: '30%', 
          minWidth: '220px' 
        }}
      >
        <div className="track-thumb-wrapper" style={{ width: '56px', height: '56px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--bg-hover)' }}>
          <img src={displayThumb} alt="cover" className="track-thumb" />
        </div>
        <div className="track-details" style={{ flex: '1 1 auto', marginRight: '10px', overflow: 'hidden' }}>
          <MarqueeText text={currentSong.title} style={{ fontSize: '14px', fontWeight: '600', color: 'white' }} />
          <MarqueeText text={currentSong.channel} style={{ fontSize: '12px', color: 'var(--text-muted)' }} />
        </div>
        
        <button 
          className="icon-btn" 
          onClick={(e) => { e.stopPropagation(); toggleLike(currentSong); }} 
          title={isLiked ? "Beğenilenlerden Kaldır" : "Beğen"}
          style={{ flexShrink: 0 }}
        >
          {isLiked ? <MdFavorite size={22} color="var(--accent)" /> : <MdFavoriteBorder size={22} color="var(--text-muted)" />}
        </button>
      </div>

      <div className="player-controls" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '40%' }}>
        <div className="main-buttons" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '5px' }}>
          <button 
            className="icon-btn" 
            onClick={(e) => { e.stopPropagation(); toggleShuffle(); }}
            title="Karışık Çal"
            style={{ color: isShuffle ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <MdShuffle size={20} />
          </button>

          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); playPrev(); }}><MdSkipPrevious size={28} /></button>
          
          <button className="play-pause-btn" onClick={(e) => { e.stopPropagation(); togglePlay(); }}>
            {isPlaying ? <MdPause size={32} color="black" /> : <MdPlayArrow size={32} color="black" />}
          </button>
          
          <button className="icon-btn" onClick={(e) => { e.stopPropagation(); playNext(); }}><MdSkipNext size={28} /></button>
          
          <button 
            className="icon-btn" 
            onClick={(e) => { e.stopPropagation(); toggleRepeat(); }}
            title="Tekrarla"
            style={{ color: isRepeat ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            <MdRepeat size={20} />
          </button>
        </div>
        
        <TimelineProgress />
      </div>

      <div className="player-actions" style={{ display: 'flex', alignItems: 'center', gap: '15px', justifyContent: 'flex-end', width: '30%', minWidth: '220px' }}>
        <button 
          className="icon-btn" 
          onClick={(e) => { e.stopPropagation(); openAddModal(currentSong); }} 
          title="Çalma Listesine Ekle"
        >
          <MdPlaylistAdd size={24} color="var(--text-muted)" />
        </button>
        
        <button 
          className="icon-btn" 
          onClick={handleShare} 
          title="Şarkıyı Paylaş"
        >
          <MdShare size={20} color="var(--text-muted)" />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '10px' }}>
          <button 
            className="icon-btn" 
            onClick={(e) => { e.stopPropagation(); setVolume(volume > 0 ? 0 : 50); }} 
            title={volume === 0 ? "Sesi Aç" : "Sessize Al"}
            style={{ padding: 0 }}
          >
            {volume === 0 ? (
              <MdVolumeOff size={22} color="var(--text-muted)" />
            ) : volume < 50 ? (
              <MdVolumeDown size={22} color="white" />
            ) : (
              <MdVolumeUp size={22} color="white" />
            )}
          </button>
          
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={volume} 
            onChange={(e) => setVolume(parseInt(e.target.value))}
            className="seek-bar" 
            style={{ 
              width: '80px', 
              height: '4px',
              background: `linear-gradient(to right, #fff ${volume}%, #4d4d4d ${volume}%)`
            }} 
          />
        </div>
      </div>
    </footer>
  );
};

export default PlayerBar;