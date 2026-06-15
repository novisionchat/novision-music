import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import useAuthStore from './store/useAuthStore';
import usePlayerStore from './store/usePlayerStore';
import Home from './pages/Home'; 
import Search from './pages/Search';
import Library from './pages/Library';
import PlaylistDetail from './pages/PlaylistDetail';
import ArtistDetail from './pages/ArtistDetail';
import AuthModal from './components/AuthModal';
import AddToPlaylistModal from './components/AddToPlaylistModal';
import { Toaster } from 'react-hot-toast'; 
import { LocalNotifications } from '@capacitor/local-notifications';
import { db } from './firebase'; 
import { ref, onValue } from 'firebase/database'; 

function App() {
  // ZUSTAND OPTİMİZASYONU: Uygulamanın gereksiz yere baştan çizilmesini (re-render) önler
  const initAuth = useAuthStore(s => s.initAuth);
  const loading = useAuthStore(s => s.loading);
  const user = useAuthStore(s => s.user);

  const initOfflineStorage = usePlayerStore(s => s.initOfflineStorage);
  const setOfflineMode = usePlayerStore(s => s.setOfflineMode);
  const setLikedSongs = usePlayerStore(s => s.setLikedSongs);

  // 1. SADECE UYGULAMA AÇILDIĞINDA 1 KEZ ÇALIŞACAK KODLAR (Döngüye Girmemesi İçin)
  useEffect(() => { 
    initAuth(); 
    initOfflineStorage();

    // Sadece mobildeyken (Capacitor varsa) bildirim izni iste
    if (window.Capacitor) {
      LocalNotifications.requestPermissions().then((res) => {
        console.log("Native bildirim izni sonucu:", res);
      }).catch(e => console.log("Tarayıcıda native bildirim izni atlandı."));
    }

    const handleOnline = () => {
      setOfflineMode(false);
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (existingScript) existingScript.remove();
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag) firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      else document.head.appendChild(tag);
    };
    
    const handleOffline = () => setOfflineMode(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // <-- BOŞ DİZİ! Bu sayede bu blok sadece 1 kere çalışır ve cihaz hafızasını bir daha taramaz.

  // 2. KULLANICI DURUMU DEĞİŞTİĞİNDE ÇALIŞACAK KODLAR (Beğenilen Şarkılar)
  useEffect(() => {
    if (user) {
      const unsub = onValue(ref(db, `users/${user.uid}/likedSongs`), (snap) => {
        setLikedSongs(snap.exists() ? snap.val() : []);
      });
      return () => unsub(); // Component kapandığında dinlemeyi bırak
    } else {
      setLikedSongs([]);
    }
  }, [user, setLikedSongs]); // <-- Sadece "user" değiştiğinde çalışır

  // Yüklenme Ekranı
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', backgroundColor: '#000' }}>
        Yükleniyor...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 4000, 
          style: {
            background: '#282828',
            color: '#ffffff',
            borderRadius: '50px',
            padding: '12px 24px',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
            border: 'none',
          },
          success: { iconTheme: { primary: '#FF2A54', secondary: '#ffffff' } },
          error: { iconTheme: { primary: '#ff4d4d', secondary: '#ffffff' } }
        }}
        containerStyle={{ zIndex: 999999, top: 20 }}
      />
      <AuthModal />
      <AddToPlaylistModal />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/playlist/:id" element={<PlaylistDetail />} />
          <Route path="/artist/:name" element={<ArtistDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;