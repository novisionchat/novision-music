import React, { useEffect, useRef, useState, useMemo } from 'react';
import YouTube from 'react-youtube';
import usePlayerStore from '../store/usePlayerStore';

const YouTubeEngine = () => {
  const { 
    currentSong, setPlayerRef, setHtml5PlayerRef, setPlaying, 
    setCurrentTime, setDuration, playNext, playPrev, togglePlay, 
    isVideoMode, activeEngine, downloadedSongs, isOfflineMode, currentTime
  } = usePlayerStore();
  
  const progressInterval = useRef(null);
  const audioRef = useRef(null);
  const [ytReady, setYtReady] = useState(!!(window.YT && window.YT.Player));

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtReady(true);
      return;
    }

    const checkInterval = setInterval(() => {
      if (window.YT && window.YT.Player) {
        setYtReady(true);
        clearInterval(checkInterval);
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, []);

  const opts = useMemo(() => ({
    height: '100%', width: '100%', 
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, mute: 1 },
  }), []);

  useEffect(() => {
    if (audioRef.current) setHtml5PlayerRef(audioRef.current);
  }, [setHtml5PlayerRef]);

  // Arka Plan/iOS PWA için Medya Bildirim Desteği (Tam Çözünürlüklü Resimler ve Butonlar)
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      const localData = downloadedSongs[currentSong.id];
      const displayThumb = localData?.localThumbUrl || currentSong.thumbnail;

      navigator.mediaSession.metadata = new MediaMetadata({ 
        title: currentSong.title, 
        artist: currentSong.channel, 
        artwork: [
          { src: displayThumb, sizes: '96x96', type: 'image/jpeg' },
          { src: displayThumb, sizes: '128x128', type: 'image/jpeg' },
          { src: displayThumb, sizes: '256x256', type: 'image/jpeg' },
          { src: displayThumb, sizes: '512x512', type: 'image/jpeg' }
        ] 
      });
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('previoustrack', playPrev);
      navigator.mediaSession.setActionHandler('nexttrack', playNext);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
         usePlayerStore.getState().seekTo(details.seekTime);
      });
    }
  }, [currentSong, togglePlay, playPrev, playNext, downloadedSongs]);

  // Görsel Senkronizasyon Döngüsü: Videonun Ses Motoruna Ayak Uydurmasını Sağlar (Sadece Arka Planda)
  useEffect(() => {
    let syncInterval;
    if (activeEngine === 'html5') {
      syncInterval = setInterval(() => {
        const state = usePlayerStore.getState();
        const ytPlayer = state.playerRef;
        if (state.isVideoMode && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
           const ytTime = ytPlayer.getCurrentTime() || 0;
           const storeTime = state.currentTime;
           if (Math.abs(ytTime - storeTime) > 2) {
             ytPlayer.seekTo(storeTime, true);
           }
        }
      }, 2000);
    }
    return () => clearInterval(syncInterval);
  }, [activeEngine]);

  const onReady = (event) => { 
    setPlayerRef(event.target); 
    const currentEngine = usePlayerStore.getState().activeEngine;
    if (currentEngine === 'html5') {
       event.target.mute();
    } else {
       event.target.unMute();
       event.target.setVolume(usePlayerStore.getState().volume || 100); 
    }
  };
  
  const onStateChange = (event) => {
    const { activeEngine: currentEngine } = usePlayerStore.getState();
    const player = event.target;

    if (currentEngine === 'html5') {
      player.mute();
      return;
    }

    if (currentEngine !== 'youtube') return; 
    
    player.unMute();
    player.setVolume(usePlayerStore.getState().volume || 100);

    if (event.data === 1) { 
      setPlaying(true); setDuration(player.getDuration());
      if (progressInterval.current) clearInterval(progressInterval.current);
      progressInterval.current = setInterval(() => setCurrentTime(player.getCurrentTime()), 1000);
    } else if (event.data === 2) { 
      setPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    }
  };
  
  const onEnd = () => { if (usePlayerStore.getState().activeEngine === 'youtube') playNext(); };
  const onError = () => { if (usePlayerStore.getState().activeEngine === 'youtube') playNext(); };

  const onAudioPlay = () => { if (usePlayerStore.getState().activeEngine === 'html5') setPlaying(true); };
  const onAudioPause = () => { if (usePlayerStore.getState().activeEngine === 'html5') setPlaying(false); };
  const onAudioEnded = () => { if (usePlayerStore.getState().activeEngine === 'html5') playNext(); };
  
  const onAudioTimeUpdate = () => {
    if (usePlayerStore.getState().activeEngine !== 'html5' || !audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  };
  const onAudioLoadedMetadata = () => {
    if (usePlayerStore.getState().activeEngine !== 'html5' || !audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  // SES AKIŞI HATA VERDİĞİNDE ANINDA YOUTUBE PLAYER'A DÖNEN ACİL DURUM KANCASI
  const onAudioError = () => {
    const state = usePlayerStore.getState();
    if (state.activeEngine === 'html5' && navigator.onLine && !downloadedSongs[state.currentSong?.id]) {
       console.warn("Ses akışında hata oluştu. Varsayılan oynatıcıya geçiliyor...");
       state.setFallbackToYoutube();
    }
  };

  useEffect(() => { return () => { if (progressInterval.current) clearInterval(progressInterval.current); }; }, []);

  return (
    <div style={{ 
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
      opacity: (isVideoMode && activeEngine === 'youtube') ? 1 : 0.01, 
      pointerEvents: 'none',
      zIndex: (isVideoMode && activeEngine === 'youtube') ? 5 : -1,
      borderRadius: '8px', overflow: 'hidden'
    }}>
      {currentSong && ytReady && (
        <YouTube 
          key={`yt-engine-${currentSong.id}-${isOfflineMode ? 'off' : 'on'}`} 
          videoId={currentSong.id} 
          opts={opts} 
          onReady={onReady} onStateChange={onStateChange} onEnd={onEnd} onError={onError} 
          className="youtube-react-wrapper" 
          iframeClassName="youtube-video-fill" 
        />
      )}
      {/* HTML5 Audio üzerinde CORS preflight engelini kaldırmak için crossOrigin tamamen silindi */}
      <audio 
        ref={audioRef}
        onPlay={onAudioPlay}
        onPause={onAudioPause}
        onEnded={onAudioEnded}
        onTimeUpdate={onAudioTimeUpdate}
        onLoadedMetadata={onAudioLoadedMetadata}
        onError={onAudioError}
        style={{ display: 'none' }}
        playsInline
        preload="auto"
      />
    </div>
  );
};

export default YouTubeEngine;