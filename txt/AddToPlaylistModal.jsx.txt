import React, { useEffect, useState } from 'react';
import { MdClose, MdQueueMusic } from 'react-icons/md';
import { db } from '../firebase';
import { ref, get } from 'firebase/database';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';

const AddToPlaylistModal = () => {
  const { user } = useAuthStore();
  const { 
    isAddModalOpen, closeAddModal, songToAdd, localPlaylists, 
    saveLocalPlaylists, updateLocalPlaylistSongs, isOfflineMode 
  } = usePlayerStore();
  
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLocalCreate, setIsLocalCreate] = useState(isOfflineMode);

  useEffect(() => {
    setIsLocalCreate(isOfflineMode);
    if (!isAddModalOpen) return;
    
    // Çevrimdışı isek Firebase sorgusuna girmeden doğrudan yerel listelerle devam et
    if (!user || isOfflineMode) {
      setPlaylists([]);
      return;
    }

    const fetchPlaylists = async () => {
      setLoading(true);
      try {
        const snap = await get(ref(db, `users/${user.uid}/playlists`));
        if (snap.exists()) {
          const data = snap.val();
          setPlaylists(Object.keys(data).map(key => ({ id: key, ...data[key] })));
        } else {
          setPlaylists([]);
        }
      } catch (err) {
        console.error("Bulut çalma listeleri çekilemedi:", err);
      }
      setLoading(false);
    };
    fetchPlaylists();
  }, [user, isAddModalOpen, isOfflineMode]);

  if (!isAddModalOpen || !songToAdd) return null;

  const handleAddToPlaylist = async (playlist) => {
    const currentSongs = playlist.songs || [];
    if (currentSongs.find(s => s.id === songToAdd.id)) {
      alert("Bu şarkı zaten listede var.");
      return;
    }

    const newSongData = { ...songToAdd, uniqueId: `${songToAdd.id}-${Date.now()}` };
    const updatedSongs = [...currentSongs, newSongData];
    
    if (playlist.id.startsWith('local_')) {
      updateLocalPlaylistSongs(playlist.id, updatedSongs);
      alert(`"${songToAdd.title}" başarıyla yerel listeye eklendi!`);
      closeAddModal();
      return;
    }

    if (!isOfflineMode) {
      await set(ref(db, `users/${user.uid}/playlists/${playlist.id}/songs`), updatedSongs);
      alert(`"${songToAdd.title}" başarıyla bulut listeye eklendi!`);
      closeAddModal();
    } else {
      alert("Bulut listesine eklemek için internet bağlantısı gerekiyor.");
    }
  };

  const handleQuickCreate = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const newSongData = { ...songToAdd, uniqueId: `${songToAdd.id}-${Date.now()}` };

    if (!user || isLocalCreate || isOfflineMode) {
      const pl = { id: `local_${Date.now()}`, name: newPlaylistName.trim(), songs: [newSongData] };
      saveLocalPlaylists([...localPlaylists, pl]);
      alert("Yerel liste oluşturuldu ve şarkı eklendi!");
    } else {
      const newRef = push(ref(db, `users/${user.uid}/playlists`));
      await set(newRef, { id: newRef.key, name: newPlaylistName.trim(), songs: [newSongData] });
      alert("Bulut listesi oluşturuldu ve şarkı eklendi!");
    }

    setNewPlaylistName("");
    closeAddModal();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '90%', maxWidth: '400px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: 'white', margin: 0, fontSize: '18px' }}>Çalma Listesine Ekle</h3>
          <button className="icon-btn" onClick={closeAddModal}><MdClose size={24} /></button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '15px', textAlign: 'left' }}>
          Bir liste seçin veya yenisini oluşturun:
        </p>

        {loading ? (
          <p style={{ color: 'gray', padding: '20px 0' }}>Yükleniyor...</p>
        ) : (
          <div className="playlist-selection-list">
            {localPlaylists.map(pl => (
              <div key={pl.id} className="playlist-select-item" onClick={() => handleAddToPlaylist(pl)}>
                <MdQueueMusic size={24} color="var(--accent)" />
                <span style={{ flex: 1, fontWeight: '500', color: 'white', textAlign: 'left' }}>{pl.name} <span style={{fontSize:'10px'}}>(Yerel)</span></span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pl.songs ? pl.songs.length : 0} şarkı</span>
              </div>
            ))}
            {playlists.map(pl => (
              <div key={pl.id} className="playlist-select-item" onClick={() => handleAddToPlaylist(pl)}>
                <MdQueueMusic size={24} color="var(--text-main)" />
                <span style={{ flex: 1, fontWeight: '500', color: 'white', textAlign: 'left' }}>{pl.name}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pl.songs ? pl.songs.length : 0} şarkı</span>
              </div>
            ))}
            {playlists.length === 0 && localPlaylists.length === 0 && <p style={{ color: 'gray', fontSize: '13px' }}>Henüz listeniz yok.</p>}
          </div>
        )}

        <form onSubmit={handleQuickCreate} style={{ borderTop: '1px solid var(--border)', paddingTop: '15px', marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <input 
              type="checkbox" 
              checked={isLocalCreate || isOfflineMode} 
              disabled={isOfflineMode}
              onChange={(e) => setIsLocalCreate(e.target.checked)} 
            />
            Yerel (Çevrimdışı) Liste Oluştur {isOfflineMode && "(Zorunlu)"}
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input type="text" className="form-input" placeholder="Yeni çalma listesi adı..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} style={{ margin: 0, padding: '10px', flex: 1 }} />
            <button type="submit" className="primary-btn" style={{ width: 'auto', padding: '0 15px', whiteSpace: 'nowrap', fontSize: '14px' }}>Oluştur</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddToPlaylistModal;