import { create } from 'zustand';
import { auth, db } from '../firebase';
import { ref, set as firebaseSet } from 'firebase/database';
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

const usePlayerStore = create((set, get) => ({
  currentSong: null, queue: [], currentIndex: -1, isPlaying: false,
  volume: 100, currentTime: 0, duration: 0, 
  
  playerRef: null, html5PlayerRef: null,  
  activeEngine: 'youtube', 
  downloadedSongs: {},
  downloadedMetadata: {}, 
  localPlaylists: [],     
  isOfflineMode: !navigator.onLine, 
  currentStreamUrl: null, 
  
  downloadQueue: [], downloadProgress: {}, downloadXHRs: {}, downloadQueueList: [],

  isPanelOpen: false, isPanelFullscreen: false,
  isShuffle: false, isRepeat: false,
  history: [], historyCursor: -1, songToAdd: null, isAddModalOpen: false,
  lyrics: [], isLyricsLoading: false, isVideoMode: false,
  nativeProgressInterval: null,

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
  toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),
  toggleRepeat: () => set((state) => ({ isRepeat: !state.isRepeat })),

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
                const hasThumb = result.files.some(f => {
                  const fName = typeof f === 'string' ? f : f.name;
                  return fName === `${id}_thumb.jpg`;
                });

                if (hasThumb) {
                  try {
                    const thumbData = await Filesystem.readFile({ path: `${id}_thumb.jpg`, directory: Directory.Data });
                    localThumbUrl = `data:image/jpeg;base64,${thumbData.data}`;
                  } catch (err) { console.error("Küçük resim okuma hatası:", err); }
                }

                loadedSongs[id] = {
                  localAudioUrl: window.Capacitor.convertFileSrc(audioUri.uri),
                  localNativeUrl: audioUri.uri,
                  localThumbUrl: localThumbUrl || '/icon.png',
                  metadata: metadata[id] || { id, title: "Çevrimdışı Şarkı", channel: "Bilinmeyen Sanatçı", thumbnail: localThumbUrl || '/icon.png', lyrics: [] }
                };
              }
            }
          }
          set({ downloadedSongs: loadedSongs });
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
                metadata: metadata[id] || { id, title: "Çevrimdışı", channel: "Sanatçı", thumbnail: localThumbUrl || '/icon.png', lyrics: [] }
              }; 
            }
          }
          set({ downloadedSongs: loadedSongs });
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
    const newPlaylist = { id: `local_${Date.now()}`, name, songs: [] };
    get().saveLocalPlaylists([...get().localPlaylists, newPlaylist]);
  },
  updateLocalPlaylistSongs: (id, songs) => { get().saveLocalPlaylists(get().localPlaylists.map(pl => pl.id === id ? { ...pl, songs } : pl)); },
  updateLocalPlaylistName: (id, name) => { get().saveLocalPlaylists(get().localPlaylists.map(pl => pl.id === id ? { ...pl, name } : pl)); },
  deleteLocalPlaylist: (id) => { get().saveLocalPlaylists(get().localPlaylists.filter(pl => pl.id !== id)); },

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
              let cleanTitle = song.title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/official|video|audio|lyrics|lyric|hd|4k|mv|music/gi, '').trim();
              let artist = song.channel.replace(/ - Topic|VEVO/gi, '').trim();
              const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(artist + " " + cleanTitle)}`);
              if(res.ok) {
                const data = await res.json();
                if (data && data[0]?.syncedLyrics) {
                  data[0].syncedLyrics.split('\n').forEach(line => {
                    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
                    if (match && match[4].trim()) fetchedLyrics.push({ time: parseInt(match[1])*60 + parseInt(match[2]) + (parseInt(match[3])/(match[3].length===2?100:1000)), text: match[4].trim() });
                  });
                }
              }
            } catch(e) {}

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
                localThumbUrl = `data:image/jpeg;base64,${base64Thumb}`; 
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
                    metadata: newMetadata 
                  } 
                },
                downloadQueue: s.downloadQueue.filter(id => id !== song.id), downloadXHRs: newXHRs
              };
            });
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
  },

  fetchLyrics: async (song) => {
    const state = get();
    const localData = state.downloadedSongs[song.id];
    if (localData && localData.metadata?.lyrics?.length > 0) {
      set({ lyrics: localData.metadata.lyrics, isLyricsLoading: false });
      return;
    }
    if (!navigator.onLine) { set({ lyrics: [], isLyricsLoading: false }); return; }
    set({ lyrics: [], isLyricsLoading: true });
    try {
      let cleanTitle = song.title.replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/official|video|audio|lyrics|lyric|hd|4k|mv|music/gi, '').trim();
      let artist = song.channel.replace(/ - Topic|VEVO/gi, '').trim();
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(artist + " " + cleanTitle)}`);
      const data = await res.json();
      if (data && data[0]?.syncedLyrics) {
        const parsed = [];
        data[0].syncedLyrics.split('\n').forEach(line => {
          const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
          if(match && match[4].trim()) parsed.push({time: parseInt(match[1])*60 + parseInt(match[2]) + (parseInt(match[3])/(match[3].length===2?100:1000)), text: match[4].trim()});
        });
        set({ lyrics: parsed, isLyricsLoading: false });
      } else { set({ lyrics: [], isLyricsLoading: false }); }
    } catch(e) { set({ lyrics: [], isLyricsLoading: false }); }
  },

  // SEAMLESS HANDOFF (ARKA PLANA / ÖN PLANA GEÇİŞ KONTROLCÜSÜ)
  handleAppStateChange: async (isActive) => {
    const state = get();
    const { currentSong, isPlaying, currentTime, activeEngine, currentStreamUrl, playerRef, html5PlayerRef } = state;

    if (!currentSong || !isPlaying) return;

    // Şarkı çevrimdışı (yerel) ise zaten sorunsuz çalar, müdahale etmiyoruz
    const localData = state.downloadedSongs[currentSong.id];
    if (localData) return;

    if (!isActive) {
      console.log("📲 [SİSTEM] Kullanıcı uygulamadan çıktı / ekranı kilitledi.");
      
      if (activeEngine === 'youtube') {
        if (currentStreamUrl) {
          console.log(`🔄 [KESİNTİSİZ DEVİR] YouTube Iframe durduruluyor, saf ses akışına geçiliyor. Geçiş zamanı: ${currentTime} saniye.`);
          
          if (playerRef && typeof playerRef.pauseVideo === 'function') {
            playerRef.pauseVideo();
          }

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
            } catch (err) {
              console.error("Native Audio arka plan hatası:", err);
            }
          } else if (html5PlayerRef) {
            html5PlayerRef.src = currentStreamUrl;
            html5PlayerRef.currentTime = currentTime;
            html5PlayerRef.play().catch(e => console.error("HTML5 Arka plan çalma hatası:", e));
          }
        } else {
          console.warn("⚠️ [UYARI] Arka plan akış linki bulunamadığı için müzik geçici olarak durduruldu.");
          if (playerRef && typeof playerRef.pauseVideo === 'function') {
            playerRef.pauseVideo();
          }
          set({ isPlaying: false });
        }
      }
    } else {
      console.log("📲 [SİSTEM] Kullanıcı uygulamaya (ön plana) geri döndü.");
      if (activeEngine === 'html5') {
        console.log(`🔄 [KESİNTİSİZ DEVİR] Saf ses durduruluyor, YouTube Iframe'e geri dönülüyor. Dönüş zamanı: ${currentTime} saniye.`);

        if (window.Capacitor && AudioPlayer) {
          await AudioPlayer.pause({ audioId: 'novision-track' }).catch(() => {});
        } else if (html5PlayerRef) {
          html5PlayerRef.pause();
        }

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
    
    console.log("🚨 [ACİL DURUM] Ses akışında sorun oldu. YouTube Iframe'e dönülüyor!");
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

  playSong: (song, rawQueue = [], index = 0, fromHistory = false) => {
    const state = get();
    let newHistory = Array.isArray(state.history) ? [...state.history] : [];
    let newCursor = state.historyCursor !== undefined ? state.historyCursor : -1;
    let queue = Array.isArray(rawQueue) ? rawQueue : [];

    if (!fromHistory) {
      if (newCursor < newHistory.length - 1) newHistory = newHistory.slice(0, newCursor + 1);
      newHistory.push(song); newCursor++;
    }

    const localData = state.downloadedSongs[song.id];
    const isDownloaded = !!localData;
    const nextEngine = (get().isOfflineMode && isDownloaded) ? 'html5' : 'youtube';
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const streamUrlToAssign = `${apiUrl}/api/download?id=${song.id}`;

    // GELİŞTİRİCİ RAPORU
    console.log(`\n================================`);
    console.log(`🎵 [OYNATMA BAŞLATILDI] ${song.title}`);
    console.log(`💾 [YEREL DURUM] Çevrimdışı indirildi mi?: ${isDownloaded ? 'EVET' : 'HAYIR'}`);
    console.log(`⚙️  [MOTOR] Başlangıç motoru: ${nextEngine.toUpperCase()}`);
    console.log(`🔗 [YEDEK LİNK] Arka plan için atanan link: ${streamUrlToAssign}`);
    console.log(`================================\n`);

    if (nextEngine === 'youtube' && !navigator.onLine) {
      toast.error("İnternet bağlantınız yok ve bu şarkı indirilmemiş."); 
      return; 
    }

    if (state.nativeProgressInterval) {
      clearInterval(state.nativeProgressInterval);
    }

    set({ 
      currentSong: song, queue: queue.length > 0 ? queue : [song], 
      currentIndex: index, isPlaying: true, currentTime: 0, 
      history: newHistory, historyCursor: newCursor, activeEngine: nextEngine,
      currentStreamUrl: streamUrlToAssign,
      nativeProgressInterval: null
    });

    setTimeout(async () => {
      const html5El = get().html5PlayerRef;
      const ytEl = get().playerRef;

      if (nextEngine === 'html5' && localData) {
        if (ytEl && typeof ytEl.pauseVideo === 'function') ytEl.pauseVideo(); 

        if (window.Capacitor && AudioPlayer) {
          try {
            await AudioPlayer.destroy({ audioId: 'novision-track' }).catch(() => {});
            const nativeSource = localData.localNativeUrl || localData.localAudioUrl;
            const nativeArtwork = localData.localThumbUrl && !localData.localThumbUrl.startsWith('data:') 
              ? localData.localThumbUrl 
              : '/icon.png';

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
                if (timeRes && timeRes.currentTime !== undefined) {
                  set({ currentTime: timeRes.currentTime });
                }
                if (durRes && durRes.duration !== undefined && durRes.duration > 0) {
                  set({ duration: durRes.duration });
                }
              } catch (e) {}
            }, 1000);

            set({ nativeProgressInterval: interval });

          } catch (nativeErr) {
            console.error("Native Audio Player hatası:", nativeErr);
            set({ isPlaying: false });
          }

        } else if (html5El) {
          let finalSrc = localData.localAudioUrl;
          const isSameSong = html5El.getAttribute('data-song-id') === song.id;
          if (!isSameSong) {
            html5El.setAttribute('data-song-id', song.id);
            html5El.src = finalSrc;
            html5El.load();
          }
          html5El.play().catch(e => {
            console.error("HTML5 Play Hatası:", e);
            set({ isPlaying: false });
          });
        }

      } else if (nextEngine === 'youtube' && ytEl && typeof ytEl.playVideo === 'function') {
        if (window.Capacitor && AudioPlayer) {
          await AudioPlayer.pause({ audioId: 'novision-track' }).catch(() => {});
        }
        if (html5El) html5El.pause();
        ytEl.unMute();
        ytEl.setVolume(get().volume || 100);
        ytEl.playVideo();
      }
    }, 50);

    get().fetchLyrics(song);

    if (auth.currentUser && navigator.onLine) {
      const uniqueHistory = Array.from(new Set(newHistory.map(a => a?.id))).map(id => newHistory.find(a => a?.id === id)).filter(Boolean).slice(-25); 
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
    } else if (activeEngine === 'html5') {
      if (window.Capacitor && AudioPlayer) {
        if (isPlaying) {
          AudioPlayer.pause({ audioId: 'novision-track' });
          set({ isPlaying: false });
        } else {
          AudioPlayer.play({ audioId: 'novision-track' });
          set({ isPlaying: true });
        }
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
      if (window.Capacitor && AudioPlayer) {
        AudioPlayer.seek({ audioId: 'novision-track', timeInSeconds: Math.floor(seconds) });
      } else if (html5PlayerRef) {
        html5PlayerRef.currentTime = seconds;
      }
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
    const { queue: rawQueue, currentIndex, isShuffle, isRepeat, history: rawHistory, historyCursor, playSong, _seekCurrentEngineToZero } = state;
    const queue = Array.isArray(rawQueue) ? rawQueue : [];
    const history = Array.isArray(rawHistory) ? rawHistory : [];

    if (queue.length === 0) return;
    
    if (historyCursor < history.length - 1) {
      const nextCursor = historyCursor + 1; const nextSong = history[nextCursor];
      if(!nextSong) return;
      let idxInQueue = queue.findIndex(s => s.id === nextSong.id);
      if (idxInQueue === -1) { queue.push(nextSong); idxInQueue = queue.length - 1; }
      playSong(nextSong, queue, idxInQueue, true); set({ historyCursor: nextCursor }); return;
    }
    
    if (isRepeat) { 
      _seekCurrentEngineToZero(); 
      const { activeEngine, playerRef, html5PlayerRef } = get();
      if (activeEngine === 'youtube' && playerRef) playerRef.playVideo();
      if (activeEngine === 'html5') {
        if (window.Capacitor && AudioPlayer) {
          AudioPlayer.play({ audioId: 'novision-track' });
        } else if (html5PlayerRef) {
          html5PlayerRef.play();
        }
      }
      return; 
    }
    
    if (currentIndex === queue.length - 1 && !isShuffle) {
      if (!navigator.onLine) {
        _seekCurrentEngineToZero();
        const { activeEngine, playerRef, html5PlayerRef } = get();
        if (activeEngine === 'youtube' && playerRef) playerRef.pauseVideo();
        if (activeEngine === 'html5') {
          if (window.Capacitor && AudioPlayer) {
            AudioPlayer.pause({ audioId: 'novision-track' });
          } else if (html5PlayerRef) {
            html5PlayerRef.pause();
          }
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
            if (window.Capacitor && AudioPlayer) {
              AudioPlayer.pause({ audioId: 'novision-track' });
            } else if (html5PlayerRef) {
              html5PlayerRef.pause();
            }
          }
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

    if (_getCurrentEngineTime() > 3) { _seekCurrentEngineToZero(); return; }
    
    if (historyCursor > 0) {
      const prevCursor = historyCursor - 1; const prevSong = history[prevCursor];
      if(!prevSong) return;
      let idxInQueue = queue.findIndex(s => s.id === prevSong.id);
      if (idxInQueue === -1) { queue.unshift(prevSong); idxInQueue = 0; }
      playSong(prevSong, queue, idxInQueue, true); 
      set({ historyCursor: prevCursor });
    } else { _seekCurrentEngineToZero(); }
  }
}));

export default usePlayerStore;