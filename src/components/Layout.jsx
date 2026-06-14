import { NavLink, Outlet } from 'react-router-dom';
import { MdHomeFilled, MdSearch, MdLibraryMusic } from 'react-icons/md';
import YouTubeEngine from './YouTubeEngine';
import PlayerBar from './PlayerBar';
import NowPlayingPanel from './NowPlayingPanel';
import useAuthStore from '../store/useAuthStore'; // YENİ EKLENDİ

const Layout = () => {
  const { profile, setAuthModalOpen } = useAuthStore(); // YENİ EKLENDİ

  return (
    <div className="layout-container">
      {/* SOL MENÜ */}
      <aside className="sidebar-desktop">
        <div className="logo-area">
          <img src="/icon.png" alt="Novision" width="32" style={{ borderRadius: '50%' }} />
          <h2>Novision</h2>
        </div>
        
        <nav className="main-nav">
          <NavLink to="/" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <MdHomeFilled size={24} /> Ana Sayfa
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <MdSearch size={24} /> Ara
          </NavLink>
          <NavLink to="/library" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <MdLibraryMusic size={24} /> Kitaplık
          </NavLink>
        </nav>
      </aside>

      {/* ANA İÇERİK ALANI */}
      <main className="main-content">
        
        {/* YENİ EKLENDİ: ÜST BAR VE KULLANICI PROFİL FOTOSU */}
        <header className="top-bar">
          <div style={{ flex: 1 }}></div> {/* Sol tarafı boş bırak, sağa it */}
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