import { create } from 'zustand';
import { auth, db } from '../firebase';
import { ref, set as firebaseSet } from 'firebase/database';
import localforage from 'localforage'; // Tarayıcı veritabanı (IndexedDB)

// LocalForage Yapılandırması (Tarayıcı offline testleri için)
localforage.config({
  name: 'NovisionMusic',
  storeName: 'offline_songs'
});

// Dosyaları Capacitor için Base64 formatına çevirme yardımcı fonksiyonu
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

const usePlayerStore = create((set, get) => ({
  // --- TEMEL DURUMLAR ---
  currentSong: null, queue: [], currentIndex: -1, isPlaying: false,
  volume: 100, currentTime: 0, duration: 0, 
  
  // --- ÇİFT MOTOR & İNDİRME DURUMLARI ---
  playerRef: null,       
  html5PlayerRef: null,  
  activeEngine: 'youtube', 
  downloadedSongs: {},   
  isOfflineMode: !navigator.onLine, 
  
  // İNDİRME YÖNETİCİSİ
  downloadQueue: [],      
  downloadProgress: {},   
  downloadXHRs: {}, 
  downloadQueueList: [],  // Sırasını bekleyen şarkı objelerinin listesi

  // --- ARAYÜZ VE LİSTE DURUMLARI ---
  isPanelOpen: false, isPanelFullscreen: false,
  isShuffle: false, isRepeat: false,
  history: [], historyCursor: -1, songToAdd: null, isAddModalOpen: false,
  lyrics: [], isLyricsLoading: false, isVideoMode: false,

  // --- SETTER'LAR VE UI KONTROLLERİ ---
  setVideoMode: (val) => set({ isVideoMode: val }),
  openAddModal: (song) => set({ songToAdd: song, isAddModalOpen: true }),
  closeAddModal: () => set({ songToAdd: null, isAddModalOpen: false }),
  setPlayerRef: (ref) => set({ playerRef: ref }),
  setHtml5PlayerRef: (ref) => set({ html5PlayerRef: ref }),
  setOfflineMode: (status) => set({ isOfflineMode: status }),
  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
  closePanel: () => set({ isPanelOpen: false, isPanelFullscreen: false }), 
  toggleFullscreen: () => set((state) => ({ isPanelFullscreen: !state.isPanelFullscreen })),
  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),

  // --- UYGULAMA AÇILDIĞINDA İNDİRİLMİŞ ŞARKILARI VE KAPAKLARI YÜKLE ---
  initOfflineStorage: async () => {
    try {
      if (window.Capacitor) {
        // MOBİL UYGULAMA (APK): Yerel diskten dosyaları tara
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const result = await Filesystem.readdir({
          path: '',
          directory: Directory.Data
        });
        
        const loadedSongs = {};
        for (let file of result.files) {
          const name = file.name;
          if (name.endsWith('.mp3')) {
            const id = name.replace('.mp3', '');
            const audioUri = await Filesystem.getUri({ path: name, directory: Directory.Data });
            
            let localThumbUrl = null;
            const thumbExists = result.files.some(f => f.name === `${id}_thumb.jpg`);
            if (thumbExists) {
              const tUri = await Filesystem.getUri({ path: `${id}_thumb.jpg`, directory: Directory.Data });
              localThumbUrl = window.Capacitor.convertFileSrc(tUri.uri);
            }

            loadedSongs[id] = {
              localAudioUrl: window.Capacitor.convertFileSrc(audioUri.uri),
              localThumbUrl: localThumbUrl
            };
          }
        }
        set({ downloadedSongs: loadedSongs });
      } else {
        // TARAYICI (TEST MODU): IndexedDB'den müzik ve kapak bloblarını yükle
        const keys = await localforage.keys();
        const loadedSongs = {};
        for (let id of keys) {
          if (id.endsWith('-thumb')) continue; // Kapak anahtarlarını atla, müzik anahtarlarını yakala
          
          const blob = await localforage.getItem(id);
          const thumbBlob = await localforage.getItem(`${id}-thumb`);
          
          if (blob) {
            loadedSongs[id] = { 
              localAudioUrl: URL.createObjectURL(blob), 
              localThumbUrl: thumbBlob ? URL.createObjectURL(thumbBlob) : null 
            }; 
          }
        }
        set({ downloadedSongs: loadedSongs });
      }
    } catch (e) {
      console.error("Offline DB yüklenirken hata:", e);
    }
  },

  // --- TOPLU İNDİRME SIRASINA EKLEME ---
  addToDownloadQueueList: (songs) => {
    const state = get();
    const newSongs = songs.filter(song => 
      !state.downloadedSongs[song.id] && 
      !state.downloadQueue.includes(song.id) &&
      !state.downloadQueueList.some(q => q.id === song.id)
    );

    if (newSongs.length === 0) return;

    set((s) => ({ downloadQueueList: [...s.downloadQueueList, ...newSongs] }));

    if (get().downloadQueue.length === 0) {
      get()._processDownloadQueue();
    }
  },

  _processDownloadQueue: async () => {
    const state = get();
    if (state.downloadQueueList.length === 0) return;

    const nextSong = state.downloadQueueList[0];
    set((s) => ({ downloadQueueList: s.downloadQueueList.slice(1) }));

    try {
      await get().downloadSong(nextSong);
    } catch (err) {
      console.error(`"${nextSong.title}" indirilemedi, sıradakine geçiliyor...`);
    }

    get()._processDownloadQueue();
  },

  // --- ŞARKI VE KAPAK İNDİRME FONKSİYONU ---
  downloadSong: (song) => {
    return new Promise((resolve, reject) => {
      const state = get();
      if (state.downloadedSongs[song.id] || state.downloadQueue.includes(song.id)) {
        resolve(); return;
      }

      const xhr = new XMLHttpRequest();
      
      set((s) => ({
        downloadQueue: [...s.downloadQueue, song.id],
        downloadProgress: { ...s.downloadProgress, [song.id]: 0 },
        downloadXHRs: { ...s.downloadXHRs, [song.id]: xhr }
      }));

      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const downloadUrl = `${apiUrl}/api/download?id=${song.id}`; 
        
        xhr.responseType = 'blob';
        xhr.open('GET', downloadUrl, true);

        xhr.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            set((s) => ({ downloadProgress: { ...s.downloadProgress, [song.id]: percentComplete } }));
          }
        };

        xhr.onload = async () => {
          if (xhr.status === 200 || xhr.status === 206) {
            const blob = xhr.response;
            
            // KAPAK FOTOĞRAFINI DA GÜVENLİCE BLOB OLARAK İNDİR
            let thumbBlob = null;
            try {
              const thumbRes = await fetch(song.thumbnail);
              if (thumbRes.ok) {
                thumbBlob = await thumbRes.blob();
              }
            } catch (e) {
              console.warn("Kapak fotoğrafı indirilemedi, yedek görsel atanacak.");
            }

            let localAudioUrl = "";
            let localThumbUrl = null;

            if (window.Capacitor) {
              // MOBİL UYGULAMA (APK): Telefon hafızasına kaydet (Directory.Data)
              const { Filesystem, Directory } = await import('@capacitor/filesystem');
              
              const base64Audio = await blobToBase64(blob);
              await Filesystem.writeFile({
                path: `${song.id}.mp3`,
                data: base64Audio,
                directory: Directory.Data
              });
              const audioUri = await Filesystem.getUri({ path: `${song.id}.mp3`, directory: Directory.Data });
              localAudioUrl = window.Capacitor.convertFileSrc(audioUri.uri);

              if (thumbBlob) {
                const base64Thumb = await blobToBase64(thumbBlob);
                await Filesystem.writeFile({
                  path: `${song.id}_thumb.jpg`,
                  data: base64Thumb,
                  directory: Directory.Data
                });
                const thumbUri = await Filesystem.getUri({ path: `${song.id}_thumb.jpg`, directory: Directory.Data });
                localThumbUrl = window.Capacitor.convertFileSrc(thumbUri.uri);
              }
            } else {
              // TARAYICI (TEST MODU): IndexedDB'ye kaydet
              await localforage.setItem(song.id, blob);
              localAudioUrl = URL.createObjectURL(blob);
              
              if (thumbBlob) {
                await localforage.setItem(`${song.id}-thumb`, thumbBlob);
                localThumbUrl = URL.createObjectURL(thumbBlob);
              }
            }

            set((s) => {
              const newXHRs = { ...s.downloadXHRs }; delete newXHRs[song.id];
              return {
                downloadedSongs: { 
                  ...s.downloadedSongs, 
                  [song.id]: { localAudioUrl: localAudioUrl, localThumbUrl: localThumbUrl || song.thumbnail } 
                },
                downloadQueue: s.downloadQueue.filter(id => id !== song.id),
                downloadXHRs: newXHRs
              };
            });
            console.log(`"${song.title}" ve kapağı başarıyla yerel diske kaydedildi.`);
            resolve();
          } else {
             get().cancelDownload(song.id);
             reject(new Error("HTTP Hatası: " + xhr.status));
          }
        };

        xhr.onerror = () => {
          get().cancelDownload(song.id);
          reject(new Error("Ağ hatası oluştu."));
        };
        
        xhr.send();

      } catch (error) {
        get().cancelDownload(song.id);
        reject(error);
      }
    });
  },

  // --- İNDİRMEYİ İPTAL ETME ---
  cancelDownload: (id) => {
    const xhr = get().downloadXHRs[id];
    if (xhr) xhr.abort(); 
    
    set((s) => {
      const newXHRs = { ...s.downloadXHRs }; delete newXHRs[id];
      const newProgress = { ...s.downloadProgress }; delete newProgress[id];
      return {
        downloadQueue: s.downloadQueue.filter(songId => songId !== id),
        downloadProgress: newProgress,
        downloadXHRs: newXHRs
      };
    });
  },

  // --- İNDİRİLMİŞ ŞARKIYI SİLME ---
  deleteDownloadedSong: async (id) => {
    if (window.Capacitor) {
      // APK ise telefondan dosyaları sil
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        await Filesystem.deleteFile({ path: `${id}.mp3`, directory: Directory.Data });
        await Filesystem.deleteFile({ path: `${id}_thumb.jpg`, directory: Directory.Data }).catch(() => {});
      } catch (e) {
        console.error("Yerel dosya silinemedi:", e);
      }
    } else {
      // Tarayıcı ise IndexedDB'den sil
      await localforage.removeItem(id);
    }
    
    set((s) => {
      const newDownloaded = { ...s.downloadedSongs };
      if (newDownloaded[id]?.localAudioUrl) URL.revokeObjectURL(newDownloaded[id].localAudioUrl);
      delete newDownloaded[id];
      
      let engine = s.activeEngine;
      if (s.currentSong?.id === id && s.activeEngine === 'html5') {
        engine = 'youtube'; 
        if (s.html5PlayerRef) s.html5PlayerRef.pause();
        if (s.playerRef) s.playerRef.playVideo();
      }

      return { downloadedSongs: newDownloaded, activeEngine: engine };
    });
  },

  // --- SÖZLER VE DİĞER MOTOR AYARLARI (Aynı Kaldı) ---
  fetchLyrics: async (song) => {
    set({ lyrics: [], isLyricsLoading: true });
    try {
      let cleanTitle = song.title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/official|video|audio|lyrics|lyric|hd|4k|mv|music/gi, '').trim();
      let artist = song.channel.replace(/ - Topic|VEVO/gi, '').trim();
      let searchQuery = artist.length > 2 && !cleanTitle.toLowerCase().includes(artist.toLowerCase()) ? `${artist} ${cleanTitle}` : cleanTitle;
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data && data.length > 0) {
          const bestMatch = data[0];
          if (bestMatch.syncedLyrics) {
              const parsed = [];
              bestMatch.syncedLyrics.split('\n').forEach(line => {
                  const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
                  if(match) {
                      const time = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + (parseInt(match[3], 10) / (match[3].length === 2 ? 100 : 1000));
                      if(match[4].trim()) parsed.push({time, text: match[4].trim()});
                  }
              });
              set({ lyrics: parsed, isLyricsLoading: false });
          } else if (bestMatch.plainLyrics) { set({ lyrics: [{ time: 0, text: bestMatch.plainLyrics }], isLyricsLoading: false }); } 
          else { set({ lyrics: [], isLyricsLoading: false }); }
      } else { set({ lyrics: [], isLyricsLoading: false }); }
    } catch(e) { set({ lyrics: [], isLyricsLoading: false }); }
  },

  playSong: (song, rawQueue = [], index = 0, fromHistory = false) => {
    const state = get();
    let newHistory = Array.isArray(state.history) ? [...state.history] : [];
    let newCursor = state.historyCursor !== undefined ? state.historyCursor : -1;
    let queue = Array.isArray(rawQueue) ? rawQueue : [];

    if (!fromHistory) {
      if (newCursor < newHistory.length - 1) newHistory = newHistory.slice(0, newCursor + 1);
      newHistory.push(song);
      newCursor++;
    }

    const isDownloaded = !!state.downloadedSongs[song.id];
    const nextEngine = isDownloaded ? 'html5' : 'youtube';

    if (nextEngine === 'html5' && state.playerRef) {
      state.playerRef.pauseVideo();
    } else if (nextEngine === 'youtube' && state.html5PlayerRef) {
      state.html5PlayerRef.pause();
    }

    set({ 
      currentSong: song, queue: queue.length > 0 ? queue : [song], 
      currentIndex: index, isPlaying: true, currentTime: 0, 
      history: newHistory, historyCursor: newCursor, activeEngine: nextEngine
    });
    
    get().fetchLyrics(song);

    if (auth.currentUser) {
      const uniqueHistory = Array.from(new Set(newHistory.map(a => a?.id)))
        .map(id => newHistory.find(a => a?.id === id))
        .filter(Boolean).slice(-25); 
      firebaseSet(ref(db, `users/${auth.currentUser.uid}/recentSongs`), uniqueHistory);
    }
  },

  setPlaying: (status) => set({ isPlaying: status }),
  setCurrentTime: (time) => set({ currentTime: time }),
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
    } else if (activeEngine === 'html5' && html5PlayerRef) {
      if (isPlaying) html5PlayerRef.pause(); else html5PlayerRef.play();
    }
  },
  
  seekTo: (seconds) => { 
    const { playerRef, html5PlayerRef, activeEngine } = get(); 
    if (activeEngine === 'youtube' && playerRef && playerRef.seekTo) { 
      playerRef.seekTo(seconds, true); 
    } else if (activeEngine === 'html5' && html5PlayerRef) {
      html5PlayerRef.currentTime = seconds;
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
    const { activeEngine, playerRef, html5PlayerRef } = get();
    if (activeEngine === 'youtube' && playerRef && playerRef.seekTo) playerRef.seekTo(0);
    if (activeEngine === 'html5' && html5PlayerRef) html5PlayerRef.currentTime = 0;
  },

  playNext: async () => {
    const state = get();
    const { queue: rawQueue, currentIndex, isShuffle, isRepeat, history: rawHistory, historyCursor, playSong, _seekCurrentEngineToZero } = state;
    const queue = Array.isArray(rawQueue) ? rawQueue : [];
    const history = Array.isArray(rawHistory) ? rawHistory : [];

    if (queue.length === 0) return;
    
    if (historyCursor < history.length - 1) {
      const nextCursor = historyCursor + 1; 
      const nextSong = history[nextCursor];
      if(!nextSong) return;
      let idxInQueue = queue.findIndex(s => s.id === nextSong.id);
      if (idxInQueue === -1) { queue.push(nextSong); idxInQueue = queue.length - 1; }
      playSong(nextSong, queue, idxInQueue, true); set({ historyCursor: nextCursor }); return;
    }
    
    if (isRepeat) { 
      _seekCurrentEngineToZero(); 
      const { activeEngine, playerRef, html5PlayerRef } = get();
      if (activeEngine === 'youtube' && playerRef) playerRef.playVideo();
      if (activeEngine === 'html5' && html5PlayerRef) html5PlayerRef.play();
      return; 
    }
    
    if (currentIndex === queue.length - 1 && !isShuffle) {
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
          if (activeEngine === 'html5' && html5PlayerRef) html5PlayerRef.pause();
        }
      } catch(e) {}
      return;
    }
    
    let nextIndex = isShuffle ? Math.floor(Math.random() * queue.length) : currentIndex + 1;
    if (nextIndex >= queue.length) nextIndex = 0; 
    playSong(queue[nextIndex], queue, nextIndex);
  },

  playPrev: () => {
    const state = get();
    const { history: rawHistory, historyCursor, queue: rawQueue, playSong, _getCurrentEngineTime, _seekCurrentEngineToZero } = state;
    const history = Array.isArray(rawHistory) ? rawHistory : [];
    const queue = Array.isArray(rawQueue) ? rawQueue : [];

    if (_getCurrentEngineTime() > 3) { 
      _seekCurrentEngineToZero(); 
      return; 
    }
    
    if (historyCursor > 0) {
      const prevCursor = historyCursor - 1; const prevSong = history[prevCursor];
      if(!prevSong) return;
      let idxInQueue = queue.findIndex(s => s.id === prevSong.id);
      if (idxInQueue === -1) { queue.unshift(prevSong); idxInQueue = 0; }
      playSong(prevSong, queue, idxInQueue, true); 
      set({ historyCursor: prevCursor });
    } else {
      _seekCurrentEngineToZero();
    }
  }
}));

export default usePlayerStore;