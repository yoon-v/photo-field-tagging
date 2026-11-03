# Photo Field Tagging — Offline Starter

Starter PWA untuk pengembangan Photo Field Tagging wilayah Desa Silau Jawa, Kecamatan Bandar Pasir Mandoge, Kabupaten Asahan.

## Menjalankan
1. Upload seluruh isi folder ke repository GitHub.
2. Aktifkan GitHub Pages melalui Settings → Pages → Deploy from a branch.
3. Buka URL HTTPS GitHub Pages dari Chrome Android.
4. Berikan izin kamera dan lokasi.
5. Pilih "Tambahkan ke layar utama" dari menu Chrome.
6. Buka aplikasi, aktifkan kamera, lalu ambil foto.

## Fitur prototipe
- PWA dengan Service Worker dan cache aset inti.
- Kamera belakang melalui getUserMedia.
- Pembacaan GPS saat tombol foto ditekan.
- Overlay informasi pada salinan hasil foto.
- Metadata tersimpan di IndexedDB.
- Unduhan otomatis hasil tagging setelah pengambilan foto.

## Batasan yang wajib diketahui
- Browser PWA tidak menjamin file otomatis masuk ke aplikasi Galeri. Unduhan biasanya masuk ke Downloads. Untuk penyimpanan langsung ke MediaStore/Galeri tanpa dialog browser, perlu aplikasi Android native (misalnya Capacitor dengan plugin MediaStore).
- PWA hanya dapat menggunakan kamera saat aplikasi aktif dan izin diberikan.
- GPS memerlukan izin lokasi dan perangkat dapat membutuhkan waktu untuk memperoleh fix; koordinat kosong tidak boleh direkayasa.
- Alamat offline dan peta satelit offline belum disertakan. Dibutuhkan data alamat lokal dan paket tile/MBTiles yang lisensinya mengizinkan penggunaan offline.
- Citra kamera yang diproses melalui browser adalah frame video, bukan jaminan file foto sensor asli/resolusi penuh. Untuk menjaga kualitas/resolusi kamera secara maksimal dan penyimpanan Galeri yang andal, tahap native Android disarankan.
- Foto asli tidak diunggah ke server. Prototipe hanya menyimpan metadata di IndexedDB; hasil foto diunduh oleh browser.

## Tahap pengembangan berikutnya
1. Bungkus proyek menjadi Android app dengan Capacitor.
2. Implementasikan plugin kamera native + MediaStore agar foto hasil tagging masuk langsung ke Galeri.
3. Tambahkan basis data petani Silau Jawa dan pencocokan koordinat.
4. Tambahkan batas desa resmi dan peta satelit offline dari sumber berlisensi.
5. Tambahkan backup/restore ZIP untuk foto dan database lokal.
