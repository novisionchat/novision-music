import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdAdd, MdMoreVert } from 'react-icons/md';
import { db } from '../firebase';
import { ref, onValue, push, set, remove, get } from 'firebase/database';
import useAuthStore from '../store/useAuthStore';

const Library = () => {
  const { user } = useAuthStore();
  const [playlists, setPlaylists] = useState([]);
  const navigate = useNavigate();

  // Modal State'leri
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  
  // Linkten Ekleme için Yeni Eklenen State'ler
  const [modalMode, setModalMode] = useState('create'); // 'create' veya 'import'
  const [importLink, setImportLink] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  // Dropdown (3 nokta) State'i
  const [activeDropdown, setActiveDropdown] = useState(null);

  useEffect(() => {
    if (!user) return;
    const playlistsRef = ref(db, `users/${user.uid}/playlists`);
    const unsubscribe = onValue(playlistsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const formattedList = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setPlaylists(formattedList);
      } else {
        setPlaylists([]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // Yeni Liste Oluşturma (Modal - Oluştur Sekmesi)
  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const newRef = push(ref(db, `users/${user.uid}/playlists`));
    await set(newRef, { id: newRef.key, name: newPlaylistName.trim(), songs: [] });
    resetAndCloseModal();
  };

  // Link ile Liste İçe Aktarma (Modal - Link ile Ekle Sekmesi)
  const handleImportPlaylist = async (e) => {
    e.preventDefault();
    const link = importLink.trim();
    if (!link) return;

    setIsImporting(true);

    try {
      // DURUM 1: Uygulama İçi (Novision) Paylaşım Linki Kontrolü
      if (link.includes('/playlist/')) {
        try {
          const urlObj = new URL(link);
          const playlistId = urlObj.pathname.split('/').pop();
          const ownerId = urlObj.searchParams.get('owner'); // Linkten owner ID'sini alıyoruz

          if (playlistId && ownerId) {
            // SADECE o kullanıcının listesine istek atıyoruz (İzin hatası almamak için)
            const snap = await get(ref(db, `users/${ownerId}/playlists/${playlistId}`));
            
            if (snap.exists()) {
              const foundPlaylist = snap.val();
              
              const newRef = push(ref(db, `users/${user.uid}/playlists`));
              
              const copiedSongs = (foundPlaylist.songs || []).map((s, idx) => ({
                ...s,
                uniqueId: `${s.id}-${Date.now()}-${idx}`
              }));

              await set(newRef, {
                id: newRef.key,
                name: foundPlaylist.name + " (Kopya)",
                songs: copiedSongs
              });

              alert("Novision çalma listesi başarıyla kopyalandı!");
              resetAndCloseModal();
              return;
            } else {
              alert("Bu liste silinmiş veya bulunamadı.");
              setIsImporting(false);
              return;
            }
          } else {
            alert("Eksik veya geçersiz link! Linkin sonundaki ?owner= kısmının olduğundan emin olun.");
            setIsImporting(false);
            return;
          }
        } catch (err) {
          alert("Link ayrıştırılamadı. Geçerli bir link yapıştırdığınıza emin olun.");
          setIsImporting(false);
          return;
        }
      }

      // DURUM 2: YouTube Playlist Linki Kontrolü
      let listId = null;
      if (link.includes('list=')) {
        try {
          listId = new URL(link).searchParams.get('list');
        } catch(err) {
          listId = link.split('list=')[1]?.split('&')[0];
        }
      } else if (link.startsWith('PL') && link.length > 15) {
        listId = link;
      }

      if (listId) {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/playlist?listId=${listId}`);
        if (!res.ok) throw new Error("YouTube playlist çekilemedi. API hatası.");
        const data = await res.json();

        const newRef = push(ref(db, `users/${user.uid}/playlists`));
        
        const fetchedSongs = (data.videos || []).map((s, idx) => ({
          ...s,
          uniqueId: `${s.id}-${Date.now()}-${idx}`
        }));

        await set(newRef, {
          id: newRef.key,
          name: data.playlistName || "YouTube Playlist",
          songs: fetchedSongs
        });

        alert(`"${data.playlistName}" başarıyla eklendi!`);
        resetAndCloseModal();
      } else {
        alert("Geçerli bir YouTube veya Novision playlist linki giriniz.");
      }
    } catch (error) {
      console.error(error);
      alert("Playlist içe aktarılırken bir hata oluştu: " + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const resetAndCloseModal = () => {
    setIsModalOpen(false);
    setNewPlaylistName("");
    setImportLink("");
    setModalMode('create');
  };

  // Dropdown İşlemleri
  const handleShare = (e, playlistId) => {
    e.stopPropagation();
    // Paylaşım linkine kullanıcının UID'sini (owner) ekliyoruz
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
      await remove(ref(db, `users/${user.uid}/playlists/${playlistId}`));
    }
  };

  if (!user) return <div style={{ padding: '20px', color: 'gray' }}>Kitaplığınızı görmek için giriş yapmalısınız.</div>;

  return (
    <div className="library-page" onClick={() => setActiveDropdown(null)}>
      <div className="library-header">
        <h1 className="page-title" style={{ marginBottom: 0 }}>Kitaplığın</h1>
        <button className="icon-btn add-playlist-btn" onClick={() => setIsModalOpen(true)} title="Yeni Liste Oluştur">
          <MdAdd size={28} color="white" />
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '30px' }}>Kendi oluşturduğun çalma listelerin.</p>

      {playlists.length === 0 ? (
        <div style={{ color: 'gray', textAlign: 'center', margin: '50px 0' }}>Henüz bir listen yok.</div>
      ) : (
        <div className="home-grid">
          {playlists.map(pl => {
            const thumb = pl.songs && pl.songs.length > 0 ? pl.songs[0].thumbnail : '/icon.png';
            return (
              /* KESİLME SORUNUNU ÇÖZMEK İÇİN KARTA 'position: relative' EKLENDİ */
              <div key={pl.id} className="home-card" style={{ position: 'relative' }} onClick={() => navigate(`/playlist/${pl.id}`)}>
                
                {/* 1. KISIM: SADECE RESİM */}
                <div className="card-thumb-wrapper">
                  <img src={thumb} alt={pl.name} />
                </div>
                
                {/* 2. KISIM: KESİLMEMESİ İÇİN DIŞARI ALINAN 3 NOKTA MENÜSÜ */}
                <div className="kebab-menu-container" style={{ top: '20px', right: '20px' }}>
                  <button 
                    className="icon-btn kebab-btn" 
                    onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === pl.id ? null : pl.id); }}
                  >
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

                {/* 3. KISIM: YAZILAR */}
                <div className="card-title">{pl.name}</div>
                <div className="card-subtitle">{pl.songs ? pl.songs.length : 0} Şarkı</div>
              </div>
            );
          })}
        </div>
      )}

      {/* YENİ LİSTE VE LİNKTEN EKLEME MODALI */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '20px', color: 'white' }}>Çalma Listesi</h3>

            {/* SEKMELER */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                type="button"
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)',
                  background: modalMode === 'create' ? 'var(--bg-active)' : 'transparent',
                  color: modalMode === 'create' ? 'white' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 'bold'
                }}
                onClick={() => setModalMode('create')}
              >
                Oluştur
              </button>
              <button
                type="button"
                style={{
                  flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border)',
                  background: modalMode === 'import' ? 'var(--bg-active)' : 'transparent',
                  color: modalMode === 'import' ? 'white' : 'var(--text-muted)',
                  cursor: 'pointer', fontWeight: 'bold'
                }}
                onClick={() => setModalMode('import')}
              >
                Link'ten İçe Aktar
              </button>
            </div>

            {/* OLUŞTURMA ALANI */}
            {modalMode === 'create' ? (
              <form onSubmit={handleCreatePlaylist}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Liste Adı..." 
                  value={newPlaylistName} 
                  onChange={(e) => setNewPlaylistName(e.target.value)} 
                  autoFocus 
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className="secondary-btn" onClick={resetAndCloseModal}>İptal</button>
                  <button type="submit" className="primary-btn" style={{ width: 'auto', padding: '10px 20px' }}>Oluştur</button>
                </div>
              </form>
            ) : (
            /* LİNK İLE İÇE AKTARMA ALANI */
              <form onSubmit={handleImportPlaylist}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="YouTube veya Novision playlist linki..." 
                  value={importLink} 
                  onChange={(e) => setImportLink(e.target.value)} 
                  autoFocus 
                />
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className="secondary-btn" onClick={resetAndCloseModal}>İptal</button>
                  <button type="submit" className="primary-btn" style={{ width: 'auto', padding: '10px 20px' }} disabled={isImporting}>
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