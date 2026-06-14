import { create } from 'zustand';
import { auth, db } from '../firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
// BURASI DEĞİŞTİ: set yerine firebaseSet olarak içeri aktarıyoruz
import { ref, get, set as firebaseSet } from 'firebase/database';

const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  loading: true,
  isAuthModalOpen: false, // Profil/Giriş penceresi açık mı?

  setAuthModalOpen: (isOpen) => set({ isAuthModalOpen: isOpen }),

  // Uygulama açıldığında kullanıcının oturumunu kontrol eder
  initAuth: () => {
    onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Kullanıcı giriş yapmışsa, veritabanından kullanıcı adını/fotosunu çek
        const snapshot = await get(ref(db, `users/${currentUser.uid}`));
        set({ user: currentUser, profile: snapshot.val() || {}, loading: false });
      } else {
        // Giriş yapmamışsa modalı otomatik aç
        set({ user: null, profile: null, loading: false, isAuthModalOpen: true });
      }
    });
  },

  login: async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
    set({ isAuthModalOpen: false }); // Başarılıysa pencereyi kapat
  },

  signup: async (email, password, username) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = { username, email, avatar: '/icon.png' };
    
    // BURASI DEĞİŞTİ: firebaseSet kullandık
    await firebaseSet(ref(db, `users/${cred.user.uid}`), newUser);
    
    set({ profile: newUser, isAuthModalOpen: false });
  },

  logout: async () => {
    await signOut(auth);
    set({ isAuthModalOpen: true }); // Çıkış yapınca giriş ekranını aç
  }
}));

export default useAuthStore;