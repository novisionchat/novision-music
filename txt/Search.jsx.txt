import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdSearch, MdPlayArrow, MdPlaylistAdd, MdClose, MdSync } from 'react-icons/md';
import usePlayerStore from '../store/usePlayerStore';
import useAuthStore from '../store/useAuthStore';
import { db } from '../firebase';
import { ref, get, set } from 'firebase/database';

const Search = () => {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  
  const playSong = usePlayerStore(s => s.playSong);
  const currentSong = usePlayerStore(s => s.currentSong);
  const openAddModal = usePlayerStore(s => s.openAddModal);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  
  useEffect(() => {
    if (!user) return;
    get(ref(db, `users/${user.uid}/recentSearches`)).then((snap) => {
      if (snap.exists()) setRecentSearches(snap.val());
    });
  }, [user]);

  const saveToHistory = (item) => {
    if (!user) return;
    const isObj = typeof item === 'object';
    const queryStr = isObj ? item.name : item;
    
    let updated = recentSearches.filter(x => {
      if (typeof x === 'object') return x.name !== queryStr;
      return x !== queryStr;
    });

    updated = [item, ...updated].slice(0, 8);
    setRecentSearches(updated);
    set(ref(db, `users/${user.uid}/recentSearches`), updated);
  };

  const handleSearch = async (e, directQuery = null) => {
    if (e) e.preventDefault();
    const q = directQuery || query;
    if (!q.trim()) return;

    if (q.includes('/playlist/')) {
      try {
        const urlObj = new URL(q);
        if (urlObj.pathname.includes('/playlist/')) {
          navigate(urlObj.pathname + urlObj.search);
          return;
        }
      } catch(err) {}
    }

    setLoading(true); setQuery(q);

    if (!directQuery || typeof directQuery === 'string') {
      saveToHistory(q);
    }

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
    } catch (error) {} finally { setLoading(false); }
  };

  const removeSearchHistory = (target, e) => {
    e.stopPropagation();
    const targetName = typeof target === 'object' ? target.name : target;
    const updated = recentSearches.filter(x => {
      if (typeof x === 'object') return x.name !== targetName;
      return x !== targetName;
    });
    setRecentSearches(updated);
    if (user) set(ref(db, `users/${user.uid}/recentSearches`), updated);
  };

  const handleArtistClick = (artist) => {
    saveToHistory({ type: 'artist', name: artist.name, thumbnail: artist.thumbnail });
    navigate(`/artist/${encodeURIComponent(artist.name)}`);
  };

  return (
    <div className="search-page">
      <h1 className="page-title">Ara</h1>
      
      <form onSubmit={handleSearch} className="search-bar-container">
        <MdSearch size={24} className="search-icon" />
        <input type="text" className="search-input" placeholder="Şarkı veya çalma listesi linki yapıştır..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>

      {results.length === 0 && !loading && recentSearches.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '15px', color: 'white' }}>Son Aramalar</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {recentSearches.map((item, idx) => {
              const isArtist = typeof item === 'object' && item.type === 'artist';
              return (
                <div key={idx} className="search-chip" onClick={() => isArtist ? handleArtistClick(item) : handleSearch(null, item)} style={{ padding: isArtist ? '6px 15px 6px 6px' : '8px 15px' }}>
                  {isArtist && <img src={item.thumbnail} alt={item.name} referrerPolicy="no-referrer" style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} />}
                  <span>{isArtist ? item.name : item}</span>
                  <button className="icon-btn" onClick={(e) => removeSearchHistory(item, e)} style={{ padding: 0, marginLeft: '5px' }}><MdClose size={16} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="search-results">
        {/* YENİLİK BURADA: Sadece SVG İkonu dönüyor, yazı tipi gecikme hatası önlendi */}
        {loading && (
          <div className="loading-container">
            <MdSync className="loading-spinner" size={40} color="var(--text-muted)" />
            <p>Aranıyor...</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="song-list">
            {results.map((song, index) => {
              // Arama sonuçlarındaki fotoğrafların siyah barlarını silmek için mqdefault düzeltmesi eklendi
              const displayThumb = (song.thumbnail || '').replace('hqdefault.jpg', 'mqdefault.jpg').replace('sddefault.jpg', 'mqdefault.jpg');
              
              return (
                <div key={song.id} className={`song-row ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => playSong(song, results, index)}>
                  <div className="song-thumb-container">
                    <img src={displayThumb} alt={song.title} className="song-thumb" />
                    <div className="play-overlay"><MdPlayArrow size={24} color="white" /></div>
                  </div>
                  <div className="song-info">
                    <div className="song-title">{song.title}</div>
                    <div className="song-channel">{song.channel}</div>
                  </div>
                  <button className="icon-btn" style={{ marginLeft: 'auto', padding: '10px' }} onClick={(e) => { e.stopPropagation(); openAddModal(song); }}><MdPlaylistAdd size={28} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;