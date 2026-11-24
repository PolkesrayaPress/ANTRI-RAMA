// Uji tumpang tindih: JALA Arsip dan ANTRI RAMA dipasang bersamaan. Data fiktif.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), a = require('assert');
const ANTRI = path.resolve(__dirname, '../../extension'), JALA = process.argv[3]; if (!JALA) { console.log('Pakai: node tumpuk.js <folder-keluaran> <folder-ekstensi-JALA>'); process.exit(2); }
const TA = '/tmp/antri-ext-tumpuk';
const OUT = process.argv[2] || path.resolve(__dirname, 'out');
fs.rmSync(TA, { recursive: true, force: true }); fs.cpSync(ANTRI, TA, { recursive: true });
fs.writeFileSync(TA + '/panel.js', fs.readFileSync(ANTRI + '/panel.js', 'utf8').replace("attachShadow({ mode: 'closed' })", "attachShadow({ mode: 'open' })"));
let n = 0; const ok = (c, m) => { a.ok(c, m); n++; console.log('  lulus:', m); };
const overlap = (x, y) => !(x.right <= y.left || y.right <= x.left || x.bottom <= y.top || y.bottom <= x.top);
(async () => {
  const dir = fs.mkdtempSync('/tmp/antri-prof-');
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: '/usr/bin/google-chrome', headless: false, ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 }, locale: 'id-ID',
    args: ['--headless=new', '--hide-scrollbars', '--lang=id', '--no-proxy-server', '--ignore-certificate-errors',
      '--host-resolver-rules=MAP srikandi.arsip.go.id:443 127.0.0.1:8444, MAP api.arsip.go.id:443 127.0.0.1:8444, MAP s3.arsip.go.id:443 127.0.0.1:8444',
      '--disable-extensions-except=' + TA + ',' + JALA, '--load-extension=' + TA + ',' + JALA]
  });
  const p = await ctx.newPage();
  await p.goto('https://srikandi.arsip.go.id/pembuatan-naskah-keluar/tandatangan-naskah');
  await p.waitForTimeout(4000);
  const jala = await p.evaluate(() => { const e = document.getElementById('srk-fab'); return e ? JSON.parse(JSON.stringify(e.getBoundingClientRect())) : null; });
  const antri = await p.evaluate(() => { const h = document.getElementById('antri-rama-host'); const f = h && h.shadowRoot && h.shadowRoot.querySelector('.fab'); return f ? JSON.parse(JSON.stringify(f.getBoundingClientRect())) : null; });
  console.log('JALA', jala, '\nANTRI', antri);
  ok(jala, 'tombol JALA tampil');
  ok(antri, 'tombol ANTRI RAMA tampil');
  ok(!overlap(jala, antri), 'kedua tombol tidak bertumpuk');
  ok(antri.bottom <= jala.top - 6, 'ANTRI RAMA berada di atas JALA dengan jarak');
  await p.screenshot({ path: path.join(OUT, '10-dua-tombol.png'), clip: { x: 1120, y: 740, width: 320, height: 160 } });
  console.log('Uji tumpuk: ' + n + ' pemeriksaan lulus');
  await ctx.close();
})().catch(e => { console.log('GAGAL:', e.message); process.exit(1); });
