import React, { useState, useEffect } from 'react';
import { MdSearch, MdPlayArrow, MdPlaylistAdd, MdClose } from 'react-icons/md';
import usePlayerStore from '../store/usePlayerStore';
import useAuthStore from '../store/useAuthStore';
import { db } from '../firebase';
import { ref, get, set } from 'firebase/database';

const Search = () => {
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  
  const playSong = usePlayerStore(state => state.playSong);
  const currentSong = usePlayerStore(state => state.currentSong);
  const openAddModal = usePlayerStore(state => state.openAddModal);

  // Veritabanından Son Aramaları Çek
  useEffect(() => {
    if (!user) return;
    get(ref(db, `users/${user.uid}/recentSearches`)).then((snap) => {
      if (snap.exists()) setRecentSearches(snap.val());
    });
  }, [user]);

  const handleSearch = async (e, directQuery = null) => {
    if (e) e.preventDefault();
    const q = directQuery || query;
    if (!q.trim()) return;

    if (user && !recentSearches.includes(q)) {
      const updated = [q, ...recentSearches].slice(0, 8);
      setRecentSearches(updated);
      set(ref(db, `users/${user.uid}/recentSearches`), updated);
    }

    setLoading(true); setQuery(q);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
    } catch (error) {} finally { setLoading(false); }
  };

  const removeSearchHistory = (q, e) => {
    e.stopPropagation();
    const updated = recentSearches.filter(item => item !== q);
    setRecentSearches(updated);
    if (user) set(ref(db, `users/${user.uid}/recentSearches`), updated);
  };

  return (
    <div className="search-page">
      <h1 className="page-title">Ara</h1>
      
      <form onSubmit={handleSearch} className="search-bar-container">
        <MdSearch size={24} className="search-icon" />
        <input type="text" className="search-input" placeholder="Ne dinlemek istersin?" value={query} onChange={(e) => setQuery(e.target.value)} />
      </form>

      {results.length === 0 && !loading && recentSearches.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ fontSize: '16px', marginBottom: '15px', color: 'white' }}>Son Aramalar</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {recentSearches.map((q, idx) => (
              <div key={idx} className="search-chip" onClick={() => handleSearch(null, q)}>
                <span>{q}</span>
                <button className="icon-btn" onClick={(e) => removeSearchHistory(q, e)} style={{ padding: 0 }}><MdClose size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="search-results">
        {loading && <div className="loading-container"><span className="material-icons loading-spinner">sync</span><p>Aranıyor...</p></div>}

        {!loading && results.length > 0 && (
          <div className="song-list">
            {results.map((song, index) => (
              <div key={song.id} className={`song-row ${currentSong?.id === song.id ? 'active' : ''}`} onClick={() => playSong(song, results, index)}>
                <div className="song-thumb-container">
                  <img src={song.thumbnail} alt={song.title} className="song-thumb" />
                  <div className="play-overlay"><MdPlayArrow size={24} color="white" /></div>
                </div>
                <div className="song-info">
                  <div className="song-title">{song.title}</div>
                  <div className="song-channel">{song.channel}</div>
                </div>
                <button className="icon-btn" style={{ marginLeft: 'auto', padding: '10px' }} onClick={(e) => { e.stopPropagation(); openAddModal(song); }}><MdPlaylistAdd size={28} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Search;