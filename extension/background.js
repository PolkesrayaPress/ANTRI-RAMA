/* ANTRI RAMA v1.0.1 - service worker
   Tugas: membaca token sesi dan alamat daftar dari lalu lintas SRIKANDI (tanpa menyentuh halaman),
   menyimpan pengaturan dan log (tanpa NIK dan Key Phrase), serta menyimpan NIK di memori sesi peramban.
   Key Phrase tidak pernah dikirim ke sini. */
importScripts('core.js');
const C = self.ANTRI_CORE;
const SRIKANDI = 'https://srikandi.arsip.go.id';
const LOG_MAX = 3000;

/* ---------- Token dan alamat daftar per tab (memori sesi, hilang saat peramban ditutup) ---------- */
const tabKey = id => 'tab_' + id;
async function getTab(id) { const o = await chrome.storage.session.get(tabKey(id)); return o[tabKey(id)] || {}; }
async function setTab(id, v) { await chrome.storage.session.set({ [tabKey(id)]: v }); }
let tabChain = Promise.resolve();

chrome.webRequest.onSendHeaders.addListener(d => {
  if (d.tabId < 0 || d.initiator !== SRIKANDI) return;
  const auth = (d.requestHeaders || []).find(h => /^authorization$/i.test(h.name));
  if (!auth || !auth.value) return;
  tabChain = tabChain.then(async () => {
    const t = await getTab(d.tabId);
    // Token pertama di halaman dikunci. Token lain berarti sesi berubah: ANTRI RAMA berhenti sampai halaman dimuat ulang.
    if (!t.token) t.token = auth.value;
    else if (t.token !== auth.value) t.conflict = true;
    if (d.method === 'GET') { const tpl = C.sanitizeTemplate(d.url); if (tpl) t.template = tpl; }
    await setTab(d.tabId, t);
  }).catch(() => {});
}, { urls: ['https://api.arsip.go.id/*'], types: ['xmlhttprequest'] }, ['requestHeaders', 'extraHeaders']);

// Muat ulang atau pindah halaman penuh = mulai bersih.
chrome.webNavigation.onCommitted.addListener(d => { if (d.frameId === 0) tabChain = tabChain.then(() => chrome.storage.session.remove(tabKey(d.tabId))); });
chrome.tabs.onRemoved.addListener(id => { tabChain = tabChain.then(() => chrome.storage.session.remove(tabKey(id))); });

/* ---------- Penyimpanan ---------- */
let chain = Promise.resolve();
const serial = fn => (chain = chain.then(fn, fn));
const get = k => chrome.storage.local.get(k).then(o => o[k]);

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (sender.id !== chrome.runtime.id) return false;
  const fromPage = !!(sender.tab && sender.url && sender.url.startsWith(SRIKANDI + '/'));
  const fromOptions = !!sender.url && sender.url.startsWith('chrome-extension://' + chrome.runtime.id + '/options.html');
  const p = (msg && msg.payload) || {};
  const page = {
    session: async () => { await tabChain; const t = await getTab(sender.tab.id); return { token: t.conflict ? null : (t.token || null), conflict: !!t.conflict, template: t.template || null }; },
    settings: async () => C.sanitizeSettings(await get('ar_settings')),
    setSettings: () => serial(async () => { const s = C.sanitizeSettings(Object.assign(C.sanitizeSettings(await get('ar_settings')), p)); await chrome.storage.local.set({ ar_settings: s }); return s; }),
    nik: async () => { const o = await chrome.storage.session.get('nik'); return o.nik || null; },
    setNik: async () => { if (!C.isValidNik(p.nik)) throw new Error('NIK harus 16 angka'); await chrome.storage.session.set({ nik: String(p.nik) }); return true; },
    clearNik: async () => { await chrome.storage.session.remove('nik'); return true; },
    logAppend: () => serial(async () => {
      const rows = (Array.isArray(p.rows) ? p.rows : []).slice(0, 20).map(C.sanitizeLogRow);
      const next = ((await get('ar_log')) || []).concat(rows).slice(-LOG_MAX);
      await chrome.storage.local.set({ ar_log: next });
      return next.length;
    })
  };
  const opts = {
    settings: page.settings,
    setSettings: page.setSettings,
    log: async () => (await get('ar_log')) || [],
    clearLog: () => serial(async () => { await chrome.storage.local.remove('ar_log'); return true; }),
    nikMasked: async () => { const o = await chrome.storage.session.get('nik'); return o.nik ? C.maskNik(o.nik) : null; },
    clearNik: page.clearNik,
    info: async () => ({ version: chrome.runtime.getManifest().version, id: chrome.runtime.id })
  };
  const table = fromPage ? page : fromOptions ? opts : null;
  const fn = table && msg && Object.prototype.hasOwnProperty.call(table, msg.type) ? table[msg.type] : null;
  if (!fn) { send({ ok: false, error: 'Perintah tidak dikenal' }); return false; }
  Promise.resolve().then(fn).then(data => send({ ok: true, data }), e => send({ ok: false, error: String(e && e.message || e) }));
  return true;
});
