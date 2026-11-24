# ANTRI RAMA

**Asisten Naskah Tandatangan Ringkas Instansi. Ramah Administrasi, Mudah Akuntabel.**

Ekstensi Chrome untuk pejabat penandatangan SRIKANDI. Menjalankan **Setuju, Ambil Nomor, dan tanda tangan elektronik (TTE)** hingga 10 naskah per putaran dengan **sekali Key Phrase**. Alat bantu pribadi, bukan produk resmi ANRI maupun BSrE.

Situs dan panduan: folder `docs/` (GitHub Pages). Unduhan: [`docs/download/antri-rama-v1.0.1.zip`](docs/download/antri-rama-v1.0.1.zip).

> **Jangan pindahkan atau hapus folder ANTRI RAMA** setelah dipasang. Folder hasil ekstrak adalah aplikasinya. Untuk memperbarui, timpa isi folder yang sama.

## Kenapa ANTRI RAMA

| Untuk 10 naskah | Manual | TTE banyak naskah SRIKANDI | ANTRI RAMA |
|---|---|---|---|
| Setuju | 10 kali | 10 kali, manual | Sekali jalan untuk yang dicentang |
| Ambil Nomor | 10 kali | 10 kali, manual | Sekali konfirmasi, berurutan |
| Key Phrase | 10 kali | 1 kali | 1 kali |
| Bila satu gagal | Satu per satu | Tetap lanjut | Berhenti total, laporan per naskah |
| Naskah bermasalah | Tergantung ketelitian | Ikut terpilih | Dipisahkan, diproses manual |

## Pasang

1. Unduh dan ekstrak `antri-rama-v1.0.1.zip` ke lokasi tetap.
2. Buka `chrome://extensions/`, nyalakan Mode pengembang.
3. Klik **Muat yang belum dibuka** dan pilih folder `antri-rama`.
4. Buka SRIKANDI, Naskah Keluar, Tandatangan Naskah, tekan F5.
5. Klik tombol **ANTRI RAMA** di kanan bawah.

ID ekstensi tetap: `nkjjdpaiglgmfncekmmahfiabeacnadc`.

## Cara kerja

1. **Penyaringan.** Naskah belum giliran disisihkan. Naskah lebih dari 180 hari, berjabatan penandatangan berbeda dengan jabatan terbaru Anda, Rahasia, ber-OTP, atau datanya tidak lengkap masuk **Perlu perhatian**.
2. **Baca dan centang.** Paling banyak 10 naskah, urut dari yang paling lama masuk antrean (atau tanggal naskah). Centang aktif setelah pratinjau PDF dibuka.
3. **Setuju**, lalu **Ambil Nomor** (bagi penandatangan pertama, setelah peringatan nomor tidak bisa diubah), lalu **TTE** dengan sekali Key Phrase.
4. **Berhenti pada kegagalan pertama.** Langkah yang sudah berhasil tidak diulang di putaran berikutnya.
5. **Log** per naskah, tanpa NIK dan Key Phrase, bisa diunduh CSV.

Permintaan yang dikirim sama dengan yang dikirim antarmuka SRIKANDI sendiri (dipetakan dari pemakaian sungguhan dan kode tampilan SRIKANDI):

| Langkah | Permintaan |
|---|---|
| Daftar | `GET /naskah-keluar/api/penandatangan-naskah/list` |
| Setuju | `POST /naskah-keluar/api/penandatangan-naskah/update` (`id`, `naskah_keluar_id`, `user_id`, `status=SETUJU`) |
| Ambil Nomor | `GET /nk-number/api/penomoran-otomatis/get-nomor-final-update` |
| TTE | `POST /nk-ttd/api/penandatangan-naskah/ttd-elektronik-only` (`nik`, `key`, `naskah_keluar_id`) |

## Keamanan

- Key Phrase tidak disimpan dan hanya dikirim ke alamat TTE.
- Panel dan tindakan berjalan di ruang terisolasi ekstensi dengan shadow DOM tertutup, terpisah dari skrip halaman, termasuk skrip pihak ketiga.
- NIK di memori sesi peramban saja, hilang saat Chrome ditutup.
- Token sesi dibaca dari lalu lintas SRIKANDI dan dikunci per tab; token lain menghentikan ANTRI RAMA.
- Daftar putih enam alamat. Pengiriman naskah tidak termasuk.
- Tanpa server perantara, AI, atau analitik.

## Batasan

| Batas | Nilai |
|---|---|
| Naskah per putaran | 1 sampai 10 (dikunci maksimal 10) |
| Jeda antarpermintaan | 1, 2, atau 3 detik |
| Daftar yang dibaca | Hingga 2.000 naskah teratas |
| Log | 3.000 baris terakhir |

Belum dilakukan: Perbarui PDF dan kirim naskah (tetap di SRIKANDI), pemeriksaan isi teks PDF.

## Pengujian

| Rangkaian | Berkas | Isi | Hasil 1.0.1 |
|---|---|---|---|
| Inti | `tests/core.test.js` | Daftar putih, penyaringan, antrean, putaran, CSV | 32 lulus |
| Mesin putaran | `tests/run.test.js` | Urutan fase, Key Phrase salah, nomor 404, galat jaringan, berhenti, melanjutkan | 14 lulus |
| Chrome sungguhan | `tests/e2e/e2e.js` + `fakesrk.py` | SRIKANDI tiruan lewat HTTPS lokal: panel, pratinjau, putaran gagal dan berhasil, sesi berubah, NIK, opsi | 28 lulus |
| Bersama JALA | `tests/e2e/tumpuk.js` | JALA Arsip dan ANTRI RAMA dipasang bersamaan: tombol tidak bertumpuk | 4 lulus |

Uji Chrome memakai salinan ekstensi yang shadow DOM-nya dibuka agar bisa diklik otomatis; selebihnya identik. Sertifikat uji dibuat sendiri (`openssl req -x509 -newkey rsa:2048 -nodes -keyout key.pem -out cert.pem -days 30 -subj /CN=uji`).

**Belum diuji di SRIKANDI sungguhan dengan ANTRI RAMA.** Uji pertama sebaiknya dengan 2 sampai 3 naskah yang memang harus ditandatangani.

## Riwayat versi

- **1.0.1** (23 November 2026): tombol ANTRI RAMA otomatis naik di atas tombol JALA Arsip bila keduanya terpasang, sehingga tidak bertumpuk.
- **1.0.0** (23 November 2026): rilis pertama.

## Pengembang

Dikembangkan oleh Deddy Eko Heryanto, S.T.
JFT Pranata Komputer Ahli Muda
Perpustakaan Poltekkes Kemenkes Palangka Raya

Lisensi MIT. Huruf situs: Plus Jakarta Sans (SIL OFL).
