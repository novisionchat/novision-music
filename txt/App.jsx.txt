import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import useAuthStore from './store/useAuthStore';
import usePlayerStore from './store/usePlayerStore'; // EKLENDİ
import Home from './pages/Home'; 
import Search from './pages/Search';
import Library from './pages/Library';
import PlaylistDetail from './pages/PlaylistDetail';
import AuthModal from './components/AuthModal';
import AddToPlaylistModal from './components/AddToPlaylistModal';

function App() {
  const { initAuth, loading } = useAuthStore();
  const { initOfflineStorage } = usePlayerStore(); // EKLENDİ

  useEffect(() => { 
    initAuth(); 
    initOfflineStorage(); // Sayfa açılırken indirilen müzikleri yükle
  }, [initAuth, initOfflineStorage]);

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