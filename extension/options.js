/* ANTRI RAMA v1.0.0 - halaman pengaturan dan log */
(function () {
  'use strict';
  const C = window.ANTRI_CORE;
  const $ = id => document.getElementById(id);
  const sw = (type, payload) => new Promise((res, rej) => chrome.runtime.sendMessage({ type, payload }, r => {
    const e = chrome.runtime.lastError; if (e) rej(new Error(e.message)); else if (!r || !r.ok) rej(new Error((r && r.error) || 'Gagal')); else res(r.data);
  }));
  const msg = t => { $('msg').textContent = t; setTimeout(() => { if ($('msg').textContent === t) $('msg').textContent = ''; }, 4000); };
  let settings = C.DEFAULT_SETTINGS;
  for (let i = 1; i <= C.MAX_PUTARAN; i++) { const o = document.createElement('option'); o.value = i; o.textContent = i + ' naskah' + (i === 10 ? ' (paling banyak)' : ''); $('perPutaran').append(o); }
  function theme() {
    const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('theme').textContent = dark ? 'Tema terang' : 'Tema gelap';
  }
  async function load() {
    const inf = await sw('info');
    $('info').textContent = 'Versi ' + inf.version + ' | ID ekstensi ' + inf.id;
    settings = await sw('settings');
    $('perPutaran').value = settings.perPutaran; $('urut').value = settings.urut; $('jedaDetik').value = settings.jedaDetik;
    theme();
    $('nik').textContent = (await sw('nikMasked')) || 'tidak ada';
    const log = await sw('log');
    const tb = $('log'); tb.textContent = '';
    log.slice().reverse().forEach(r => {
      const tr = document.createElement('tr');
      [r.waktu, r.putaran, r.nomor, r.hal, r.setuju, r.nomorStatus, r.tte, r.pesan].forEach(v => {
        const td = document.createElement('td'); td.textContent = v || '';
        if (v === 'berhasil') td.className = 'ok'; if (v === 'gagal') td.className = 'bad';
        tr.append(td);
      });
      tb.append(tr);
    });
    if (!log.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 8; td.textContent = 'Belum ada putaran.'; tr.append(td); tb.append(tr); }
  }
  $('save').onclick = async () => { settings = await sw('setSettings', { perPutaran: Number($('perPutaran').value), urut: $('urut').value, jedaDetik: Number($('jedaDetik').value), theme: settings.theme }); msg('Pengaturan disimpan. Muat ulang antrean di SRIKANDI.'); };
  $('theme').onclick = async () => { settings = await sw('setSettings', { theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); theme(); };
  $('clearNik').onclick = async () => { await sw('clearNik'); $('nik').textContent = 'tidak ada'; msg('NIK dihapus dari memori peramban.'); };
  $('clearLog').onclick = async () => { if (!confirm('Hapus seluruh log putaran? Unduh CSV dulu bila perlu.')) return; await sw('clearLog'); await load(); msg('Log dihapus.'); };
  $('csv').onclick = async () => {
    const log = await sw('log');
    const blob = new Blob([C.toCsv(log)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'ANTRI_RAMA_log_' + new Date().toISOString().slice(0, 10) + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  load().catch(e => msg('Gagal memuat: ' + e.message));
})();
