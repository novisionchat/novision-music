import { create } from 'zustand';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, get, set as firebaseSet } from 'firebase/database';

const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  isAuthModalOpen: false,

  setAuthModalOpen: (isOpen) => set({ isAuthModalOpen: isOpen }),

  initAuth: () => {
    let isTimeout = false;
    
    // OFFLINE MOD İÇİN GÜVENLİK: Eğer 3 saniye içinde Firebase cevap vermezse (veya internet kapalıysa) yerel veriyi kullan
    const timeoutId = setTimeout(() => {
      if (get().loading) {
        isTimeout = true;
        const cachedUser = JSON.parse(localStorage.getItem('novision_user') || 'null');
        const cachedProfile = JSON.parse(localStorage.getItem('novision_profile') || 'null');
        set({ user: cachedUser, profile: cachedProfile, loading: false });
      }
    }, 3000);

    onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(timeoutId);
      if (currentUser) {
        // Çevrimdışı kullanım için basit kullanıcı bilgilerini sakla
        localStorage.setItem('novision_user', JSON.stringify({ uid: currentUser.uid, email: currentUser.email }));
        
        try {
          if (navigator.onLine) {
            const snapshot = await get(ref(db, `users/${currentUser.uid}`));
            const prof = snapshot.val() || {};
            localStorage.setItem('novision_profile', JSON.stringify(prof)); // Profili yedekle
            if (!isTimeout) set({ user: currentUser, profile: prof, loading: false });
          } else {
            // İnternet yoksa yedeği yükle
            const cachedProfile = JSON.parse(localStorage.getItem('novision_profile') || '{}');
            if (!isTimeout) set({ user: currentUser, profile: cachedProfile, loading: false });
          }
        } catch (error) {
          const cachedProfile = JSON.parse(localStorage.getItem('novision_profile') || '{}');
          if (!isTimeout) set({ user: currentUser, profile: cachedProfile, loading: false });
        }
      } else {
        localStorage.removeItem('novision_user');
        localStorage.removeItem('novision_profile');
        if (!isTimeout) set({ user: null, profile: null, loading: false, isAuthModalOpen: navigator.onLine });
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
    set({ profile: newUser, isAuthModalOpen: false });
  },

  logout: async () => {
    await signOut(auth);
    set({ isAuthModalOpen: true });
  }
}));

export default useAuthStore;