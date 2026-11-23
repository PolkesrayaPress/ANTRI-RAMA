// Uji mesin putaran ANTRI RAMA dengan SRIKANDI tiruan (fungsi tindakan palsu).
const a = require('assert'); const C = require('../extension/core.js');
let n = 0; const ok = (c, m) => { a.ok(c, m); n++; };
const ctx = { myId: 5, today: '2026-11-23' };
const row = (id, o) => Object.assign({ id, nomor: '', hal: 'Hal ' + id, tanggal: '2026-11-20', sender_user_id: 5, jenis_naskah_id: 2, sifat_naskah_id: 1, klasifikasi_id: 9, file: 'a', file_path: 'b', penandatangan_naskahs: [{ id: 700 + id, user_id: 5, urutan: 1, status: null, is_signed: false }] }, o || {});
const NIK = '1234567890123456', KEY = 'rahasia-uji';
function fake(opt) {
  opt = opt || {};
  const log = [];
  return { log, deps: {
    setuju: async it => { log.push('setuju:' + it.id); return opt.failSetuju === it.id ? { ok: false, pesan: 'Gagal setuju' } : { ok: true }; },
    showSingkatan: async it => { log.push('show:' + it.id); return opt.noSingkatan ? '' : 'XLI.6'; },
    nomor: async (it, s) => { log.push('nomor:' + it.id); if (opt.nomor404 === it.id) return { ok: false, pesan: 'Pastikan Tata Usaha / Sekretaris telah membuat format nomor' }; return { ok: true, nilai: 'PP.01/' + s + '/' + it.id + '/2026' }; },
    tte: async (it, nik, key) => { log.push('tte:' + it.id); a.strictEqual(nik, NIK); a.strictEqual(key, KEY); if (opt.badKeyAt === it.id) return { ok: false, pesan: 'Passphrase salah' }; if (opt.throwAt === it.id) throw new Error('upstream server is timing out'); return { ok: true }; },
    sleep: async () => {}, stopped: () => !!opt.stop && log.length >= opt.stop, onStep: () => {}
  } };
}
(async () => {
  const items = [1, 2, 3].map(i => C.analyze(row(i), ctx));
  let f = fake(); let r = await C.runRound(items, { nik: NIK, key: KEY }, f.deps);
  ok(r.ok && f.log.join() === 'setuju:1,setuju:2,setuju:3,show:1,nomor:1,show:2,nomor:2,show:3,nomor:3,tte:1,tte:2,tte:3', 'urutan tiga fase');
  ok(r.report.every(x => x.setuju === 'berhasil' && x.nomorStatus === 'berhasil' && x.tte === 'berhasil') && r.report[0].nomor === 'PP.01/XLI.6/1/2026', 'laporan lengkap dengan nomor baru');

  f = fake({ badKeyAt: 1 }); r = await C.runRound(items, { nik: NIK, key: KEY }, f.deps);
  ok(!r.ok && r.stopAt.fase === 'tte' && f.log.filter(x => x.startsWith('tte')).length === 1, 'Key Phrase salah: berhenti di TTE pertama, tidak mengulang');
  ok(r.report[0].tte === 'gagal' && r.report[1].tte === 'tidak dijalankan' && r.report[0].pesan === 'Passphrase salah', 'laporan TTE gagal');

  f = fake({ failSetuju: 2 }); r = await C.runRound(items, { nik: NIK, key: KEY }, f.deps);
  ok(!r.ok && !f.log.some(x => /^(nomor|tte)/.test(x)), 'Setuju gagal: tidak ada nomor dan TTE');
  ok(r.report[0].setuju === 'berhasil' && r.report[1].setuju === 'gagal' && r.report[2].setuju === 'tidak dijalankan', 'status setuju per naskah');

  f = fake({ nomor404: 2 }); r = await C.runRound(items, { nik: NIK, key: KEY }, f.deps);
  ok(!r.ok && f.log.filter(x => x.startsWith('nomor')).length === 2 && !f.log.some(x => x.startsWith('tte')), 'nomor gagal: berhenti sebelum TTE apa pun');
  ok(/format nomor/.test(r.report[1].pesan) && r.report[2].nomorStatus === 'tidak dijalankan', 'pesan nomor 404');

  f = fake({ noSingkatan: true }); r = await C.runRound(items, { nik: NIK, key: KEY }, f.deps);
  ok(!r.ok && r.stopAt.fase === 'nomor' && !f.log.some(x => x.startsWith('nomor:')), 'tanpa kode unit: nomor tidak diminta');

  f = fake({ throwAt: 2 }); r = await C.runRound(items, { nik: NIK, key: KEY }, f.deps);
  ok(!r.ok && /timing out/.test(r.stopAt.pesan) && r.report[0].tte === 'berhasil' && r.report[2].tte === 'tidak dijalankan', 'galat jaringan BSrE ditangkap');

  f = fake({ stop: 2 }); r = await C.runRound(items, { nik: NIK, key: KEY }, f.deps);
  ok(!r.ok && r.stopAt.pesan === 'Dihentikan oleh pengguna' && f.log.length === 2, 'tombol berhenti');

  f = fake(); r = await C.runRound(items, { nik: '123', key: KEY }, f.deps);
  ok(!r.ok && f.log.length === 0, 'NIK tidak valid: tidak ada permintaan');
  f = fake(); r = await C.runRound(items, { nik: NIK, key: '' }, f.deps);
  ok(!r.ok && f.log.length === 0, 'Key Phrase kosong: tidak ada permintaan');

  // lanjut setelah gagal: naskah yang sudah setuju & bernomor hanya butuh TTE
  const lanjut = [C.analyze(row(1, { nomor: 'PP/1', penandatangan_naskahs: [{ id: 701, user_id: 5, urutan: 1, status: 'SETUJU' }] }), ctx), C.analyze(row(2), ctx)];
  f = fake(); r = await C.runRound(lanjut, { nik: NIK, key: KEY }, f.deps);
  ok(f.log.join() === 'setuju:2,show:2,nomor:2,tte:1,tte:2' && r.report[0].setuju === 'sudah', 'lanjut tanpa mengulang langkah yang sudah');
  console.log('MESIN PUTARAN: ' + n + ' pemeriksaan lulus');
})().catch(e => { console.log('GAGAL', e.message); process.exit(1); });
