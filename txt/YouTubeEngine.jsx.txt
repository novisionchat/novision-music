import React, { useEffect, useRef, useMemo } from 'react';
import YouTube from 'react-youtube';
import usePlayerStore from '../store/usePlayerStore';

const YouTubeEngine = () => {
  const { 
    currentSong, setPlayerRef, setHtml5PlayerRef, setPlaying, 
    setCurrentTime, setDuration, playNext, playPrev, togglePlay, 
    isVideoMode, activeEngine, downloadedSongs 
  } = usePlayerStore();
  
  const progressInterval = useRef(null);
  const audioRef = useRef(null);

  // YouTube Ayarları (Sadece bir kez yüklenmesi için memoize edildi)
  const opts = useMemo(() => ({
    height: '100%', width: '100%', 
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
  }), []);

  // HTML5 Motorunu (Audio) Mount edildiğinde Store'a kaydet
  useEffect(() => {
    if (audioRef.current) {
      setHtml5PlayerRef(audioRef.current);
    }
  }, [setHtml5PlayerRef]);

  // Media Session (Arka Plan ve Kilit Ekranı Kontrolleri)
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      const localData = downloadedSongs[currentSong.id];
      const displayThumb = (activeEngine === 'html5' && localData?.localThumbUrl) ? localData.localThumbUrl : currentSong.thumbnail;

      navigator.mediaSession.metadata = new MediaMetadata({ 
        title: currentSong.title, 
        artist: currentSong.channel, 
        artwork: [{ src: displayThumb, sizes: '512x512', type: 'image/jpeg' }] 
      });
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', playPrev);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
    }
  }, [currentSong, togglePlay, playPrev, playNext, activeEngine, downloadedSongs]);

  // ==========================================
  // --- YOUTUBE MOTORU EVENTLERİ ---
  // ==========================================
  const onReady = (event) => { setPlayerRef(event.target); event.target.setVolume(100); };
  const onStateChange = (event) => {
    if (activeEngine !== 'youtube') return; // Eğer yerel dosya çalıyorsa YT eventlerini görmezden gel
    const player = event.target;
    if (event.data === 1) { 
      setPlaying(true); setDuration(player.getDuration());
      if (progressInterval.current) clearInterval(progressInterval.current);
      progressInterval.current = setInterval(() => setCurrentTime(player.getCurrentTime()), 1000);
    } else { 
      setPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    }
  };
  const onEnd = () => { if (activeEngine === 'youtube') playNext(); };
  const onError = () => { if (activeEngine === 'youtube') playNext(); };

  // ==========================================
  // --- HTML5 MOTORU EVENTLERİ ---
  // ==========================================
  const onAudioPlay = () => { if (activeEngine === 'html5') setPlaying(true); };
  const onAudioPause = () => { if (activeEngine === 'html5') setPlaying(false); };
  const onAudioEnded = () => { if (activeEngine === 'html5') playNext(); };
  const onAudioTimeUpdate = () => {
    if (activeEngine !== 'html5' || !audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };
  const onAudioLoadedMetadata = () => {
    if (activeEngine !== 'html5' || !audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  // HTML5 Motoru Kaynak (URL) Ataması ve Otomatik Başlatma
  useEffect(() => {
    if (activeEngine === 'html5' && currentSong && audioRef.current) {
      const localData = downloadedSongs[currentSong.id];
      if (localData && localData.localAudioUrl) {
        // Gereksiz reload atmamak için önce src değişmiş mi kontrol et
        if (audioRef.current.src !== localData.localAudioUrl) {
          audioRef.current.src = localData.localAudioUrl;
          audioRef.current.load();
        }
        audioRef.current.play().catch(e => console.error("Çevrimdışı oynatma hatası:", e));
      }
    }
  }, [currentSong, activeEngine, downloadedSongs]);

  useEffect(() => { return () => { if (progressInterval.current) clearInterval(progressInterval.current); }; }, []);

  return (
    <div style={{ 
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
      opacity: (isVideoMode && activeEngine === 'youtube') ? 1 : 0.01, 
      pointerEvents: 'none',
      zIndex: (isVideoMode && activeEngine === 'youtube') ? 5 : -1,
      borderRadius: '8px', overflow: 'hidden'
    }}>
      {currentSong && (
        <>
          <YouTube 
            videoId={currentSong.id} 
            opts={opts} 
            onReady={onReady} onStateChange={onStateChange} onEnd={onEnd} onError={onError} 
            className="youtube-react-wrapper" 
            iframeClassName="youtube-video-fill" 
          />
          {/* ÇİFT MOTORUN GİZLİ KAHRAMANI: HTML5 AUDIO */}
          <audio 
            ref={audioRef}
            onPlay={onAudioPlay}
            onPause={onAudioPause}
            onEnded={onAudioEnded}
            onTimeUpdate={onAudioTimeUpdate}
            onLoadedMetadata={onAudioLoadedMetadata}
            style={{ display: 'none' }}
          />
        </>
      )}
    </div>
  );
};

export default YouTubeEngine;