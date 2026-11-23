# ANTRI RAMA 1.0.0

**A**sisten **N**askah **T**anda**t**angan **R**ingkas **I**nstansi. **R**amah **A**dministrasi, **M**udah **A**kuntabel.

Ekstensi Chrome untuk pejabat penandatangan SRIKANDI. Menjalankan Setuju, Ambil Nomor, dan tanda tangan elektronik (TTE) hingga 10 naskah per putaran dengan sekali Key Phrase. Alat bantu pribadi, bukan produk resmi ANRI maupun BSrE.

## Peringatan folder

Folder ini adalah aplikasinya. **Jangan dipindahkan atau dihapus** selama ANTRI RAMA masih dipakai. Simpan di lokasi tetap pilihan Anda. Untuk memperbarui, timpa isi folder yang sama, lalu klik muat ulang di kartu ANTRI RAMA pada `chrome://extensions/`.

## Pasang

1. Ekstrak berkas ZIP ke lokasi tetap. Hasilnya folder `antri-rama`.
2. Buka `chrome://extensions/` (salin alamat ini ke tab baru) dan nyalakan **Mode pengembang**.
3. Klik **Muat yang belum dibuka** (Load unpacked) dan pilih folder `antri-rama`.
4. Buka SRIKANDI, menu Naskah Keluar, Tandatangan Naskah, lalu tekan F5 sekali.
5. Klik tombol **ANTRI RAMA** di kanan bawah.

ID ekstensi selalu `nkjjdpaiglgmfncekmmahfiabeacnadc`. Bila ada dua kartu ANTRI RAMA, hapus yang lain.

## Satu putaran

| Langkah | Siapa | Keterangan |
|---|---|---|
| Penyaringan | ANTRI RAMA | Naskah belum giliran disisihkan. Naskah lebih dari 180 hari, berjabatan penandatangan berbeda, Rahasia, ber-OTP, atau datanya tidak lengkap dipisahkan ke **Perlu perhatian** dan diproses manual di SRIKANDI |
| Baca dan centang | Anda | Paling banyak 10 naskah, urut dari yang paling lama masuk antrean. Centang aktif setelah pratinjau PDF dibuka. Tidak ada pilih semua |
| Setuju | ANTRI RAMA | Untuk setiap naskah yang dicentang |
| Ambil Nomor | ANTRI RAMA | Untuk naskah yang Anda tandatangani pertama dan belum bernomor, setelah Anda menyetujui peringatan bahwa nomor tidak bisa diubah |
| TTE | ANTRI RAMA | Key Phrase diketik sekali, dikirim per naskah dengan jeda, lalu dilepas dari memori |

Putaran **berhenti total pada kegagalan pertama** (Key Phrase salah, format nomor belum dibuat, gangguan BSrE, sesi habis). Langkah yang sudah berhasil tidak diulang di putaran berikutnya.

## Data

| Data | Perlakuan |
|---|---|
| Key Phrase | Tidak disimpan, tidak dicatat, hanya dikirim ke alamat TTE SRIKANDI |
| NIK | Dibaca dari Form TTE yang tampil di layar Anda atau diketik sekali. Disimpan di memori peramban dan hilang saat Chrome ditutup. Tampil tersamar |
| Token sesi | Dibaca dari lalu lintas SRIKANDI di tab itu dan dikunci. Token lain di tab yang sama menghentikan ANTRI RAMA |
| Log | Waktu, putaran, nomor, hal, dan hasil tiap langkah. Tanpa NIK dan Key Phrase. Bisa diunduh CSV di halaman opsi |

## Tidak dilakukan

Setuju tanpa pratinjau dan centang Anda, aturan setuju otomatis, menyimpan Key Phrase, membaca penyimpanan terenkripsi SRIKANDI, mengirim naskah, Perbarui PDF, dan menandatangani atas nama orang lain.

## Pengembang

Dikembangkan oleh Deddy Eko Heryanto, S.T.
JFT Pranata Komputer Ahli Muda
Perpustakaan Poltekkes Kemenkes Palangka Raya

Lisensi MIT. Pemakaian sebaiknya disetujui pimpinan dan unit kearsipan instansi Anda.
