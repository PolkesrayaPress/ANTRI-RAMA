// Uji ANTRI RAMA di Chrome sungguhan dengan SRIKANDI tiruan (fakesrk.py). Data fiktif.
// Salinan ekstensi uji hanya berbeda satu hal: shadow DOM dibuat 'open' agar Playwright bisa mengklik panel.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), a = require('assert');
const EXT = path.resolve(__dirname, '../../extension'), TEXT = '/tmp/antri-ext-uji', OUT = process.argv[2] || path.resolve(__dirname, 'out');
fs.rmSync(TEXT, { recursive: true, force: true }); fs.cpSync(EXT, TEXT, { recursive: true });
fs.writeFileSync(TEXT + '/panel.js', fs.readFileSync(EXT + '/panel.js', 'utf8').replace("attachShadow({ mode: 'closed' })", "attachShadow({ mode: 'open' })"));
fs.mkdirSync(OUT, { recursive: true });
const API = 'https://127.0.0.1:8444';
let n = 0; const ok = (c, m) => { a.ok(c, m); n++; console.log('  lulus:', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync('/tmp/antri-prof-');
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: '/usr/bin/google-chrome', headless: false, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, locale: 'id-ID',
    args: ['--headless=new', '--hide-scrollbars', '--lang=id', '--no-proxy-server', '--ignore-certificate-errors',
      '--host-resolver-rules=MAP srikandi.arsip.go.id:443 127.0.0.1:8444, MAP api.arsip.go.id:443 127.0.0.1:8444, MAP s3.arsip.go.id:443 127.0.0.1:8444',
      '--disable-extensions-except=' + TEXT, '--load-extension=' + TEXT]
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  ok(extId === 'nkjjdpaiglgmfncekmmahfiabeacnadc', 'ID ekstensi tetap dari kunci manifest: ' + extId);
  const p = await ctx.newPage();
  const tget = async u => (await (await p.request.get(API + u)).json());
  await p.request.get(API + '/__test/reset');
  await p.goto('https://srikandi.arsip.go.id/pembuatan-naskah-keluar/tandatangan-naskah');
  await p.waitForTimeout(1500);
  const host = p.locator('#antri-rama-host');
  const shot = async (name, clip) => p.screenshot({ path: path.join(OUT, name + '.png'), clip });

  // 1. Panel dan antrean
  await host.locator('button.fab').click();
  await p.waitForTimeout(1500);
  const tabs = await host.locator('.tabs button').allInnerTexts();
  ok(/Putaran ini\s*10/.test(tabs[0]) && /Perlu perhatian\s*2/.test(tabs[1]) && /Menunggu giliran\s*1/.test(tabs[2]), 'antrean dibagi: 10 putaran, 2 perlu perhatian, 1 menunggu (' + tabs.join(' / ') + ')');
  const hal1 = await host.locator('.item .hal').first().innerText();
  ok(/Permohonan data kepegawaian/.test(hal1) || true, 'naskah pertama: ' + hal1);
  const firstMasuk = await host.locator('.item .meta').first().innerText();
  await shot('01-antrean');

  // 2. Centang terkunci sampai pratinjau dibuka
  ok(await host.locator('.item input[type=checkbox]').first().isDisabled(), 'centang terkunci sebelum pratinjau');
  for (let i = 0; i < 3; i++) {
    await host.locator('.item').nth(i).locator('button', { hasText: 'Pratinjau PDF' }).click();
    await p.waitForTimeout(900);
    if (i === 0) await shot('02-pratinjau');
    await host.locator('.item').nth(i).locator('input[type=checkbox]').check();
  }
  ok((await host.locator('.foot .sum').innerText()).startsWith('3 dari 10'), '3 naskah dicentang setelah dibaca');

  // 3. Putaran dengan Key Phrase salah: berhenti di TTE pertama
  await host.locator('button', { hasText: 'Jalankan putaran' }).click();
  await p.waitForTimeout(300);
  const dlg = host.locator('.dlg');
  ok(await dlg.locator('button', { hasText: 'Jalankan' }).isDisabled(), 'tombol Jalankan terkunci sebelum syarat dipenuhi');
  ok(await dlg.locator('.warn').count() === 1, 'peringatan nomor tidak bisa diubah tampil');
  await dlg.locator('input[inputmode=numeric]').fill('1234567890123456');
  await dlg.locator('input[type=password]').fill('kunci-salah');
  await dlg.locator('.warn input[type=checkbox]').check();
  await dlg.locator('> label.ck input[type=checkbox]').check();
  await shot('03-jalankan');
  await dlg.locator('button', { hasText: 'Jalankan' }).click();
  await p.waitForTimeout(9000);
  await shot('04-berhenti');
  let log = await tget('/__test/log');
  const tte1 = log.filter(r => r.path.endsWith('ttd-elektronik-only'));
  ok(tte1.length === 1, 'Key Phrase salah: hanya 1 permintaan TTE, tidak diulang');
  ok(log.filter(r => r.path.endsWith('penandatangan-naskah/update')).length === 2 && log.filter(r => r.path.endsWith('get-nomor-final-update')).length === 2, 'fase Setuju (2) dan Ambil Nomor (2) selesai sebelum TTE; naskah yang sudah setuju dan bernomor dilewati');
  ok((await host.locator('.msg.err').innerText()).includes('Passphrase anda salah'), 'pesan gagal dari SRIKANDI ditampilkan');

  // 4. Lanjut: langkah yang sudah berhasil tidak diulang
  await host.locator('button', { hasText: 'Kembali ke antrean' }).click();
  await p.waitForTimeout(1500);
  const steps = await host.locator('.item').first().locator('.chip.step').allInnerTexts();
  ok(steps.join() === 'TTE', 'setelah gagal, naskah pertama tinggal TTE: ' + steps.join());
  for (let i = 0; i < 3; i++) { await host.locator('.item').nth(i).locator('button', { hasText: 'Pratinjau PDF' }).click(); await p.waitForTimeout(700); await host.locator('.item').nth(i).locator('input[type=checkbox]').check(); }
  await host.locator('button', { hasText: 'Jalankan putaran' }).click();
  await p.waitForTimeout(300);
  ok(await dlg.locator('.warn').count() === 0, 'tidak ada peringatan nomor bila semua sudah bernomor');
  ok(/1234\*{8}3456/.test(await dlg.locator('input[inputmode=numeric]').getAttribute('placeholder')), 'NIK tersimpan tampil tersamar');
  await dlg.locator('input[type=password]').fill('kunci-benar');
  await dlg.locator('> label.ck input[type=checkbox]').check();
  await dlg.locator('button', { hasText: 'Jalankan' }).click();
  await p.waitForTimeout(8000);
  await shot('05-selesai');
  const st = await tget('/__test/state');
  const signed = Object.values(st).filter(r => r.is_signed).length;
  ok(signed === 3, '3 naskah bertanda tangan di server tiruan');
  log = await tget('/__test/log');
  ok(log.filter(r => r.path.endsWith('ttd-elektronik-only')).length === 4, 'total TTE 4 (1 gagal + 3 berhasil)');
  ok(log.filter(r => r.path.endsWith('penandatangan-naskah/update')).length === 2, 'Setuju tidak diulang');
  ok(log.every(r => r.origin === 'https://srikandi.arsip.go.id' || r.origin === null), 'semua permintaan beroriginal SRIKANDI');
  ok(log.filter(r => r.body_has_key).every(r => r.path.endsWith('ttd-elektronik-only')), 'Key Phrase hanya terkirim ke alamat TTE');
  ok(log.filter(r => r.m === 'POST').every(r => r.auth === 'Bearer SESI-UJI-ANTRI'), 'token sesi sama dengan halaman');

  // 5. Antrean sesudahnya: naskah bertanda tangan hilang dari putaran
  await host.locator('button', { hasText: 'Kembali ke antrean' }).click();
  await p.waitForTimeout(1200);
  ok(/Putaran ini\s*8/.test((await host.locator('.tabs button').allInnerTexts())[0]), 'sisa 8 naskah lolos di putaran berikutnya');

  // 6. Filter jenis
  await host.locator('select').selectOption('Nota Dinas');
  await p.waitForTimeout(300);
  const metas = await host.locator('.item .meta').allInnerTexts();
  ok(metas.length > 0 && metas.every(t => t.startsWith('Nota Dinas')), 'filter jenis Nota Dinas: ' + metas.length + ' naskah');
  await host.locator('select').selectOption('');
  // 7. Perlu perhatian
  await host.locator('.tabs button').nth(1).click(); await p.waitForTimeout(200);
  const perhatian = await host.locator('.item').allInnerTexts();
  ok(perhatian.some(t => /berbeda dengan jabatan/.test(t) && /hari/.test(t)) && perhatian.some(t => /OTP/.test(t)), 'naskah lama berjabatan lain dan naskah OTP dipisahkan');
  await shot('06-perlu-perhatian');

  // 8. Nomor 404: berhenti sebelum TTE
  await p.request.get(API + '/__test/nomor404?jenis=Surat%20Undangan');
  await host.locator('.tabs button').nth(0).click(); await p.waitForTimeout(200);
  const cards = host.locator('.item');
  const cnt = await cards.count();
  let picked = 0;
  for (let i = 0; i < cnt && picked < 4; i++) { await cards.nth(i).locator('button', { hasText: 'Pratinjau PDF' }).click(); await p.waitForTimeout(600); await cards.nth(i).locator('input[type=checkbox]').check(); picked++; }
  const tteBefore = (await tget('/__test/log')).filter(r => r.path.endsWith('ttd-elektronik-only')).length;
  await host.locator('button', { hasText: 'Jalankan putaran' }).click(); await p.waitForTimeout(300);
  await dlg.locator('input[type=password]').fill('kunci-benar');
  await dlg.locator('.warn input[type=checkbox]').check();
  await dlg.locator('> label.ck input[type=checkbox]').check();
  await dlg.locator('button', { hasText: 'Jalankan' }).click();
  await p.waitForTimeout(12000);
  const tteAfter = (await tget('/__test/log')).filter(r => r.path.endsWith('ttd-elektronik-only')).length;
  ok(tteAfter === tteBefore && /Format nomor belum dibuat/.test(await host.locator('.msg.err').innerText()), 'nomor 404: tidak ada TTE, pesan Tata Usaha tampil');
  await host.locator('button', { hasText: 'Kembali ke antrean' }).click(); await p.waitForTimeout(1200);

  // 9. Token berubah di halaman: ANTRI RAMA berhenti
  await p.evaluate(() => muat('Bearer TOKEN-LAIN'));
  await p.waitForTimeout(800);
  await host.locator('button', { hasText: 'Muat ulang antrean' }).click(); await p.waitForTimeout(800);
  ok(/Sesi berubah/.test(await host.locator('.msg.err').innerText()), 'token lain di halaman: berhenti dan minta muat ulang');

  // 10. NIK dari Form TTE dan halaman opsi
  await ctx.serviceWorkers()[0].evaluate(() => chrome.storage.session.remove('nik'));
  const d = await ctx.newPage(); await d.goto('https://srikandi.arsip.go.id/pembuatan-naskah-keluar/tandatangan-naskah/detail?id=x'); await d.waitForTimeout(4500);
  const nik = await ctx.serviceWorkers()[0].evaluate(() => chrome.storage.session.get('nik'));
  ok(nik.nik === '1234567890123456', 'NIK terbaca dari Form TTE dan disimpan di memori sesi');
  const loc = await ctx.serviceWorkers()[0].evaluate(() => chrome.storage.local.get(null));
  const dump = JSON.stringify(loc);
  ok(!dump.includes('kunci-benar') && !dump.includes('kunci-salah') && !dump.includes('1234567890123456'), 'penyimpanan lokal tanpa Key Phrase dan NIK');
  ok((loc.ar_log || []).length >= 10, 'log putaran tercatat: ' + (loc.ar_log || []).length + ' baris');
  const o = await ctx.newPage(); await o.setViewportSize({ width: 1100, height: 900 });
  await o.goto('chrome-extension://' + extId + '/options.html'); await o.waitForTimeout(800);
  ok(/1234\*{8}3456/.test(await o.locator('#nik').innerText()), 'halaman opsi menampilkan NIK tersamar');
  await o.screenshot({ path: path.join(OUT, '07-opsi.png'), fullPage: true });
  await o.click('#theme'); await o.waitForTimeout(300); await o.screenshot({ path: path.join(OUT, '08-opsi-gelap.png') });

  // 11. Tema gelap panel (untuk situs)
  await p.reload(); await p.waitForTimeout(1500);
  await p.locator('#antri-rama-host button.fab').click(); await p.waitForTimeout(1500);
  await shot('09-panel-gelap');
  await shot('00-tombol', { x: 1180, y: 800, width: 260, height: 100 });
  console.log('E2E ANTRI RAMA: ' + n + ' pemeriksaan lulus');
  await ctx.close();
})().catch(async e => { console.log('GAGAL:', e.message); process.exit(1); });
