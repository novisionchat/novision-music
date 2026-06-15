import React, { useEffect, useRef, useState } from 'react';
import usePlayerStore from '../store/usePlayerStore';
import { 
  MdExpandMore, MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious, 
  MdPlaylistAdd, MdShuffle, MdRepeat, MdOpenInFull, MdCloseFullscreen, 
  MdShare, MdFileDownload, MdDelete, MdClose
} from 'react-icons/md';
import YouTubeEngine from './YouTubeEngine';
import toast from 'react-hot-toast';

const formatTime = (time) => {
  if (!time || isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const NowPlayingPanel = () => {
  const { 
    currentSong, isPanelOpen, isPanelFullscreen, toggleFullscreen, closePanel, 
    openAddModal, isPlaying, togglePlay, currentTime, duration, seekTo, playNext, 
    playPrev, isShuffle, isRepeat, toggleShuffle, toggleRepeat, lyrics, isLyricsLoading, 
    isVideoMode, setVideoMode, activeEngine, downloadedSongs, 
    downloadSong, cancelDownload, deleteDownloadedSong, downloadQueue, downloadProgress 
  } = usePlayerStore();
  
  const lyricsContainerRef = useRef(null);
  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false);

  const safeLyrics = Array.isArray(lyrics) ? lyrics : [];
  
  const activeLyricIndex = safeLyrics.findIndex((l, i) => { 
    const nextTime = safeLyrics[i + 1]?.time || Infinity; 
    return currentTime >= l.time && currentTime < nextTime; 
  });

  useEffect(() => {
    if (activeLyricIndex !== -1 && lyricsContainerRef.current) {
      const container = lyricsContainerRef.current;
      const activeEl = container.children[activeLyricIndex];
      if (activeEl) {
        const scrollPos = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2);
        container.scrollTo({ top: scrollPos, behavior: 'smooth' });
      }
    }
  }, [activeLyricIndex, isLyricsExpanded]); 

  if (!currentSong) return null;
  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  const handleShare = () => {
    navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${currentSong.id}`);
    toast.success("Şarkı bağlantısı kopyalandı!");
  };

  const localData = downloadedSongs[currentSong.id];
  const displayThumb = localData?.localThumbUrl || currentSong.thumbnail;
  
  const isDownloaded = !!localData;
  const isDownloading = downloadQueue.includes(currentSong.id);
  const progress = downloadProgress[currentSong.id] || 0;

  return (
    <aside className={`now-playing-panel ${isPanelOpen ? 'open' : ''} ${isPanelFullscreen ? 'fullscreen' : ''}`}>
      <div className="ambient-bg" style={{ backgroundImage: `url(${displayThumb})` }}></div>
      <div className="ambient-overlay"></div>
      
      <div className="panel-header">
        <button className="icon-btn close-panel-btn" onClick={closePanel} title="Kapat">
          <MdExpandMore size={32} color="white" />
        </button>
        
        <div className="mode-switch">
          <div className="mode-bg" style={{ transform: isVideoMode ? 'translateX(100%)' : 'translateX(0)' }}></div>
          <button className={`mode-btn ${!isVideoMode ? 'active' : ''}`} onClick={() => setVideoMode(false)}>Şarkı</button>
          <button className={`mode-btn ${isVideoMode ? 'active' : ''}`} onClick={() => setVideoMode(true)}>Video</button>
        </div>
        
        <button className="icon-btn toggle-fullscreen-btn" onClick={toggleFullscreen} title="Tam Ekran">
          {isPanelFullscreen ? <MdCloseFullscreen size={24} color="white" /> : <MdOpenInFull size={24} color="white" />}
        </button>
      </div>

      <div className="panel-scroll-area">
        <div className={`panel-artwork-container ${isLyricsExpanded ? 'hidden-for-lyrics' : ''}`}>
          <YouTubeEngine />
          <img src={displayThumb} alt="cover" className="panel-artwork" style={{ opacity: (isVideoMode && activeEngine === 'youtube') ? 0 : 1, transition: 'opacity 0.3s' }} />
        </div>

        <div className={`panel-info ${isLyricsExpanded ? 'hidden-for-lyrics' : ''}`}>
          <h2 className="panel-title">{currentSong.title}</h2>
          <p className="panel-artist">{currentSong.channel}</p>
        </div>

        <div className="panel-controls">
          <div className="progress-container panel-progress">
            <span className="time-text">{formatTime(currentTime)}</span>
            <div className="seek-bar-wrapper">
              <input type="range" min="0" max={duration || 100} value={currentTime} onChange={(e) => seekTo(parseFloat(e.target.value))} className="seek-bar" style={{ background: `linear-gradient(to right, #fff ${progressPercent}%, #4d4d4d ${progressPercent}%)` }} />
            </div>
            <span className="time-text">{formatTime(duration)}</span>
          </div>
          
          <div className="main-buttons panel-main-buttons">
            <button className="icon-btn" onClick={toggleShuffle} style={{ color: isShuffle ? 'var(--accent)' : 'var(--text-muted)' }}><MdShuffle size={24} /></button>
            <button className="icon-btn" onClick={playPrev}><MdSkipPrevious size={36} color="white" /></button>
            <button className="play-pause-btn big" onClick={togglePlay}>
              {isPlaying ? <MdPause size={40} color="black" /> : <MdPlayArrow size={40} color="black" />}
            </button>
            <button className="icon-btn" onClick={playNext}><MdSkipNext size={36} color="white" /></button>
            <button className="icon-btn" onClick={toggleRepeat} style={{ color: isRepeat ? 'var(--accent)' : 'var(--text-muted)' }}><MdRepeat size={24} /></button>
          </div>
        </div>

        {!isLyricsExpanded && (
          <div className="panel-actions">
            {isDownloaded ? (
              <button className="icon-btn" title="Cihazdan Sil" onClick={() => {
                if(window.confirm("İndirilen şarkı silinsin mi?")) deleteDownloadedSong(currentSong.id);
              }}>
                <MdDelete size={28} color="#ff4d4d" />
              </button>
            ) : isDownloading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 'bold' }}>
                  {progress > 0 ? `%${progress}` : "İndiriliyor..."}
                </span>
                <button className="icon-btn" onClick={() => cancelDownload(currentSong.id)} title="İptal Et">
                   <MdClose size={20} color="var(--text-muted)" />
                </button>
              </div>
            ) : (
              <button className="icon-btn" title="Çevrimdışı Dinlemek İçin İndir" onClick={() => downloadSong(currentSong)}>
                <MdFileDownload size={28} color="white" />
              </button>
            )}

            <button className="icon-btn" title="Listeye Ekle" onClick={() => openAddModal(currentSong)}><MdPlaylistAdd size={28} color="white" /></button>
            <button className="icon-btn" title="Paylaş" onClick={handleShare}><MdShare size={26} color="white" /></button>
          </div>
        )}

        <div className={`lyrics-card ${isLyricsExpanded ? 'expanded' : ''}`}>
          <div className="lyrics-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Sözler</span>
            <button className="icon-btn" onClick={() => setIsLyricsExpanded(!isLyricsExpanded)}>{isLyricsExpanded ? <MdCloseFullscreen size={20} color="white" /> : <MdOpenInFull size={20} color="white" />}</button>
          </div>
          <div className="lyrics-content" ref={lyricsContainerRef}>
            {isLyricsLoading ? <div className="lyrics-placeholder">Sözler aranıyor...</div> : safeLyrics.length > 0 ? safeLyrics.map((line, idx) => (
              <div key={idx} className={`lyric-line ${idx === activeLyricIndex ? 'active' : ''}`} onClick={() => seekTo(line.time)}>{line.text}</div>
            )) : <div className="lyrics-placeholder">Bu şarkı için söz bulunamadı.</div>}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default NowPlayingPanel;