"""SRIKANDI tiruan untuk uji ANTRI RAMA. Satu server HTTPS melayani srikandi.arsip.go.id, api.arsip.go.id,
dan s3.arsip.go.id (dipetakan lewat --host-resolver-rules). Semua data fiktif."""
import http.server, ssl, json, re, sys, threading
from urllib.parse import urlparse, parse_qs
from email.parser import BytesParser
from email.policy import default

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8444
TOKEN = 'Bearer SESI-UJI-ANTRI'
NIK_OK, KEY_OK = '1234567890123456', 'kunci-benar'
ORIGIN = 'https://srikandi.arsip.go.id'
PDF = open('contoh.pdf', 'rb').read() if __import__('os').path.exists('contoh.pdf') else b'%PDF-1.4 contoh'
LOCK = threading.Lock()
LOG = []          # catatan semua permintaan API (untuk pemeriksaan uji)
STATE = {}
NOMOR_SEQ = [40]
FLAGS = {'nomor404_jenis': None}

JENIS = [(1, 'Surat Dinas'), (2, 'Nota Dinas'), (3, 'Surat Undangan'), (4, 'Surat Keterangan')]
HAL = ['Permohonan data kepegawaian triwulan IV', 'Undangan rapat koordinasi perpustakaan', 'Penyampaian laporan kegiatan bimtek',
       'Permintaan narasumber pelatihan literasi', 'Pemberitahuan jadwal stock opname', 'Usulan pengadaan buku referensi',
       'Laporan pemanfaatan repositori', 'Undangan sosialisasi SRIKANDI', 'Penyampaian hasil evaluasi layanan',
       'Permohonan izin penggunaan ruang baca', 'Pemberitahuan libur layanan', 'Penugasan pengelola jurnal',
       'Permintaan data kunjungan', 'Penyampaian notulen rapat']

def reset():
    STATE.clear(); LOG.clear(); NOMOR_SEQ[0] = 40; FLAGS['nomor404_jenis'] = None
    for i, hal in enumerate(HAL):
        nid = 9001 + i
        j = JENIS[i % 4]
        STATE[nid] = {
            'id': nid, 'nomor': '', 'hal': hal, 'tanggal': '2026-11-%02d' % (10 + i % 12), 'created_at': '2026-11-%02dT08:00:00' % (10 + i % 12),
            'sender_user_id': 5, 'jenis_naskah_id': j[0], 'jenis_naskah_nama': j[1], 'sifat_naskah_id': 1, 'sifat_naskah_nama': 'Biasa',
            'sifat_naskah': {'id': 1, 'sifat_naskah': 'Biasa', 'otp_protected': False}, 'urgensi_naskah_nama': 'Segera' if i == 5 else None,
            'klasifikasi_id': 77, 'klasifikasi_nama': 'Perpustakaan', 'file': 'naskah-%d.pdf' % nid, 'file_path': 'naskah-dinas-keluar/%d/2026-11' % nid,
            'user_created_nama': 'Konseptor Contoh %d' % (i % 3 + 1), 'is_signed': False, 'is_draft': False,
            'penandatangan_naskahs': [{'id': 5000 + i, 'naskah_keluar_id': nid, 'user_id': 5, 'nama': 'Pejabat Contoh, S.T.', 'jabatan': 'Kepala Pusat Contoh',
                                       'urutan': 1, 'status': None, 'is_signed': False, 'is_canceled': False, 'created_at': '2026-11-%02dT09:%02d:00' % (10 + i % 12, i)}]}
    # Kasus khusus
    old = STATE[9013]; old.update(tanggal='2025-07-02', created_at='2025-07-02T08:00:00', hal='Surat keterangan aktif kuliah (lama)'); old['penandatangan_naskahs'][0]['jabatan'] = 'Kepala Sub Bagian Lama'; old['penandatangan_naskahs'][0]['created_at'] = '2025-07-02T09:00:00'
    rah = STATE[9014]; rah.update(sifat_naskah_nama='Rahasia'); rah['sifat_naskah'] = {'id': 3, 'sifat_naskah': 'Rahasia', 'otp_protected': True}
    tunggu = STATE[9012]; tunggu['penandatangan_naskahs'] = [{'id': 4999, 'user_id': 8, 'nama': 'Pejabat Pertama Contoh', 'jabatan': 'Direktur', 'urutan': 1, 'status': None, 'is_signed': False, 'is_canceled': False},
                                                         dict(tunggu['penandatangan_naskahs'][0], urutan=2)]
    siap = STATE[9001]; siap['nomor'] = 'PP.01.01/XLI.6/39/2026'; siap['penandatangan_naskahs'][0]['status'] = 'SETUJU'
reset()

def multipart(h, body):
    ct = h.get('Content-Type', '')
    msg = BytesParser(policy=default).parsebytes(b'Content-Type: ' + ct.encode() + b'\r\n\r\n' + body)
    out = {}
    for part in msg.iter_parts():
        out[part.get_param('name', header='content-disposition')] = part.get_content()
    return out

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def log_message(self, *a): pass
    def send(self, code, obj=None, ctype='application/json', raw=None):
        body = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body)))
        if self.headers.get('Host', '').startswith('api.'):
            self.send_header('Access-Control-Allow-Origin', ORIGIN)
            self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self): self.send(204, raw=b'')
    def host(self): return self.headers.get('Host', '').split(':')[0]
    def do_GET(self): self.route('GET', b'')
    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0) or 0)
        self.route('POST', self.rfile.read(n) if n else b'')
    def route(self, m, body):
        u = urlparse(self.path); q = {k: v[0] for k, v in parse_qs(u.query).items()}; h = self.host()
        if h == 's3.arsip.go.id': return self.send(200, raw=PDF, ctype='application/pdf')
        if h == 'srikandi.arsip.go.id':
            if u.path.startswith('/__'): return self.send(404, {})
            page = open('detail.html' if 'detail' in u.path else 'list.html', 'rb').read()
            return self.send(200, raw=page, ctype='text/html; charset=utf-8')
        # API
        if u.path == '/__test/log': return self.send(200, LOG)
        if u.path == '/__test/state': return self.send(200, STATE)
        if u.path == '/__test/reset': reset(); return self.send(200, {'ok': True})
        if u.path == '/__test/nomor404':
            FLAGS['nomor404_jenis'] = q.get('jenis'); return self.send(200, {'ok': True})
        form = multipart(self.headers, body) if m == 'POST' and body else {}
        with LOCK:
            LOG.append({'m': m, 'path': u.path, 'q': q, 'form': {k: ('<16 digit>' if k == 'nik' else v) for k, v in form.items()},
                        'auth': self.headers.get('Authorization'), 'origin': self.headers.get('Origin'), 'body_has_key': KEY_OK.encode() in body or b'kunci-salah' in body})
        if self.headers.get('Authorization') != TOKEN: return self.send(401, {'success': False, 'message': 'Unauthenticated'})
        with LOCK:
            if u.path == '/naskah-keluar/api/penandatangan-naskah/list':
                rows = [json.loads(json.dumps(r)) for r in STATE.values()]
                return self.send(200, {'success': True, 'result': {'data': rows, 'next_cursor': None}})
            mm = re.match(r'^/naskah-keluar/api/naskah-dinas/naskah-keluar/(\d+)/show$', u.path)
            if mm: return self.send(200, {'success': True, 'result': {'id': int(mm.group(1)), 'detail_user_created': {'singkatan_unit_kerja': 'XLI.6'}}})
            if u.path == '/storage/geturlpreview': return self.send(200, {'success': True, 'url': 'https://s3.arsip.go.id/srikandi-prod/' + q.get('folder', '') + '/' + q.get('filename', '')})
            if u.path == '/naskah-keluar/api/penandatangan-naskah/update' and m == 'POST':
                r = STATE.get(int(form.get('naskah_keluar_id', 0)))
                e = r and next((x for x in r['penandatangan_naskahs'] if str(x['id']) == form.get('id') and str(x['user_id']) == form.get('user_id')), None)
                if not e or form.get('status') != 'SETUJU': return self.send(422, {'success': False, 'message': 'Data penandatangan tidak valid'})
                e['status'] = 'SETUJU'; return self.send(200, {'success': True, 'message': 'Berhasil', 'result': None})
            if u.path == '/nk-number/api/penomoran-otomatis/get-nomor-final-update':
                r = STATE.get(int(q.get('naskah_id', 0)))
                if not r or q.get('singkatan_org') != 'XLI.6' or q.get('organisasi_id') != q.get('sender_user_id'): return self.send(422, {'success': False, 'message': 'Parameter salah'})
                if FLAGS['nomor404_jenis'] and r['jenis_naskah_nama'] == FLAGS['nomor404_jenis']: return self.send(404, {'success': False, 'message': 'Format tidak ditemukan'})
                if not r['nomor']: NOMOR_SEQ[0] += 1; r['nomor'] = 'PP.01.01/XLI.6/%d/2026' % NOMOR_SEQ[0]
                return self.send(200, {'success': True, 'result': r['nomor']})
            if u.path == '/nk-ttd/api/penandatangan-naskah/ttd-elektronik-only' and m == 'POST':
                r = STATE.get(int(form.get('naskah_keluar_id', 0)))
                if form.get('nik') != NIK_OK or form.get('key') != KEY_OK: return self.send(200, {'success': False, 'message': 'Passphrase anda salah'})
                e = r and r['penandatangan_naskahs'][-1]
                if not r or not r['nomor'] or e['status'] != 'SETUJU': return self.send(422, {'success': False, 'message': 'Naskah belum siap ditandatangani'})
                e['is_signed'] = True; r['is_signed'] = True
                return self.send(200, {'success': True, 'message': 'Berhasil', 'result': {'id': e['id'], 'naskah_keluar_id': r['id'], 'status': 'SETUJU'}})
        return self.send(404, {'success': False, 'message': 'Tidak dikenal: ' + u.path})

s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain('cert.pem', 'key.pem')
s.socket = ctx.wrap_socket(s.socket, server_side=True)
s.serve_forever()
