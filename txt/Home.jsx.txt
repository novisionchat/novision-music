import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdPlayArrow, MdFavorite, MdTrendingUp, MdPublic, MdMoreVert } from 'react-icons/md';
import usePlayerStore from '../store/usePlayerStore';
import useAuthStore from '../store/useAuthStore';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';

const Home = () => {
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
    <div className="home-page" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h1 className="page-title" style={{ marginBottom: '25px' }}>İyi Günler {profile ? profile.username : ''}</h1>
      
      <div 
        className="pinned-playlists-vertical" 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px', 
          marginBottom: '40px' 
        }}
      >
        
        <div 
          onClick={() => navigate('/playlist/liked')}
          style={{
            display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)', padding: '12px 18px', borderRadius: '12px',
            cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', height: '74px'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.transform = 'translateX(6px)';
            e.currentTarget.style.borderColor = 'rgba(255,42,84,0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
          }}
        >
          <div style={{ width: '50px', height: '50px', borderRadius: '8px', background: 'linear-gradient(135deg, #FF2A54, #8b0021)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
            <MdFavorite size={28} color="white" />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'white' }}>Beğenilen Şarkılar</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{likedSongs.length} Şarkı • Sizin için özel koleksiyon</span>
          </div>
        </div>

        <div 
          onClick={() => navigate('/playlist/trend_tr')}
          style={{
            display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)', padding: '12px 18px', borderRadius: '12px',
            cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', height: '74px'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.transform = 'translateX(6px)';
            e.currentTarget.style.borderColor = 'rgba(255,128,56,0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
          }}
        >
          <div style={{ width: '50px', height: '50px', borderRadius: '8px', background: 'linear-gradient(135deg, #ff8038, #ffb347)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
            <MdTrendingUp size={28} color="white" />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'white' }}>Türkiye Trendleri</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ülke genelinde en çok dinlenen popüler müzikler</span>
          </div>
        </div>

        <div 
          onClick={() => navigate('/playlist/trend_global')}
          style={{
            display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)', padding: '12px 18px', borderRadius: '12px',
            cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)', height: '74px'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
            e.currentTarget.style.transform = 'translateX(6px)';
            e.currentTarget.style.borderColor = 'rgba(0,198,255,0.3)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
            e.currentTarget.style.transform = 'translateX(0)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
          }}
        >
          <div style={{ width: '50px', height: '50px', borderRadius: '8px', background: 'linear-gradient(135deg, #00C6FF, #0072FF)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
            <MdPublic size={28} color="white" />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '15px', fontWeight: 'bold', color: 'white' }}>Global Trendler</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Dünya genelinde kulaktan kulağa yayılan hit şarkılar</span>
          </div>
        </div>

      </div>

      <h3 style={{ fontSize: '20px', color: 'white', marginBottom: '15px', fontWeight: 'bold' }}>Yakın Zamanda Çalınanlar</h3>
      {recentSongs.length === 0 ? (
        <div style={{ color: 'gray' }}>Geçmişin boş. Müzik dinlemeye başla!</div>
      ) : (
        <div className="home-grid">
          {recentSongs.map((song, index) => {
             // FOTOĞRAF DÜZELTMESİ EKLENDİ
             const displayThumb = (song.thumbnail || '').replace('hqdefault.jpg', 'mqdefault.jpg').replace('sddefault.jpg', 'mqdefault.jpg');
             return (
              <div key={`${song.id}-${index}`} className="home-card" onClick={() => playSong(song, recentSongs, index)}>
                <div className="card-thumb-wrapper">
                  <img src={displayThumb} alt={song.title} />
                  <div className="play-overlay" style={{ opacity: currentSong?.id === song.id ? 1 : '' }}>
                    <MdPlayArrow size={28} color={currentSong?.id === song.id ? "var(--accent)" : "white"} />
                  </div>
                </div>
                <div className="card-title" style={{ color: currentSong?.id === song.id ? 'var(--accent)' : 'white' }}>{song.title}</div>
                <div className="card-subtitle">{song.channel}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Home;