import React, { useEffect, useState } from 'react';
import { MdClose, MdQueueMusic, MdCheckCircle } from 'react-icons/md';
import { db } from '../firebase';
import { ref, get, set, push } from 'firebase/database';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';
import toast from 'react-hot-toast';

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

  // DÜZELTME: Salt okunur (readonly) olan listeleri tamamen gizle!
  const editableLocalPlaylists = localPlaylists.filter(pl => !pl.readonly);
  const editableCloudPlaylists = playlists.filter(pl => !pl.readonly);

  // DÜZELTME: En son eklenen çalma listesini listenin en tepesine uçur
  const lastAddedId = localStorage.getItem('last_added_playlist_id');

  const sortPlaylists = (list) => {
    return [...list].sort((a, b) => {
      if (a.id === lastAddedId) return -1;
      if (b.id === lastAddedId) return 1;
      return 0;
    });
  };

  const finalLocalList = sortPlaylists(editableLocalPlaylists);
  const finalCloudList = sortPlaylists(editableCloudPlaylists);

  // DÜZELTME: Şarkının bu listede olup olmadığını kontrol etme fonksiyonu
  const hasSong = (playlist) => {
    let currentSongs = [];
    if (playlist.songs) {
      if (Array.isArray(playlist.songs)) {
        currentSongs = playlist.songs;
      } else if (typeof playlist.songs === 'object') {
        currentSongs = Object.values(playlist.songs).filter(Boolean);
      }
    }
    return currentSongs.some(s => s.id === songToAdd.id);
  };

  const handleAddToPlaylist = async (playlist) => {
    try {
      if (!user && !playlist.id.startsWith('local_')) {
        toast.error("Bulut listesine eklemek için giriş yapmalısınız.");
        return;
      }

      let currentSongs = [];
      if (playlist.songs) {
        if (Array.isArray(playlist.songs)) {
          currentSongs = playlist.songs;
        } else if (typeof playlist.songs === 'object') {
          currentSongs = Object.values(playlist.songs).filter(Boolean);
        }
      }

      if (currentSongs.find(s => s.id === songToAdd.id)) {
        toast.error("Bu şarkı zaten listede var.");
        return;
      }

      const newSongData = { ...songToAdd, uniqueId: `${songToAdd.id}-${Date.now()}` };
      const updatedSongs = [...currentSongs, newSongData];
      
      // Son ekleme yapılan playlist ID'sini hafızada sakla
      localStorage.setItem('last_added_playlist_id', playlist.id);

      if (playlist.id.startsWith('local_')) {
        updateLocalPlaylistSongs(playlist.id, updatedSongs);
        toast.success(`"${songToAdd.title}" yerel listeye eklendi!`);
        closeAddModal();
        return;
      }

      if (!isOfflineMode) {
        await set(ref(db, `users/${user.uid}/playlists/${playlist.id}/songs`), updatedSongs);
        toast.success(`"${songToAdd.title}" bulut listeye eklendi!`);
        closeAddModal();
      } else {
        toast.error("Bulut listesine eklemek için internet bağlantısı gerekiyor.");
      }
    } catch (error) {
      console.error("Çalma listesine ekleme sırasında hata oluştu:", error);
      toast.error("Şarkı listeye eklenemedi.");
    }
  };

  const handleQuickCreate = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const newSongData = { ...songToAdd, uniqueId: `${songToAdd.id}-${Date.now()}` };

    try {
      if (!user || isLocalCreate || isOfflineMode) {
        const pl = { id: `local_${Date.now()}`, name: newPlaylistName.trim(), songs: [newSongData] };
        saveLocalPlaylists([...localPlaylists, pl]);
        toast.success("Yerel liste oluşturuldu ve şarkı eklendi!");
      } else {
        const newRef = push(ref(db, `users/${user.uid}/playlists`));
        await set(newRef, { id: newRef.key, name: newPlaylistName.trim(), songs: [newSongData] });
        toast.success("Bulut listesi oluşturuldu ve şarkı eklendi!");
      }

      setNewPlaylistName("");
      closeAddModal();
    } catch (error) {
      console.error("Yeni liste oluşturulurken hata:", error);
      toast.error("Yeni liste oluşturulamadı.");
    }
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
            {finalLocalList.map(pl => {
              const songExists = hasSong(pl);
              return (
                <div key={pl.id} className="playlist-select-item" onClick={() => !songExists && handleAddToPlaylist(pl)} style={{ opacity: songExists ? 0.6 : 1, cursor: songExists ? 'default' : 'pointer' }}>
                  <MdQueueMusic size={24} color="var(--accent)" />
                  <span style={{ flex: 1, fontWeight: '500', color: 'white', textAlign: 'left' }}>{pl.name} <span style={{fontSize:'10px'}}>(Yerel)</span></span>
                  {songExists ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold' }}><MdCheckCircle size={16} /> Zaten Ekli</span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pl.songs ? pl.songs.length : 0} şarkı</span>
                  )}
                </div>
              );
            })}
            
            {finalCloudList.map(pl => {
              const songExists = hasSong(pl);
              return (
                <div key={pl.id} className="playlist-select-item" onClick={() => !songExists && handleAddToPlaylist(pl)} style={{ opacity: songExists ? 0.6 : 1, cursor: songExists ? 'default' : 'pointer' }}>
                  <MdQueueMusic size={24} color="var(--text-main)" />
                  <span style={{ flex: 1, fontWeight: '500', color: 'white', textAlign: 'left' }}>{pl.name}</span>
                  {songExists ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold' }}><MdCheckCircle size={16} /> Zaten Ekli</span>
                  ) : (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pl.songs ? (Array.isArray(pl.songs) ? pl.songs.length : Object.keys(pl.songs).length) : 0} şarkı</span>
                  )}
                </div>
              );
            })}
            {finalCloudList.length === 0 && finalLocalList.length === 0 && <p style={{ color: 'gray', fontSize: '13px' }}>Henüz düzenlenebilir listeniz yok.</p>}
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