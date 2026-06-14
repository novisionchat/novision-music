import React, { useEffect, useState } from 'react';
import { MdClose, MdQueueMusic } from 'react-icons/md';
import { db } from '../firebase';
import { ref, get, set, push } from 'firebase/database';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';

const AddToPlaylistModal = () => {
  const { user } = useAuthStore();
  const { isAddModalOpen, closeAddModal, songToAdd } = usePlayerStore();
  
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal açıldığında Firebase'den anlık listeleri çek
  useEffect(() => {
    if (!user || !isAddModalOpen) return;
    
    const fetchPlaylists = async () => {
      setLoading(true);
      const snap = await get(ref(db, `users/${user.uid}/playlists`));
      if (snap.exists()) {
        const data = snap.val();
        setPlaylists(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setPlaylists([]);
      }
      setLoading(false);
    };
    fetchPlaylists();
  }, [user, isAddModalOpen]);

  if (!isAddModalOpen || !songToAdd) return null;

  // Listeye şarkıyı ekleme fonksiyonu
  const handleAddToPlaylist = async (playlist) => {
    const currentSongs = playlist.songs || [];
    
    // Şarkı listede var mı kontrolü
    if (currentSongs.find(s => s.id === songToAdd.id)) {
      alert("Bu şarkı zaten listede var.");
      return;
    }

    // DND hatasını engellemek için eşsiz kimlik (uniqueId) ile ekliyoruz
    const newSongData = { ...songToAdd, uniqueId: `${songToAdd.id}-${Date.now()}` };
    const updatedSongs = [...currentSongs, newSongData];
    
    await set(ref(db, `users/${user.uid}/playlists/${playlist.id}/songs`), updatedSongs);
    alert(`"${songToAdd.title}" başarıyla eklendi!`);
    closeAddModal();
  };

  // Yeni liste oluşturup şarkıyı direkt içine atma
  const handleQuickCreate = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const newRef = push(ref(db, `users/${user.uid}/playlists`));
    const newSongData = { ...songToAdd, uniqueId: `${songToAdd.id}-${Date.now()}` };
    
    await set(newRef, { 
      id: newRef.key, 
      name: newPlaylistName.trim(), 
      songs: [newSongData] // İlk şarkı olarak ekle
    });

    alert("Yeni liste oluşturuldu ve şarkı eklendi!");
    setNewPlaylistName("");
    closeAddModal();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ width: '90%', maxWidth: '400px', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ color: 'white', margin: 0, fontSize: '18px' }}>Çalma Listesine Ekle</h3>
          <button className="icon-btn" onClick={closeAddModal}>
            <MdClose size={24} />
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '15px', textAlign: 'left' }}>
          Bir liste seçin veya yenisini oluşturun:
        </p>

        {loading ? (
          <p style={{ color: 'gray', padding: '20px 0' }}>Yükleniyor...</p>
        ) : (
          <div className="playlist-selection-list">
            {playlists.length === 0 && <p style={{ color: 'gray', fontSize: '13px' }}>Henüz listeniz yok.</p>}
            {playlists.map(pl => (
              <div key={pl.id} className="playlist-select-item" onClick={() => handleAddToPlaylist(pl)}>
                <MdQueueMusic size={24} color="var(--text-main)" />
                <span style={{ flex: 1, fontWeight: '500', color: 'white', textAlign: 'left' }}>{pl.name}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{pl.songs ? pl.songs.length : 0} şarkı</span>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleQuickCreate} style={{ borderTop: '1px solid var(--border)', paddingTop: '15px', marginTop: '15px', display: 'flex', gap: '10px' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Yeni çalma listesi adı..." 
            value={newPlaylistName} 
            onChange={(e) => setNewPlaylistName(e.target.value)} 
            style={{ margin: 0, padding: '10px' }} 
          />
          <button type="submit" className="primary-btn" style={{ width: 'auto', padding: '0 15px', whiteSpace: 'nowrap', fontSize: '14px' }}>
            Oluştur
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddToPlaylistModal;