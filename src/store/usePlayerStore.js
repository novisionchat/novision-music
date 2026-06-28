import { create } from 'zustand';
import { auth, db } from '../firebase';
import { ref, set as firebaseSet, get as firebaseGet } from 'firebase/database';
import localforage from 'localforage';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { AudioPlayer } from '@mediagrid/capacitor-native-audio';
import toast from 'react-hot-toast';

localforage.config({ name: 'NovisionMusic', storeName: 'offline_songs' });

const isNative = Capacitor.isNativePlatform();

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
  activeEngine: 'html5', 
  downloadedSongs: {},
  downloadedMetadata: {}, 
  localPlaylists: [],     
  isOfflineMode: !navigator.onLine, 
  currentStreamUrl: null, 
  
  downloadQueue: [], downloadProgress: {}, downloadXHRs: {}, downloadQueueList: [],

  // --- KAYDIRMA KALKANI İÇİN YENİ STATELER ---
  isSeeking: false,
  seekTimeout: null,
  seekUnlockTimeout: null,

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
    const state = get();
    if (state.isVideoMode === val) return;
    set({ isVideoMode: val });

    if (state.currentSong && state.isPlaying) {
      const currentTime = state._getCurrentEngineTime();
      state.seekTo(currentTime);
      if (val) {
         state.setFallbackToYoutube();
      } else {
         state._switchToHtml5Engine(currentTime);
      }
    } else if (state.currentSong) {
      set({ activeEngine: val ? 'youtube' : 'html5' });
    }
  },

  _switchToHtml5Engine: async (time) => {
    const state = get();
    set({ activeEngine: 'html5' });
    
    if (state.playerRef && typeof state.playerRef.pauseVideo === 'function') {
      state.playerRef.pauseVideo();
    }
    
    const localData = state.downloadedSongs[state.currentSong?.id];
    const streamUrlToAssign = state.currentStreamUrl;
    
    if (isNative && AudioPlayer) {
      try {
        await AudioPlayer.destroy({ audioId: 'novision-track' }).catch(() => {});
        const nativeSource = localData ? (localData.localNativeUrl || localData.localAudioUrl) : streamUrlToAssign;
        const nativeArtwork = localData ? (localData.localThumbFileUrl || '/icon.png') : (state.currentSong.thumbnail || '/icon.png');

        await AudioPlayer.create({
          audioId: 'novision-track',
          audioSource: nativeSource,
          friendlyTitle: state.currentSong.title,
          artistName: state.currentSong.channel,
          artworkSource: nativeArtwork,
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
        await AudioPlayer.seek({ audioId: 'novision-track', timeInSeconds: Math.floor(time) });
        await AudioPlayer.play({ audioId: 'novision-track' });

        if (state.nativeProgressInterval) clearInterval(state.nativeProgressInterval);
        const interval = setInterval(async () => {
          const currentState = get();
          // EĞER KALKAN DEVREDEYSE GÜNCELLEMEYİ YOK SAY (Titreme olmaz)
          if (currentState.activeEngine !== 'html5' || !currentState.isPlaying || currentState.isSeeking) return;
          try {
            const timeRes = await AudioPlayer.getCurrentTime({ audioId: 'novision-track' });
            const durRes = await AudioPlayer.getDuration({ audioId: 'novision-track' });
            if (timeRes && timeRes.currentTime !== undefined) set({ currentTime: timeRes.currentTime });
            if (durRes && durRes.duration !== undefined && durRes.duration > 0) set({ duration: durRes.duration });
          } catch (e) {}
        }, 1000);
        set({ nativeProgressInterval: interval });

      } catch (e) { console.error("Native Audio Geçiş Hatası:", e); }
    } else {
      const html5El = state.html5PlayerRef;
      if (html5El) {
        const finalSrc = localData ? localData.localAudioUrl : streamUrlToAssign;
        const isSameSong = html5El.getAttribute('data-song-id') === state.currentSong.id;

        html5El.dataset.isTransitioning = "true";

        if (!isSameSong) {
            html5El.setAttribute('data-song-id', state.currentSong.id);
            html5El.src = finalSrc;
            html5El.load();
        }

        const attemptSeekAndPlay = () => {
            html5El.currentTime = time;
            html5El.play().then(() => {
                setTimeout(() => { html5El.dataset.isTransitioning = "false"; }, 400);
            }).catch(() => {
                html5El.dataset.isTransitioning = "false";
            });
        };

        if (html5El.readyState >= 1) {
            attemptSeekAndPlay();
        } else {
            html5El.addEventListener('loadedmetadata', attemptSeekAndPlay, { once: true });
            html5El.play().catch(() => {});
        }
      }
    }
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

      if (isNative) {
        try { metadata = (await safeReadJSON(Filesystem, Directory, 'downloaded_metadata.json')) || {}; } catch (e) {}
        try { lPlaylists = (await safeReadJSON(Filesystem, Directory, 'local_playlists.json')) || []; } catch (e) {}
        set({ downloadedMetadata: metadata, localPlaylists: lPlaylists });

        try {
          const result = await Filesystem.readdir({ path: '', directory: Directory.Data });
          if (result && result.files) {
            for (let file of result.files) {
              const fileName = typeof file === 'string' ? file : file.name;
              if (fileName && fileName.endsWith('.mp3')) {
                const id = fileName.replace('.mp3', '');
                const audioUri = await Filesystem.getUri({ path: fileName, directory: Directory.Data });
                
                let localThumbUrl = null; let localThumbFileUrl = null; 
                const hasThumb = result.files.some(f => {
                  const fName = typeof f === 'string' ? f : f.name;
                  return fName === `${id}_thumb.jpg`;
                });

                if (hasThumb) {
                  try {
                    const thumbUri = await Filesystem.getUri({ path: `${id}_thumb.jpg`, directory: Directory.Data });
                    localThumbUrl = window.Capacitor.convertFileSrc(thumbUri.uri); 
                    localThumbFileUrl = thumbUri.uri; 
                  } catch (err) {}
                }

                loadedSongs[id] = {
                  localAudioUrl: window.Capacitor.convertFileSrc(audioUri.uri),
                  localNativeUrl: audioUri.uri,
                  localThumbUrl: localThumbUrl || '/icon.png',
                  localThumbFileUrl: localThumbFileUrl || '/icon.png',
                  metadata: metadata[id] || { id, title: "Çevrimdışı Şarkı", channel: "Bilinmeyen", thumbnail: localThumbUrl || '/icon.png', lyrics: [] }
                };
              }
            }
          }
          set({ downloadedSongs: loadedSongs });
        } catch (dirError) {}

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
        } catch (webError) {}
      }
    } catch (e) {}
  },

  saveLocalPlaylists: async (newPlaylists) => {
    set({ localPlaylists: newPlaylists });
    if (isNative) {
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

            let localAudioUrl = ""; let localThumbUrl = null; let localNativeUrl = "";
            const newMetadata = { id: song.id, title: song.title, channel: song.channel, thumbnail: song.thumbnail, lyrics: fetchedLyrics };
            const updatedMetadata = { ...get().downloadedMetadata, [song.id]: newMetadata };

            if (isNative) {
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
                  [song.id]: { localAudioUrl, localNativeUrl, localThumbUrl: localThumbUrl || song.thumbnail, localThumbFileUrl: localNativeUrl ? localNativeUrl.replace('.mp3', '_thumb.jpg') : song.thumbnail, metadata: newMetadata } 
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
    if (isNative) {
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

          const localData = state.downloadedSongs[state.currentSong?.id];
          const finalSrc = localData ? (localData.localNativeUrl || localData.localAudioUrl) : currentStreamUrl;
          const finalThumb = localData ? (localData.localThumbFileUrl || '/icon.png') : (currentSong.thumbnail || '/icon.png');

          if (isNative && AudioPlayer) {
            try {
              await AudioPlayer.destroy({ audioId: 'novision-track' }).catch(() => {});
              await AudioPlayer.create({
                audioId: 'novision-track',
                audioSource: finalSrc,
                friendlyTitle: currentSong.title,
                artistName: currentSong.channel,
                artworkSource: finalThumb,
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
            } catch (err) {}
          } else if (html5PlayerRef) {
            html5PlayerRef.src = finalSrc;
            html5PlayerRef.currentTime = currentTime;
            html5PlayerRef.play().catch(() => {});
          }
        }
      }
    } else {
      if (activeEngine === 'html5' && state.isVideoMode) {
        if (isNative && AudioPlayer) await AudioPlayer.pause({ audioId: 'novision-track' }).catch(() => {});
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
    if (isNative && AudioPlayer) {
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
    const isActuallyDownloaded = !!localData;
    const isAppBackground = document.visibilityState === 'hidden';
    
    const nextEngine = isActuallyDownloaded ? 'html5' 
                     : isAppBackground ? 'html5' 
                     : get().isVideoMode ? 'youtube'
                     : 'html5';

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const streamUrlToAssign = `${apiUrl}/api/download?id=${song.id}`;

    if (nextEngine === 'youtube' && !navigator.onLine) {
      toast.error("İnternet bağlantınız yok ve bu şarkı indirilmemiş."); 
      return; 
    }

    setTimeout(() => {
        const currentState = get();
        if (currentState.currentSong?.id !== song.id) return; 
        
        let prefetchIndex = currentState.isShuffle ? Math.floor(Math.random() * queue.length) : index + 1;
        if (prefetchIndex < queue.length) {
           const prefetchSong = queue[prefetchIndex];
           if (prefetchSong && !currentState.downloadedSongs[prefetchSong.id]) {
               const prefetchUrl = `${apiUrl}/api/download?id=${prefetchSong.id}`;
               const audioPreload = new Audio();
               audioPreload.preload = 'auto'; 
               audioPreload.src = prefetchUrl;
           }
        }
    }, 8000); 

    if (state.nativeProgressInterval) clearInterval(state.nativeProgressInterval);

    set({ 
      currentSong: song, queue: queue.length > 0 ? queue : [song], 
      currentIndex: index, isPlaying: true, currentTime: 0, 
      history: newHistory, historyCursor: newCursor, activeEngine: nextEngine,
      currentStreamUrl: streamUrlToAssign,
      nativeProgressInterval: null
    });

    if (isNative && AudioPlayer && nextEngine === 'html5') {
        const runNativeAudio = async () => {
          try {
            await AudioPlayer.destroy({ audioId: 'novision-track' }).catch(() => {});
            
            const nativeSource = isActuallyDownloaded 
              ? (localData.localNativeUrl || localData.localAudioUrl) 
              : streamUrlToAssign;

            const nativeArtwork = isActuallyDownloaded 
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
              // KALKAN DEVREDEYSE SANIYE OKUMA (TİTREMEYİ ENGELLER)
              if (currentState.activeEngine !== 'html5' || !currentState.isPlaying || currentState.isSeeking) return;
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

          if (nextEngine === 'html5' && html5El) {
            let finalSrc = isActuallyDownloaded ? localData.localAudioUrl : streamUrlToAssign;
            const isSameSong = html5El.getAttribute('data-song-id') === song.id;
            
            html5El.dataset.isTransitioning = "false";

            if (!isSameSong) {
              html5El.setAttribute('data-song-id', song.id);
              html5El.src = finalSrc;
              html5El.load();
            }
            html5El.play().catch(() => { set({ isPlaying: false }); });
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
        let updatedRecent = [song, ...currentRecent.filter(s => s.id !== song.id)].slice(0, 25);
        firebaseSet(recentRef, updatedRecent);
      });
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
      if (isNative && AudioPlayer) {
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
  
  // ==========================================
  // AKILLI KAYDIRMA KALKANI (Debounce + Titreme Koruması)
  // ==========================================
  seekTo: (seconds) => { 
    const state = get(); 
    
    // UI barını anında kullanıcıya göster ve "Kalkanı" indir (setInterval'leri sustur)
    set({ currentTime: seconds, isSeeking: true }); 
    
    if (state.seekTimeout) clearTimeout(state.seekTimeout); 
    if (state.seekUnlockTimeout) clearTimeout(state.seekUnlockTimeout); 

    // Kaydırma işlemi durduktan 150ms sonra Asıl Motorlara Emri Yolla
    const sTimeout = setTimeout(() => { 
      const { playerRef, html5PlayerRef, activeEngine } = get(); 
      if (activeEngine === 'youtube' && playerRef && playerRef.seekTo) { 
        playerRef.seekTo(seconds, true); 
      } else if (activeEngine === 'html5') { 
        if (isNative && AudioPlayer) {
          AudioPlayer.seek({ audioId: 'novision-track', timeInSeconds: Math.floor(seconds) }).catch(() => {});
        } else if (html5PlayerRef) { 
          html5PlayerRef.currentTime = seconds; 
        } 
        if (playerRef && playerRef.seekTo) playerRef.seekTo(seconds, true); 
      } 
      
      // Emir verildikten yaklaşık 1 saniye sonra kalkanı kaldır ki Native Eklenti kendine gelsin
      const uTimeout = setTimeout(() => set({ isSeeking: false }), 800); 
      set({ seekUnlockTimeout: uTimeout }); 
    }, 150); 
    
    set({ seekTimeout: sTimeout }); 
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
        if (isNative && AudioPlayer) AudioPlayer.play({ audioId: 'novision-track' });
        else if (html5PlayerRef) html5PlayerRef.play();
      }
      return; 
    }
    
    if (currentIndex === queue.length - 1 && !isShuffle) {
      if (!navigator.onLine) {
        _seekCurrentEngineToZero();
        const { activeEngine, playerRef, html5PlayerRef } = get();
        if (activeEngine === 'youtube' && playerRef) playerRef.pauseVideo();
        if (activeEngine === 'html5') {
          if (isNative && AudioPlayer) AudioPlayer.pause({ audioId: 'novision-track' });
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
            if (isNative && AudioPlayer) AudioPlayer.pause({ audioId: 'novision-track' });
            else if (html5PlayerRef) html5PlayerRef.pause();
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