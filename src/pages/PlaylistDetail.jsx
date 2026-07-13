import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { 
  MdPlayArrow, MdShuffle, MdEdit, MdCheck, MdArrowBack, 
  MdDragIndicator, MdDelete, MdExpandMore, MdSearch, MdFileDownload, MdFavorite, MdLibraryAdd, MdCheckCircle, MdClose,
  MdSync
} from 'react-icons/md';
import { db } from '../firebase';
import { ref, get, set, push } from 'firebase/database';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';
import { getTrendings } from '../utils/youtubeApi';
import toast from 'react-hot-toast';

// --- LEVENSHTEIN HARF MESAFESİ HESAPLAYICI ---
const getLevenshteinDistance = (s1, s2) => {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let prevRow = Array(s2.length + 1);
  let currRow = Array(s2.length + 1);

  for (let j = 0; j <= s2.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    currRow[0] = i;
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1.charAt(i - 1) === s2.charAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1, 
        prevRow[j] + 1,     
        prevRow[j - 1] + cost 
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  return prevRow[s2.length];
};

// --- TÜRKÇE KARAKTER VE NOKTALAMA NORMALİZASYONU ---
const normalizeTurkish = (str) => {
  if (!str) return "";
  return str
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/i/g, 'i')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, ' ') 
    .trim();
};

// --- AKILLI VE PUANLI ARAMA ALGORİTMASI ---
const calculateSearchScore = (title, channel, query) => {
  if (!query) return 1;
  if (!title) title = "";
  if (!channel) channel = "";

  const normTitle = normalizeTurkish(title);
  const normChannel = normalizeTurkish(channel);
  const normQuery = normalizeTurkish(query);

  const qTokens = normQuery.split(/\s+/).filter(Boolean);
  const tTokens = normTitle.split(/\s+/).filter(Boolean);
  const cTokens = normChannel.split(/\s+/).filter(Boolean);
  const allTokens = [...tTokens, ...cTokens];

  if (qTokens.length === 0) return 1;

  const exactTitleIndex = normTitle.indexOf(normQuery);
  if (exactTitleIndex === 0) {
    return 5000 - title.length / 10;
  } else if (exactTitleIndex > 0) {
    return 4000 - exactTitleIndex - title.length / 10;
  }

  const exactChannelIndex = normChannel.indexOf(normQuery);
  if (exactChannelIndex === 0) {
    return 3000 - channel.length / 10;
  } else if (exactChannelIndex > 0) {
    return 2000 - exactChannelIndex - channel.length / 10;
  }

  let matchedTokensCount = 0;
  let totalTokenScore = 0;

  for (const qToken of qTokens) {
    let bestTokenScore = 0;
    
    for (const tToken of allTokens) {
      if (tToken === qToken) {
        bestTokenScore = Math.max(bestTokenScore, 1000);
      } else if (tToken.startsWith(qToken)) {
        bestTokenScore = Math.max(bestTokenScore, 800);
      } else if (tToken.includes(qToken)) {
        bestTokenScore = Math.max(bestTokenScore, 500);
      } else {
        if (qToken.length > 2) {
          const lenDiff = Math.abs(tToken.length - qToken.length);
          if (lenDiff <= 3) {
            const dist = getLevenshteinDistance(qToken, tToken);
            const maxAllowed = qToken.length <= 5 ? 1 : 2;
            if (dist <= maxAllowed) {
              const sim = 1 - (dist / Math.max(qToken.length, tToken.length));
              bestTokenScore = Math.max(bestTokenScore, Math.round(sim * 300));
            }
          }
        }
      }
    }

    if (bestTokenScore > 0) {
      matchedTokensCount++;
      totalTokenScore += bestTokenScore;
    }
  }

  if (matchedTokensCount === qTokens.length) {
    return totalTokenScore;
  }

  return 0; 
};

// --- İZOLE VE PERFORMANS CANAVARI ARAMA KUTUSU (0% RE-RENDER COST) ---
const SearchBox = React.memo(({ onSearchChange, defaultValue }) => {
  const [localVal, setLocalVal] = useState(defaultValue || "");

  useEffect(() => {
    setLocalVal(defaultValue || "");
  }, [defaultValue]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localVal);
    }, 300);

    return () => clearTimeout(timer);
  }, [localVal, onSearchChange]);

  return (
    <div className="playlist-search-box">
      <MdSearch size={22} color="var(--text-muted)" />
      <input 
        type="text" 
        placeholder="Listede şarkı bul..." 
        value={localVal} 
        onChange={(e) => setLocalVal(e.target.value)} 
      />
    </div>
  );
});
SearchBox.displayName = 'SearchBox';

const MarqueeText = ({ text, style }) => {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isMarquee, setIsMarquee] = useState(false);
  const [dist, setDist] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;

    setIsMarquee(false);

    const updateMarquee = () => {
      setIsMarquee(false);
      
      requestAnimationFrame(() => {
        const overflowDist = textEl.scrollWidth - container.clientWidth;
        if (overflowDist > 0) {
          setDist(-overflowDist - 20); 
          setIsMarquee(true);
        } else {
          setDist(0);
          setIsMarquee(false);
        }
      });
    };

    const observer = new ResizeObserver(() => {
      updateMarquee();
    });
    
    observer.observe(container);
    updateMarquee();

    return () => {
      observer.disconnect();
    };
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      className="marquee-container" 
      style={{ overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}
    >
      <span
        ref={textRef}
        className={isMarquee ? "marquee-text marquee-active" : "marquee-text"}
        style={{
          ...style,
          display: 'inline-block',
          whiteSpace: 'nowrap',
          willChange: 'transform',
          '--marquee-dist': `${dist}px`,
          '--marquee-duration': `${Math.max(6, Math.abs(dist) / 12)}s`
        }}
      >
        {text}
      </span>
    </div>
  );
};

const PlaylistDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const user = useAuthStore(s => s.user);
  const playSong = usePlayerStore(s => s.playSong);
  const currentSong = usePlayerStore(s => s.currentSong); 
  const isShuffle = usePlayerStore(s => s.isShuffle);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  
  // Önbellek ve Depolama Store bağlantıları
  const downloadedSongs = usePlayerStore(s => s.downloadedSongs);
  const deleteDownloadedSong = usePlayerStore(s => s.deleteDownloadedSong);
  const totalStorageSize = usePlayerStore(s => s.totalStorageSize);
  const downloadedFileSizes = usePlayerStore(s => s.downloadedFileSizes);
  const calculateStorageSize = usePlayerStore(s => s.calculateStorageSize);
  const clearAllDownloads = usePlayerStore(s => s.clearAllDownloads);

  const downloadQueue = usePlayerStore(s => s.downloadQueue);
  const addToDownloadQueueList = usePlayerStore(s => s.addToDownloadQueueList);
  const downloadQueueList = usePlayerStore(s => s.downloadQueueList);
  const localPlaylists = usePlayerStore(s => s.localPlaylists);
  const updateLocalPlaylistSongs = usePlayerStore(s => s.updateLocalPlaylistSongs);
  const updateLocalPlaylistName = usePlayerStore(s => s.updateLocalPlaylistName);
  const likedSongs = usePlayerStore(s => s.likedSongs);
  const isOfflineMode = usePlayerStore(s => s.isOfflineMode);
  const updatePlaylistLastPlayed = usePlayerStore(s => s.updatePlaylistLastPlayed);
  
  const [playlist, setPlaylist] = useState(null);
  const [songs, setSongs] = useState([]);
  const [isEditMode, setIsEditMode] = useState(location.state?.autoEdit || false);
  const [isNameEditing, setIsNameEditing] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const [sortOrder, setSortOrder] = useState(localStorage.getItem('novision_playlist_sort') || 'oldest');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(""); 
  const [isDownloadMode, setIsDownloadMode] = useState(false);
  const [selectedSongs, setSelectedSongs] = useState([]);
  const [isAddedToLibrary, setIsAddedToLibrary] = useState(false);
  const [isDailyMixRefreshing, setIsDailyMixRefreshing] = useState(false);
  
  // Depolama Arayüz Modalı
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);

  const ownerId = searchParams.get('owner') || (user ? user.uid : null);
  
  const isLocal = id.startsWith('local_');
  const isDownloadedFolder = id === 'downloaded';
  const isLiked = id === 'liked';
  const isDailyMix = id === 'daily_mix';
  const iTrendTR = id === 'trend_tr';
  const isTrendGlobal = id === 'trend_global';
  const isTrend = iTrendTR || isTrendGlobal;
  
  const isMyPlaylist = isLocal || (user && ownerId === user.uid);
  const canEdit = !isDownloadedFolder && !isLiked && !isTrend && !isDailyMix && isMyPlaylist && !playlist?.readonly;
  const isExternal = !isMyPlaylist && !isTrend && !isLiked && !isDownloadedFolder && !isDailyMix;

  useEffect(() => {
    if (isDownloadedFolder) {
      const dSongs = Object.values(downloadedSongs).map(d => ({ ...d.metadata, uniqueId: `${d.metadata.id}-dl` }));
      setPlaylist({ name: 'İndirilen Şarkılar', songs: dSongs });
      setSongs(dSongs);
      setEditNameValue('İndirilen Şarkılar');
      calculateStorageSize(); // Depolama alanını tetikle
    } else if (isLiked) {
      setPlaylist({ name: 'Beğenilen Şarkılar', songs: likedSongs });
      setSongs(likedSongs);
      setEditNameValue('Beğenilen Şarkılar');
    } else if (isDailyMix) {
      const mix = usePlayerStore.getState().dailyMix;
      const mixSongs = mix?.songs || [];
      setPlaylist({ name: 'Sizin İçin Karışım', songs: mixSongs });
      setSongs(mixSongs);
      setEditNameValue('Sizin İçin Karışım');
    } else if (iTrendTR) {
      getTrendings('TR').then(data => { setPlaylist({ name: 'Türkiye Trendleri', songs: data }); setSongs(data); setEditNameValue('Türkiye Trendleri'); });
    } else if (isTrendGlobal) {
      getTrendings('US').then(data => { setPlaylist({ name: 'Global Trendler', songs: data }); setSongs(data); setEditNameValue('Global Trendler'); });
    } else if (isLocal) {
      const pl = localPlaylists.find(p => p.id === id);
      if (pl) { setPlaylist(pl); setSongs(pl.songs || []); setEditNameValue(pl.name); }
    } else if (ownerId && navigator.onLine) {
      get(ref(db, `users/${ownerId}/playlists/${id}`)).then(snap => {
        if (snap.exists()) {
          const data = snap.val();
          setPlaylist(data);
          const loadedSongs = data.songs || [];
          setSongs(loadedSongs.map((s, i) => ({ ...s, uniqueId: s.uniqueId || `${s.id}-${Date.now()}-${i}` })));
          setEditNameValue(data.name);
        }
      });
    }

    if (user && isExternal && navigator.onLine) {
      get(ref(db, `users/${user.uid}/playlists`)).then(snap => {
        if (snap.exists()) {
          const myPlaylists = snap.val();
          const alreadyAdded = Object.values(myPlaylists).some(p => p.originalId === id);
          setIsAddedToLibrary(alreadyAdded);
        }
      });
    }
  }, [id, user, ownerId, downloadedSongs, localPlaylists, likedSongs, isExternal]);

  const handleSortChange = (val) => {
    setSortOrder(val);
    localStorage.setItem('novision_playlist_sort', val);
    setIsSortOpen(false);
  };

  const handleSaveToLibrary = async () => {
    if(!user) return toast.error("Giriş yapmalısınız!");
    if(isAddedToLibrary) return toast.error("Bu liste zaten kitaplığınızda!");

    const newRef = push(ref(db, `users/${user.uid}/playlists`));
    await set(newRef, {
      id: newRef.key,
      name: playlist.name,
      songs: songs,
      readonly: true,
      originalOwner: ownerId,
      originalId: id
    });
    setIsAddedToLibrary(true);
    toast.success("Kitaplığa eklendi!");
  };

  const handleRefreshDailyMix = async () => {
    if (isDailyMixRefreshing) return;
    setIsDailyMixRefreshing(true);
    
    const generateDailyMix = usePlayerStore.getState().generateDailyMix;
    await generateDailyMix(true); // Önbelleği atlayarak baştan hesaplamaya zorla
    
    const freshMix = usePlayerStore.getState().dailyMix;
    const freshSongs = freshMix?.songs || [];
    
    setPlaylist({ name: 'Sizin İçin Karışım', songs: freshSongs });
    setSongs(freshSongs);
    setIsDailyMixRefreshing(false);
    toast.success("Karışım listeniz yeniden analiz edilerek güncellendi!");
  };

  const onDragEnd = (result) => {
    if (!result.destination || !canEdit) return;
    const items = Array.from(songs);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setSongs(items);
  };

  const handleSaveEdit = async () => {
    if (!canEdit) return;
    if (isLocal) {
      updateLocalPlaylistSongs(id, songs);
      if (editNameValue.trim() !== "" && editNameValue !== playlist.name) {
        updateLocalPlaylistName(id, editNameValue);
        setPlaylist(prev => ({ ...prev, name: editNameValue }));
      }
    } else if (user && navigator.onLine) {
      await set(ref(db, `users/${user.uid}/playlists/${id}/songs`), songs);
      if (editNameValue.trim() !== "" && editNameValue !== playlist.name) {
        setPlaylist(prev => ({ ...prev, name: editNameValue }));
        await set(ref(db, `users/${user.uid}/playlists/${id}/name`), editNameValue);
      }
    }
    setIsEditMode(false); setIsNameEditing(false);
  };

  const handleRemoveSong = (index) => {
    if (!canEdit) return;
    const newSongs = [...songs]; newSongs.splice(index, 1); setSongs(newSongs);
  };

  const handlePlayAll = async () => {
    if (songs.length === 0) return toast.error("Liste boş!");
    const startIndex = isShuffle ? Math.floor(Math.random() * songs.length) : 0;
    playSong(songs[startIndex], songs, startIndex);
    
    updatePlaylistLastPlayed(id, isLocal, user);
  };

  const handlePlaySong = (song, index) => {
    playSong(song, displaySongs, index);
    updatePlaylistLastPlayed(id, isLocal, user);
  };

  const handleSelectAll = () => {
    const unDownloadedIds = songs
      .filter(song => !downloadedSongs[song.id])
      .map(song => song.id);
    setSelectedSongs(unDownloadedIds);
  };

  const handleUnselectAll = () => {
    setSelectedSongs([]);
  };

  const toggleSelectSong = (songId) => {
    setSelectedSongs(prev => 
      prev.includes(songId) 
        ? prev.filter(id => id !== songId) 
        : [...prev, songId]
    );
  };

  const handleStartBulkDownload = () => {
    const songsToDownload = songs.filter(song => selectedSongs.includes(song.id));
    if (songsToDownload.length > 0) {
      addToDownloadQueueList(songsToDownload);
      toast.success(`${songsToDownload.length} şarkı indirme sırasına eklendi.`);
    }
    setIsDownloadMode(false);
    setSelectedSongs([]);
  };

  const safeSongs = Array.isArray(songs) ? songs : [];
  
  let displaySongs = [];
  if (searchQuery.trim() !== "") {
    const scoredSongs = safeSongs
      .map(song => ({
        song,
        score: calculateSearchScore(song.title, song.channel, searchQuery)
      }))
      .filter(item => item.score > 0);
    
    scoredSongs.sort((a, b) => b.score - a.score);
    displaySongs = scoredSongs.map(item => item.song);
  } else {
    displaySongs = sortOrder === 'newest' ? [...safeSongs].reverse() : safeSongs;
  }

  if (!playlist) return <div style={{ color: 'gray', padding: '20px' }}>Yükleniyor...</div>;

  return (
    <div className="playlist-detail-page" onClick={() => setIsSortOpen(false)}>
      <div className="back-btn-container" onClick={() => navigate(-1)}><MdArrowBack size={28} /></div>

      <div className="playlist-header-large" style={{ display: 'flex', alignItems: 'center', gap: '25px' }}>
        
        {isLiked && (
          <div style={{ width: '120px', height: '120px', borderRadius: '12px', background: 'linear-gradient(135deg, #FF2A54, #8b0021)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, boxShadow: '0 10px 30px rgba(255, 42, 84, 0.4)' }}>
            <MdFavorite size={64} color="white" />
          </div>
        )}

        {isDownloadedFolder && (
          <div style={{ width: '120px', height: '120px', borderRadius: '12px', background: '#282828', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)' }}>
            <MdFileDownload size={64} color="white" />
          </div>
        )}

        {isDailyMix && (
          <div style={{ width: '120px', height: '120px', borderRadius: '12px', background: 'linear-gradient(135deg, #8B5CF6, #EC4899)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, boxShadow: '0 10px 30px rgba(139, 92, 246, 0.4)' }}>
            <span style={{ fontSize: '32px', color: 'white', fontWeight: 'bold' }}>Mix</span>
          </div>
        )}
        
        <div style={{ flex: 1 }}>
          {isNameEditing && canEdit ? (
            <div className="edit-name-container">
              <input type="text" className="edit-name-input" value={editNameValue} onChange={(e) => setEditNameValue(e.target.value)} autoFocus />
              <button className="icon-btn" onClick={() => setIsNameEditing(false)}><MdCheck size={28} color="var(--accent)" /></button>
            </div>
          ) : (
            <div className="title-container">
              <h1 className="playlist-huge-title">{editNameValue}</h1>
              {isEditMode && canEdit && <button className="icon-btn" onClick={() => setIsNameEditing(true)}><MdEdit size={24} color="var(--text-muted)" /></button>}
            </div>
          )}
          <p className="playlist-info-text">
            {safeSongs.length} Şarkı 
            {(playlist.readonly || isDailyMix) && " • (Salt Okunur)"}
            {isDownloadedFolder && ` • Cihazda kaplanan alan: ${totalStorageSize}`}
            {isLocal && " • (Yerel)"}
          </p>
        </div>
      </div>

      {isDownloadMode && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', marginBottom: '20px', backgroundColor: 'var(--bg-hover)', padding: '12px 15px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <button className="secondary-btn" onClick={handleSelectAll}>Hepsini Seç</button>
          <button className="secondary-btn" onClick={handleUnselectAll}>Seçimi Temizle</button>
          <button className="primary-btn" style={{ width: 'auto', padding: '8px 20px', background: 'var(--accent)', color: 'white' }} onClick={handleStartBulkDownload} disabled={selectedSongs.length === 0}>
            Seçilenleri İndir ({selectedSongs.length})
          </button>
          <button className="secondary-btn" style={{ marginLeft: 'auto' }} onClick={() => { setIsDownloadMode(false); setSelectedSongs([]); }}>İptal</button>
        </div>
      )}

      <div className="playlist-action-bar">
        {!isEditMode && !isDownloadMode && (
          <>
            <button className="play-pause-btn big-play" onClick={handlePlayAll}><MdPlayArrow size={32} color="white" /></button>
            <button className="icon-btn shuffle-btn" onClick={toggleShuffle} style={{ color: isShuffle ? 'var(--accent)' : 'var(--text-muted)' }}><MdShuffle size={32} /></button>
            
            {!isDownloadedFolder && safeSongs.length > 0 && navigator.onLine && (
              <button className="icon-btn" title="Toplu İndir" onClick={() => setIsDownloadMode(true)} style={{ marginLeft: '15px' }}>
                <MdFileDownload size={32} color="white" />
              </button>
            )}

            {/* İNDİRİLENLER İÇİN YEREL DEPOLAMA YÖNETİ̇M PANEL BUTONU */}
            {isDownloadedFolder && safeSongs.length > 0 && (
              <button 
                className="secondary-btn" 
                onClick={() => setIsStorageModalOpen(true)}
                style={{ marginLeft: '15px', background: '#242424', color: 'white', border: '1px solid var(--border)' }}
              >
                Depolama Yönetimi
              </button>
            )}

            {/* GÜNLÜK KARIŞIMI YENİDEN HESAPLAMA BUTONU */}
            {isDailyMix && navigator.onLine && (
              <button 
                className="secondary-btn" 
                onClick={handleRefreshDailyMix}
                disabled={isDailyMixRefreshing}
                style={{ 
                  marginLeft: '15px', display: 'flex', alignItems: 'center', gap: '6px', 
                  background: 'rgba(139, 92, 246, 0.2)', 
                  border: '1px solid rgba(139, 92, 246, 0.4)', 
                  color: 'white',
                  cursor: isDailyMixRefreshing ? 'not-allowed' : 'pointer'
                }}
              >
                <MdSync 
                  size={18} 
                  style={{ animation: isDailyMixRefreshing ? 'spin 1s linear infinite' : 'none' }} 
                /> 
                {isDailyMixRefreshing ? "Yenileniyor..." : "Yeniden Hesapla"}
              </button>
            )}

            {isExternal && (
              <button 
                className="secondary-btn" 
                onClick={handleSaveToLibrary} 
                disabled={isAddedToLibrary}
                style={{ 
                  marginLeft: '15px', display: 'flex', alignItems: 'center', gap: '8px', 
                  background: isAddedToLibrary ? 'var(--bg-active)' : 'var(--accent)', 
                  color: isAddedToLibrary ? 'var(--text-muted)' : 'white', 
                  border: 'none', cursor: isAddedToLibrary ? 'not-allowed' : 'pointer'
                }}
              >
                {isAddedToLibrary ? <><MdCheckCircle size={20} /> Eklendi</> : <><MdLibraryAdd size={20} /> Kitaplığa Ekle</>}
              </button>
            )}

            <div style={{ flex: 1 }}></div>
            <div className="sort-dropdown-container" style={{ position: 'relative' }}>
              <div className="sort-dropdown-header" onClick={(e) => { e.stopPropagation(); setIsSortOpen(!isSortOpen); }}>
                <span>{sortOrder === 'oldest' ? 'Eskiden Yeniye' : 'Yeniden Eskiye'}</span>
                <MdExpandMore size={20} />
              </div>
              {isSortOpen && (
                <div className="custom-dropdown-menu sort-menu">
                  <div className={`dropdown-item ${sortOrder === 'oldest' ? 'active' : ''}`} onClick={() => handleSortChange('oldest')}>Eskiden Yeniye</div>
                  <div className={`dropdown-item ${sortOrder === 'newest' ? 'active' : ''}`} onClick={() => handleSortChange('newest')}>Yeniden Eskiye</div>
                </div>
              )}
            </div>
          </>
        )}
        
        {canEdit && !isDownloadMode && (
          <button className="secondary-btn" onClick={isEditMode ? handleSaveEdit : () => { setSortOrder('oldest'); setSearchQuery(''); setIsEditMode(true); }} style={{ marginLeft: isEditMode ? 'auto' : '15px', background: isEditMode ? 'var(--accent)' : 'transparent', color: isEditMode ? 'white' : 'var(--text-muted)' }}>
            {isEditMode ? "Bitti" : "Düzenle"}
          </button>
        )}
      </div>

      {!isEditMode && !isDownloadMode && safeSongs.length > 5 && (
        <SearchBox defaultValue={searchQuery} onSearchChange={setSearchQuery} />
      )}

      {downloadQueueList.length > 0 && (
        <p style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 'bold', marginBottom: '15px' }}>Sırada bekleyen {downloadQueueList.length} indirme var...</p>
      )}

      <div className="playlist-songs">
        {displaySongs.length === 0 ? (
          <p style={{ color: 'gray', margin: '30px 0', textAlign: 'center' }}>Aranan kriterlere uygun şarkı bulunamadı.</p>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="songs" isDropDisabled={!isEditMode || isDownloadMode || searchQuery !== ""}>
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {displaySongs.map((song, displayIndex) => {
                    const trueIndex = safeSongs.findIndex(s => s.uniqueId === song.uniqueId);
                    const isSongDownloaded = !!downloadedSongs[song.id];
                    const isSongDownloading = downloadQueue.includes(song.id);
                    const isSongInWaitQueue = downloadQueueList.some(q => q.id === song.id);

                    const rowThumb = (isOfflineMode && downloadedSongs[song.id]?.localThumbUrl)
                                     ? downloadedSongs[song.id].localThumbUrl
                                     : (song.thumbnail || '')
                                       .replace('hqdefault.jpg', 'mqdefault.jpg')
                                       .replace('sddefault.jpg', 'mqdefault.jpg');
                    
                    const isCurrentPlaying = currentSong?.id === song.id;

                    return (
                      <Draggable key={song.uniqueId} draggableId={song.uniqueId} index={trueIndex !== -1 ? trueIndex : displayIndex} isDragDisabled={!isEditMode || isDownloadMode}>
                        {(provided, snapshot) => (
                          <div className={`song-row dnd-row ${snapshot.isDragging ? 'dragging' : ''} ${isEditMode ? 'edit-mode' : ''} ${isCurrentPlaying ? 'active' : ''}`} ref={provided.innerRef} {...provided.draggableProps}>
                            {isEditMode && canEdit && <div className="drag-handle" {...provided.dragHandleProps}><MdDragIndicator size={24} color="gray" /></div>}
                            
                            {isDownloadMode && <input type="checkbox" checked={selectedSongs.includes(song.id)} onChange={() => toggleSelectSong(song.id)} disabled={isSongDownloaded} style={{ width: '20px', height: '20px', marginRight: '15px', cursor: isSongDownloaded ? 'not-allowed' : 'pointer', accentColor: 'var(--accent)' }} />}

                            <div className="song-thumb-container" onClick={() => !isEditMode && !isDownloadMode && handlePlaySong(song, displayIndex)}>
                              <img src={rowThumb} alt={song.title} className="song-thumb" />
                              {!isEditMode && !isDownloadMode && <div className="play-overlay"><MdPlayArrow size={24} color="white" /></div>}
                            </div>

                            <div className="song-info" onClick={() => !isEditMode && !isDownloadMode && handlePlaySong(song, displayIndex)}>
                              <div className="song-title" style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', width: '100%' }}>
                                <div style={{ flex: 1, overflow: 'hidden' }}>
                                  {isCurrentPlaying ? (
                                    <MarqueeText text={song.title} style={{ color: 'var(--accent)', fontWeight: '600' }} />
                                  ) : (
                                    <span style={{ color: 'white' }}>{song.title}</span>
                                  )}
                                </div>
                                {isSongDownloaded && <span style={{ fontSize: '10px', background: 'rgba(255,42,84,0.15)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '50px', flexShrink: 0 }}>Çevrimdışı</span>}
                                {isSongDownloading && <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.1)', color: 'white', padding: '2px 6px', borderRadius: '50px', flexShrink: 0 }}>İniyor...</span>}
                                {isSongInWaitQueue && <span style={{ fontSize: '10px', color: 'gray', flexShrink: 0 }}>Sırada</span>}
                              </div>
                              <div className="song-channel">{song.channel}</div>
                            </div>
                            {isEditMode && canEdit && <button className="icon-btn" style={{ color: '#ff4d4d' }} onClick={() => handleRemoveSong(trueIndex)}><MdDelete size={24} /></button>}
                          </div>
                        )}
                      </Draggable>
                    )
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* --- DEPOLAMA VE ÖNBELLEK KONTROL PANELİ MODALI --- */}
      {isStorageModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-content" style={{ width: '90%', maxWidth: '420px', padding: '25px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ color: 'white', margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Depolama Yönetimi</h3>
              <button className="icon-btn" onClick={() => setIsStorageModalOpen(false)}>
                <MdClose size={24} />
              </button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.4' }}>
              Cihazınızda çevrimdışı dinleme için ayrılan toplam alan: <strong style={{ color: 'white' }}>{totalStorageSize}</strong>
            </p>

            <button 
              className="primary-btn" 
              onClick={() => {
                toast((t) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '220px', padding: '10px 5px' }}>
                    <span style={{ fontSize: '15px', fontWeight: '500', textAlign: 'center', color: 'white' }}>
                      TÜM çevrimdışı şarkıları silmek istediğinize emin misiniz?
                    </span>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '5px' }}>
                      <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => toast.dismiss(t.id)}>İptal</button>
                      <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#ff4d4d', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={async () => {
                         toast.dismiss(t.id);
                         await clearAllDownloads();
                         setIsStorageModalOpen(false);
                      }}>Hepsini Sil</button>
                    </div>
                  </div>
                ), { duration: Infinity, position: 'top-center' });
              }}
              style={{ background: '#ff4d4d', color: 'white', marginBottom: '20px', fontSize: '14px', padding: '12px', borderRadius: '50px', border: 'none', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}
            >
              Tüm İndirmeleri Temizle
            </button>

            <h4 style={{ color: 'white', fontSize: '14px', marginBottom: '12px', fontWeight: 'bold' }}>Kayıtlı Çevrimdışı Şarkılar:</h4>

            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '5px' }}>
              {Object.values(downloadedSongs).map(song => (
                <div 
                  key={song.metadata.id} 
                  style={{
                    display: 'flex', alignItems: 'center', justify: 'space-between', 
                    padding: '10px', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid var(--border)'
                  }}
                >
                  <div style={{ flex: 1, overflow: 'hidden', marginRight: '10px' }}>
                    <div style={{ color: 'white', fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {song.metadata.title}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '2px' }}>
                      {downloadedFileSizes[song.metadata.id] || "Hesaplanıyor..."}
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      toast((t) => (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', minWidth: '220px', padding: '10px 5px' }}>
                          <span style={{ fontSize: '15px', fontWeight: '500', textAlign: 'center', color: 'white' }}>
                            "{song.metadata.title}" çevrimdışı indirilenlerden silinsin mi?
                          </span>
                          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '5px' }}>
                            <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#444', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => toast.dismiss(t.id)}>İptal</button>
                            <button style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: '#ff4d4d', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} onClick={async () => {
                               toast.dismiss(t.id);
                               await deleteDownloadedSong(song.metadata.id);
                            }}>Sil</button>
                          </div>
                        </div>
                      ), { duration: Infinity, position: 'top-center' });
                    }}
                    style={{ background: 'transparent', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    Sil
                  </button>
                </div>
              ))}
              {Object.keys(downloadedSongs).length === 0 && (
                <p style={{ color: 'gray', fontSize: '12px', textAlign: 'center', marginTop: '10px' }}>İndirilmiş şarkı bulunmuyor.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PlaylistDetail;