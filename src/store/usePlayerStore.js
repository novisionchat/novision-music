import { create } from 'zustand';
import { auth, db } from '../firebase';
import { ref, set as firebaseSet, get as firebaseGet } from 'firebase/database';
import localforage from 'localforage';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { AudioPlayer } from '@mediagrid/capacitor-native-audio';
import toast from 'react-hot-toast';

localforage.config({ name: 'NovisionMusic', storeName: 'offline_songs' });

const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const safeReadJSON = async (Filesystem, Directory, path) => {
  try {
    const res = await Filesystem.readFile({ path, directory: Directory.Data, encoding: 'utf8' });
    return JSON.parse(res.data);
  } catch (e) { return null; }
};

const safeWriteJSON = async (Filesystem, Directory, path, data) => {
  try { await Filesystem.writeFile({ path, data: JSON.stringify(data), directory: Directory.Data, encoding: 'utf8' }); } 
  catch (e) { console.error("Yazma hatası:", e); }
};

// --- YARDIMCI METADATA TEMİZLEME VE PARSE İŞLEVLERİ ---
const cleanArtistName = (channel) => {
  if (!channel) return "";
  return channel
    .replace(/\s*-\s*Topic$/gi, '')
    .replace(/\s*VEVO$/gi, '')
    .replace(/\s*Official$/gi, '')
    .replace(/\s*Music$/gi, '')
    .replace(/\s*Records$/gi, '')
    .trim();
};

const cleanTrackTitle = (title) => {
  if (!title) return "";
  return title
    .replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyrics|lyric|hd|4k|mv|music|clip|prod|remix|feat|ft|visualizer|cover)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*(official\s*video|official\s*audio|lyric\s*video|official\s*lyrics|clip\s*officiel|music\s*video|mv|visualizer|hd|4k)/gi, '')
    .replace(/\s*-\s*Lyrics$/gi, '')
    .replace(/\s*[\(\[]\s*[\)\]]/g, '')
    .trim();
};

const parseSyncedLyrics = (syncedLyricsText) => {
  if (!syncedLyricsText) return [];
  const parsed = [];
  const lines = syncedLyricsText.split('\n');
  for (let line of lines) {
    const match = line.match(/\[(\d+):(\d+)(?:\.(\d+))?\](.*)/);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const msVal = match[3] ? parseInt(match[3], 10) : 0;
      const msFactor = match[3] ? Math.pow(10, match[3].length) : 1000;
      const time = min * 60 + sec + (msVal / msFactor);
      const text = match[4].trim();
      if (text) {
        parsed.push({ time, text });
      }
    }
  }
  return parsed;
};

// --- KELİME BENZERLİK SKORU ALGORİTMASI (Overlap Coefficient) ---
const getSimilarityScore = (str1, str2) => {
  if (!str1 || !str2) return 0;
  
  const cleanAndSplit = (str) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9ıışşğğççööüü]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  };

  const words1 = cleanAndSplit(str1);
  const words2 = cleanAndSplit(str2);
  
  const w1 = new Set(words1);
  const w2 = new Set(words2);
  
  if (w1.size === 0 || w2.size === 0) return 0;
  
  let intersection = 0;
  for (let w of w1) {
    if (w2.has(w)) intersection++;
  }
  
  return intersection / Math.min(w1.size, w2.size);
};

// --- SIKI DOĞRULAMA FİLTRESİ (Yalancı Eşleşmeleri Önler) ---
const verifyLyricsMatch = (searchedArtist, searchedTitle, searchedDuration, result) => {
  if (!result) return false;
  
  const returnedArtist = result.artistName;
  const returnedTitle = result.trackName;
  const returnedDuration = result.duration;

  if (searchedDuration > 0 && returnedDuration > 0) {
    const diff = Math.abs(searchedDuration - returnedDuration);
    if (diff > 25) {
      return false; 
    }
  }

  const titleScore = getSimilarityScore(searchedTitle, returnedTitle);
  const artistScore = getSimilarityScore(searchedArtist, returnedArtist);

  if (titleScore >= 0.75 && artistScore >= 0.5) {
    return true;
  }

  return false;
};

// --- AKILLI ÇOKLU ADAY ÜRETİCİSİ ---
const getCandidatePairs = (channel, title) => {
  const pairs = [];
  
  const rawChannelClean = cleanArtistName(channel);
  const rawTitleClean = cleanTrackTitle(title);
  
  pairs.push({ artist: rawChannelClean, title: rawTitleClean });
  
  const dashRegex = /\s*[-–—]\s*/;
  if (dashRegex.test(rawTitleClean)) {
    const parts = rawTitleClean.split(dashRegex);
    if (parts.length >= 2) {
      const part1 = parts[0];
      const part2 = parts.slice(1).join(' - ');
      
      const cleanPart1 = cleanArtistName(part1);
      const cleanPart2 = cleanTrackTitle(part2);
      
      if (cleanPart1 && cleanPart2) {
        pairs.push({ artist: cleanPart1, title: cleanPart2 });
        pairs.push({ artist: cleanPart2, title: cleanPart1 });
      }
    }
  }
  
  const uniquePairs = [];
  const seen = new Set();
  for (const p of pairs) {
    if (!p.artist || !p.title) continue;
    const key = `${p.artist.toLowerCase()}|||${p.title.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePairs.push(p);
    }
  }
  
  return uniquePairs;
};

// --- GELİŞTİRİLMİŞ ÇOK AŞAMALI ŞARKI SÖZÜ MOTORU ---
const fetchLyricsFromLrcLib = async (channel, title, duration) => {
  const userAgent = 'NovisionMusic v1.0.0 (https://github.com/novision/music)';
  const candidates = getCandidatePairs(channel, title);
  
  if (duration && duration > 0) {
    for (const cand of candidates) {
      try {
        const getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cand.artist)}&track_name=${encodeURIComponent(cand.title)}&duration=${Math.round(duration)}`;
        const getRes = await fetch(getUrl, { headers: { 'User-Agent': userAgent } });
        if (getRes.ok) {
          const data = await getRes.json();
          if (data && (data.syncedLyrics || data.plainLyrics || data.instrumental)) {
            if (verifyLyricsMatch(cand.artist, cand.title, duration, data)) {
              return data;
            }
          }
        }
      } catch (e) {
        console.warn(`Lrclib /api/get adayı için başarısız (${cand.artist} - ${cand.title}):`, e);
      }
    }
  }

  for (const cand of candidates) {
    try {
      const searchUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(cand.title)}&artist_name=${encodeURIComponent(cand.artist)}`;
      const searchRes = await fetch(searchUrl, { headers: { 'User-Agent': userAgent } });
      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data && data.length > 0) {
          const verifiedMatches = data.filter(item => 
            verifyLyricsMatch(cand.artist, cand.title, duration, item)
          );
          
          if (verifiedMatches.length > 0) {
            let bestMatch = verifiedMatches.find(item => item.syncedLyrics);
            if (!bestMatch) bestMatch = verifiedMatches.find(item => item.plainLyrics);
            if (!bestMatch) bestMatch = verifiedMatches[0];
            return bestMatch;
          }
        }
      }
    } catch (e) {
      console.warn(`Lrclib yapılandırılmış arama adayı için başarısız (${cand.artist} - ${cand.title}):`, e);
    }
  }

  for (const cand of candidates) {
    try {
      const queryUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(cand.artist + " " + cand.title)}`;
      const queryRes = await fetch(queryUrl, { headers: { 'User-Agent': userAgent } });
      if (queryRes.ok) {
        const data = await queryRes.json();
        if (data && data.length > 0) {
          const verifiedMatches = data.filter(item => 
            verifyLyricsMatch(cand.artist, cand.title, duration, item)
          );
          
          if (verifiedMatches.length > 0) {
            let bestMatch = verifiedMatches.find(item => item.syncedLyrics);
            if (!bestMatch) bestMatch = verifiedMatches.find(item => item.plainLyrics);
            if (!bestMatch) bestMatch = verifiedMatches[0];
            return bestMatch;
          }
        }
      }
    } catch (e) {
      console.warn(`Lrclib fuzzy arama adayı için başarısız (${cand.artist} - ${cand.title}):`, e);
    }
  }

  try {
    const rawTitleClean = cleanTrackTitle(title);
    const queryUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(rawTitleClean)}`;
    const queryRes = await fetch(queryUrl, { headers: { 'User-Agent': userAgent } });
    if (queryRes.ok) {
      const data = await queryRes.json();
      if (data && data.length > 0) {
        for (const cand of candidates) {
          const verifiedMatches = data.filter(item => 
            verifyLyricsMatch(cand.artist, cand.title, duration, item)
          );
          if (verifiedMatches.length > 0) {
            let bestMatch = verifiedMatches.find(item => item.syncedLyrics);
            if (!bestMatch) bestMatch = verifiedMatches.find(item => item.plainLyrics);
            if (!bestMatch) bestMatch = verifiedMatches[0];
            return bestMatch;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Lrclib fallback sadece başlık araması başarısız:", e);
  }

  return null;
};

const usePlayerStore = create((set, get) => ({
  currentSong: null, 
  queue: [], 
  currentIndex: -1, 
  isPlaying: false,
  volume: 100, 
  currentTime: 0, 
  duration: 0, 
  
  playerRef: null, 
  html5PlayerRef: null,  
  activeEngine: 'youtube', 
  downloadedSongs: {},
  downloadedMetadata: {}, 
  localPlaylists: [],     
  isOfflineMode: !navigator.onLine, 
  currentStreamUrl: null, 
  
  downloadQueue: [], 
  downloadProgress: {}, 
  downloadXHRs: {}, 
  downloadQueueList: [],

  // --- AKILLI KARIŞIK ÇALMA VE ÖN YÜKLEME STATE TANIMLARI ---
  shuffleOrder: [],
  shuffleCursor: -1,
  isPrefetched: false,
  prefetchAudioObj: null,

  // --- DEPOLAMA VE ÖNBELLEK STATE TANIMLARI ---
  totalStorageSize: "0.0 MB",
  downloadedFileSizes: {},

  // --- BEĞENİLENLER SİSTEMİ ---
  likedSongs: [],
  setLikedSongs: (songs) => set({ likedSongs: songs || [] }),
  toggleLike: async (song) => {
    const state = get();
    const isLiked = state.likedSongs.some(s => s.id === song.id);
    let newLiked = [];
    
    if (isLiked) {
      newLiked = state.likedSongs.filter(s => s.id !== song.id);
      toast("Şarkı beğenilenlerden çıkarıldı", { icon: '💔' });
    } else {
      newLiked = [song, ...state.likedSongs];
      toast.success("Şarkı beğenilenlere eklendi!");
    }
    
    set({ likedSongs: newLiked });
    
    if (auth.currentUser && navigator.onLine) {
      await firebaseSet(ref(db, `users/${auth.currentUser.uid}/likedSongs`), newLiked);
    }
  },

  isPanelOpen: false, 
  isPanelFullscreen: false,
  isShuffle: false, 
  isRepeat: false,
  history: [], 
  historyCursor: -1, 
  songToAdd: null, 
  isAddModalOpen: false,
  lyrics: [], 
  isLyricsLoading: false, 
  isVideoMode: false,
  nativeProgressInterval: null,

  // --- ARKA PLAN / SES SİSTEMİ ÇEVİRİ DESTEĞİ ---
  translatedLyrics: [],
  isTranslationLoading: false,
  showTranslation: false,
  targetLanguage: localStorage.getItem('lyrics_target_language') || 'tr',
  detectedLanguage: 'AUTO',
  lyricsTimeoutId: null,

  setVideoMode: (val) => {
    if (val && !navigator.onLine) {
      toast.error("İnternet bağlantınız yok. Video oynatılamaz.");
      return;
    }
    set({ isVideoMode: val });
  },

  openAddModal: (song) => set({ songToAdd: song, isAddModalOpen: true }),
  closeAddModal: () => set({ songToAdd: null, isAddModalOpen: false }),
  setPlayerRef: (ref) => set({ playerRef: ref }),
  setHtml5PlayerRef: (ref) => set({ html5PlayerRef: ref }),
  setOfflineMode: (status) => set({ isOfflineMode: status }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  closePanel: () => set({ isPanelOpen: false, isPanelFullscreen: false }), 
  toggleFullscreen: () => set((state) => ({ isPanelFullscreen: !state.isPanelFullscreen })),
  toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),

  // --- AKILLI KARIŞIK ÇALMA EYLEMLERİ ---
  toggleShuffle: () => {
    const state = get();
    const nextShuffle = !state.isShuffle;
    set({ isShuffle: nextShuffle });
    if (nextShuffle && state.queue.length > 0) {
      get().generateShuffleOrder(state.currentIndex);
    } else {
      set({ shuffleOrder: [], shuffleCursor: -1 });
    }
  },

  generateShuffleOrder: (startingIndex = 0) => {
    const { queue } = get();
    if (queue.length === 0) return;
    
    let indices = Array.from({ length: queue.length }, (_, i) => i);
    indices = indices.filter(idx => idx !== startingIndex);
    
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    const finalOrder = [startingIndex, ...indices];
    set({ shuffleOrder: finalOrder, shuffleCursor: 0 });
  },

  // --- SONRAKİ ŞARKIYI ÖN YÜKLEME (PRE-FETCHING) ---
  prefetchNextSong: async () => {
    const state = get();
    if (state.isPrefetched || !navigator.onLine) return;

    let nextIndex = -1;
    if (state.isShuffle) {
      const nextCursor = state.shuffleCursor + 1;
      if (nextCursor < state.shuffleOrder.length) {
        nextIndex = state.shuffleOrder[nextCursor];
      }
    } else {
      if (state.currentIndex < state.queue.length - 1) {
        nextIndex = state.currentIndex + 1;
      }
    }

    if (nextIndex === -1) return;
    const nextSong = state.queue[nextIndex];
    if (!nextSong) return;

    if (state.downloadedSongs[nextSong.id]) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const streamUrl = `${apiUrl}/api/download?id=${nextSong.id}`;

    console.log(`🚀 Sonraki şarkı önceden yükleniyor: ${nextSong.title}`);

    let audioObj = state.prefetchAudioObj;
    if (!audioObj) {
      audioObj = new Audio();
      set({ prefetchAudioObj: audioObj });
    }

    audioObj.src = streamUrl;
    audioObj.preload = "auto";
    set({ isPrefetched: true });
  },

  // --- SIRADAKİ ŞARKILAR (QUEUE) SİSTEMİ ---
  removeFromQueue: (index) => {
    const { queue, currentIndex, playSong, isShuffle, shuffleOrder, shuffleCursor } = get();
    if (queue.length <= 1) {
      toast.error("Sıradaki son şarkıyı listeden çıkaramazsınız.");
      return;
    }
    
    const newQueue = [...queue];
    newQueue.splice(index, 1);
    
    let newIndex = currentIndex;
    if (index === currentIndex) {
      newIndex = index >= newQueue.length ? 0 : index;
    } else if (index < currentIndex) {
      newIndex = currentIndex - 1;
    }

    if (isShuffle && shuffleOrder.length > 0) {
      const positionInShuffle = shuffleOrder.indexOf(index);
      let newShuffleOrder = shuffleOrder.filter(idx => idx !== index);
      newShuffleOrder = newShuffleOrder.map(idx => idx > index ? idx - 1 : idx);
      
      let newShuffleCursor = shuffleCursor;
      if (positionInShuffle === shuffleCursor) {
        newShuffleCursor = shuffleCursor >= newShuffleOrder.length ? 0 : shuffleCursor;
        const nextOriginalIndex = newShuffleOrder[newShuffleCursor];
        set({ queue: newQueue, currentIndex: nextOriginalIndex, shuffleOrder: newShuffleOrder, shuffleCursor: newShuffleCursor });
        playSong(newQueue[nextOriginalIndex], newQueue, nextOriginalIndex, true, true);
      } else {
        if (positionInShuffle < shuffleCursor) {
          newShuffleCursor = shuffleCursor - 1;
        }
        set({ queue: newQueue, currentIndex: newIndex, shuffleOrder: newShuffleOrder, shuffleCursor: newShuffleCursor });
      }
    } else {
      if (index === currentIndex) {
        set({ queue: newQueue, currentIndex: newIndex });
        playSong(newQueue[newIndex], newQueue, newIndex);
      } else {
        set({ queue: newQueue, currentIndex: newIndex });
      }
    }
    
    toast.success("Şarkı sıradan çıkarıldı.");
  },

  moveQueueItem: (fromIndex, direction) => {
    const { queue, currentIndex, isShuffle, shuffleOrder, shuffleCursor } = get();
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    
    if (isShuffle && shuffleOrder.length > 0) {
      if (toIndex < 0 || toIndex >= shuffleOrder.length) return;
      const newShuffleOrder = [...shuffleOrder];
      const [moved] = newShuffleOrder.splice(fromIndex, 1);
      newShuffleOrder.splice(toIndex, 0, moved);
      
      let newShuffleCursor = shuffleCursor;
      if (shuffleCursor === fromIndex) {
        newShuffleCursor = toIndex;
      } else if (shuffleCursor === toIndex) {
        newShuffleCursor = fromIndex;
      }
      
      set({ shuffleOrder: newShuffleOrder, shuffleCursor: newShuffleCursor });
    } else {
      if (toIndex < 0 || toIndex >= queue.length) return;
      const newQueue = [...queue];
      const [movedItem] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedItem);
      
      let newIndex = currentIndex;
      if (currentIndex === fromIndex) {
        newIndex = toIndex;
      } else if (currentIndex === toIndex) {
        newIndex = fromIndex;
      }
      set({ queue: newQueue, currentIndex: newIndex });
    }
  },

  // --- DEPOLAMA BOYUTU VE TEMİZLEME KONTROLLERİ ---
  calculateStorageSize: async () => {
    const state = get();
    const { downloadedSongs } = state;
    let totalBytes = 0;
    const sizes = {};

    if (window.Capacitor) {
      for (let id of Object.keys(downloadedSongs)) {
        try {
          const fileInfo = await Filesystem.stat({
            path: `${id}.mp3`,
            directory: Directory.Data
          });
          if (fileInfo && fileInfo.size) {
            totalBytes += fileInfo.size;
            sizes[id] = (fileInfo.size / (1024 * 1024)).toFixed(1) + " MB";
          } else {
            sizes[id] = "Bilinmiyor";
          }
        } catch (e) {
          sizes[id] = "Bilinmiyor";
        }
      }
    } else {
      for (let id of Object.keys(downloadedSongs)) {
        sizes[id] = "Yaklaşık 5.5 MB";
        totalBytes += 5.5 * 1024 * 1024;
      }
    }

    const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
    set({ 
      totalStorageSize: `${totalMB} MB`,
      downloadedFileSizes: sizes
    });
  },

  clearAllDownloads: async () => {
    const state = get();
    const ids = Object.keys(state.downloadedSongs);
    if (ids.length === 0) {
      toast.error("Temizlenecek indirme yok.");
      return;
    }

    for (let id of ids) {
      await state.deleteDownloadedSong(id);
    }
    
    toast.success("Tüm indirmeler ve önbellek temizlendi!");
    get().calculateStorageSize();
  },

  initOfflineStorage: async () => {
    try {
      const handleVisibilityChange = () => {
        const isActive = document.visibilityState === 'visible';
        get().handleAppStateChange(isActive);
      };
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      let metadata = {}; 
      let lPlaylists = []; 
      let loadedSongs = {};

      if (window.Capacitor) {
        try {
          metadata = (await safeReadJSON(Filesystem, Directory, 'downloaded_metadata.json')) || {};
        } catch (e) { console.error("Metadata yükleme hatası:", e); }

        try {
          lPlaylists = (await safeReadJSON(Filesystem, Directory, 'local_playlists.json')) || [];
        } catch (e) { console.error("Yerel çalma listesi yükleme hatası:", e); }

        set({ downloadedMetadata: metadata, localPlaylists: lPlaylists });

        try {
          const result = await Filesystem.readdir({ path: '', directory: Directory.Data });
          if (result && result.files) {
            for (let file of result.files) {
              const fileName = typeof file === 'string' ? file : file.name;
              if (fileName && fileName.endsWith('.mp3')) {
                const id = fileName.replace('.mp3', '');
                const audioUri = await Filesystem.getUri({ path: fileName, directory: Directory.Data });
                
                let localThumbUrl = null;
                let localThumbFileUrl = null; 
                
                const hasThumb = result.files.some(f => {
                  const fName = typeof f === 'string' ? f : f.name;
                  return fName === `${id}_thumb.jpg`;
                });

                if (hasThumb) {
                  try {
                    const thumbUri = await Filesystem.getUri({ path: `${id}_thumb.jpg`, directory: Directory.Data });
                    localThumbUrl = window.Capacitor.convertFileSrc(thumbUri.uri); 
                    localThumbFileUrl = thumbUri.uri; 
                  } catch (err) { console.error("Küçük resim okuma hatası:", err); }
                }

                loadedSongs[id] = {
                  localAudioUrl: window.Capacitor.convertFileSrc(audioUri.uri),
                  localNativeUrl: audioUri.uri,
                  localThumbUrl: localThumbUrl || '/icon.png',
                  localThumbFileUrl: localThumbFileUrl || '/icon.png',
                  metadata: metadata[id] || { id, title: "Çevrimdışı Şarkı", channel: "Bilinmeyen Sanatçı", thumbnail: localThumbUrl || '/icon.png', lyrics: [] }
                };
              }
            }
          }
          set({ downloadedSongs: loadedSongs });
          get().calculateStorageSize(); 
          console.log(`📦 [APK - Cihaz Hafızası] ${Object.keys(loadedSongs).length} çevrimdışı şarkı yüklendi.`);
        } catch (dirError) {
          console.warn("İndirilen müzik klasörü henüz boş:", dirError);
        }

      } else {
        try {
          metadata = (await localforage.getItem('downloaded_metadata')) || {};
          lPlaylists = (await localforage.getItem('local_playlists')) || [];
          set({ downloadedMetadata: metadata, localPlaylists: lPlaylists });

          const keys = await localforage.keys();
          for (let id of keys) {
            if (id.endsWith('-thumb') || id === 'downloaded_metadata' || id === 'local_playlists') continue;
            const blob = await localforage.getItem(id);
            const thumbBlob = await localforage.getItem(`${id}-thumb`);
            if (blob) {
              const localThumbUrl = thumbBlob ? URL.createObjectURL(thumbBlob) : null;
              loadedSongs[id] = { 
                localAudioUrl: URL.createObjectURL(blob), 
                localNativeUrl: URL.createObjectURL(blob),
                localThumbUrl: localThumbUrl || '/icon.png',
                localThumbFileUrl: localThumbUrl || '/icon.png',
                metadata: metadata[id] || { id, title: "Çevrimdışı", channel: "Sanatçı", thumbnail: localThumbUrl || '/icon.png', lyrics: [] }
              }; 
            }
          }
          set({ downloadedSongs: loadedSongs });
          get().calculateStorageSize(); 
          console.log(`📦 [TARAYICI - IndexedDB] ${Object.keys(loadedSongs).length} çevrimdışı şarkı Blob olarak yüklendi.`);
        } catch (webError) {
          console.error("Tarayıcı önbellek yükleme hatası:", webError);
        }
      }
    } catch (e) { console.error("Offline DB yüklenirken genel hata:", e); }
  },

  saveLocalPlaylists: async (newPlaylists) => {
    set({ localPlaylists: newPlaylists });
    if (window.Capacitor) {
      await safeWriteJSON(Filesystem, Directory, 'local_playlists.json', newPlaylists);
    } else { await localforage.setItem('local_playlists', newPlaylists); }
  },
  createLocalPlaylist: (name) => {
    const newPlaylist = { id: `local_${Date.now()}`, name, songs: [], lastPlayed: 0 };
    get().saveLocalPlaylists([...get().localPlaylists, newPlaylist]);
  },
  updateLocalPlaylistSongs: (id, songs) => { get().saveLocalPlaylists(get().localPlaylists.map(pl => pl.id === id ? { ...pl, songs } : pl)); },
  updateLocalPlaylistName: (id, name) => { get().saveLocalPlaylists(get().localPlaylists.map(pl => pl.id === id ? { ...pl, name } : pl)); },
  deleteLocalPlaylist: (id) => { get().saveLocalPlaylists(get().localPlaylists.filter(pl => pl.id !== id)); },

  // --- ÇALMA LİSTESİ SON OYNATMA ZAMANINI GÜNCELLEME SİSTEMİ ---
  updatePlaylistLastPlayed: async (playlistId, isLocal, user) => {
    // DÜZELTME: Sistem listelerinin (indirilenler, beğenilenler, trendler) veritabanında hayalet liste oluşturması engellendi.
    if (playlistId === 'downloaded' || playlistId === 'liked' || playlistId === 'trend_tr' || playlistId === 'trend_global') {
      return; 
    }
    const now = Date.now();
    if (isLocal) {
      const updated = get().localPlaylists.map(p => p.id === playlistId ? { ...p, lastPlayed: now } : p);
      get().saveLocalPlaylists(updated);
    } else if (user && navigator.onLine) {
      await firebaseSet(ref(db, `users/${user.uid}/playlists/${playlistId}/lastPlayed`), now);
    }
  },

  addToDownloadQueueList: (songs) => {
    const state = get();
    const newSongs = songs.filter(song => !state.downloadedSongs[song.id] && !state.downloadQueue.includes(song.id) && !state.downloadQueueList.some(q => q.id === song.id));
    if (newSongs.length === 0) return;
    set((s) => ({ downloadQueueList: [...s.downloadQueueList, ...newSongs] }));
    if (get().downloadQueue.length === 0) get()._processDownloadQueue();
  },

  _processDownloadQueue: async () => {
    const state = get();
    if (state.downloadQueueList.length === 0) return;
    const nextSong = state.downloadQueueList[0];
    set((s) => ({ downloadQueueList: s.downloadQueueList.slice(1) }));
    try { await get().downloadSong(nextSong); } catch (err) {}
    get()._processDownloadQueue();
  },

  downloadSong: (song) => {
    return new Promise((resolve, reject) => {
      const state = get();
      if (state.downloadedSongs[song.id] || state.downloadQueue.includes(song.id)) { resolve(); return; }
      const xhr = new XMLHttpRequest();
      set((s) => ({ downloadQueue: [...s.downloadQueue, song.id], downloadProgress: { ...s.downloadProgress, [song.id]: 0 }, downloadXHRs: { ...s.downloadXHRs, [song.id]: xhr } }));

      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        xhr.responseType = 'blob';
        xhr.open('GET', `${apiUrl}/api/download?id=${song.id}`, true);
        xhr.onprogress = (event) => {
          if (event.lengthComputable) set((s) => ({ downloadProgress: { ...s.downloadProgress, [song.id]: Math.round((event.loaded / event.total) * 100) } }));
        };
        xhr.onload = async () => {
          if (xhr.status === 200 || xhr.status === 206) {
            const blob = xhr.response;
            let thumbBlob = null;
            try {
              const thumbRes = await fetch(song.thumbnail);
              if (thumbRes.ok) thumbBlob = await thumbRes.blob();
            } catch (e) {}

            let fetchedLyrics = [];
            try {
              const lyricsData = await fetchLyricsFromLrcLib(song.channel, song.title, song.duration || 0);
              
              if (lyricsData) {
                if (lyricsData.instrumental) {
                  fetchedLyrics = [{ time: 0, text: "✦ Enstrümantal ✦" }];
                } else if (lyricsData.syncedLyrics) {
                  fetchedLyrics = parseSyncedLyrics(lyricsData.syncedLyrics);
                } else if (lyricsData.plainLyrics) {
                  lyricsData.plainLyrics.split('\n').forEach((line, idx) => {
                    if (line.trim()) fetchedLyrics.push({ time: idx * 999999, text: line.trim() });
                  });
                }
              }
            } catch (e) {
              console.error("İndirme sırasında söz alınamadı:", e);
            }

            let localAudioUrl = ""; let localThumbUrl = null;
            let localNativeUrl = "";
            const newMetadata = { id: song.id, title: song.title, channel: song.channel, thumbnail: song.thumbnail, lyrics: fetchedLyrics };
            const updatedMetadata = { ...get().downloadedMetadata, [song.id]: newMetadata };

            if (window.Capacitor) {
              const base64Audio = await blobToBase64(blob);
              await Filesystem.writeFile({ path: `${song.id}.mp3`, data: base64Audio, directory: Directory.Data });
              const audioUri = await Filesystem.getUri({ path: `${song.id}.mp3`, directory: Directory.Data });
              localAudioUrl = window.Capacitor.convertFileSrc(audioUri.uri);
              localNativeUrl = audioUri.uri;

              if (thumbBlob) {
                const base64Thumb = await blobToBase64(thumbBlob);
                await Filesystem.writeFile({ path: `${song.id}_thumb.jpg`, data: base64Thumb, directory: Directory.Data });
                const thumbUri = await Filesystem.getUri({ path: `${song.id}_thumb.jpg`, directory: Directory.Data });
                localThumbUrl = window.Capacitor.convertFileSrc(thumbUri.uri);
              }
              await safeWriteJSON(Filesystem, Directory, 'downloaded_metadata.json', updatedMetadata);
            } else {
              await localforage.setItem(song.id, blob);
              localAudioUrl = URL.createObjectURL(blob);
              localNativeUrl = localAudioUrl;
              if (thumbBlob) { await localforage.setItem(`${song.id}-thumb`, thumbBlob); localThumbUrl = URL.createObjectURL(thumbBlob); }
              await localforage.setItem('downloaded_metadata', updatedMetadata);
            }

            set((s) => {
              const newXHRs = { ...s.downloadXHRs }; delete newXHRs[song.id];
              return {
                downloadedMetadata: updatedMetadata,
                downloadedSongs: { 
                  ...s.downloadedSongs, 
                  [song.id]: { 
                    localAudioUrl, 
                    localNativeUrl, 
                    localThumbUrl: localThumbUrl || song.thumbnail, 
                    localThumbFileUrl: localNativeUrl ? localNativeUrl.replace('.mp3', '_thumb.jpg') : song.thumbnail,
                    metadata: newMetadata 
                  } 
                },
                downloadQueue: s.downloadQueue.filter(id => id !== song.id), downloadXHRs: newXHRs
              };
            });
            get().calculateStorageSize(); 
            resolve();
          } else { get().cancelDownload(song.id); reject(); }
        };
        xhr.onerror = () => { get().cancelDownload(song.id); reject(); };
        xhr.send();
      } catch (error) { get().cancelDownload(song.id); reject(error); }
    });
  },

  cancelDownload: (id) => {
    const xhr = get().downloadXHRs[id]; if (xhr) xhr.abort(); 
    set((s) => {
      const newXHRs = { ...s.downloadXHRs }; delete newXHRs[id];
      const newProgress = { ...s.downloadProgress }; delete newProgress[id];
      return { downloadQueue: s.downloadQueue.filter(songId => songId !== id), downloadProgress: newProgress, downloadXHRs: newXHRs };
    });
  },

  deleteDownloadedSong: async (id) => {
    const updatedMetadata = { ...get().downloadedMetadata }; delete updatedMetadata[id];
    if (window.Capacitor) {
      try {
        await Filesystem.deleteFile({ path: `${id}.mp3`, directory: Directory.Data });
        await Filesystem.deleteFile({ path: `${id}_thumb.jpg`, directory: Directory.Data }).catch(() => {});
        await safeWriteJSON(Filesystem, Directory, 'downloaded_metadata.json', updatedMetadata);
      } catch (e) {}
    } else {
      await localforage.removeItem(id); await localforage.setItem('downloaded_metadata', updatedMetadata);
    }
    
    set((s) => {
      const newDownloaded = { ...s.downloadedSongs };
      if (newDownloaded[id]?.localAudioUrl) URL.revokeObjectURL(newDownloaded[id].localAudioUrl);
      delete newDownloaded[id];
      return { downloadedSongs: newDownloaded, downloadedMetadata: updatedMetadata };
    });
    get().calculateStorageSize(); 
  },

  fetchLyrics: async (song) => {
    const state = get();

    if (state.lyricsTimeoutId) {
      clearTimeout(state.lyricsTimeoutId);
    }

    set({ lyrics: [], isLyricsLoading: true, lyricsTimeoutId: null });

    const localData = state.downloadedSongs[song.id];

    if (localData && localData.metadata?.lyrics?.length > 0) {
      set({ lyrics: localData.metadata.lyrics, isLyricsLoading: false });
      return;
    }
    
    if (!navigator.onLine) { 
      set({ lyrics: [], isLyricsLoading: false }); 
      return; 
    }
    
    const timeoutId = setTimeout(async () => {
      if (get().currentSong?.id !== song.id) return;

      try {
        const songDuration = song.duration || get().duration || 0;
        const lyricsData = await fetchLyricsFromLrcLib(song.channel, song.title, songDuration);
        
        if (get().currentSong?.id !== song.id) {
          return;
        }

        if (lyricsData) {
          let parsed = [];
          if (lyricsData.instrumental) {
            parsed = [{ time: 0, text: "✦ Enstrümantal ✦" }];
          } else if (lyricsData.syncedLyrics) {
            parsed = parseSyncedLyrics(lyricsData.syncedLyrics);
          } else if (lyricsData.plainLyrics) {
            lyricsData.plainLyrics.split('\n').forEach((line, idx) => {
              if (line.trim()) {
                parsed.push({ time: idx * 999999, text: line.trim() });
              }
            });
          }
          set({ lyrics: parsed, isLyricsLoading: false });
        } else {
          set({ lyrics: [], isLyricsLoading: false });
        }
      } catch(e) {
        if (get().currentSong?.id === song.id) {
          set({ lyrics: [], isLyricsLoading: false });
        }
      }
    }, 1500);

    set({ lyricsTimeoutId: timeoutId });
  },

  setTranslationActive: (val) => set({ showTranslation: val }),
  
  translateCurrentLyrics: async (targetLang) => {
    const state = get();
    const { lyrics, currentSong } = state;
    if (!lyrics || lyrics.length === 0 || !currentSong) return;

    set({ isTranslationLoading: true, targetLanguage: targetLang });
    localStorage.setItem('lyrics_target_language', targetLang);

    try {
      const separator = " ||| ";
      const combinedText = lyrics.map(l => l.text).join(separator);
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(combinedText)}`;
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const detected = data[2] || 'AUTO';
        
        let fullTranslatedText = "";
        if (data[0] && Array.isArray(data[0])) {
          fullTranslatedText = data[0].map(x => x[0]).join('');
        }

        const translatedLines = fullTranslatedText.split("|||").map(line => line.trim());

        const mapped = lyrics.map((lyric, idx) => ({
          time: lyric.time,
          text: translatedLines[idx] || lyric.text
        }));

        set({
          translatedLyrics: mapped,
          showTranslation: true,
          detectedLanguage: detected.toUpperCase(),
          isTranslationLoading: false
        });
      } else {
        set({ isTranslationLoading: false });
        toast.error("Çeviri motoru yanıt vermedi.");
      }
    } catch (err) {
      console.error("Çeviri hatası:", err);
      set({ isTranslationLoading: false });
      toast.error("Sözler çevrilirken hata oluştu.");
    }
  },

  handleAppStateChange: async (isActive) => {
    const state = get();
    const { currentSong, isPlaying, currentTime, activeEngine, currentStreamUrl, playerRef, html5PlayerRef } = state;

    if (!currentSong || !isPlaying) return;
    if (get().isOfflineMode) return;

    if (!isActive) {
      if (activeEngine === 'youtube') {
        if (currentStreamUrl) {
          if (playerRef && typeof playerRef.pauseVideo === 'function') playerRef.pauseVideo();
          set({ activeEngine: 'html5' });

          if (window.Capacitor && AudioPlayer) {
            try {
              await AudioPlayer.destroy({ audioId: 'novision-track' }).catch(() => {});
              await AudioPlayer.create({
                audioId: 'novision-track',
                audioSource: currentStreamUrl,
                friendlyTitle: currentSong.title,
                artistName: currentSong.channel,
                artworkSource: currentSong.thumbnail || '/icon.png',
                useForNotification: true,
                isBackgroundMusic: true,
                loop: false,
              });
              await AudioPlayer.onAudioEnd({ audioId: 'novision-track' }, () => get().playNext());
              await AudioPlayer.onPlaybackStatusChange({ audioId: 'novision-track' }, (result) => {
                if (result.status === 'playing') set({ isPlaying: true });
                else if (result.status === 'paused') set({ isPlaying: false });
              });
              await AudioPlayer.initialize({ audioId: 'novision-track' }).catch(() => {});
              await AudioPlayer.seek({ audioId: 'novision-track', timeInSeconds: Math.floor(currentTime) });
              await AudioPlayer.play({ audioId: 'novision-track' });
            } catch (err) { console.error("Native Audio arka plan hatası:", err); }
          } else if (html5PlayerRef) {
            html5PlayerRef.src = currentStreamUrl;
            html5PlayerRef.currentTime = currentTime;
            html5PlayerRef.play().catch(e => console.error("HTML5 Arka plan çalma hatası:", e));
          }
        } else {
          if (playerRef && typeof playerRef.pauseVideo === 'function') playerRef.pauseVideo();
          set({ isPlaying: false });
        }
      }
    } else {
      if (activeEngine === 'html5') {
        if (window.Capacitor && AudioPlayer) await AudioPlayer.pause({ audioId: 'novision-track' }).catch(() => {});
        else if (html5PlayerRef) html5PlayerRef.pause();

        set({ activeEngine: 'youtube' });

        if (playerRef && typeof playerRef.unMute === 'function') {
          playerRef.unMute();
          playerRef.setVolume(state.volume || 100);
          playerRef.seekTo(currentTime, true);
          playerRef.playVideo();
        }
      }
    }
  },

  setFallbackToYoutube: () => {
    const state = get();
    const ytEl = state.playerRef;
    const html5El = state.html5PlayerRef;
    
    set({ activeEngine: 'youtube' });

    if (html5El) html5El.pause();
    if (window.Capacitor && AudioPlayer) {
      AudioPlayer.pause({ audioId: 'novision-track' }).catch(() => {});
    }

    if (ytEl && typeof ytEl.unMute === 'function') {
      ytEl.unMute();
      ytEl.setVolume(state.volume || 100);
      ytEl.seekTo(state.currentTime, true);
      ytEl.playVideo();
    }
  },

  playSong: (song, rawQueue = [], index = 0, fromHistory = false, keepShuffle = false) => {
    const state = get();
    let newHistory = Array.isArray(state.history) ? [...state.history] : [];
    let newCursor = state.historyCursor !== undefined ? state.historyCursor : -1;
    let queue = Array.isArray(rawQueue) ? rawQueue : [];

    if (!fromHistory) {
      if (newCursor < newHistory.length - 1) newHistory = newHistory.slice(0, newCursor + 1);
      newHistory.push(song); newCursor++;
    }

    const localData = state.downloadedSongs[song.id];
    const isDownloaded = !!localData && get().isOfflineMode; 
    
    const isAppBackground = document.visibilityState === 'hidden';
    const nextEngine = (get().isOfflineMode && isDownloaded) ? 'html5' 
                     : isAppBackground ? 'html5' 
                     : 'youtube';

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const streamUrlToAssign = `${apiUrl}/api/download?id=${song.id}`;

    if (nextEngine === 'youtube' && !navigator.onLine) {
      toast.error("İnternet bağlantınız yok ve bu şarkı indirilmemiş."); 
      return; 
    }

    if (state.nativeProgressInterval) clearInterval(state.nativeProgressInterval);

    set({ 
      currentSong: song, 
      queue: queue.length > 0 ? queue : [song], 
      currentIndex: index, 
      isPlaying: true, 
      currentTime: 0, 
      history: newHistory, 
      historyCursor: newCursor, 
      activeEngine: nextEngine,
      currentStreamUrl: streamUrlToAssign,
      nativeProgressInterval: null,
      translatedLyrics: [],
      showTranslation: false,
      detectedLanguage: 'AUTO',
      isPrefetched: false 
    });

    if (get().isShuffle && queue.length > 0 && !keepShuffle) {
      get().generateShuffleOrder(index);
    } else if (get().isShuffle && keepShuffle) {
      const cursor = get().shuffleOrder.indexOf(index);
      if (cursor !== -1) {
        set({ shuffleCursor: cursor });
      }
    }

    if (window.Capacitor && AudioPlayer && nextEngine === 'html5') {
        const runNativeAudio = async () => {
          try {
            await AudioPlayer.destroy({ audioId: 'novision-track' }).catch(() => {});
            
            const nativeSource = isDownloaded && localData 
              ? (localData.localNativeUrl || localData.localAudioUrl) 
              : streamUrlToAssign;

            const nativeArtwork = isDownloaded && localData 
              ? (localData.localThumbFileUrl || '/icon.png') 
              : (song.thumbnail || '/icon.png');

            await AudioPlayer.create({
              audioId: 'novision-track',
              audioSource: nativeSource,
              friendlyTitle: song.title,
              artistName: song.channel,
              artworkSource: nativeArtwork,
              useForNotification: true,
              isBackgroundMusic: true,
              loop: false,
            });

            await AudioPlayer.onAudioEnd({ audioId: 'novision-track' }, () => {
              get().playNext();
            });

            await AudioPlayer.onPlaybackStatusChange({ audioId: 'novision-track' }, (result) => {
              if (result.status === 'playing') set({ isPlaying: true });
              else if (result.status === 'paused') set({ isPlaying: false });
            });

            await AudioPlayer.initialize({ audioId: 'novision-track' }).catch(() => {});
            await AudioPlayer.play({ audioId: 'novision-track' });
            set({ isPlaying: true });

            const interval = setInterval(async () => {
              const currentState = get();
              if (currentState.activeEngine !== 'html5' || !currentState.isPlaying) return;
              try {
                const timeRes = await AudioPlayer.getCurrentTime({ audioId: 'novision-track' });
                const durRes = await AudioPlayer.getDuration({ audioId: 'novision-track' });
                if (timeRes && timeRes.currentTime !== undefined) set({ currentTime: timeRes.currentTime });
                if (durRes && durRes.duration !== undefined && durRes.duration > 0) set({ duration: durRes.duration });
              } catch (e) {}
            }, 1000);

            set({ nativeProgressInterval: interval });
          } catch (nativeErr) {
            get().setFallbackToYoutube();
          }
        };
        runNativeAudio();
    } else {
        setTimeout(() => {
          const html5El = get().html5PlayerRef;
          const ytEl = get().playerRef;

          if (nextEngine === 'html5' && localData && html5El) {
            let finalSrc = localData.localAudioUrl;
            const isSameSong = html5El.getAttribute('data-song-id') === song.id;
            if (!isSameSong) {
              html5El.setAttribute('data-song-id', song.id);
              html5El.src = finalSrc;
              html5El.load();
            }
            html5El.play().catch(e => { set({ isPlaying: false }); });
          } else if (nextEngine === 'youtube' && ytEl && typeof ytEl.playVideo === 'function') {
            if (html5El) html5El.pause();
            ytEl.unMute();
            ytEl.setVolume(get().volume || 100);
            ytEl.playVideo();
          }
        }, 50);
    }

    get().fetchLyrics(song);

    if (auth.currentUser && navigator.onLine) {
      const recentRef = ref(db, `users/${auth.currentUser.uid}/recentSongs`);
      firebaseGet(recentRef).then((snap) => {
        let currentRecent = snap.exists() ? snap.val() : [];
        let updatedRecent = [...currentRecent.filter(s => s.id !== song.id), song].slice(-25);
        firebaseSet(recentRef, updatedRecent);
      });
    }
  },

  setPlaying: (status) => set({ isPlaying: status }),
  
  setCurrentTime: (time) => { 
    set({ currentTime: time }); 
    const state = get();
    if (state.duration > 0 && (state.duration - time) <= 15 && !state.isPrefetched) {
      get().prefetchNextSong();
    }
  },
  
  setDuration: (time) => set({ duration: time }),
  
  setVolume: (val) => { 
    const { playerRef, html5PlayerRef } = get(); 
    if (playerRef && playerRef.setVolume) playerRef.setVolume(val); 
    if (html5PlayerRef) html5PlayerRef.volume = val / 100; 
    set({ volume: val }); 
  },
  
  togglePlay: () => { 
    const { isPlaying, playerRef, html5PlayerRef, activeEngine } = get(); 
    if (activeEngine === 'youtube' && playerRef) { 
      if (isPlaying) playerRef.pauseVideo(); else playerRef.playVideo(); 
    } else if (activeEngine === 'html5') {
      if (window.Capacitor && AudioPlayer) {
        if (isPlaying) { AudioPlayer.pause({ audioId: 'novision-track' }); set({ isPlaying: false }); } 
        else { AudioPlayer.play({ audioId: 'novision-track' }); set({ isPlaying: true }); }
      } else if (html5PlayerRef) {
        if (isPlaying) html5PlayerRef.pause(); else html5PlayerRef.play();
      }
      if (playerRef && typeof playerRef.pauseVideo === 'function') {
         if (isPlaying) playerRef.pauseVideo(); else playerRef.playVideo();
      }
    }
  },
  
  seekTo: (seconds) => { 
    const { playerRef, html5PlayerRef, activeEngine } = get(); 
    if (activeEngine === 'youtube' && playerRef && playerRef.seekTo) { playerRef.seekTo(seconds, true); } 
    else if (activeEngine === 'html5') {
      if (window.Capacitor && AudioPlayer) AudioPlayer.seek({ audioId: 'novision-track', timeInSeconds: Math.floor(seconds) });
      else if (html5PlayerRef) html5PlayerRef.currentTime = seconds;
      if (playerRef && playerRef.seekTo) playerRef.seekTo(seconds, true);
    }
    set({ currentTime: seconds }); 
  },

  _getCurrentEngineTime: () => {
    const { activeEngine, playerRef, html5PlayerRef } = get();
    if (activeEngine === 'youtube' && playerRef && typeof playerRef.getCurrentTime === 'function') return playerRef.getCurrentTime() || 0;
    if (activeEngine === 'html5' && html5PlayerRef) return html5PlayerRef.currentTime || 0;
    return 0;
  },

  _seekCurrentEngineToZero: () => {
    get().seekTo(0);
  },

  playNext: async () => {
    const state = get();
    const { queue: rawQueue, currentIndex, isShuffle, isRepeat, history: rawHistory, historyCursor, playSong, _seekCurrentEngineToZero, shuffleOrder, shuffleCursor } = state;
    const queue = Array.isArray(rawQueue) ? rawQueue : [];
    const history = Array.isArray(rawHistory) ? rawHistory : [];

    if (queue.length === 0) return;
    
    // 1. GEÇMİŞ (HISTORY) İLERİ AKIŞI
    if (historyCursor < history.length - 1) {
      const nextCursor = historyCursor + 1; const nextSong = history[nextCursor];
      if(!nextSong) return;
      let idxInQueue = queue.findIndex(s => s.id === nextSong.id);
      if (idxInQueue === -1) { queue.push(nextSong); idxInQueue = queue.length - 1; }
      
      playSong(nextSong, queue, idxInQueue, true, true); 
      set({ historyCursor: nextCursor }); 
      return;
    }
    
    if (isRepeat && !isShuffle) { 
      _seekCurrentEngineToZero(); 
      const { activeEngine, playerRef, html5PlayerRef } = get();
      if (activeEngine === 'youtube' && playerRef) playerRef.playVideo();
      if (activeEngine === 'html5') {
        if (window.Capacitor && AudioPlayer) AudioPlayer.play({ audioId: 'novision-track' });
        else if (html5PlayerRef) html5PlayerRef.play();
      }
      return; 
    }
    
    if (isShuffle) {
      let nextCursor = shuffleCursor + 1;
      if (nextCursor >= shuffleOrder.length) {
        if (isRepeat) {
          get().generateShuffleOrder(currentIndex);
          const freshState = get();
          nextCursor = 0;
          const nextIndex = freshState.shuffleOrder[nextCursor];
          set({ shuffleCursor: nextCursor });
          playSong(queue[nextIndex], queue, nextIndex, false, true);
        } else {
          _seekCurrentEngineToZero();
          const { activeEngine, playerRef, html5PlayerRef } = get();
          if (activeEngine === 'youtube' && playerRef) playerRef.pauseVideo();
          if (activeEngine === 'html5') {
            if (window.Capacitor && AudioPlayer) AudioPlayer.pause({ audioId: 'novision-track' });
            else if (html5PlayerRef) html5PlayerRef.pause();
          }
          toast("Sıradaki tüm karışık şarkılar çalındı.", { icon: '🔄' });
        }
        return;
      }
      
      set({ shuffleCursor: nextCursor });
      const nextIndex = shuffleOrder[nextCursor];
      playSong(queue[nextIndex], queue, nextIndex, false, true);
      return;
    }
    
    if (currentIndex === queue.length - 1 && !isShuffle) {
      if (!navigator.onLine) {
        _seekCurrentEngineToZero();
        const { activeEngine, playerRef, html5PlayerRef } = get();
        if (activeEngine === 'youtube' && playerRef) playerRef.pauseVideo();
        if (activeEngine === 'html5') {
          if (window.Capacitor && AudioPlayer) AudioPlayer.pause({ audioId: 'novision-track' });
          else if (html5PlayerRef) html5PlayerRef.pause();
        }
        return;
      }

      const currentSong = queue[currentIndex];
      try {
        let cleanArtist = currentSong.channel.replace(' - Topic', '').replace(/VEVO/i, '').trim();
        let searchBase = cleanArtist.length > 2 ? cleanArtist : currentSong.title.replace(/\[.*?\]|\(.*?\)/g, '').trim();
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/search?q=${encodeURIComponent(searchBase + " official audio")}`);
        const results = await res.json();
        let validSongs = results.filter(r => !['haber', 'news', 'vlog', 'podcast', 'pizza'].some(w => r.title.toLowerCase().includes(w)) && !queue.some(q => q.id === r.id));
        if (validSongs.length > 0) { 
          const newSong = validSongs[Math.floor(Math.random() * Math.min(validSongs.length, 8))]; 
          playSong(newSong, [...queue, newSong], currentIndex + 1); 
        } else { 
          _seekCurrentEngineToZero();
          const { activeEngine, playerRef, html5PlayerRef } = get();
          if (activeEngine === 'youtube' && playerRef) playerRef.pauseVideo();
          if (activeEngine === 'html5') {
            if (window.Capacitor && AudioPlayer) AudioPlayer.pause({ audioId: 'novision-track' });
            else if (html5PlayerRef) html5PlayerRef.pause();
          }
        }
      } catch(e) {}
      return;
    }
    
    let nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) nextIndex = 0; 
    playSong(queue[nextIndex], queue, nextIndex);
  },

  playPrev: () => {
    const state = get();
    const { history: rawHistory, historyCursor, queue: rawQueue, playSong, _getCurrentEngineTime, _seekCurrentEngineToZero } = state;
    const history = Array.isArray(rawHistory) ? rawHistory : [];
    const queue = Array.isArray(rawQueue) ? rawQueue : [];

    if (_getCurrentEngineTime() > 3) { _seekCurrentEngineToZero(); return; }
    
    // 2. GEÇMİŞ (HISTORY) GERİ AKIŞI
    if (historyCursor > 0) {
      const prevCursor = historyCursor - 1; const prevSong = history[prevCursor];
      if(!prevSong) return;
      let idxInQueue = queue.findIndex(s => s.id === prevSong.id);
      if (idxInQueue === -1) { queue.unshift(prevSong); idxInQueue = 0; }
      
      playSong(prevSong, queue, idxInQueue, true, true); 
      set({ historyCursor: prevCursor });
    } else { _seekCurrentEngineToZero(); }
  }
}));

export default usePlayerStore;