import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAdd, MdMoreVert, MdFileDownload, MdFavorite } from 'react-icons/md';
import { db } from '../firebase';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';
import toast from 'react-hot-toast';

const Library = () => {
  const user = useAuthStore(s => s.user);
  
  const localPlaylists = usePlayerStore(s => s.localPlaylists);
  const downloadedSongs = usePlayerStore(s => s.downloadedSongs);
  const createLocalPlaylist = usePlayerStore(s => s.createLocalPlaylist);
  const deleteLocalPlaylist = usePlayerStore(s => s.deleteLocalPlaylist);
  const likedSongs = usePlayerStore(s => s.likedSongs);

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
      await set(newRef, { id: newRef.key, name: newPlaylistName.trim(), songs: [], lastPlayed: 0 });
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
              await set(newRef, { id: newRef.key, name: foundPlaylist.name + " (Kopya)", songs: copiedSongs, lastPlayed: 0 });
              toast.success("Novision çalma listesi başarıyla kopyalandı!");
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
        await set(newRef, { id: newRef.key, name: data.playlistName || "YouTube Playlist", songs: fetchedSongs, lastPlayed: 0 });
        toast.success(`"${data.playlistName}" başarıyla eklendi!`);
        resetAndCloseModal();
      } else { toast.error("Geçerli bir YouTube veya Novision playlist linki giriniz."); }
    } catch (error) { toast.error("Playlist içe aktarılırken bir hata oluştu."); } 
    finally { setIsImporting(false); }
  };

  const resetAndCloseModal = () => {
    setIsModalOpen(false); setNewPlaylistName(""); setImportLink(""); setModalMode('create');
  };

  const handleDelete = async (e, playlistId, playlistName) => {
    e.stopPropagation();
    setActiveDropdown(null);
    
    toast((t) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '220px', padding: '10px 5px' }}>
        <span style={{ fontSize: '15px', fontWeight: '500', textAlign: 'center', color: 'white' }}>
          "{playlistName}" listesini silmek istediğinize emin misiniz?
        </span>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '5px' }}>
          <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => toast.dismiss(t.id)}>İptal</button>
          <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#ff4d4d', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={async () => {
             toast.dismiss(t.id);
             if (playlistId.startsWith('local_')) {
               deleteLocalPlaylist(playlistId);
             } else {
               await remove(ref(db, `users/${user.uid}/playlists/${playlistId}`));
             }
             toast.success("Liste silindi.");
          }}>Sil</button>
        </div>
      </div>
    ), { duration: Infinity, position: 'top-center' });
  };

  // DÜZELTME: Yerel ve bulut çalma listeleri tek çatı altında toplanıyor ve son çalınmaya (lastPlayed) göre diziliyor!
  const dynamicPlaylists = [
    ...localPlaylists.map(p => ({ ...p, isLocal: true })),
    ...playlists.map(p => ({ ...p, isLocal: false }))
  ].sort((a, b) => {
    const ta = a.lastPlayed || 0;
    const tb = b.lastPlayed || 0;
    return tb - ta;
  });

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
        <div className="home-card" style={{ position: 'relative' }} onClick={() => navigate(`/playlist/liked`)}>
          <div className="card-thumb-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'linear-gradient(135deg, #FF2A54, #8b0021)' }}>
            <MdFavorite size={48} color="white" />
          </div>
          <div className="card-title">Beğenilen Şarkılar</div>
          <div className="card-subtitle">{likedSongs.length} Şarkı</div>
        </div>

        <div className="home-card" style={{ position: 'relative' }} onClick={() => navigate(`/playlist/downloaded`)}>
          <div className="card-thumb-wrapper" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#282828' }}>
            <MdFileDownload size={48} color="white" />
          </div>
          <div className="card-title">İndirilen Şarkılar</div>
          <div className="card-subtitle">{Object.keys(downloadedSongs).length} Şarkı</div>
        </div>

        {/* YENİLİK: Yerel ve Bulut listeleri en son çalınana göre sıralı şekilde tek bir döngüde çizilir */}
        {dynamicPlaylists.map(pl => {
          const rawThumb = pl.songs && pl.songs.length > 0 ? pl.songs[0].thumbnail : '/icon.png';
          const thumb = rawThumb.replace('hqdefault.jpg', 'mqdefault.jpg').replace('sddefault.jpg', 'mqdefault.jpg');
          return (
            <div key={pl.id} className="home-card" style={{ position: 'relative' }} onClick={() => navigate(`/playlist/${pl.id}`)}>
              <div className="card-thumb-wrapper"><img src={thumb} alt={pl.name} /></div>
              <div className="kebab-menu-container" style={{ top: '20px', right: '20px' }}>
                <button className="icon-btn kebab-btn" onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === pl.id ? null : pl.id); }}>
                  <MdMoreVert size={24} color="white" />
                </button>
                {activeDropdown === pl.id && (
                  <div className="custom-dropdown-menu">
                    {pl.isLocal ? (
                      <>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); navigate(`/playlist/${pl.id}`, { state: { autoEdit: true } }); }}>Düzenle</div>
                        <div className="dropdown-item delete" onClick={(e) => handleDelete(e, pl.id, pl.name)}>Sil</div>
                      </>
                    ) : (
                      <>
                        <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/playlist/${pl.id}?owner=${user.uid}`); toast.success("Kopyalandı!"); }}>Paylaş</div>
                        {!pl.readonly && <div className="dropdown-item" onClick={(e) => { e.stopPropagation(); navigate(`/playlist/${pl.id}`, { state: { autoEdit: true } }); }}>Düzenle</div>}
                        <div className="dropdown-item delete" onClick={(e) => handleDelete(e, pl.id, pl.name)}>Sil</div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="card-title">
                {pl.name} {pl.isLocal && <span style={{ color: 'var(--accent)', fontSize: '10px' }}>(Yerel)</span>}
              </div>
              <div className="card-subtitle">{pl.readonly ? 'Salt Okunur' : (pl.songs ? pl.songs.length : 0) + ' Şarkı'}</div>
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