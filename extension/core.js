/* ANTRI RAMA v1.0.1
   Asisten Naskah Tandatangan Ringkas Instansi, Ramah Administrasi Mudah Akuntabel.
   Fungsi murni tanpa akses jaringan. Dipakai di halaman (agent.js), service worker, dan uji Node. */
(function (root) {
  'use strict';

  const VERSION = '1.0.1';
  const API_HOST = 'api.arsip.go.id';
  const S3_HOST = 's3.arsip.go.id';
  const BUCKET = 'srikandi-prod';
  const P = {
    list: '/naskah-keluar/api/penandatangan-naskah/list',
    show: /^\/naskah-keluar\/api\/naskah-dinas\/naskah-keluar\/\d{1,12}\/show$/,
    preview: '/storage/geturlpreview',
    setuju: '/naskah-keluar/api/penandatangan-naskah/update',
    nomor: '/nk-number/api/penomoran-otomatis/get-nomor-final-update',
    tte: '/nk-ttd/api/penandatangan-naskah/ttd-elektronik-only'
  };
  const MAX_PUTARAN = 10;

  const DEFAULT_SETTINGS = { perPutaran: 10, jedaDetik: 1, theme: 'auto', urut: 'masuk' };
  function sanitizeSettings(s) {
    const o = Object.assign({}, DEFAULT_SETTINGS);
    s = s || {};
    const n = Number(s.perPutaran); if (Number.isInteger(n) && n >= 1 && n <= MAX_PUTARAN) o.perPutaran = n;
    const j = Number(s.jedaDetik); if ([1, 2, 3].includes(j)) o.jedaDetik = j;
    if (['auto', 'light', 'dark'].includes(s.theme)) o.theme = s.theme;
    if (['masuk', 'tanggal'].includes(s.urut)) o.urut = s.urut;
    return o;
  }

  /* Daftar putih permintaan. Hanya alamat dan metode ini yang boleh membawa sesi SRIKANDI. */
  function validateApi(url, method) {
    const m = String(method || 'GET').toUpperCase();
    let u;
    try { u = new URL(url); } catch (e) { throw new Error('Alamat API tidak valid'); }
    if (u.protocol !== 'https:' || u.host !== API_HOST || u.username || u.password || u.port) throw new Error('Alamat di luar https://' + API_HOST + ' ditolak');
    if ([...u.searchParams.keys()].some(k => /token|authorization|password|passphrase|key|nik/i.test(k))) throw new Error('Parameter rahasia di alamat API ditolak');
    const p = u.pathname;
    const ok = (m === 'GET' && (p === P.list || P.show.test(p) || p === P.preview || p === P.nomor)) ||
      (m === 'POST' && (p === P.setuju || p === P.tte));
    if (!ok) throw new Error('Permintaan ' + m + ' ' + p + ' tidak diizinkan');
    return u.toString();
  }

  function sanitizeTemplate(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.host !== API_HOST || u.pathname !== P.list) return null;
    if (u.searchParams.get('is_count') === 'true') return null;
    u.searchParams.delete('cursor');
    [...u.searchParams.keys()].forEach(k => { if (k === 'search' || /^filters\[(tanggal|nomor|hal|asal_naskah|status_tt|status_kirim)\]/.test(k)) u.searchParams.set(k, ''); });
    return u.toString();
  }

  function isSafePreviewUrl(url) {
    try { const u = new URL(url); return u.protocol === 'https:' && u.host === S3_HOST && !u.username && !u.password; } catch (e) { return false; }
  }

  function isValidNik(n) { return /^\d{16}$/.test(String(n || '')); }
  function maskNik(n) { const s = String(n || ''); return s.length === 16 ? s.slice(0, 4) + '********' + s.slice(12) : ''; }

  const str = v => (v == null ? '' : String(v)).trim();
  const norm = v => str(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const isTrue = v => v === true || v === 1 || v === '1' || v === 'true';
  const statusOf = e => str(e && e.status).toUpperCase();
  function dateOnly(v) { const m = str(v).match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : null; }
  function daysBetween(a, b) {
    const ta = Date.parse(a + 'T00:00:00Z'), tb = Date.parse(b + 'T00:00:00Z');
    return isNaN(ta) || isNaN(tb) ? null : Math.round((tb - ta) / 86400000);
  }
  function nomorKosong(n) { const s = str(n); return !s || /X{3,}|x{3,}|\.\.\.|-{3,}|^\$\{/.test(s); }

  /* "Saya" = user_session_id di alamat daftar, atau user_id yang ada di semua baris. */
  function detectMyUserId(rows, templateUrl) {
    try {
      const u = new URL(templateUrl);
      for (const k of ['filters[user_session_id][value]', 'filters[user_session_id]', 'user_session_id', 'user_id']) {
        const v = u.searchParams.get(k);
        if (v && /^\d+$/.test(v)) return { id: Number(v), basis: 'alamat daftar' };
      }
    } catch (e) { /* lanjut */ }
    const list = (rows || []).filter(r => Array.isArray(r.penandatangan_naskahs) && r.penandatangan_naskahs.length);
    if (!list.length) return { id: null, basis: 'tidak ada data' };
    let common = null;
    for (const r of list) {
      const ids = new Set(r.penandatangan_naskahs.map(e => Number(e.user_id)).filter(n => !isNaN(n)));
      common = common ? new Set([...common].filter(x => ids.has(x))) : ids;
    }
    if (common && common.size === 1) return { id: [...common][0], basis: 'penandatangan di semua naskah' };
    return { id: null, basis: common && common.size > 1 ? 'lebih dari satu kandidat' : 'tidak ada kandidat' };
  }

  function signers(row) {
    return (Array.isArray(row.penandatangan_naskahs) ? row.penandatangan_naskahs : []).filter(e => !isTrue(e.is_canceled))
      .slice().sort((a, b) => Number(a.urutan || 0) - Number(b.urutan || 0));
  }
  function myEntry(row, myId) {
    if (myId == null) return null;
    const mine = signers(row).filter(e => Number(e.user_id) === Number(myId));
    return mine.find(e => !isTrue(e.is_signed)) || mine[0] || null;
  }

  function referenceJabatan(rows, myId) {
    let best = null;
    for (const r of rows || []) {
      const e = myEntry(r, myId);
      if (!e || !str(e.jabatan)) continue;
      const t = str(r.created_at || r.tanggal);
      if (!best || t > best.t) best = { t, jabatan: str(e.jabatan) };
    }
    return best ? best.jabatan : '';
  }

  /* Waktu masuk antrean: entri penandatangan saya dibuat; cadangan: naskah dibuat, lalu tanggal naskah. */
  function queueTime(row, me) { return str((me && me.created_at) || row.created_at || row.tanggal); }

  /* Penyaringan satu naskah: tahap, langkah yang masih dibutuhkan, dan peringatan. Tidak ada keputusan otomatis. */
  function analyze(row, ctx) {
    ctx = ctx || {};
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const me = myEntry(row, ctx.myId);
    const list = signers(row);
    const flags = [];
    const add = (level, kode, teks) => flags.push({ level, kode, teks });

    const sudahSetuju = !!(me && statusOf(me) === 'SETUJU');
    const pertama = !!(me && list.length && Number(list[0].user_id) === Number(ctx.myId) && Number(list[0].urutan) === Number(me.urutan));
    const perluNomor = !!(me && pertama && nomorKosong(row.nomor));

    let tahap;
    if (!me) tahap = 'tidak-dikenali';
    else if (isTrue(me.is_signed)) tahap = 'selesai';
    else if (statusOf(me) === 'TOLAK') tahap = 'ditolak';
    else {
      const before = list.filter(e => Number(e.urutan || 0) < Number(me.urutan || 0) && !isTrue(e.is_signed));
      if (before.length) { tahap = 'menunggu'; add('info', 'GILIRAN', 'Menunggu penandatangan sebelumnya: ' + before.map(e => str(e.nama || e.user_nama) || 'tanpa nama').join(', ')); }
      else tahap = 'siap';
    }

    if (me && !pertama && nomorKosong(row.nomor) && tahap === 'siap') add('galat', 'NOMOR', 'Nomor belum terisi, padahal Anda bukan penandatangan pertama');

    const tgl = dateOnly(row.tanggal);
    const umur = tgl ? daysBetween(tgl, today) : null;
    if (umur != null && umur > 180) add('galat', 'UMUR', 'Tanggal naskah ' + tgl + ', sudah ' + umur + ' hari. Pastikan masih berlaku');
    else if (umur != null && umur > 30) add('peringatan', 'UMUR', 'Tanggal naskah ' + tgl + ', sudah ' + umur + ' hari');

    const ref = str(ctx.refJabatan);
    if (me && ref && str(me.jabatan) && norm(me.jabatan) !== norm(ref)) add('galat', 'JABATAN', 'Jabatan penandatangan di naskah ini "' + str(me.jabatan) + '" berbeda dengan jabatan Anda pada naskah terbaru "' + ref + '"');

    const sifatObj = row.sifat_naskah && typeof row.sifat_naskah === 'object' ? row.sifat_naskah : null;
    const sifat = str(row.sifat_naskah_nama || (sifatObj && sifatObj.sifat_naskah));
    const otp = isTrue(row.effective_otp_protected) || !!(sifatObj && isTrue(sifatObj.otp_protected));
    if (otp) add('galat', 'OTP', 'Naskah dilindungi OTP. Proses manual di SRIKANDI');
    if (/rahasia/i.test(sifat)) add('galat', 'SIFAT', 'Sifat ' + sifat + ': proses manual di SRIKANDI');
    else if (/terbatas/i.test(sifat)) add('peringatan', 'SIFAT', 'Sifat ' + sifat);

    const urg = str(row.urgensi_naskah_nama);
    if (/segera/i.test(urg)) add('info', 'URGENSI', 'Urgensi ' + urg);
    if (isTrue(row.is_draft)) add('peringatan', 'DRAF', 'Naskah masih berstatus draf');
    if (!str(row.file) || !str(row.file_path)) add('peringatan', 'BERKAS', 'Berkas PDF tidak tercantum di data daftar');
    if (perluNomor && !(row.sender_user_id && row.jenis_naskah_id && row.klasifikasi_id)) add('galat', 'DATA-NOMOR', 'Data untuk Ambil Nomor tidak lengkap. Proses manual di SRIKANDI');

    const rank = { galat: 3, peringatan: 2, info: 1 };
    const worst = flags.reduce((m, f) => Math.max(m, rank[f.level] || 0), 0);
    const langkah = tahap === 'siap' ? [sudahSetuju ? null : 'setuju', perluNomor ? 'nomor' : null, 'tte'].filter(Boolean) : [];
    return {
      id: Number(row.id), tahap, langkah, flags, worst,
      level: worst === 3 ? 'galat' : worst === 2 ? 'peringatan' : worst === 1 ? 'info' : 'ok',
      otp, urgent: /segera/i.test(urg),
      nomor: str(row.nomor), hal: str(row.hal), tanggal: tgl, umur, masuk: queueTime(row, me),
      sifat, urgensi: urg, jenis: str(row.jenis_naskah_nama), klasifikasi: str(row.klasifikasi_nama),
      konseptor: str(row.user_created_nama),
      entryId: me ? Number(me.id) : null, userId: me ? Number(me.user_id) : null,
      urutan: me ? Number(me.urutan || 0) : null, jumlahPenandatangan: list.length,
      nomorParams: perluNomor ? { sender_user_id: row.sender_user_id, jenis_naskah_id: row.jenis_naskah_id, sifat_naskah_id: row.sifat_naskah_id, klasifikasi_id: row.klasifikasi_id } : null,
      file: str(row.file), filePath: str(row.file_path)
    };
  }

  /* Pembagian antrean: lolos (masuk putaran), perlu perhatian (galat, proses manual), menunggu giliran, lainnya. */
  function partition(items, opts) {
    opts = opts || {};
    const key = opts.urut === 'tanggal' ? (i => String(i.tanggal || '9999')) : (i => String(i.masuk || i.tanggal || '9999'));
    const fifo = (a, b) => key(a).localeCompare(key(b)) || (a.id - b.id);
    const cocok = i => !opts.jenis || i.jenis === opts.jenis;
    const siap = items.filter(i => i.tahap === 'siap' && cocok(i)).sort(fifo);
    return {
      lolos: siap.filter(i => i.level !== 'galat'),
      perhatian: siap.filter(i => i.level === 'galat'),
      menunggu: items.filter(i => i.tahap === 'menunggu' && cocok(i)).sort(fifo),
      lain: items.filter(i => ['ditolak', 'tidak-dikenali'].includes(i.tahap))
    };
  }

  function nextRound(lolos, n) { return lolos.slice(0, Math.max(1, Math.min(MAX_PUTARAN, Number(n) || MAX_PUTARAN))); }
  function jenisList(items) { return [...new Set(items.filter(i => i.tahap === 'siap' && i.jenis).map(i => i.jenis))].sort(); }

  function summarize(items) {
    const s = { siap: 0, lolos: 0, perhatian: 0, menunggu: 0, ditolak: 0, 'tidak-dikenali': 0, selesai: 0 };
    items.forEach(i => {
      s[i.tahap] = (s[i.tahap] || 0) + 1;
      if (i.tahap === 'siap') { if (i.level === 'galat') s.perhatian++; else s.lolos++; }
    });
    return s;
  }

  /* Permintaan Ambil Nomor, sama dengan yang dikirim SRIKANDI (organisasi_id diisi sender_user_id seperti aslinya). */
  function nomorUrl(item, singkatan) {
    const u = new URL('https://' + API_HOST + P.nomor);
    const p = item.nomorParams || {};
    u.searchParams.set('singkatan_org', str(singkatan));
    u.searchParams.set('sender_user_id', str(p.sender_user_id));
    u.searchParams.set('organisasi_id', str(p.sender_user_id));
    u.searchParams.set('jenis_naskah_id', str(p.jenis_naskah_id));
    u.searchParams.set('sifat_naskah_id', str(p.sifat_naskah_id));
    u.searchParams.set('klasifikasi_id', str(p.klasifikasi_id));
    u.searchParams.set('naskah_id', str(item.id));
    return u.toString();
  }

  /* Mesin putaran: semua Setuju, lalu semua Ambil Nomor, lalu semua TTE. Berhenti total pada kegagalan pertama.
     deps: { setuju(item), showSingkatan(item), nomor(item, singkatan), tte(item, nik, key), sleep(ms), stopped(), onStep(rec) }
     Setiap fungsi tindakan mengembalikan { ok: true, nilai? } atau { ok: false, pesan }. */
  async function runRound(items, secret, deps, opts) {
    opts = opts || {};
    const jeda = (opts.jedaDetik || 1) * 1000;
    const report = items.map(i => ({
      id: i.id, nomor: i.nomor, hal: i.hal,
      setuju: i.langkah.includes('setuju') ? 'menunggu' : 'sudah',
      nomorStatus: i.langkah.includes('nomor') ? 'menunggu' : 'tidak perlu',
      tte: 'menunggu', pesan: ''
    }));
    const rep = id => report.find(r => r.id === id);
    let stopAt = null;
    if (!secret || !isValidNik(secret.nik) || !str(secret.key)) {
      report.forEach(r => { r.tte = 'tidak dijalankan'; if (r.setuju === 'menunggu') r.setuju = 'tidak dijalankan'; if (r.nomorStatus === 'menunggu') r.nomorStatus = 'tidak dijalankan'; });
      return { ok: false, report, stopAt: { fase: 'awal', id: null, pesan: 'NIK (16 angka) dan Key Phrase wajib diisi' } };
    }
    const step = async (fase, item, fn) => {
      if (stopAt) return null;
      if (deps.stopped && deps.stopped()) { stopAt = { fase, id: null, pesan: 'Dihentikan oleh pengguna' }; return null; }
      let res;
      try { res = await fn(); } catch (e) { res = { ok: false, pesan: String(e && e.message || e) }; }
      if (!res || res.ok !== true) {
        stopAt = { fase, id: item.id, pesan: (res && res.pesan) || 'Ditolak SRIKANDI' };
        if (deps.onStep) deps.onStep({ fase, id: item.id, ok: false, pesan: stopAt.pesan });
        return null;
      }
      if (deps.onStep) deps.onStep({ fase, id: item.id, ok: true, nilai: res.nilai || '' });
      await deps.sleep(jeda);
      return res;
    };
    const mark = (fase, field, list, cb) => list.forEach(it => { if (rep(it.id)[field] === 'menunggu') rep(it.id)[field] = 'tidak dijalankan'; });

    for (const it of items.filter(i => i.langkah.includes('setuju'))) {
      const r = await step('setuju', it, () => deps.setuju(it));
      if (r) rep(it.id).setuju = 'berhasil';
      else { if (stopAt && stopAt.id === it.id) rep(it.id).setuju = 'gagal'; break; }
    }
    mark('setuju', 'setuju', items);
    for (const it of items.filter(i => i.langkah.includes('nomor'))) {
      const r = await step('nomor', it, async () => {
        const singkatan = await deps.showSingkatan(it);
        if (!str(singkatan)) return { ok: false, pesan: 'Kode unit konseptor tidak ditemukan di detail naskah' };
        return deps.nomor(it, singkatan);
      });
      if (r) { rep(it.id).nomorStatus = 'berhasil'; if (r.nilai) rep(it.id).nomor = r.nilai; }
      else { if (stopAt && stopAt.id === it.id) rep(it.id).nomorStatus = 'gagal'; break; }
    }
    mark('nomor', 'nomorStatus', items);
    for (const it of items) {
      const r = await step('tte', it, () => deps.tte(it, secret.nik, secret.key));
      if (r) rep(it.id).tte = 'berhasil';
      else { if (stopAt && stopAt.id === it.id) rep(it.id).tte = 'gagal'; break; }
    }
    mark('tte', 'tte', items);
    if (stopAt && stopAt.id != null) rep(stopAt.id).pesan = stopAt.pesan;
    return { ok: !stopAt, report, stopAt };
  }

  /* Log tanpa NIK dan Key Phrase. */
  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  const LOG_FIELDS = ['waktu', 'putaran', 'nomor', 'hal', 'setuju', 'nomorStatus', 'tte', 'pesan'];
  function toCsv(rows) {
    const head = ['Waktu', 'Putaran', 'Nomor', 'Hal', 'Setuju', 'Ambil Nomor', 'TTE', 'Pesan'];
    const lines = [head.join(';')].concat((rows || []).map(r => LOG_FIELDS.map(f => csvCell(r[f])).join(';')));
    return '﻿' + lines.join('\r\n') + '\r\n';
  }
  function sanitizeLogRow(r) {
    const o = {};
    LOG_FIELDS.forEach(f => { o[f] = str(r && r[f]).slice(0, f === 'hal' || f === 'pesan' ? 300 : 80); });
    // Pertahanan berlapis: angka 16 digit (NIK) tidak boleh masuk log.
    Object.keys(o).forEach(k => { o[k] = o[k].replace(/\b\d{16}\b/g, '[disensor]'); });
    return o;
  }

  const api = {
    VERSION, API_HOST, S3_HOST, BUCKET, P, MAX_PUTARAN, DEFAULT_SETTINGS, LOG_FIELDS,
    sanitizeSettings, validateApi, sanitizeTemplate, isSafePreviewUrl,
    isValidNik, maskNik, nomorKosong, detectMyUserId, myEntry, referenceJabatan, analyze,
    partition, nextRound, jenisList, summarize, nomorUrl, runRound, toCsv, sanitizeLogRow, daysBetween
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ANTRI_CORE = api;
})(typeof self !== 'undefined' ? self : globalThis);
