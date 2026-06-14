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

    // DÜZELTME: Android 13+ bildirim onay penceresini açıyoruz (Arka planda çalmama sorununu çözer)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(e => console.error("Bildirim izni istenirken hata oluştu:", e));
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