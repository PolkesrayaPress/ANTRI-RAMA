/* ANTRI RAMA v1.0.1 - panel dan mesin putaran.
   Berjalan di ruang terisolasi ekstensi (bukan konteks halaman SRIKANDI). Key Phrase hanya ada di variabel
   lokal selama satu putaran berjalan, tidak pernah dikirim ke service worker, disimpan, atau dicatat. */
(function () {
  'use strict';
  if (window.__antriRama) return;
  window.__antriRama = true;
  const C = window.ANTRI_CORE;
  const API = 'https://' + C.API_HOST;

  /* ---------- Saluran ke service worker ---------- */
  function sw(type, payload) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, r => {
          const e = chrome.runtime.lastError;
          if (e) reject(new Error(e.message)); else if (!r || !r.ok) reject(new Error((r && r.error) || 'Ekstensi tidak merespons')); else resolve(r.data);
        });
      } catch (e) { reject(new Error('Ekstensi dimuat ulang. Tekan F5 di halaman ini.')); }
    });
  }

  /* ---------- Keadaan ---------- */
  let settings = Object.assign({}, C.DEFAULT_SETTINGS);
  let items = [], parts = null, myId = null, refJab = '', loading = false, running = false, stopFlag = false;
  let filterJenis = '', tab = 'putaran', previewId = null;
  const dibaca = new Set();     // naskah yang pratinjaunya sudah dibuka
  const dicentang = new Set();  // naskah yang disetujui pengguna untuk putaran ini
  let putaranKe = 0, stepLog = [], lastReport = null, runItems = [];

  /* ---------- Panggilan API (dari ruang terisolasi; Origin tetap SRIKANDI) ---------- */
  async function api(url, opt) {
    opt = opt || {};
    const method = (opt.method || 'GET').toUpperCase();
    url = C.validateApi(url, method);
    const s = await sw('session');
    if (s.conflict) throw new Error('Sesi berubah di halaman ini. Muat ulang SRIKANDI (F5) sebelum melanjutkan.');
    if (!s.token) throw new Error('Sesi SRIKANDI belum terbaca. Muat ulang halaman Tandatangan Naskah (F5).');
    let r;
    try {
      r = await fetch(url, { method, headers: { Accept: 'application/json', Authorization: s.token }, body: opt.form || undefined, credentials: 'omit', redirect: 'error', cache: 'no-store' });
    } catch (e) { throw new Error('Jaringan gagal: ' + e.message); }
    let j = null;
    try { j = await r.json(); } catch (e) { /* bukan json */ }
    if (r.status === 401 || r.status === 403) throw new Error('Sesi habis atau ditolak (' + r.status + '). Muat ulang SRIKANDI dan login bila perlu.');
    return { status: r.status, json: j };
  }
  function pesanDari(res, cadangan) {
    const j = res && res.json;
    let m = j && (j.message || (typeof j.result === 'string' ? j.result : ''));
    if (!m && j && j.result && typeof j.result === 'object' && !Array.isArray(j.result)) m = Object.values(j.result).flat().join(', ');
    return (m ? String(m).slice(0, 200) : cadangan || 'Ditolak SRIKANDI') + (res && res.status && res.status !== 200 ? ' (' + res.status + ')' : '');
  }

  async function loadQueue() {
    if (loading || running) return;
    loading = true; notice = null; render();
    try {
      const s = await sw('session');
      if (s.conflict) throw new Error('Sesi berubah di halaman ini. Muat ulang SRIKANDI (F5).');
      if (!s.template) throw new Error('Buka menu Naskah Keluar, Tandatangan Naskah, lalu klik Muat ulang antrean.');
      const rows = [];
      let cursor = null, guard = 0;
      do {
        const u = new URL(s.template);
        u.searchParams.set('rows', '50');
        if (cursor) u.searchParams.set('cursor', cursor);
        const res = await api(u.toString());
        const r = res.json && res.json.result;
        rows.push(...(Array.isArray(r) ? r : (r && r.data) || []));
        cursor = r && !Array.isArray(r) ? r.next_cursor || null : null;
        if (++guard >= 40 && cursor) { notice = { text: 'Daftar sangat panjang: hanya 2.000 naskah teratas yang dibaca.' }; break; }
      } while (cursor);
      const det = C.detectMyUserId(rows, s.template);
      if (det.id == null && rows.length) throw new Error('Posisi Anda sebagai penandatangan tidak dapat dipastikan (' + det.basis + ').');
      myId = det.id;
      refJab = C.referenceJabatan(rows, myId);
      items = rows.map(r => C.analyze(r, { myId, refJabatan: refJab }));
      [...dicentang].forEach(id => { if (!items.some(i => i.id === id && i.tahap === 'siap')) dicentang.delete(id); });
      regroup();
    } catch (e) { notice = { text: e.message, err: true }; }
    loading = false; render();
  }
  function regroup() { parts = C.partition(items, { jenis: filterJenis, urut: settings.urut }); }
  function putaran() { return parts ? C.nextRound(parts.lolos, settings.perPutaran) : []; }

  async function previewUrl(it) {
    const u = new URL(API + C.P.preview);
    u.searchParams.set('filename', it.file); u.searchParams.set('folder', it.filePath); u.searchParams.set('bucket', C.BUCKET);
    const res = await api(u.toString());
    const j = res.json;
    const url = j && (j.url || (j.result && (j.result.url || (typeof j.result === 'string' ? j.result : ''))));
    if (!url || !C.isSafePreviewUrl(url)) throw new Error('Pratinjau tidak tersedia untuk naskah ini.');
    return url;
  }

  /* ---------- Tindakan tulis (hanya dipanggil oleh mesin putaran) ---------- */
  const deps = {
    setuju: async it => {
      const f = new FormData();
      f.append('id', String(it.entryId)); f.append('naskah_keluar_id', String(it.id)); f.append('user_id', String(it.userId)); f.append('status', 'SETUJU');
      const res = await api(API + C.P.setuju, { method: 'POST', form: f });
      return res.json && res.json.success === true ? { ok: true } : { ok: false, pesan: 'Setuju ditolak: ' + pesanDari(res) };
    },
    showSingkatan: async it => {
      const res = await api(API + '/naskah-keluar/api/naskah-dinas/naskah-keluar/' + encodeURIComponent(it.id) + '/show');
      const r = res.json && res.json.result;
      return r && r.detail_user_created ? r.detail_user_created.singkatan_unit_kerja : '';
    },
    nomor: async (it, singkatan) => {
      const res = await api(C.nomorUrl(it, singkatan));
      if (res.status === 404) return { ok: false, pesan: 'Format nomor belum dibuat. Minta Tata Usaha / Sekretaris membuatnya (404)' };
      const j = res.json;
      return j && j.success === true ? { ok: true, nilai: typeof j.result === 'string' ? j.result : '' } : { ok: false, pesan: 'Ambil Nomor gagal: ' + pesanDari(res) };
    },
    tte: async (it, nik, key) => {
      const f = new FormData();
      f.append('nik', nik); f.append('key', key); f.append('naskah_keluar_id', String(it.id));
      const res = await api(API + C.P.tte, { method: 'POST', form: f });
      return res.json && res.json.success === true ? { ok: true } : { ok: false, pesan: 'TTE gagal: ' + pesanDari(res) };
    },
    sleep: ms => new Promise(r => setTimeout(r, ms)),
    stopped: () => stopFlag,
    onStep: s => { stepLog.push(s); if (open) render(); }
  };

  async function jalankan(nik, key) {
    running = true; stopFlag = false; stepLog = []; lastReport = null; putaranKe++; previewId = null; notice = null;
    runItems = putaran().filter(i => dicentang.has(i.id));
    render();
    let hasil;
    try { hasil = await C.runRound(runItems, { nik, key }, deps, { jedaDetik: settings.jedaDetik }); }
    catch (e) { hasil = { ok: false, report: [], stopAt: { fase: 'mesin', id: null, pesan: e.message } }; }
    key = null; nik = null; // Key Phrase dan NIK dilepas dari memori putaran
    lastReport = hasil;
    const waktu = new Date().toLocaleString('id-ID');
    sw('logAppend', { rows: hasil.report.map(r => Object.assign({ waktu, putaran: String(putaranKe) }, r)) }).catch(() => {});
    running = false; dicentang.clear(); dibaca.clear();
    render();
    await loadQueue();
  }

  /* ---------- NIK dari Form TTE SRIKANDI (hanya nilai yang memang tampil di layar Anda) ---------- */
  let nikMasked = null;
  async function refreshNik() { try { const n = await sw('nik'); nikMasked = n ? C.maskNik(n) : null; } catch (e) { nikMasked = null; } }
  function scanNik() {
    if (nikMasked || !/\/tandatangan-naskah\/detail/.test(location.pathname)) return;
    const inp = [...document.querySelectorAll('input')].find(i => {
      if (!/^\d{16}$/.test(i.value)) return false;
      let n = i, txt = '';
      for (let k = 0; k < 3 && n; k++) { n = n.parentElement; txt = n ? n.textContent : ''; if (/kependudukan|\bNIK\b/i.test(txt)) return true; }
      return false;
    });
    if (inp) sw('setNik', { nik: inp.value }).then(refreshNik).then(render).catch(() => {});
  }
  setInterval(scanNik, 3000);

  /* ---------- Antarmuka (shadow DOM tertutup: skrip halaman tidak dapat membaca isinya) ---------- */
  const host = document.createElement('div');
  host.id = 'antri-rama-host';
  const root = host.attachShadow({ mode: 'closed' });
  (document.body || document.documentElement).appendChild(host);

  const style = document.createElement('style');
  style.textContent = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:"Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif}
  .wrap{--bg:#ffffff;--soft:#eef7f6;--line:#cfe5e2;--ink:#10302e;--muted:#4b6663;--teal:#047D78;--red:#B42318;--redbg:#FDECEA;--amb:#7a4f00;--ambbg:#FFF4CC}
  .wrap.dark{--bg:#0d1f1e;--soft:#14302e;--line:#24504c;--ink:#e6f4f2;--muted:#9fc3be;--teal:#00B9AD;--red:#ff9b92;--redbg:#3a1714;--amb:#ffd27a;--ambbg:#3a2e0a}
  .fab{position:fixed;right:18px;bottom:18px;z-index:2147483646;display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:10px 14px 10px 16px;background:#047D78;color:#fff;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 18px rgba(4,125,120,.35)}
  .fab .n{background:#FFD21F;color:#111;border-radius:999px;min-width:24px;padding:2px 7px;text-align:center;font-size:13px}
  button:focus-visible,select:focus-visible,input:focus-visible{outline:3px solid #FFD21F;outline-offset:2px}
  .panel{position:fixed;top:0;right:0;height:100vh;width:min(620px,100vw);z-index:2147483647;background:var(--bg);color:var(--ink);border-left:4px solid var(--teal);display:flex;flex-direction:column;box-shadow:-10px 0 30px rgba(0,0,0,.18);font-size:14px}
  header{padding:14px 16px 10px;border-bottom:1px solid var(--line);display:flex;align-items:flex-start;gap:8px}
  header .t{flex:1}
  header h1{margin:0;font-size:19px}
  header p{margin:2px 0 0;color:var(--muted);font-size:12.5px;line-height:1.35}
  .ib{border:1px solid var(--line);background:var(--soft);color:var(--ink);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px}
  .status{padding:8px 16px;display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--muted);border-bottom:1px solid var(--line)}
  .status b{color:var(--ink)}
  .tools{padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  select{border:1px solid var(--line);background:var(--bg);color:var(--ink);border-radius:8px;padding:7px 8px;font-size:13px}
  .tabs{display:flex;gap:4px;padding:4px 16px 0}
  .tabs button{flex:1;border:1px solid var(--line);border-bottom:0;border-radius:10px 10px 0 0;background:var(--soft);color:var(--ink);padding:8px 6px;cursor:pointer;font-weight:600;font-size:13px}
  .tabs button[aria-selected=true]{background:#FFD21F;color:#111;border-color:#FFD21F}
  .tabs .c{display:inline-block;margin-left:6px;background:rgba(0,0,0,.12);border-radius:999px;padding:0 7px}
  .body{flex:1;overflow:auto;padding:0 16px 12px;border-top:3px solid #FFD21F}
  .item{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-top:10px}
  .item.on{border-color:var(--teal);box-shadow:0 0 0 2px rgba(4,125,120,.2)}
  .item .top{display:flex;gap:10px;align-items:flex-start}
  .item .no{font-weight:800;color:var(--teal);min-width:24px;font-size:15px}
  .item .hal{font-weight:600;line-height:1.35}
  .item .meta{color:var(--muted);font-size:12.5px;margin-top:3px;line-height:1.4}
  .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}
  .chip{font-size:11.5px;border-radius:999px;padding:2px 9px;border:1px solid var(--line);background:var(--soft);color:var(--ink)}
  .chip.step{background:transparent}
  .chip.galat{background:var(--redbg);color:var(--red);border-color:transparent}
  .chip.peringatan{background:var(--ambbg);color:var(--amb);border-color:transparent}
  .acts{display:flex;gap:10px;align-items:center;margin-top:9px;flex-wrap:wrap}
  .btn{border:0;border-radius:9px;padding:8px 13px;font-weight:700;cursor:pointer;font-size:13px}
  .btn.ghost{background:var(--soft);color:var(--ink);border:1px solid var(--line)}
  .btn.go{background:#047D78;color:#fff}
  .btn:disabled{opacity:.5;cursor:not-allowed}
  .btn.stop{background:#B42318;color:#fff}
  label.ck{display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer;line-height:1.35}
  label.ck input{width:18px;height:18px;flex:none}
  label.ck.off{opacity:.6;cursor:not-allowed}
  .pv{margin-top:10px;border:1px solid var(--line);border-radius:10px;overflow:hidden;height:52vh;background:#f3f3f3}
  .pv iframe{width:100%;height:100%;border:0}
  .foot{border-top:1px solid var(--line);padding:12px 16px;display:flex;gap:10px;align-items:center;background:var(--soft)}
  .foot .sum{flex:1;font-size:13px;color:var(--muted)}
  .note{font-size:12.5px;color:var(--muted);margin:10px 0 0;line-height:1.45}
  .msg{margin:10px 0 0;padding:8px 10px;border-radius:8px;font-size:12.5px;background:var(--soft);line-height:1.45}
  .msg.err{background:var(--redbg);color:var(--red)}
  .empty{padding:28px 6px;color:var(--muted);text-align:center;line-height:1.5}
  .modal{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
  .dlg{background:var(--bg);color:var(--ink);border-radius:14px;width:min(560px,100%);max-height:92vh;overflow:auto;padding:18px;border-top:6px solid #FFD21F}
  .dlg h2{margin:0 0 6px;font-size:18px}
  .dlg ol{margin:8px 0 10px 20px;padding:0;font-size:13px;line-height:1.5}
  .warn{background:#FFD21F;color:#111;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.45;margin:10px 0}
  .fld{display:block;margin:10px 0}
  .fld span{display:block;font-size:12.5px;font-weight:700;margin-bottom:4px}
  .fld input{width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);font-size:14px}
  .row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
  table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}
  th,td{border-bottom:1px solid var(--line);padding:6px 4px;text-align:left;vertical-align:top}
  .s-berhasil{color:var(--teal);font-weight:700} .s-gagal{color:var(--red);font-weight:700}
  .credit{font-size:11.5px;color:var(--muted);padding:8px 16px 12px;line-height:1.45;white-space:pre-line}
  `;
  root.appendChild(style);
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  root.appendChild(wrap);

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'checked' || k === 'disabled' || k === 'selected') e[k] = !!v;
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(3).forEach(k => { if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k))); });
    return e;
  }

  let open = false, notice = null, modal = null;

  function applyTheme() {
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    wrap.classList.toggle('dark', !!dark);
  }

  function itemCard(it, idx, mode) {
    const on = dicentang.has(it.id), sudahBaca = dibaca.has(it.id);
    const langkah = it.langkah.map(l => el('span', { class: 'chip step' }, l === 'setuju' ? 'Setuju' : l === 'nomor' ? 'Ambil Nomor' : 'TTE'));
    const flags = it.flags.map(f => el('span', { class: 'chip ' + f.level }, f.teks));
    const card = el('div', { class: 'item' + (on ? ' on' : '') },
      el('div', { class: 'top' },
        el('div', { class: 'no' }, String(idx + 1)),
        el('div', {},
          el('div', { class: 'hal' }, it.hal || '(tanpa hal)'),
          el('div', { class: 'meta' }, [it.jenis, it.nomor || 'belum bernomor', 'tanggal ' + (it.tanggal || '-'), it.konseptor ? 'konseptor ' + it.konseptor : ''].filter(Boolean).join(' | ')),
          el('div', { class: 'chips' }, mode === 'putaran' ? langkah : null, flags))));
    const acts = el('div', { class: 'acts' });
    if (it.file && it.filePath) acts.append(el('button', { class: 'btn ghost', type: 'button', onclick: () => togglePreview(it) }, previewId === it.id ? 'Tutup pratinjau' : 'Pratinjau PDF'));
    if (mode === 'putaran') {
      const cb = el('input', { type: 'checkbox', checked: on, disabled: !sudahBaca || running, 'data-id': String(it.id), onchange: e => { if (e.target.checked) dicentang.add(it.id); else dicentang.delete(it.id); render(); } });
      acts.append(el('label', { class: 'ck' + (sudahBaca ? '' : ' off') }, cb, sudahBaca ? 'Sudah saya baca dan setujui' : 'Buka pratinjau untuk dapat mencentang'));
    }
    card.append(acts);
    if (previewId === it.id) card.append(el('div', { class: 'pv', id: 'pv' }, el('div', { class: 'empty' }, 'Memuat pratinjau...')));
    return card;
  }

  async function togglePreview(it) {
    if (previewId === it.id) { previewId = null; render(); return; }
    previewId = it.id; render();
    try {
      const url = await previewUrl(it);
      if (previewId !== it.id) return;
      dibaca.add(it.id);
      render();
      const box = root.querySelector('#pv');
      if (box) { box.textContent = ''; box.append(el('iframe', { src: url, title: 'Pratinjau ' + (it.hal || 'naskah'), referrerpolicy: 'no-referrer' })); }
    } catch (e) { notice = { text: e.message, err: true }; previewId = null; render(); }
  }

  function progressView() {
    const box = el('div', {});
    const rep = lastReport ? lastReport.report : null;
    const stat = (id, fase) => {
      if (rep) { const r = rep.find(x => x.id === id); return r ? (fase === 'setuju' ? r.setuju : fase === 'nomor' ? r.nomorStatus : r.tte) : ''; }
      const s = stepLog.filter(x => x.id === id && x.fase === fase).pop();
      return s ? (s.ok ? 'berhasil' : 'gagal') : '...';
    };
    const tbd = el('tbody');
    runItems.forEach((it, i) => {
      const r = rep && rep.find(x => x.id === it.id);
      tbd.append(el('tr', {}, el('td', {}, String(i + 1)), el('td', {}, (r && r.nomor) || it.nomor || '', el('br'), it.hal),
        ['setuju', 'nomor', 'tte'].map(f => { const s = stat(it.id, f); return el('td', { class: 's-' + s }, s); })));
    });
    box.append(el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'No'), el('th', {}, 'Naskah'), el('th', {}, 'Setuju'), el('th', {}, 'Nomor'), el('th', {}, 'TTE'))), tbd));
    if (lastReport && lastReport.stopAt) box.append(el('div', { class: 'msg err', role: 'alert' }, 'Berhenti pada langkah ' + lastReport.stopAt.fase + ': ' + lastReport.stopAt.pesan + '. Naskah yang belum selesai tetap di antrean. Langkah yang sudah berhasil tidak diulang.'));
    if (lastReport && lastReport.ok) box.append(el('div', { class: 'msg', role: 'status' }, 'Semua naskah di putaran ini sudah disetujui, bernomor, dan ditandatangani. Bila nomor atau QR di PDF masih merah, gunakan Perbarui PDF di SRIKANDI. Pengiriman naskah tetap dilakukan di SRIKANDI.'));
    return box;
  }

  // Bila tombol JALA Arsip (#srk-fab) ada di pojok yang sama, tombol ANTRI RAMA naik ke atasnya.
  function placeFab() {
    const fab = wrap.querySelector('.fab');
    if (!fab) return;
    const jala = document.getElementById('srk-fab');
    let bottom = 18;
    if (jala && jala.isConnected) {
      const r = jala.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) bottom = Math.max(18, Math.round(window.innerHeight - r.top) + 10);
    }
    const v = bottom + 'px';
    if (fab.style.bottom !== v) fab.style.bottom = v;
  }
  setInterval(placeFab, 1500);
  window.addEventListener('resize', placeFab);

  function render() {
    applyTheme();
    wrap.textContent = '';
    const nLolos = parts ? parts.lolos.length : null;
    if (!open) {
      wrap.append(el('button', { class: 'fab', type: 'button', 'aria-label': 'Buka ANTRI RAMA', onclick: () => { open = true; render(); if (!parts) loadQueue(); } }, 'ANTRI RAMA', nLolos != null ? el('span', { class: 'n' }, String(nLolos)) : null));
      placeFab();
      return;
    }
    const dark = wrap.classList.contains('dark');
    const p = el('section', { class: 'panel', role: 'dialog', 'aria-label': 'ANTRI RAMA' });
    p.append(el('header', {},
      el('div', { class: 't' }, el('h1', {}, 'ANTRI RAMA v' + C.VERSION), el('p', {}, 'Asisten Naskah Tandatangan Ringkas Instansi. Ramah Administrasi, Mudah Akuntabel')),
      el('button', { class: 'ib', type: 'button', onclick: () => { settings.theme = dark ? 'light' : 'dark'; render(); sw('setSettings', { theme: settings.theme }).catch(() => {}); } }, dark ? 'Tema terang' : 'Tema gelap'),
      el('button', { class: 'ib', type: 'button', disabled: running, onclick: () => { open = false; previewId = null; render(); } }, 'Tutup')));
    p.append(el('div', { class: 'status' },
      el('span', {}, 'NIK: ', el('b', {}, nikMasked || 'belum terbaca')),
      el('span', {}, 'Per putaran: ', el('b', {}, String(settings.perPutaran))),
      el('span', {}, 'Urutan: ', el('b', {}, settings.urut === 'tanggal' ? 'tanggal naskah' : 'paling lama masuk antrean'))));
    p.append(el('div', { class: 'tools' },
      el('select', { 'aria-label': 'Filter jenis naskah', disabled: running, onchange: e => { filterJenis = e.target.value; dicentang.clear(); regroup(); render(); } },
        el('option', { value: '' }, 'Semua jenis naskah'), C.jenisList(items).map(j => el('option', { value: j, selected: j === filterJenis }, j))),
      el('button', { class: 'btn ghost', type: 'button', disabled: loading || running, onclick: loadQueue }, loading ? 'Memuat...' : 'Muat ulang antrean')));
    const counts = { putaran: putaran().length, perhatian: parts ? parts.perhatian.length : 0, menunggu: parts ? parts.menunggu.length : 0 };
    const tb = (k, label) => el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === k), disabled: running, onclick: () => { tab = k; previewId = null; render(); } }, label, el('span', { class: 'c' }, String(counts[k])));
    p.append(el('div', { class: 'tabs', role: 'tablist' }, tb('putaran', 'Putaran ini'), tb('perhatian', 'Perlu perhatian'), tb('menunggu', 'Menunggu giliran')));
    const body = el('div', { class: 'body' });
    if (notice) body.append(el('div', { class: 'msg' + (notice.err ? ' err' : ''), role: 'status' }, notice.text));
    if (running || lastReport) body.append(progressView());
    else if (!parts) body.append(el('div', { class: 'empty' }, loading ? 'Membaca daftar Tandatangan Naskah...' : 'Buka halaman Tandatangan Naskah, lalu klik Muat ulang antrean.'));
    else {
      const list = tab === 'putaran' ? putaran() : tab === 'perhatian' ? parts.perhatian : parts.menunggu;
      if (tab === 'putaran') body.append(el('p', { class: 'note' }, 'Diambil paling banyak ' + settings.perPutaran + ' naskah dari ' + parts.lolos.length + ' naskah yang lolos penyaringan, mulai dari yang paling lama. Buka pratinjau tiap naskah, lalu centang yang Anda setujui.'));
      if (tab === 'perhatian') body.append(el('p', { class: 'note' }, 'Naskah ini tidak ikut putaran otomatis. Periksa dan proses langsung di SRIKANDI.'));
      if (tab === 'menunggu') body.append(el('p', { class: 'note' }, 'Naskah ini belum giliran Anda karena penandatangan sebelumnya belum selesai.'));
      if (!list.length) body.append(el('div', { class: 'empty' }, tab === 'putaran' ? 'Tidak ada naskah yang siap ditandatangani.' : 'Kosong.'));
      list.forEach((it, i) => body.append(itemCard(it, i, tab)));
    }
    p.append(body);
    const pilih = putaran().filter(i => dicentang.has(i.id)).length;
    const foot = el('div', { class: 'foot' });
    if (running) foot.append(el('div', { class: 'sum' }, 'Putaran berjalan. Jangan tutup atau muat ulang tab ini.'), el('button', { class: 'btn stop', type: 'button', onclick: () => { stopFlag = true; notice = { text: 'Berhenti setelah langkah yang sedang berjalan selesai.' }; render(); } }, 'Berhenti'));
    else if (lastReport) foot.append(el('div', { class: 'sum' }, lastReport.ok ? 'Putaran selesai.' : 'Putaran berhenti.'), el('button', { class: 'btn go', type: 'button', onclick: () => { lastReport = null; runItems = []; render(); } }, 'Kembali ke antrean'));
    else foot.append(el('div', { class: 'sum' }, pilih + ' dari ' + counts.putaran + ' naskah dicentang'), el('button', { class: 'btn go', type: 'button', disabled: !pilih, onclick: openRunDialog }, 'Jalankan putaran'));
    p.append(foot);
    p.append(el('div', { class: 'credit' }, 'Dikembangkan oleh Deddy Eko Heryanto, S.T.\nJFT Pranata Komputer Ahli Muda\nPerpustakaan Poltekkes Kemenkes Palangka Raya\nAlat bantu pribadi. Bukan produk resmi ANRI maupun BSrE.'));
    wrap.append(p);
    if (modal) wrap.append(modal);
  }

  async function openRunDialog() {
    const chosen = putaran().filter(i => dicentang.has(i.id));
    if (!chosen.length || running) return;
    const nik = await sw('nik').catch(() => null);
    const perluNomor = chosen.filter(i => i.langkah.includes('nomor'));
    const nikInput = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: '16', placeholder: nik ? C.maskNik(nik) + ' (tersimpan sampai Chrome ditutup)' : '16 angka sesuai akun SRIKANDI' });
    const keyInput = el('input', { type: 'password', autocomplete: 'new-password', spellcheck: 'false', placeholder: 'Key Phrase sertifikat elektronik Anda' });
    const ckNomor = el('input', { type: 'checkbox' });
    const ckSetuju = el('input', { type: 'checkbox' });
    const go = el('button', { class: 'btn go', type: 'button', disabled: true }, 'Jalankan');
    const check = () => { go.disabled = !(ckSetuju.checked && (!perluNomor.length || ckNomor.checked) && keyInput.value && (nikInput.value ? C.isValidNik(nikInput.value) : !!nik)); };
    [nikInput, keyInput].forEach(x => x.addEventListener('input', check));
    [ckNomor, ckSetuju].forEach(x => x.addEventListener('change', check));
    const close = () => { keyInput.value = ''; modal = null; render(); };
    go.addEventListener('click', async () => {
      let n = nik;
      if (nikInput.value) {
        n = nikInput.value;
        await sw('setNik', { nik: n }).catch(() => {});
        await refreshNik();
      }
      const key = keyInput.value;
      keyInput.value = '';
      modal = null;
      jalankan(n, key);
    });
    const nSetuju = chosen.filter(i => i.langkah.includes('setuju')).length;
    modal = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Jalankan putaran', onkeydown: e => { if (e.key === 'Escape') close(); } },
      el('div', { class: 'dlg' },
        el('h2', {}, 'Jalankan putaran: ' + chosen.length + ' naskah'),
        el('ol', {}, chosen.map(i => el('li', {}, (i.nomor || 'belum bernomor') + ' | ' + i.hal))),
        el('p', { class: 'note' }, 'Urutan kerja: Setuju untuk ' + nSetuju + ' naskah, Ambil Nomor untuk ' + perluNomor.length + ' naskah, lalu TTE untuk ' + chosen.length + ' naskah. Berhenti total bila ada satu langkah yang gagal.'),
        perluNomor.length ? el('div', { class: 'warn' }, el('label', { class: 'ck' }, ckNomor, 'Saya mengerti: nomor otomatis untuk ' + perluNomor.length + ' naskah tidak bisa diubah kembali setelah diambil.')) : null,
        el('label', { class: 'fld' }, el('span', {}, 'NIK' + (nik ? ' (kosongkan untuk memakai yang tersimpan)' : '')), nikInput),
        el('label', { class: 'fld' }, el('span', {}, 'Key Phrase (tidak disimpan, dilepas setelah putaran selesai)'), keyInput),
        el('label', { class: 'ck' }, ckSetuju, 'Saya telah membaca dan menyetujui ' + chosen.length + ' naskah di atas untuk ditandatangani atas nama saya.'),
        el('div', { class: 'row' }, el('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Batal'), go)));
    render();
    setTimeout(() => (nik ? keyInput : nikInput).focus(), 30);
  }

  /* ---------- Mulai ---------- */
  (async () => {
    try { settings = C.sanitizeSettings(await sw('settings')); } catch (e) { /* bawaan */ }
    await refreshNik();
    render();
  })();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (settings.theme === 'auto') render(); });
})();
