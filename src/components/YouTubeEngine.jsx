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

  const opts = useMemo(() => ({
    height: '100%', width: '100%', 
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
  }), []);

  // Oynatıcıyı Merkeze Kaydetme (Artık hep sabit olduğu için anında kaydolacak)
  useEffect(() => {
    if (audioRef.current) setHtml5PlayerRef(audioRef.current);
  }, [setHtml5PlayerRef]);

  // Bildirim ve Kilit Ekranı Kontrolleri
  useEffect(() => {
    if ('mediaSession' in navigator && currentSong) {
      const localData = downloadedSongs[currentSong.id];
      const displayThumb = localData?.localThumbUrl || currentSong.thumbnail;

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
  }, [currentSong, togglePlay, playPrev, playNext, downloadedSongs]);

  const onReady = (event) => { setPlayerRef(event.target); event.target.setVolume(100); };
  
  const onStateChange = (event) => {
    const { activeEngine: currentEngine } = usePlayerStore.getState();
    const player = event.target;
    
    // Eğer Offline veya Local çalıyorsa, YouTube kafasına göre oynayamasın!
    if (currentEngine !== 'youtube') {
      if (event.data === 1 || event.data === 3) player.pauseVideo(); 
      return; 
    }
    
    if (event.data === 1) { 
      setPlaying(true); setDuration(player.getDuration());
      if (progressInterval.current) clearInterval(progressInterval.current);
      progressInterval.current = setInterval(() => setCurrentTime(player.getCurrentTime()), 1000);
    } else if (event.data === 2) { 
      setPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
    }
  };
  
  const onEnd = () => { 
    if (usePlayerStore.getState().activeEngine === 'youtube') playNext(); 
  };
  const onError = () => { 
    if (usePlayerStore.getState().activeEngine === 'youtube') playNext(); 
  };

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

  useEffect(() => { return () => { if (progressInterval.current) clearInterval(progressInterval.current); }; }, []);

  return (
    <div style={{ 
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
      opacity: (isVideoMode && activeEngine === 'youtube') ? 1 : 0.01, 
      pointerEvents: 'none',
      zIndex: (isVideoMode && activeEngine === 'youtube') ? 5 : -1,
      borderRadius: '8px', overflow: 'hidden'
    }}>
      {/* Youtube Videosu (İhtiyaca Göre Ekrana Çıkar) */}
      {currentSong && (
        <YouTube 
          videoId={currentSong.id} 
          opts={opts} 
          onReady={onReady} onStateChange={onStateChange} onEnd={onEnd} onError={onError} 
          className="youtube-react-wrapper" 
          iframeClassName="youtube-video-fill" 
        />
      )}
      
      {/* YEREL SES MOTORU (ARTIK HEP SABİT!) Durdur/Başlat gibi butonların bozulmasını önler. */}
      <audio 
        ref={audioRef}
        onPlay={onAudioPlay}
        onPause={onAudioPause}
        onEnded={onAudioEnded}
        onTimeUpdate={onAudioTimeUpdate}
        onLoadedMetadata={onAudioLoadedMetadata}
        style={{ display: 'none' }}
      />
    </div>
  );
};

export default YouTubeEngine;