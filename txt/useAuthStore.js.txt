import { create } from 'zustand';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get as firebaseGet, set as firebaseSet } from 'firebase/database';
import localforage from 'localforage'; // AVATAR ÖNBELLEKLEME İÇİN EKLENDİ

// AVATAR CACHING FONKSİYONLARI
const cacheAvatar = async (url) => {
  if (!url || url === '/icon.png') return '/icon.png';
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        localforage.setItem('cached_profile_avatar', reader.result);
        resolve(reader.result);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Avatar önbelleklenemedi:", error);
    return url;
  }
};

const getCachedAvatar = async () => {
  try {
    return await localforage.getItem('cached_profile_avatar');
  } catch (error) {
    return null;
  }
};

const useAuthStore = create((set, getStore) => ({
  user: null,
  profile: null,
  loading: true,
  isAuthModalOpen: false,

  setAuthModalOpen: (isOpen) => set({ isAuthModalOpen: isOpen }),

  initAuth: async () => {
    // 1. ADIM: Uygulama açılır açılmaz yerel (önbelleklenmiş) veriyi UI'a bas
    const cachedUser = JSON.parse(localStorage.getItem('novision_user') || 'null');
    const cachedProfile = JSON.parse(localStorage.getItem('novision_profile') || 'null');
    const cachedAvatar = await getCachedAvatar();
    
    if (cachedProfile && cachedAvatar) {
      cachedProfile.avatar = cachedAvatar;
    }

    if (cachedUser) {
      set({ user: cachedUser, profile: cachedProfile, loading: false });
    }

    // 2. ADIM: 3 saniye sonra hala "yükleniyor" ekranındaysa zorla kaldır
    setTimeout(() => {
      if (getStore().loading) set({ loading: false });
    }, 3000);

    // 3. ADIM: Firebase'i dinle ve asıl veriyi çek
    onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        localStorage.setItem('novision_user', JSON.stringify({ uid: currentUser.uid, email: currentUser.email }));
        
        try {
          if (navigator.onLine) {
            const snapshot = await firebaseGet(ref(db, `users/${currentUser.uid}`));
            const prof = snapshot.val() || {};
            
            const originalUrl = prof.avatar;
            // Profil avatarını önbelleğe al ve base64 olarak state'e kaydet (UI'da anında görünmesi için)
            if (prof.avatar) {
              prof.avatar = await cacheAvatar(prof.avatar);
            }
            
            // localStorage şişmesin diye orijinal URL'yi saklıyoruz
            const profToSave = { ...prof, avatar: originalUrl };
            localStorage.setItem('novision_profile', JSON.stringify(profToSave));
            
            set({ user: currentUser, profile: prof, loading: false });
          } else {
            const avatar = await getCachedAvatar();
            const prof = cachedProfile || {};
            if(avatar) prof.avatar = avatar;
            set({ user: currentUser, profile: prof, loading: false });
          }
        } catch (error) {
          console.error("Profil çekme hatası:", error);
          const avatar = await getCachedAvatar();
          const prof = cachedProfile || {};
          if(avatar) prof.avatar = avatar;
          set({ user: currentUser, profile: prof, loading: false });
        }
      } else {
        localStorage.removeItem('novision_user');
        localStorage.removeItem('novision_profile');
        localforage.removeItem('cached_profile_avatar');
        set({ user: null, profile: null, loading: false, isAuthModalOpen: navigator.onLine });
      }
    });
  },

  login: async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
    set({ isAuthModalOpen: false });
  },

  signup: async (email, password, username) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = { username, email, avatar: '/icon.png' };
    
    await firebaseSet(ref(db, `users/${cred.user.uid}`), newUser);
    
    localStorage.setItem('novision_user', JSON.stringify({ uid: cred.user.uid, email: cred.user.email }));
    localStorage.setItem('novision_profile', JSON.stringify(newUser));
    
    set({ user: cred.user, profile: newUser, isAuthModalOpen: false });
  },

  logout: async () => {
    await signOut(auth);
    localStorage.removeItem('novision_user');
    localStorage.removeItem('novision_profile');
    localforage.removeItem('cached_profile_avatar');
    set({ isAuthModalOpen: true, user: null, profile: null });
  }
}));

export default useAuthStore;