import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdPlayArrow, MdFavorite, MdTrendingUp, MdPublic } from 'react-icons/md';
import usePlayerStore from '../store/usePlayerStore';
import useAuthStore from '../store/useAuthStore';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';

const Home = () => {
  // ZUSTAND OPTİMİZASYONU: Kasmaları engeller!
  const playSong = usePlayerStore(s => s.playSong);
  const currentSong = usePlayerStore(s => s.currentSong);
  const likedSongs = usePlayerStore(s => s.likedSongs);
  
  const user = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);
  
  const navigate = useNavigate();

  const [recentSongs, setRecentSongs] = useState([]);

  useEffect(() => {
    if (!user) return;
    const songsUnsub = onValue(ref(db, `users/${user.uid}/recentSongs`), (snap) => {
      if (snap.exists()) setRecentSongs(snap.val().reverse());
    });
    return () => songsUnsub();
  }, [user]);

  return (
    <div className="home-page">
      <h1 className="page-title">İyi Günler {profile ? profile.username : ''}</h1>
      
      <div className="home-grid" style={{ marginBottom: '40px' }}>
        <div className="home-card" style={{ background: 'linear-gradient(135deg, #FF2A54, #8b0021)' }} onClick={() => navigate('/playlist/liked')}>
          <div className="card-thumb-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'transparent', boxShadow: 'none' }}>
            <MdFavorite size={64} color="white" />
          </div>
          <div className="card-title" style={{ fontSize: '16px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Beğenilen Şarkılar</div>
          <div className="card-subtitle" style={{ color: 'rgba(255,255,255,0.8)' }}>{likedSongs.length} Şarkı</div>
        </div>

        <div className="home-card" style={{ background: 'linear-gradient(135deg, #ff8038, #ffb347)' }} onClick={() => navigate('/playlist/trend_tr')}>
          <div className="card-thumb-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'transparent', boxShadow: 'none' }}>
            <MdTrendingUp size={64} color="white" />
          </div>
          <div className="card-title" style={{ fontSize: '16px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Türkiye Trendleri</div>
          <div className="card-subtitle" style={{ color: 'rgba(255,255,255,0.8)' }}>Top 50 Müzik</div>
        </div>

        <div className="home-card" style={{ background: 'linear-gradient(135deg, #00C6FF, #0072FF)' }} onClick={() => navigate('/playlist/trend_global')}>
          <div className="card-thumb-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'transparent', boxShadow: 'none' }}>
            <MdPublic size={64} color="white" />
          </div>
          <div className="card-title" style={{ fontSize: '16px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Global Trendler</div>
          <div className="card-subtitle" style={{ color: 'rgba(255,255,255,0.8)' }}>Dünya Sıralaması</div>
        </div>
      </div>

      <h3 style={{ fontSize: '20px', color: 'white', marginBottom: '15px', fontWeight: 'bold' }}>Yakın Zamanda Çalınanlar</h3>
      {recentSongs.length === 0 ? (
        <div style={{ color: 'gray' }}>Geçmişin boş. Müzik dinlemeye başla!</div>
      ) : (
        <div className="home-grid">
          {recentSongs.map((song, index) => (
            <div key={`${song.id}-${index}`} className="home-card" onClick={() => playSong(song, recentSongs, index)}>
              <div className="card-thumb-wrapper">
                <img src={song.thumbnail} alt={song.title} />
                <div className="play-overlay" style={{ opacity: currentSong?.id === song.id ? 1 : '' }}>
                  <MdPlayArrow size={28} color={currentSong?.id === song.id ? "var(--accent)" : "white"} />
                </div>
              </div>
              <div className="card-title" style={{ color: currentSong?.id === song.id ? 'var(--accent)' : 'white' }}>{song.title}</div>
              <div className="card-subtitle">{song.channel}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Home;