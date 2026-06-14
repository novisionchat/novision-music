import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdPlayArrow, MdQueueMusic } from 'react-icons/md';
import usePlayerStore from '../store/usePlayerStore';
import useAuthStore from '../store/useAuthStore';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';

const Home = () => {
  const { playSong, currentSong } = usePlayerStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [recentSongs, setRecentSongs] = useState([]);
  const [recentPlaylist, setRecentPlaylist] = useState(null);

  useEffect(() => {
    if (!user) return;
    
    // Veritabanından Son Şarkıları Çek
    const songsUnsub = onValue(ref(db, `users/${user.uid}/recentSongs`), (snap) => {
      if (snap.exists()) setRecentSongs(snap.val().reverse());
    });

    // Veritabanından Son Çalınan Listeyi Çek
    const playlistUnsub = onValue(ref(db, `users/${user.uid}/recentPlaylist`), (snap) => {
      if (snap.exists()) setRecentPlaylist(snap.val());
    });

    return () => { songsUnsub(); playlistUnsub(); };
  }, [user]);

  if (!user) return <div style={{ padding: '20px', color: 'gray' }}>Geçmişi görmek için giriş yapmalısın.</div>;

  return (
    <div className="home-page">
      <h1 className="page-title">Ana Sayfa</h1>
      
      {/* SON DİNLENEN PLAYLIST (Eğer varsa) */}
      {recentPlaylist && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ fontSize: '18px', color: 'white', marginBottom: '15px' }}>Son Çalınan Liste</h3>
          <div className="home-card" style={{ maxWidth: '200px' }} onClick={() => navigate(`/playlist/${recentPlaylist.id}`)}>
            <div className="card-thumb-wrapper">
              <img src={recentPlaylist.thumbnail} alt="playlist" />
              <div className="play-overlay"><MdPlayArrow size={32} color="white" /></div>
            </div>
            <div className="card-title">{recentPlaylist.name}</div>
          </div>
        </div>
      )}

      {/* SON DİNLENEN ŞARKILAR */}
      <h3 style={{ fontSize: '18px', color: 'white', marginBottom: '15px' }}>Yakın Zamanda Çalınanlar</h3>
      {recentSongs.length === 0 ? (
        <div style={{ color: 'gray' }}>Henüz geçmişin boş.</div>
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