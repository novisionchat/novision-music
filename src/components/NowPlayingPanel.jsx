import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import usePlayerStore from '../store/usePlayerStore';
import { 
  MdExpandMore, MdPlayArrow, MdPause, MdSkipNext, MdSkipPrevious, 
  MdPlaylistAdd, MdShuffle, MdRepeat, MdOpenInFull, MdCloseFullscreen, 
  MdShare, MdFileDownload, MdDelete, MdClose, MdFavorite, MdFavoriteBorder,
  MdTranslate, MdArrowDropDown
} from 'react-icons/md';
import YouTubeEngine from './YouTubeEngine';
import toast from 'react-hot-toast';

// PREMIUM: Ekran Boyutu Değişimlerini Anlık Takip Eden Dinamik Marquee Bileşeni
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

// PANEL PROGRESS ALT BİLEŞENİ (Saniyede bir render'ı hapseder)
const PanelProgress = () => {
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const seekTo = usePlayerStore(s => s.seekTo);

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="progress-container panel-progress" onClick={(e) => e.stopPropagation()}>
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

// SÖZLER VE SIRA ALANI ALT BİLEŞENİ
const LyricsPanelSection = ({ isLyricsExpanded, setIsLyricsExpanded, isLandscapeWide, shouldExpandLyricsLayout }) => {
  const [activeTab, setActiveTab] = useState('lyrics'); // 'lyrics' | 'queue'
  
  const lyrics = usePlayerStore(s => s.lyrics);
  const isLyricsLoading = usePlayerStore(s => s.isLyricsLoading);
  const currentTime = usePlayerStore(s => s.currentTime);
  const seekTo = usePlayerStore(s => s.seekTo);
  const isPanelFullscreen = usePlayerStore(s => s.isPanelFullscreen);

  // Sıra yönetimi store bağlantıları
  const queue = usePlayerStore(s => s.queue);
  const currentIndex = usePlayerStore(s => s.currentIndex);
  const isShuffle = usePlayerStore(s => s.isShuffle);
  const shuffleOrder = usePlayerStore(s => s.shuffleOrder);
  const shuffleCursor = usePlayerStore(s => s.shuffleCursor);
  
  const playSong = usePlayerStore(s => s.playSong);
  const removeFromQueue = usePlayerStore(s => s.removeFromQueue);
  const moveQueueItem = usePlayerStore(s => s.moveQueueItem);

  const translatedLyrics = usePlayerStore(s => s.translatedLyrics);
  const isTranslationLoading = usePlayerStore(s => s.isTranslationLoading);
  const showTranslation = usePlayerStore(s => s.showTranslation);
  const setTranslationActive = usePlayerStore(s => s.setTranslationActive);
  const targetLanguage = usePlayerStore(s => s.targetLanguage);
  const detectedLanguage = usePlayerStore(s => s.detectedLanguage);
  const translateCurrentLyrics = usePlayerStore(s => s.translateCurrentLyrics);

  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const langMenuRef = useRef(null);
  const lyricsContainerRef = useRef(null);

  const safeLyrics = Array.isArray(lyrics) ? lyrics : [];
  const activeLyricIndex = safeLyrics.findIndex((l, i) => { 
    const nextTime = safeLyrics[i + 1]?.time || Infinity; 
    return currentTime >= l.time && currentTime < nextTime; 
  });

  const displayList = React.useMemo(() => {
    if (isShuffle && shuffleOrder.length === queue.length) {
      return shuffleOrder.map((originalIndex, displayIdx) => ({
        song: queue[originalIndex],
        originalIndex: originalIndex,
        displayIndex: displayIdx,
        isPlayingNow: displayIdx === shuffleCursor
      }));
    }
    return queue.map((song, idx) => ({
      song,
      originalIndex: idx,
      displayIndex: idx,
      isPlayingNow: idx === currentIndex
    }));
  }, [queue, isShuffle, shuffleOrder, shuffleCursor, currentIndex]);

  // GELİŞTİRİLMİŞ GERÇEK VE MUTLAK DİKEY HİZALAMA MOTORU (Panel Üstü ile Player Bar Hizalaması)
  useEffect(() => {
    if (activeLyricIndex !== -1 && lyricsContainerRef.current && activeTab === 'lyrics') {
      const container = lyricsContainerRef.current;
      const activeEl = container.querySelector('.lyric-line.active');
      
      if (activeEl) {
        let scrollPos = 0;
        let targetCenterY = 0;
        
        if (isPanelFullscreen) {
          // Tam ekran modunda dikey ortalama
          targetCenterY = window.innerHeight / 2;
        } else {
          // Dikey panel modu: panel üstü ile player barın başladığı yer arası dikey merkez bulunur.
          const playerBarHeight = window.innerWidth < 768 ? 0 : 90;
          targetCenterY = (window.innerHeight - playerBarHeight) / 2;
        }

        // Aktif olan satırın ekran üzerindeki dikey merkezi hesaplanır
        const currentElementCenterY = activeEl.getBoundingClientRect().top + (activeEl.clientHeight / 2);
        
        // Mevcut kaydırma konumuna dikey hizalama elde edilir
        scrollPos = container.scrollTop + (currentElementCenterY - targetCenterY);
        
        container.scrollTo({ top: scrollPos, behavior: 'smooth' });
      }
    }
  }, [activeLyricIndex, isLyricsExpanded, activeTab, isLandscapeWide, isPanelFullscreen, shouldExpandLyricsLayout]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setIsLangMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleTranslateToggle = (e) => {
    e.stopPropagation();
    if (translatedLyrics.length > 0) {
      setTranslationActive(!showTranslation);
    } else {
      translateCurrentLyrics(targetLanguage);
    }
  };

  const handleLanguageSelect = (langCode, e) => {
    e.stopPropagation();
    setIsLangMenuOpen(false);
    translateCurrentLyrics(langCode);
  };

  return (
    <div className={`lyrics-card ${isLyricsExpanded ? 'expanded' : ''}`} onTouchStart={(e) => e.stopPropagation()}>
      <div className="lyrics-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', marginBottom: '15px' }}>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <span 
            onClick={() => setActiveTab('lyrics')}
            style={{ 
              fontSize: '18px', 
              fontWeight: '700', 
              cursor: 'pointer', 
              color: activeTab === 'lyrics' ? 'white' : 'var(--text-muted)',
              borderBottom: activeTab === 'lyrics' ? '3px solid var(--accent)' : '3px solid transparent',
              paddingBottom: '4px',
              transition: 'all 0.2s'
            }}
          >
            Sözler
          </span>
          <span 
            onClick={() => setActiveTab('queue')}
            style={{ 
              fontSize: '18px', 
              fontWeight: '700', 
              cursor: 'pointer', 
              color: activeTab === 'queue' ? 'white' : 'var(--text-muted)',
              borderBottom: activeTab === 'queue' ? '3px solid var(--accent)' : '3px solid transparent',
              paddingBottom: '4px',
              transition: 'all 0.2s'
            }}
          >
            Sıra
          </span>
        </div>

        <button className="icon-btn" onClick={() => setIsLyricsExpanded(!isLyricsExpanded)}>
          {isLyricsExpanded ? <MdCloseFullscreen size={20} color="white" /> : <MdOpenInFull size={20} color="white" />}
        </button>
      </div>

      {/* SÖZLER SEKME İÇERİĞİ */}
      {activeTab === 'lyrics' && (
        <>
          {safeLyrics.length > 0 && !isLyricsLoading && lyrics[0]?.text !== "✦ Enstrümantal ✦" && (
            <div ref={langMenuRef} className="translate-control-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '15px', flexShrink: 0 }}>
              <button 
                className={`icon-btn translate-btn ${showTranslation ? 'active' : ''}`} 
                onClick={handleTranslateToggle}
                title="Şarkı Sözlerini Çevir"
                style={{ 
                  padding: '5px', 
                  borderRadius: '50%', 
                  background: showTranslation ? 'rgba(255, 42, 84, 0.15)' : 'transparent',
                  color: showTranslation ? 'var(--accent)' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  cursor: 'pointer'
                }}
              >
                <MdTranslate size={18} />
              </button>
              
              <div 
                className="lang-badge" 
                onClick={(e) => { e.stopPropagation(); setIsLangMenuOpen(!isLangMenuOpen); }}
                style={{
                  fontSize: '11px',
                  fontWeight: 'bold',
                  background: 'rgba(255,255,255,0.08)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  userSelect: 'none',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              >
                <span>{detectedLanguage} ➜ {targetLanguage.toUpperCase()}</span>
                <MdArrowDropDown size={14} />
              </div>

              {isLangMenuOpen && (
                <div 
                  className="custom-dropdown-menu lang-dropdown"
                  style={{
                    position: 'absolute',
                    top: '110%',
                    left: 0,
                    background: '#282828',
                    borderRadius: '8px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                    padding: '4px 0',
                    zIndex: 100,
                    minWidth: '120px',
                    border: '1px solid rgba(255,255,255,0.08)'
                  }}
                >
                  {[
                    { code: 'tr', name: 'Türkçe' },
                    { code: 'en', name: 'English' },
                    { code: 'de', name: 'Deutsch' },
                    { code: 'fr', name: 'Français' },
                    { code: 'es', name: 'Español' }
                  ].map(lang => (
                    <div 
                      key={lang.code}
                      className={`dropdown-item ${targetLanguage === lang.code ? 'active' : ''}`}
                      onClick={(e) => handleLanguageSelect(lang.code, e)}
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        color: targetLanguage === lang.code ? 'var(--accent)' : 'var(--text-muted)'
                      }}
                    >
                      {lang.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div 
            className="lyrics-content" 
            ref={lyricsContainerRef} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              paddingBottom: '60vh',
              flex: isLyricsExpanded ? '1 1 0%' : 'unset',
              maxHeight: isLyricsExpanded ? '100%' : '40vh',
              overflowY: 'auto'
            }}
          >
            {isLyricsLoading ? (
              <div className="lyrics-placeholder">Sözler aranıyor...</div>
            ) : isTranslationLoading ? (
              <div className="lyrics-placeholder">Sözler çevriliyor...</div>
            ) : safeLyrics.length > 0 ? (
              safeLyrics.map((line, idx) => {
                const isLineActive = idx === activeLyricIndex;
                const translatedLine = translatedLyrics[idx]?.text;

                return (
                  <div 
                    key={idx} 
                    className={`lyric-line ${isLineActive ? 'active' : ''}`} 
                    onClick={() => seekTo(line.time)}
                  >
                    <div>{line.text}</div>
                    
                    {showTranslation && translatedLine && translatedLine !== line.text && (
                      <div 
                        className="lyric-translation"
                        style={{
                          fontSize: '0.7em', 
                          fontWeight: '500', 
                          opacity: isLineActive ? 0.85 : 0.6,
                          marginTop: '4px',
                          lineHeight: '1.25',
                          display: 'block',
                          color: isLineActive ? 'white' : 'rgba(255,255,255,0.4)',
                          transform: 'none'
                        }}
                      >
                        {translatedLine}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="lyrics-placeholder">Bu şarkı için söz bulunamadı.</div>
            )}
          </div>
        </>
      )}

      {/* SIRADAKİ ŞARKILAR (QUEUE) SEKME İÇERİĞİ */}
      {activeTab === 'queue' && (
        <div 
          className="lyrics-content" 
          style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px', 
            overflowY: 'auto',
            flex: isLyricsExpanded ? '1 1 0%' : 'unset',
            maxHeight: isLyricsExpanded ? '100%' : '40vh'
          }}
        >
          {displayList.map((item) => {
            const displayThumb = (item.song.thumbnail || '').replace('hqdefault.jpg', 'mqdefault.jpg').replace('sddefault.jpg', 'mqdefault.jpg');
            return (
              <div 
                key={`${item.song.id}-${item.displayIndex}`} 
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                  background: item.isPlayingNow ? 'rgba(255, 42, 84, 0.08)' : 'rgba(255,255,255,0.03)',
                  borderRadius: '10px', border: item.isPlayingNow ? '1px solid rgba(255, 42, 84, 0.25)' : '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => playSong(item.song, queue, item.originalIndex, false, true)}
              >
                <img 
                  src={displayThumb || '/icon.png'} 
                  alt={item.song.title} 
                  style={{ width: '44px', height: '44px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} 
                />
                <div style={{ flex: 1, overflow: 'hidden', textAlign: 'left' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: item.isPlayingNow ? 'var(--accent)' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.song.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>{item.song.channel}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
                  <button 
                    disabled={item.displayIndex === 0} 
                    onClick={() => moveQueueItem(item.displayIndex, 'up')}
                    style={{ background: 'transparent', border: 'none', color: item.displayIndex === 0 ? '#444' : 'var(--text-muted)', cursor: item.displayIndex === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px' }}
                  >
                    ▲
                  </button>
                  <button 
                    disabled={item.displayIndex === queue.length - 1} 
                    onClick={() => moveQueueItem(item.displayIndex, 'down')}
                    style={{ background: 'transparent', border: 'none', color: item.displayIndex === queue.length - 1 ? '#444' : 'var(--text-muted)', cursor: item.displayIndex === queue.length - 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px' }}
                  >
                    ▼
                  </button>
                  <button 
                    onClick={() => removeFromQueue(item.originalIndex)}
                    style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', marginLeft: '4px' }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
          {displayList.length === 0 && (
            <div className="lyrics-placeholder">Sırada şarkı bulunmuyor.</div>
          )}
        </div>
      )}
    </div>
  );
};

const NowPlayingPanel = () => {
  const navigate = useNavigate();
  
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

  // REAKTİF YÖN / EKRAN BOYUTU TAKİPÇİSİ
  const [isLandscapeWide, setIsLandscapeWide] = useState(
    window.innerWidth >= 800 && (window.innerWidth / window.innerHeight >= 1.2)
  );

  useEffect(() => {
    const handleResize = () => {
      setIsLandscapeWide(
        window.innerWidth >= 800 && (window.innerWidth / window.innerHeight >= 1.2)
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  // Dikey modda veya sidebar modundayken sol sütunun gizlenerek sözlerin genişlemesini sağlayan akıllı reaktif koşul
  const shouldExpandLyricsLayout = isLyricsExpanded && !(isPanelFullscreen && isLandscapeWide);

  return (
    <aside className={`now-playing-panel ${isPanelOpen ? 'open' : ''} ${isPanelFullscreen ? 'fullscreen' : ''}`}>
      <div className="ambient-bg">
        <div className="ambient-blob color-1" style={{ backgroundColor: ambientColors[0] }}></div>
        <div className="ambient-blob color-2" style={{ backgroundColor: ambientColors[1] }}></div>
        <div className="ambient-blob color-3" style={{ backgroundColor: ambientColors[2] }}></div>
        <div className="ambient-blob color-4" style={{ backgroundColor: ambientColors[3] }}></div>
      </div>
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

      <div className={`panel-scroll-area ${shouldExpandLyricsLayout ? 'lyrics-expanded-active' : ''}`}>
        
        <div className={`panel-left-column ${shouldExpandLyricsLayout ? 'hidden-for-lyrics' : ''}`}>
          
          <div className="panel-artwork-container">
            <YouTubeEngine />
            <img 
              src={imgSrc || '/icon.png'} 
              alt="cover" 
              className="panel-artwork" 
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

        <LyricsPanelSection 
          isLyricsExpanded={isLyricsExpanded} 
          setIsLyricsExpanded={setIsLyricsExpanded} 
          isLandscapeWide={isLandscapeWide}
          shouldExpandLyricsLayout={shouldExpandLyricsLayout}
        />

      </div>

      {/* SÖZLER GENİŞLETİLDİĞİNDE EN ALTTA SABİT KALAN BULLETPROOF REAKTİF KONTROLLER */}
      {shouldExpandLyricsLayout && (
        <div className="lyrics-expanded-controls">
          <PanelProgress />
          <div className="lyrics-expanded-buttons">
            <button className="icon-btn" onClick={playPrev}><MdSkipPrevious size={32} color="white" /></button>
            <button className="play-pause-btn" onClick={togglePlay} style={{ width: '48px', height: '48px', background: 'white', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none', cursor: 'pointer' }}>
              {isPlaying ? <MdPause size={30} color="black" /> : <MdPlayArrow size={30} color="black" />}
            </button>
            <button className="icon-btn" onClick={playNext}><MdSkipNext size={32} color="white" /></button>
          </div>
        </div>
      )}

    </aside>
  );
};

export default NowPlayingPanel;