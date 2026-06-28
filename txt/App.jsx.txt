import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
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

// İÇ İÇE GEÇMİŞ YÖNLENDİRME YAPISI İÇİN ALT BİLEŞEN
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  const initAuth = useAuthStore(s => s.initAuth);
  const loading = useAuthStore(s => s.loading);
  const user = useAuthStore(s => s.user);

  const initOfflineStorage = usePlayerStore(s => s.initOfflineStorage);
  const setOfflineMode = usePlayerStore(s => s.setOfflineMode);
  const setLikedSongs = usePlayerStore(s => s.setLikedSongs);

  // Geri tuşu kontrolü için store değişkenleri
  const isPanelOpen = usePlayerStore(s => s.isPanelOpen);
  const closePanel = usePlayerStore(s => s.closePanel);
  const isAddModalOpen = usePlayerStore(s => s.isAddModalOpen);
  const closeAddModal = usePlayerStore(s => s.closeAddModal);
  const isAuthModalOpen = useAuthStore(s => s.isAuthModalOpen);
  const setAuthModalOpen = useAuthStore(s => s.setAuthModalOpen);

  // 1. SADECE UYGULAMA AÇILDIĞINDA 1 KEZ ÇALIŞACAK KODLAR
  useEffect(() => { 
    initAuth(); 
    initOfflineStorage();

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
  }, []);

  // 2. FİZİKSEL GERİ TUŞU KONTROLÜ (SPOTIFY STİLİ AKILLI UX)
  useEffect(() => {
    if (!window.Capacitor) return;

    let activeHandler;
    
    const initBackButton = async () => {
      const { App: CapApp } = await import('@capacitor/app');
      
      activeHandler = await CapApp.addListener('backButton', () => {
        if (isPanelOpen) {
          closePanel(); // Müzik çalar açıksa önce paneli kapat
        } else if (isAddModalOpen) {
          closeAddModal(); // Liste ekleme modalı açıksa kapat
        } else if (isAuthModalOpen) {
          setAuthModalOpen(false); // Giriş ekranı açıksa kapat
        } else if (location.pathname === '/') {
          CapApp.exitApp(); // Ana sayfadaysak uygulamadan çık
        } else {
          navigate(-1); // Diğer durumlarda bir önceki sayfaya dön
        }
      });
    };

    initBackButton();

    return () => {
      if (activeHandler) {
        activeHandler.remove();
      }
    };
  }, [location.pathname, navigate, isPanelOpen, closePanel, isAddModalOpen, closeAddModal, isAuthModalOpen, setAuthModalOpen]);

  // 3. KULLANICI DURUMU DEĞİŞTİĞİNDE ÇALIŞACAK KODLAR
  useEffect(() => {
    if (user) {
      const unsub = onValue(ref(db, `users/${user.uid}/likedSongs`), (snap) => {
        setLikedSongs(snap.exists() ? snap.val() : []);
      });
      return () => unsub();
    } else {
      setLikedSongs([]);
    }
  }, [user, setLikedSongs]);

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', backgroundColor: '#000' }}>
        Yükleniyor...
      </div>
    );
  }

  return (
    <>
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
    </>
  );
}

// ANA SARICI BİLEŞEN
function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;