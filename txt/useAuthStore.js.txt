import { create } from 'zustand';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
// BURASI DÜZELTİLDİ: get -> firebaseGet olarak içeri aktarıldı (İsim çakışmasını engellemek için)
import { ref, get as firebaseGet, set as firebaseSet } from 'firebase/database';

const useAuthStore = create((set, getStore) => ({
  user: null,
  profile: null,
  loading: true,
  isAuthModalOpen: false,

  setAuthModalOpen: (isOpen) => set({ isAuthModalOpen: isOpen }),

  initAuth: () => {
    // 1. ADIM: Uygulama açılır açılmaz yerel (önbelleklenmiş) veriyi UI'a bas
    const cachedUser = JSON.parse(localStorage.getItem('novision_user') || 'null');
    const cachedProfile = JSON.parse(localStorage.getItem('novision_profile') || 'null');
    
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
            // BURADAKİ ÇAKIŞMA ÇÖZÜLDÜ: Artık firebaseGet kullanıyoruz!
            const snapshot = await firebaseGet(ref(db, `users/${currentUser.uid}`));
            const prof = snapshot.val() || {};
            
            localStorage.setItem('novision_profile', JSON.stringify(prof));
            set({ user: currentUser, profile: prof, loading: false });
          } else {
            set({ user: currentUser, profile: cachedProfile || {}, loading: false });
          }
        } catch (error) {
          console.error("Profil çekme hatası:", error);
          set({ user: currentUser, profile: cachedProfile || {}, loading: false });
        }
      } else {
        localStorage.removeItem('novision_user');
        localStorage.removeItem('novision_profile');
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
    set({ isAuthModalOpen: true, user: null, profile: null });
  }
}));

export default useAuthStore;