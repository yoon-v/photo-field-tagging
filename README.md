# Photo Field Tagging — UI refresh + Android project starter

## Perubahan tampilan
- Menghapus Catatan Dokumentasi dari tampilan.
- Menghapus bagian Hasil Akhir dari tampilan.
- Menghapus bagian Dokumentasi Tersimpan di Perangkat dari tampilan.
- Memusatkan tampilan pada identitas petani, status GPS, kamera, dan tombol ambil foto.

## Menjalankan versi web/PWA
Upload isi folder ini ke root repository GitHub Pages seperti sebelumnya.

## Persiapan proyek Android (Capacitor)
Persyaratan: Node.js LTS dan Android Studio dengan Android SDK.
1. `npm install`
2. `npm run build`
3. `npx cap add android` (cukup sekali)
4. `npx cap sync android`
5. `npx cap open android`
6. Di Android Studio pilih Build > Build Bundle(s) / APK(s) > Build APK(s).

## Catatan penting sebelum APK dipakai untuk dokumentasi resmi
Ini adalah starter UI dan konfigurasi Capacitor, belum APK final.
- Pengambilan foto saat ini masih memakai frame video browser, bukan kamera native resolusi penuh.
- Penyimpanan masih menggunakan mekanisme unduhan browser, belum MediaStore/Galeri native.
- Geolocation masih Web API, belum implementasi Android native.
Sebelum dipakai di lapangan, tahap berikutnya adalah mengganti kamera dengan CameraX/native capture, menulis hasil ke Android MediaStore, dan mengintegrasikan lokasi native. Jangan menganggap APK hasil build awal sudah memenuhi tiga hal tersebut.
