// Uji fungsi murni ANTRI RAMA. Data tiruan.
const a = require('assert'); const C = require('../extension/core.js');
let n = 0; const ok = (c, m) => { a.ok(c, m); n++; };
const T = '2026-11-23';
const row = (id, o) => Object.assign({ id, nomor: '', hal: 'Hal ' + id, tanggal: '2026-11-20', created_at: '2026-11-20T08:00:00', sender_user_id: 5, jenis_naskah_id: 2, sifat_naskah_id: 1, klasifikasi_id: 9, jenis_naskah_nama: 'Surat Dinas', sifat_naskah_nama: 'Biasa', file: 'a.pdf', file_path: 'naskah-dinas-keluar/1', penandatangan_naskahs: [{ id: 700 + id, user_id: 5, urutan: 1, status: null, is_signed: false, jabatan: 'Kepala Pusat', created_at: '2026-11-20T09:00:00' }] }, o || {});
// validateApi
ok(C.validateApi('https://api.arsip.go.id/naskah-keluar/api/penandatangan-naskah/list?rows=10', 'GET'), 'list GET boleh');
ok(C.validateApi('https://api.arsip.go.id/nk-ttd/api/penandatangan-naskah/ttd-elektronik-only', 'POST'), 'tte POST boleh');
for (const [u, m] of [['https://api.arsip.go.id/nk-ttd/api/penandatangan-naskah/ttd-elektronik', 'POST'], ['https://api.arsip.go.id/naskah-keluar/api/penandatangan-naskah/list', 'POST'], ['https://evil.test/naskah-keluar/api/penandatangan-naskah/list', 'GET'], ['https://api.arsip.go.id/storage/geturlpreview?key=1', 'GET'], ['https://api.arsip.go.id/naskah-keluar/api/naskah-dinas/naskah-keluar/1/kirim', 'POST'], ['https://api.arsip.go.id/user/api/pengguna/user/profile', 'GET']])
  a.throws(() => C.validateApi(u, m), u), n++;
// settings
ok(C.sanitizeSettings({ perPutaran: 50 }).perPutaran === 10 && C.sanitizeSettings({ perPutaran: 4 }).perPutaran === 4, 'putaran maks 10');
// NIK
ok(C.isValidNik('1234567890123456') && !C.isValidNik('123') && C.maskNik('1234567890123456') === '1234********3456', 'NIK');
// analyze
const ctx = { myId: 5, today: T, refJabatan: 'Kepala Pusat' };
let x = C.analyze(row(1), ctx); ok(x.tahap === 'siap' && x.langkah.join() === 'setuju,nomor,tte' && x.level === 'ok', 'naskah baru: setuju+nomor+tte');
x = C.analyze(row(2, { nomor: 'PP.01/XLI/1/2026', penandatangan_naskahs: [{ id: 702, user_id: 5, urutan: 1, status: 'SETUJU', is_signed: false, jabatan: 'Kepala Pusat' }] }), ctx);
ok(x.langkah.join() === 'tte', 'sudah setuju dan bernomor: tinggal tte');
x = C.analyze(row(3, { nomor: 'KH.06/XXXX/2025' }), ctx); ok(x.langkah.includes('nomor'), 'nomor XXXX dianggap kosong');
x = C.analyze(row(4, { penandatangan_naskahs: [{ id: 1, user_id: 9, nama: 'Pejabat A', urutan: 1, is_signed: false }, { id: 704, user_id: 5, urutan: 2, is_signed: false, jabatan: 'Kepala Pusat' }] }), ctx);
ok(x.tahap === 'menunggu' && /Pejabat A/.test(x.flags[0].teks), 'belum giliran');
x = C.analyze(row(5, { nomor: 'PP/1/2026', penandatangan_naskahs: [{ id: 1, user_id: 9, urutan: 1, is_signed: true }, { id: 705, user_id: 5, urutan: 2, is_signed: false, jabatan: 'Kepala Pusat' }] }), ctx);
ok(x.tahap === 'siap' && x.langkah.join() === 'setuju,tte', 'penandatangan kedua tidak ambil nomor');
x = C.analyze(row(6, { tanggal: '2025-07-02', penandatangan_naskahs: [{ id: 706, user_id: 5, urutan: 1, jabatan: 'Kepala Sub Bag. Akademik' }] }), ctx);
ok(x.level === 'galat' && x.flags.some(f => f.kode === 'UMUR') && x.flags.some(f => f.kode === 'JABATAN'), 'kasus naskah 2025 jabatan lama');
x = C.analyze(row(7, { sifat_naskah_nama: 'RAHASIA' }), ctx); ok(x.level === 'galat', 'rahasia manual');
x = C.analyze(row(8, { sifat_naskah: { sifat_naskah: 'Biasa', otp_protected: true }, sifat_naskah_nama: 'Biasa' }), ctx); ok(x.otp && x.level === 'galat', 'otp lewat sifat');
x = C.analyze(row(9, { penandatangan_naskahs: [{ id: 709, user_id: 5, urutan: 1, is_signed: true }] }), ctx); ok(x.tahap === 'selesai', 'selesai');
x = C.analyze(row(10, { penandatangan_naskahs: [{ id: 710, user_id: 5, urutan: 1, status: 'TOLAK' }] }), ctx); ok(x.tahap === 'ditolak', 'ditolak');
x = C.analyze(row(11, { sender_user_id: null }), ctx); ok(x.flags.some(f => f.kode === 'DATA-NOMOR'), 'data nomor tidak lengkap');
// detect user
ok(C.detectMyUserId([row(1)], 'https://api.arsip.go.id/x?filters%5Buser_session_id%5D%5Bvalue%5D=77').id === 77, 'user dari alamat');
ok(C.detectMyUserId([row(1), row(2)], 'https://api.arsip.go.id/x').id === 5, 'user dari baris');
// partition FIFO + jenis + putaran
const rows = [];
for (let i = 1; i <= 14; i++) rows.push(row(100 + i, { created_at: '2026-11-' + String(i).padStart(2, '0') + 'T08:00:00', penandatangan_naskahs: [{ id: 800 + i, user_id: 5, urutan: 1, jabatan: 'Kepala Pusat', created_at: '2026-11-' + String(15 - i).padStart(2, '0') + 'T08:00:00' }], jenis_naskah_nama: i % 2 ? 'Surat Dinas' : 'Nota Dinas' }));
rows.push(row(200, { tanggal: '2025-01-01' }));
const items = rows.map(r => C.analyze(r, ctx));
let p = C.partition(items, {}); ok(p.lolos.length === 14 && p.perhatian.length === 1, 'galat dipisah');
ok(p.lolos[0].id === 114 && p.lolos[13].id === 101, 'urut dari paling lama masuk antrean');
ok(C.nextRound(p.lolos, 10).length === 10 && C.nextRound(p.lolos, 99).length === 10, 'putaran maks 10');
p = C.partition(items, { jenis: 'Nota Dinas' }); ok(p.lolos.every(i => i.jenis === 'Nota Dinas') && p.lolos.length === 7, 'filter jenis');
p = C.partition(items, { urut: 'tanggal' }); ok(p.lolos.length === 14, 'urut tanggal');
ok(C.jenisList(items).join() === 'Nota Dinas,Surat Dinas', 'daftar jenis');
// nomorUrl
const nu = new URL(C.nomorUrl(C.analyze(row(1), ctx), 'XLI.6'));
ok(nu.pathname === C.P.nomor && nu.searchParams.get('organisasi_id') === '5' && nu.searchParams.get('naskah_id') === '1' && nu.searchParams.get('singkatan_org') === 'XLI.6', 'parameter ambil nomor');
ok(C.validateApi(nu.toString(), 'GET'), 'nomor lolos daftar putih');
// CSV + log
const csv = C.toCsv([C.sanitizeLogRow({ waktu: 'w', nomor: '=1+1', hal: 'NIK 1234567890123456 x', pesan: 'a;b' })]);
ok(/'=1\+1/.test(csv) && !/1234567890123456/.test(csv) && /"a;b"/.test(csv), 'csv aman dan tanpa NIK');
console.log('CORE ANTRI RAMA: ' + n + ' pemeriksaan lulus');
