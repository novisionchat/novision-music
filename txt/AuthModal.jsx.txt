import React, { useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import { MdClose, MdLogout } from 'react-icons/md';

const AuthModal = () => {
  const { user, profile, isAuthModalOpen, setAuthModalOpen, login, signup, logout } = useAuthStore();
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLoginMode) {
        await login(email, password);
      } else {
        await signup(email, password, username);
      }
    } catch (err) {
      setError("İşlem başarısız. Bilgilerinizi kontrol edin.");
    }
  };

  // KULLANICI GİRİŞ YAPMIŞSA PROFIL EKRANINI GÖSTER
  if (user) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <button className="modal-close-btn" onClick={() => setAuthModalOpen(false)}>
            <MdClose size={24} />
          </button>
          
          <img src={profile?.avatar || '/icon.png'} alt="avatar" className="profile-avatar-large" />
          <h2 className="profile-name">{profile?.username || 'Kullanıcı'}</h2>
          <p className="profile-email">{user.email}</p>
          
          <button className="primary-btn logout-btn" onClick={logout}>
            <MdLogout size={20} /> Çıkış Yap
          </button>
        </div>
      </div>
    );
  }

  // GİRİŞ YAPMAMIŞSA GİRİŞ/KAYIT EKRANINI GÖSTER
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <img src="/icon.png" alt="logo" width="60" style={{ borderRadius: '50%', marginBottom: '15px' }} />
        <h2 style={{ marginBottom: '20px' }}>{isLoginMode ? "Novision'a Giriş Yap" : "Hesap Oluştur"}</h2>
        
        {error && <p className="error-text">{error}</p>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {!isLoginMode && (
            <input 
              type="text" className="form-input" placeholder="Kullanıcı Adı" required 
              value={username} onChange={(e) => setUsername(e.target.value)} 
            />
          )}
          <input 
            type="email" className="form-input" placeholder="E-posta Adresi" required 
            value={email} onChange={(e) => setEmail(e.target.value)} 
          />
          <input 
            type="password" className="form-input" placeholder="Şifre (Min 6 karakter)" required minLength="6"
            value={password} onChange={(e) => setPassword(e.target.value)} 
          />
          <button type="submit" className="primary-btn">
            {isLoginMode ? "Giriş Yap" : "Kayıt Ol"}
          </button>
        </form>

        <p className="switch-mode-text" onClick={() => setIsLoginMode(!isLoginMode)}>
          {isLoginMode ? "Hesabın yok mu? Kayıt Ol" : "Zaten hesabın var mı? Giriş Yap"}
        </p>
      </div>
    </div>
  );
};

export default AuthModal;