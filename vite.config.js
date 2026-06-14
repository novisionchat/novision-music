import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // Yeni güncelleme geldiğinde arka planda otomatik günceller
      includeAssets: ['icon.png'], // Önbelleğe alınacak ekstra dosyalar
      manifest: {
        name: 'Novision Music',
        short_name: 'Novision Music',
        description: 'Novision Music Player',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone', // Tarayıcı arayüzünü gizler, gerçek uygulama gibi görünür
        orientation: 'portrait', // Dikey ekranda başlatır
        icons: [
          {
            src: '/icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any' 
          }
        ]
      }
    })
  ],
})