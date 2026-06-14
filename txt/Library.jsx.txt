import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAdd, MdMoreVert, MdFileDownload } from 'react-icons/md';
import { db } from '../firebase';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';

const Library = () => {
  const { user } = useAuthStore();
  const { localPlaylists, downloadedSongs, createLocalPlaylist, deleteLocalPlaylist } = usePlayerStore();
  const [playlists, setPlaylists] = useState([]);
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  
  const [modalMode, setModalMode] = useState('create'); 
  const [importLink, setImportLink] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    if (!user || !navigator.onLine) {
      setPlaylists([]);
      return;
    }
    const playlistsRef = ref(db, `users/${user.uid}/playlists`);
    const unsubscribe = onValue(playlistsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setPlaylists(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setPlaylists([]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    
    if (modalMode === 'local' || !user || !navigator.onLine) {
      createLocalPlaylist(newPlaylistName.trim());
    } else {
      const newRef = push(ref(db, `users/${user.uid}/playlists`));
      await set(newRef, { id: newRef.key, name: newPlaylistName.trim(), songs: [] });
    }
    resetAndCloseModal();
  };

  const handleImportPlaylist = async (e) => {
    e.preventDefault();
    const link = importLink.trim();
    if (!link) return;
    setIsImporting(true);
    try {
      if (link.includes('/playlist/')) {
        try {
          const urlObj = new URL(link);
          const playlistId = urlObj.pathname.split('/').pop();
          const ownerId = urlObj.searchParams.get('owner');
          if (playlistId && ownerId) {
            const snap = await get(ref(db, `users/${ownerId}/playlists/${playlistId}`));
            if (snap.exists()) {
              const foundPlaylist = snap.val();
              const newRef = push(ref(db, `users/${user.uid}/playlists`));
              const copiedSongs = (foundPlaylist.songs || []).map((s, idx) => ({ ...s, uniqueId: `${s.id}-${Date.now()}-${idx}` }));
              await set(newRef, { id: newRef.key, name: foundPlaylist.name + " (Kopya)", songs: copiedSongs });
              alert("Novision çalma listesi başarıyla kopyalandı!");
              resetAndCloseModal();
              return;
            }
          }
        } catch (err) {}
      }

      let listId = null;
      if (link.includes('list=')) {
        try { listId = new URL(link).searchParams.get('list'); } 
        catch(err) { listId = link.split('list=')[1]?.split('&')[0]; }
      } else if (link.startsWith('PL') && link.length > 15) { listId = link; }

      if (listId) {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/playlist?listId=${listId}`);
        const data = await res.json();
        const newRef = push(ref(db, `users/${user.uid}/playlists`));
        const fetchedSongs = (data.videos || []).map((s, idx) => ({ ...s, uniqueId: `${s.id}-${Date.now()}-${idx}` }));
        await set(newRef, { id: newRef.key, name: data.playlistName || "YouTube Playlist", songs: fetchedSongs });
        alert(`"${data.playlistName}" başarıyla eklendi!`);
        resetAndCloseModal();
      } else { alert("Geçerli bir YouTube veya Novision playlist linki giriniz."); }
    } catch (error) { alert("Playlist içe aktarılırken bir hata oluştu: " + error.message); } 
    finally { setIsImporting(false); }
  };

  const resetAndCloseModal = () => {
    setIsModalOpen(false); setNewPlaylistName(""); setImportLink(""); setModalMode('create');
  };

  const handleShare = (e, playlistId) => {
    e.stopPropagation();
    const url = `${window.location.origin}/playlist/${playlistId}?owner=${user.uid}`;
    navigator.clipboard.writeText(url);
    alert("Liste bağlantısı kopyalandı!");
    setActiveDropdown(null);
  };

  const handleEdit = (e, playlistId) => {
    e.stopPropagation();
    navigate(`/playlist/${playlistId}`, { state: { autoEdit: true } });
  };

  const handleDelete = async (e, playlistId, playlistName) => {
    e.stopPropagation();
    setActiveDropdown(null);
    if (window.confirm(`"${playlistName}" listesini silmek istediğinize emin misiniz?`)) {
      if (playlistId.startsWith('local_')) {
        deleteLocalPlaylist(playlistId);
      } else {
        await remove(ref(db, `users/${user.uid}/playlists/${playlistId}`));
      }
    }
  };

  return (
    <div className="library-page" onClick={() => setActiveDropdown(null)}>
      <div className="library-header">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Kitaplığın</h1>
        <button className="icon-btn add-playlist-btn" onClick={() => setIsModalOpen(true)} title="Yeni Liste Oluştur">
          <MdAdd size={28} color="white" />
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Oluşturduğun veya indirdiğin tüm çalma listelerin.</p>

      <div className="home-grid">
        {/* İNDİRİLEN ŞARKILAR KLASÖRÜ */}
        <div className="home-card" style={{ position: 'relative' }} onClick={() => navigate(`/playlist/downloaded`)}>
          <div className="card-thumb-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#282828' }}>
            <MdFileDownload size={48} color="white" />
          </div>
          <div className="card-title">İndirilen Şarkılar</div>
          <div className="card-subtitle">{Object.keys(downloadedSongs).length} Şarkı</div>
        </div>

        {/* YEREL PLAYLİSTLER */}
        {localPlaylists.map(pl => {
          const thumb = pl.songs && pl.songs.length > 0 ? pl.songs[0].thumbnail : '/icon.png';
          return (
            <div key={pl.id} className="home-card" style={{ position: 'relative' }} onClick={() => navigate(`/playlist/${pl.id}`)}>
              <div className="card-thumb-wrapper"><img src={thumb} alt={pl.name} /></div>
              <div className="kebab-menu-container" style={{ top: '20px', right: '20px' }}>
                <button className="icon-btn kebab-btn" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === pl.id ? null : pl.id); }}>
                  <MdMoreVert size={24} color="white" />
                </button>
                {activeDropdown === pl.id && (
                  <div className="custom-dropdown-menu">
                    <div className="dropdown-item" onClick={(e) => handleEdit(e, pl.id)}>Düzenle</div>
                    <div className="dropdown-item delete" onClick={(e) => handleDelete(e, pl.id, pl.name)}>Sil</div>
                  </div>
                )}
              </div>
              <div className="card-title">{pl.name} <span style={{ color: 'var(--accent)', fontSize: '10px' }}>(Yerel)</span></div>
              <div className="card-subtitle">{pl.songs ? pl.songs.length : 0} Şarkı</div>
            </div>
          );
        })}

        {/* BULUT (FİREBASE) PLAYLİSTLERİ */}
        {playlists.map(pl => {
          const thumb = pl.songs && pl.songs.length > 0 ? pl.songs[0].thumbnail : '/icon.png';
          return (
            <div key={pl.id} className="home-card" style={{ position: 'relative' }} onClick={() => navigate(`/playlist/${pl.id}`)}>
              <div className="card-thumb-wrapper"><img src={thumb} alt={pl.name} /></div>
              <div className="kebab-menu-container" style={{ top: '20px', right: '20px' }}>
                <button className="icon-btn kebab-btn" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === pl.id ? null : pl.id); }}>
                  <MdMoreVert size={24} color="white" />
                </button>
                {activeDropdown === pl.id && (
                  <div className="custom-dropdown-menu">
                    <div className="dropdown-item" onClick={(e) => handleShare(e, pl.id)}>Paylaş</div>
                    <div className="dropdown-item" onClick={(e) => handleEdit(e, pl.id)}>Düzenle</div>
                    <div className="dropdown-item delete" onClick={(e) => handleDelete(e, pl.id, pl.name)}>Sil</div>
                  </div>
                )}
              </div>
              <div className="card-title">{pl.name}</div>
              <div className="card-subtitle">{pl.songs ? pl.songs.length : 0} Şarkı</div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '20px', color: 'white' }}>Çalma Listesi</h3>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
              <button type="button" style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: modalMode === 'create' ? 'var(--bg-active)' : 'transparent', color: modalMode === 'create' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }} onClick={() => setModalMode('create')}>Oluştur</button>
              <button type="button" style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: modalMode === 'local' ? 'var(--bg-active)' : 'transparent', color: modalMode === 'local' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }} onClick={() => setModalMode('local')}>Yerel</button>
              <button type="button" style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid var(--border)', background: modalMode === 'import' ? 'var(--bg-active)' : 'transparent', color: modalMode === 'import' ? 'white' : 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }} onClick={() => setModalMode('import')}>Link'ten</button>
            </div>

            {modalMode === 'create' || modalMode === 'local' ? (
              <form onSubmit={handleCreatePlaylist}>
                <input type="text" className="form-input" placeholder="Liste Adı..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} autoFocus />
                {modalMode === 'create' && (!user || !navigator.onLine) && (
                  <p style={{ color: '#ff4d4d', fontSize: '12px', textAlign: 'left', marginBottom: '10px' }}>Bulut liste için internet bağlantısı ve giriş gereklidir.</p>
                )}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" className="secondary-btn" onClick={resetAndCloseModal}>İptal</button>
                  <button type="submit" className="primary-btn" style={{ width: 'auto', padding: '10px 20px' }} disabled={modalMode === 'create' && (!user || !navigator.onLine)}>Oluştur</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleImportPlaylist}>
                <input type="text" className="form-input" placeholder="YouTube veya Novision playlist linki..." value={importLink} onChange={(e) => setImportLink(e.target.value)} autoFocus />
                {(!user || !navigator.onLine) && (
                  <p style={{ color: '#ff4d4d', fontSize: '12px', textAlign: 'left', marginBottom: '10px' }}>Bu işlem için internet gereklidir.</p>
                )}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" className="secondary-btn" onClick={resetAndCloseModal}>İptal</button>
                  <button type="submit" className="primary-btn" style={{ width: 'auto', padding: '10px 20px' }} disabled={isImporting || !user || !navigator.onLine}>
                    {isImporting ? "Ekleniyor..." : "İçe Aktar"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Library;