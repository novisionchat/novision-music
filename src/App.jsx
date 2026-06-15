import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import useAuthStore from './store/useAuthStore';
import usePlayerStore from './store/usePlayerStore';
import Home from './pages/Home'; 
import Search from './pages/Search';
import Library from './pages/Library';
import PlaylistDetail from './pages/PlaylistDetail';
import AuthModal from './components/AuthModal';
import AddToPlaylistModal from './components/AddToPlaylistModal';
import { Toaster } from 'react-hot-toast'; 

// NATIVE BİLDİRİM İZNİ İÇİN RESMİ EKLENTİYİ İTHAL EDİYORUZ
import { LocalNotifications } from '@capacitor/local-notifications';

function App() {
  const { initAuth, loading } = useAuthStore();
  const { initOfflineStorage, setOfflineMode } = usePlayerStore();

  useEffect(() => { 
    initAuth(); 
    initOfflineStorage();

    // DÜZELTME: Android 13+ için gerçek native bildirim izin istemini tetikliyoruz.
    if (window.Capacitor) {
      LocalNotifications.requestPermissions().then((res) => {
        console.log("Native bildirim izni sonucu:", res);
      }).catch(e => console.error("Native bildirim izni istenirken hata:", e));
    }

    const handleOnline = () => {
      setOfflineMode(false);
      
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (existingScript) {
        existingScript.remove();
      }

      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    };
    
    const handleOffline = () => setOfflineMode(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initAuth, initOfflineStorage, setOfflineMode]);

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Yükleniyor...</div>;

  return (
    <BrowserRouter>
      {/* SPOTIFY STİLİ ULTRA ESTETİK TOAST BİLDİRİMLERİ */}
      <Toaster 
        position="top-center"
        toastOptions={{
          duration: 4000, 
          style: {
            background: '#282828', // Koyu gri amoled arkaplan
            color: '#ffffff', // Temiz beyaz metin
            borderRadius: '50px', // Spotify tarzı tam oval (hap/pill) tasarım
            padding: '12px 24px', // Metne nefes aldıran geniş boşluklar
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 10px 40px rgba(0,0,0,0.8)', // Havada süzülme hissi veren derin gölge
            border: 'none', // Sınırları kaldırarak daha modern bir görünüm
          },
          success: {
            iconTheme: {
              primary: '#FF2A54', // Novision uygulamasının ana kırmızı vurgu rengi
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ff4d4d', // Göz yormayan uyarı kırmızısı
              secondary: '#ffffff',
            },
          }
        }}
        containerStyle={{
          zIndex: 999999, // Tüm modalların en önünde kalmasını sağlar
          top: 20 // Ekranın en üstüne çok yapışmaması için ufak bir mesafe
        }}
      />
      <AuthModal />
      <AddToPlaylistModal />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/library" element={<Library />} />
          <Route path="/playlist/:id" element={<PlaylistDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;