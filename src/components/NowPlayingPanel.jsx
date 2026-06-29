import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePlayerStore from '../store/usePlayerStore';
import { 
  MdExpandMore, MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious, 
  MdPlaylistAdd, MdShuffle, MdRepeat, MdOpenInFull, MdCloseFullscreen, 
  MdShare, MdFileDownload, MdDelete, MdClose, MdFavorite, MdFavoriteBorder
} from 'react-icons/md';
import YouTubeEngine from './YouTubeEngine';
import toast from 'react-hot-toast';

// ÖNBELLEKLENMİŞ MARQUEE BİLEŞENİ
const MarqueeText = React.memo(({ text, style }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isMarquee, setIsMarquee] = useState(false);
  const [dist, setDist] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

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

    const observer = new ResizeObserver(() => updateMarquee());
    observer.observe(container);
    updateMarquee(); 

    return () => observer.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} className="marquee-container" style={{ overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
      <span
        ref={textRef}
        className={isMarquee ? "marquee-text marquee-active" : "marquee-text"}
        style={{
          ...style, display: 'inline-block', whiteSpace: 'nowrap', willChange: 'transform',
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

// PANEL PROGRESS ALT BİLEŞENİ
const PanelProgress = () => {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const seekTo = usePlayerStore(s => s.seekTo);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="progress-container panel-progress">
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

// SÖZLER ALANI ALT BİLEŞENİ (Saniyede bir scroll hesaplamasının ana bileşeni kasmasını engeller)
const LyricsPanelSection = ({ isLyricsExpanded, setIsLyricsExpanded }) => {
  const lyrics = usePlayerStore(s => s.lyrics);
  const isLyricsLoading = usePlayerStore(s => s.isLyricsLoading);
  const currentTime = usePlayerStore(s => s.currentTime);
  const seekTo = usePlayerStore(s => s.seekTo);

  const lyricsContainerRef = useRef(null);

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

  return (
    <div className={`lyrics-card ${isLyricsExpanded ? 'expanded' : ''}`} onTouchStart={(e) => e.stopPropagation()}>
      <div className="lyrics-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Sözler</span>
        <button className="icon-btn" onClick={() => setIsLyricsExpanded(!isLyricsExpanded)}>
          {isLyricsExpanded ? <MdCloseFullscreen size={20} color="white" /> : <MdOpenInFull size={20} color="white" />}
        </button>
      </div>
      <div className="lyrics-content" ref={lyricsContainerRef}>
        {isLyricsLoading ? (
          <div className="lyrics-placeholder">Sözler aranıyor...</div>
        ) : safeLyrics.length > 0 ? (
          safeLyrics.map((line, idx) => (
            <div 
              key={idx} 
              className={`lyric-line ${idx === activeLyricIndex ? 'active' : ''}`} 
              onClick={() => seekTo(line.time)}
            >
              {line.text}
            </div>
          ))
        ) : (
          <div className="lyrics-placeholder">Bu şarkı için söz bulunamadı.</div>
        )}
      </div>
    </div>
  );
};

const NowPlayingPanel = () => {
  const navigate = useNavigate();
  
  // Seçicileri ayrıştırarak ana panel render yükünü tamamen kaldırıyoruz
  const currentSong = usePlayerStore(s => s.currentSong);
  const isPanelOpen = usePlayerStore(s => s.isPanelOpen);
  const isPanelFullscreen = usePlayerStore(s => s.isPanelFullscreen);
  const toggleFullscreen = usePlayerStore(s => s.toggleFullscreen);
  const closePanel = usePlayerStore(s => s.closePanel);
  const openAddModal = usePlayerStore(s => s.openAddModal);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const playNext = usePlayerStore(s => s.playNext);
  const playPrev = usePlayerStore(s => s.playPrev);
  const isShuffle = usePlayerStore(s => s.isShuffle);
  const isRepeat = usePlayerStore(s => s.isRepeat);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
  const isVideoMode = usePlayerStore(s => s.isVideoMode);
  const setVideoMode = usePlayerStore(s => s.setVideoMode);
  const activeEngine = usePlayerStore(s => s.activeEngine);
  const downloadedSongs = usePlayerStore(s => s.downloadedSongs);
  const downloadSong = usePlayerStore(s => s.downloadSong);
  const cancelDownload = usePlayerStore(s => s.cancelDownload);
  const deleteDownloadedSong = usePlayerStore(s => s.deleteDownloadedSong);
  const downloadQueue = usePlayerStore(s => s.downloadQueue);
  const downloadProgress = usePlayerStore(s => s.downloadProgress);
  const likedSongs = usePlayerStore(s => s.likedSongs);
  const toggleLike = usePlayerStore(s => s.toggleLike);

  const [isLyricsExpanded, setIsLyricsExpanded] = useState(false);
  const [imgSrc, setImgSrc] = useState('');
  const [ambientColors, setAmbientColors] = useState(['#FF2A54', '#ff8038', '#00C6FF', '#121212']);
  const [touchStart, setTouchStart] = useState(null);

  useEffect(() => {
    if (!currentSong) return;
    const localData = downloadedSongs[currentSong.id];
    setImgSrc(localData?.localThumbUrl ? localData.localThumbUrl : `https://i.ytimg.com/vi/${currentSong.id}/maxresdefault.jpg`);
  }, [currentSong, downloadedSongs]);

  useEffect(() => {
    if (!imgSrc) return;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = imgSrc;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 20; 
        canvas.height = 20;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 20, 20);
        const data = ctx.getImageData(0, 0, 20, 20).data;
        
        let colorMap = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if (a < 150) continue; 
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 30 || brightness > 230) continue; 
          colorMap.push({ r, g, b, sat: Math.max(r, g, b) - Math.min(r, g, b) });
        }
        
        colorMap.sort((a, b) => b.sat - a.sat); 
        
        let distinct = [];
        for (let c of colorMap) {
          if (distinct.length >= 4) break;
          const isDistinct = distinct.every(dc => Math.abs(dc.r - c.r) + Math.abs(dc.g - c.g) + Math.abs(dc.b - c.b) > 70);
          if (isDistinct) distinct.push(c);
        }
        
        for (let c of colorMap) {
          if (distinct.length >= 4) break;
          if (!distinct.includes(c)) distinct.push(c);
        }

        while(distinct.length < 4) distinct.push({ r: 18, g: 18, b: 18 });

        setAmbientColors([
          `rgb(${distinct[0].r}, ${distinct[0].g}, ${distinct[0].b})`,
          `rgb(${distinct[1].r}, ${distinct[1].g}, ${distinct[1].b})`,
          `rgb(${distinct[2].r}, ${distinct[2].g}, ${distinct[2].b})`,
          `rgb(${distinct[3].r}, ${distinct[3].g}, ${distinct[3].b})`
        ]);
      } catch (err) {
        setAmbientColors(['#FF2A54', '#ff8038', '#00C6FF', '#121212']);
      }
    };
    img.onerror = () => setAmbientColors(['#FF2A54', '#ff8038', '#00C6FF', '#121212']);
  }, [imgSrc]);

  if (!currentSong) return null;

  const isLiked = currentSong ? likedSongs.some(s => s.id === currentSong.id) : false;
  const localData = downloadedSongs[currentSong.id];
  const isDownloaded = !!localData;
  const isDownloading = downloadQueue.includes(currentSong.id);
  const progress = downloadProgress[currentSong.id] || 0;

  const handleImageError = () => {
    const fallbackUrl = currentSong?.thumbnail || '/icon.png';
    if (imgSrc !== fallbackUrl) setImgSrc(fallbackUrl.replace('hqdefault.jpg', 'mqdefault.jpg').replace('sddefault.jpg', 'mqdefault.jpg'));
  };

  const handleImageLoad = (e) => {
    if (e.target.naturalWidth === 120 && e.target.naturalHeight === 90) handleImageError();
  };

  const handleShare = () => {
    navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${currentSong.id}`);
    toast.success("Şarkı bağlantısı kopyalandı!");
  };

  const handleToggleFullscreen = () => {
    setIsLyricsExpanded(false);
    toggleFullscreen();
  };

  const handleClosePanel = () => {
    setIsLyricsExpanded(false);
    closePanel();
  };

  const handleTouchStart = (e) => setTouchStart(e.targetTouches[0].clientY);
  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStart - touchEnd;
    if (diff < -50) { 
      e.stopPropagation(); 
      handleClosePanel(); 
    }
    setTouchStart(null);
  };

  return (
    <aside className={`now-playing-panel ${isPanelOpen ? 'open' : ''} ${isPanelFullscreen ? 'fullscreen' : ''}`}>
      <div 
        className="ambient-bg" 
        style={{ 
          backgroundImage: `
            radial-gradient(circle at 0% 0%, ${ambientColors[0]} 0%, transparent 50%),
            radial-gradient(circle at 100% 0%, ${ambientColors[1]} 0%, transparent 50%),
            radial-gradient(circle at 100% 100%, ${ambientColors[2]} 0%, transparent 50%),
            radial-gradient(circle at 0% 100%, ${ambientColors[3]} 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, ${ambientColors[0]} 0%, ${ambientColors[1]} 100%)
          `
        }}
      ></div>
      <div className="ambient-overlay"></div>
      
      <div className="panel-header" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <button className="icon-btn close-panel-btn" onClick={handleClosePanel} title="Kapat"><MdExpandMore size={32} color="white" /></button>
        <div className="mode-switch">
          <div className="mode-bg" style={{ transform: isVideoMode ? 'translateX(100%)' : 'translateX(0)' }}></div>
          <button className={`mode-btn ${!isVideoMode ? 'active' : ''}`} onClick={() => setVideoMode(false)}>Şarkı</button>
          <button className={`mode-btn ${isVideoMode ? 'active' : ''}`} onClick={() => setVideoMode(true)}>Video</button>
        </div>
        <button className="icon-btn toggle-fullscreen-btn" onClick={handleToggleFullscreen} title="Tam Ekran">
          {isPanelFullscreen ? <MdCloseFullscreen size={24} color="white" /> : <MdOpenInFull size={24} color="white" />}
        </button>
      </div>

      <div className={`panel-scroll-area ${isLyricsExpanded ? 'lyrics-expanded-active' : ''}`}>
        
        {/* SOL SÜTUN SARMALAYICISI */}
        <div className={`panel-left-column ${isLyricsExpanded ? 'hidden-for-lyrics' : ''}`}>
          
          <div className="panel-artwork-container">
            <YouTubeEngine />
            <img 
              src={imgSrc || '/icon.png'} 
              alt="cover" 
              className="panel-artwork" 
              onLoad={handleImageLoad} 
              onError={handleImageError} 
              style={{ opacity: (isVideoMode && activeEngine === 'youtube') ? 0 : 1, transition: 'opacity 0.3s' }} 
            />
          </div>

          <div className="panel-info">
            <div className="panel-info-row">
              <div className="panel-info-text-container">
                <MarqueeText text={currentSong.title} style={{ fontSize: '22px', fontWeight: 'bold', color: 'white', marginBottom: '4px' }} />
                <div className="panel-info-channel-link" onClick={() => { handleClosePanel(); navigate(`/artist/${encodeURIComponent(currentSong.channel)}`); }}>
                  <MarqueeText text={currentSong.channel} style={{ fontSize: '15px', color: 'rgba(255,255,255,0.7)' }} />
                </div>
              </div>
              <button className="icon-btn panel-info-like-btn" onClick={() => toggleLike(currentSong)}>
                {isLiked ? <MdFavorite size={28} color="var(--accent)" /> : <MdFavoriteBorder size={28} color="var(--text-muted)" />}
              </button>
            </div>
          </div>

          <div className="panel-controls">
            {/* Progress Bar Alt Bileşene İndirgenmiştir */}
            <PanelProgress />
            
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

          <div className="panel-actions">
            {isDownloaded ? (
              <button className="icon-btn" title="Cihazdan Sil" onClick={() => {
                toast((t) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '220px', padding: '10px 5px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '500', textAlign: 'center', color: 'white' }}>İndirilen şarkı silinsin mi?</span>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '5px' }}>
                      <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => toast.dismiss(t.id)}>İptal</button>
                      <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#ff4d4d', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => { 
                         toast.dismiss(t.id); deleteDownloadedSong(currentSong.id); 
                         const successId = toast.success("Şarkı cihazdan silindi.");
                         setTimeout(() => { toast.dismiss(successId); }, 3000);
                      }}>Sil</button>
                    </div>
                  </div>
                ), { duration: Infinity, position: 'top-center' });
              }}>
                <MdDelete size={28} color="#ff4d4d" />
              </button>
            ) : isDownloading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 'bold' }}>{progress > 0 ? `%${progress}` : "İndiriliyor..."}</span>
                <button className="icon-btn" onClick={() => cancelDownload(currentSong.id)} title="İptal Et"><MdClose size={20} color="var(--text-muted)" /></button>
              </div>
            ) : (
              <button className="icon-btn" title="Çevrimdışı Dinlemek İçin İndir" onClick={() => downloadSong(currentSong)}><MdFileDownload size={28} color="white" /></button>
            )}

            <button className="icon-btn" title="Listeye Ekle" onClick={() => openAddModal(currentSong)}><MdPlaylistAdd size={28} color="white" /></button>
            <button className="icon-btn" title="Paylaş" onClick={handleShare}><MdShare size={26} color="white" /></button>
          </div>

        </div>

        {/* SAĞ SÜTUN: Şarkı sözleri alanı Alt Bileşene İndirgenmiştir */}
        <LyricsPanelSection isLyricsExpanded={isLyricsExpanded} setIsLyricsExpanded={setIsLyricsExpanded} />

      </div>
    </aside>
  );
};

export default NowPlayingPanel;