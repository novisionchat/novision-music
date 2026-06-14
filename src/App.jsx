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

function App() {
  const { initAuth, loading } = useAuthStore();
  const { initOfflineStorage, setOfflineMode } = usePlayerStore();

  useEffect(() => { 
    initAuth(); 
    initOfflineStorage();

    // 1. İNTERNET BAĞLANTISINI ANLIK DİNLE (Çevrimdışı/Çevrimiçi geçişi için)
    const handleOnline = () => setOfflineMode(false);
    const handleOffline = () => setOfflineMode(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. ARKA PLAN MODUNU DEVREYE SOK (deviceready beklenmek zorundadır)
    document.addEventListener('deviceready', () => {
      if (window.cordova && window.cordova.plugins && window.cordova.plugins.backgroundMode) {
        const bgMode = window.cordova.plugins.backgroundMode;
        bgMode.setDefaults({
            title: 'Novision Music',
            text: 'Arka planda çalıyor',
            icon: 'icon',
            color: '000000',
            resume: true,
            hidden: false,
        });
        
        bgMode.on('activate', () => {
            bgMode.disableWebViewOptimizations(); // Ekran kapanınca WebView'ın dondurulmasını engeller
        });
        
        bgMode.enable();
      }
    }, false);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [initAuth, initOfflineStorage, setOfflineMode]);

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>Yükleniyor...</div>;

  return (
    <BrowserRouter>
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