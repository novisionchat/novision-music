import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { MdHomeFilled, MdSearch, MdLibraryMusic, MdExpandMore, MdMenu, MdFavorite } from 'react-icons/md';
import YouTubeEngine from './YouTubeEngine';
import PlayerBar from './PlayerBar';
import NowPlayingPanel from './NowPlayingPanel';
import useAuthStore from '../store/useAuthStore';
import usePlayerStore from '../store/usePlayerStore';
import { db } from '../firebase';
import { ref, onValue } from 'firebase/database';

const Layout = () => {
  const navigate = useNavigate();
  const { profile, setAuthModalOpen, user } = useAuthStore();
  const localPlaylists = usePlayerStore(s => s.localPlaylists);
  const likedSongs = usePlayerStore(s => s.likedSongs);

  const [playlists, setPlaylists] = useState([]);
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    localStorage.getItem('sidebar_collapsed') === 'true'
  );
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);

  useEffect(() => {
    if (!user || !navigator.onLine) {
      setPlaylists([]);
      return;
    }
    const playlistsRef = ref(db, `users/${user.uid}/playlists`);
    const unsubscribe = onValue(playlistsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setPlaylists(Object.keys(data).map(key => ({ id: key, ...data[key] })));
      } else {
        setPlaylists([]);
      }
    });
    return () => unsubscribe();
  }, [user]);

  const toggleSidebar = () => {
    const nextState = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextState);
    localStorage.setItem('sidebar_collapsed', nextState);
  };

  // DÜZELTME: Dinamik çalma listeleri (Yerel + Bulut) son oynatma tarihine göre büyükten küçüğe sıralanıyor!
  const dynamicPlaylists = [...localPlaylists, ...playlists].sort((a, b) => {
    const ta = a.lastPlayed || 0;
    const tb = b.lastPlayed || 0;
    return tb - ta;
  });

  const sidebarPlaylists = [
    { id: 'liked', name: 'Beğenilen Şarkılar', songs: likedSongs, isStatic: true },
    ...dynamicPlaylists
  ];

  return (
    <div className="layout-container">
      <aside 
        className="sidebar-desktop" 
        style={{ 
          width: isSidebarCollapsed ? '80px' : '260px', 
          padding: isSidebarCollapsed ? '20px 10px' : '20px 15px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div>
            <div 
              className="logo-area" 
              style={{ 
                justifyContent: isSidebarCollapsed ? 'center' : 'space-between', 
                padding: 0, 
                width: '100%', 
                display: 'flex', 
                alignItems: 'center' 
              }}
            >
              {isSidebarCollapsed ? (
                <button 
                  className="icon-btn" 
                  onClick={toggleSidebar} 
                  style={{ padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <MdMenu size={26} color="white" />
                </button>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img src="/icon.png" alt="Novision" width="32" style={{ borderRadius: '50%' }} />
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold' }}>Novision</h2>
                  </div>
                  <button 
                    className="icon-btn" 
                    onClick={toggleSidebar} 
                    style={{ padding: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <MdMenu size={26} color="white" />
                  </button>
                </>
              )}
            </div>
            
            <nav className="main-nav" style={{ marginTop: '30px' }}>
              <NavLink to="/" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <MdHomeFilled size={24} /> 
                {!isSidebarCollapsed && <span>Ana Sayfa</span>}
              </NavLink>
              <NavLink to="/search" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start' }}>
                <MdSearch size={24} /> 
                {!isSidebarCollapsed && <span>Ara</span>}
              </NavLink>
              
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', background: 'transparent' }}>
                <NavLink 
                  to="/library" 
                  className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'} 
                  style={{ 
                    justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                    flexGrow: 1,
                    width: '100%',
                    paddingRight: !isSidebarCollapsed && sidebarPlaylists.length > 0 ? '40px' : undefined
                  }}
                >
                  <MdLibraryMusic size={24} />
                  {!isSidebarCollapsed && <span>Kitaplık</span>}
                </NavLink>

                {(!isSidebarCollapsed && sidebarPlaylists.length > 0) && (
                  <button 
                    className="icon-btn" 
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 10, padding: '6px' }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsLibraryOpen(!isLibraryOpen); }}
                  >
                    <MdExpandMore size={22} style={{ transform: isLibraryOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }} />
                  </button>
                )}
              </div>

              {(!isSidebarCollapsed && isLibraryOpen) && (
                <div 
                  className="sidebar-playlists-dropdown" 
                  style={{ maxHeight: '40vh', overflowY: 'auto', marginTop: '10px', paddingLeft: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                  {sidebarPlaylists.map(pl => {
                    let thumb = '/icon.png';
                    if (pl.id === 'liked') {
                      thumb = 'gradient';
                    } else if (pl.songs && pl.songs.length > 0) {
                      thumb = (pl.songs[0].thumbnail || '')
                              .replace('hqdefault.jpg', 'mqdefault.jpg')
                              .replace('sddefault.jpg', 'mqdefault.jpg');
                    }

                    return (
                      <div 
                        key={pl.id} 
                        className="sidebar-playlist-item"
                        onClick={() => navigate(`/playlist/${pl.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        {thumb === 'gradient' ? (
                          <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: 'linear-gradient(135deg, #FF2A54, #8b0021)', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                            <MdFavorite size={16} color="white" />
                          </div>
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0 }}>
                             <img src={thumb} alt={pl.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', textOverflow: 'ellipsis', overflow: 'hidden' }}>{pl.name}</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{pl.id === 'liked' ? 'Sabit Liste' : pl.readonly ? 'Salt Okunur' : 'Çalma Listesi'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </nav>
          </div>
        </div>
      </aside>

      {/* ANA İÇERİK ALANI */}
      <main className="main-content">
        <header className="top-bar">
          <div style={{ flex: 1 }}></div>
          <div className="user-profile-btn" onClick={() => setAuthModalOpen(true)}>
            <img src={profile?.avatar || '/icon.png'} alt="User" />
          </div>
        </header>

        <Outlet />
      </main>

      <NowPlayingPanel />

      {/* MOBİL ALT MENÜ */}
      <nav className="mobile-bottom-nav">
        <NavLink to="/" className={({ isActive }) => isActive ? 'm-nav-item active' : 'm-nav-item'}>
          <MdHomeFilled size={26} /><span>Ana Sayfa</span>
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => isActive ? 'm-nav-item active' : 'm-nav-item'}>
          <MdSearch size={26} /><span>Ara</span>
        </NavLink>
        <NavLink to="/library" className={({ isActive }) => isActive ? 'm-nav-item active' : 'm-nav-item'}>
          <MdLibraryMusic size={26} /><span>Kitaplık</span>
        </NavLink>
      </nav>

      <PlayerBar />
    </div>
  );
};

export default Layout;