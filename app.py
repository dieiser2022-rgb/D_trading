"""D_Trading Local — servidor 100% local, sem dependências de terceiros.
Rodar: python app.py    (Python 3.9+)
"""
import base64
import datetime as dt
from contextlib import contextmanager
import io
import json
import mimetypes
import os
import pathlib
import re
import shutil
import sqlite3
import threading
import time
import uuid
import webbrowser
import zipfile
from cloud_sync import CloudController, CloudError, migrate, stamp
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

ROOT = pathlib.Path(__file__).resolve().parent
DATA = ROOT / 'data'
UPLOADS = DATA / 'uploads'
WEB = ROOT / 'web'
DB = DATA / 'diario.db'
for p in (DATA, UPLOADS): p.mkdir(exist_ok=True)
LOCAL_HOST = '127.0.0.1'
PORT = int(os.environ.get('DTRADING_PORT', '8765'))


def connect():
    c = sqlite3.connect(DB, timeout=20)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA journal_mode=WAL')
    return c


@contextmanager
def db():
    conn = connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def init_db():
    with db() as c:
        c.executescript('''
            CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, initial_capital REAL NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD', created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS strategies (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
            CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, file TEXT NOT NULL, current_page INTEGER NOT NULL DEFAULT 1, page_count INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS time_sessions (id INTEGER PRIMARY KEY, day TEXT NOT NULL, seconds INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS timer (id INTEGER PRIMARY KEY CHECK(id=1), running INTEGER NOT NULL DEFAULT 0, started_at REAL, elapsed INTEGER NOT NULL DEFAULT 0);
            INSERT OR IGNORE INTO timer (id,running,started_at,elapsed) VALUES (1,0,NULL,0);
        ''')
        migrate(c)


def decode_data_url(data, kind):
    m = re.fullmatch(r'data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)', data or '', re.DOTALL)
    if not m: raise ValueError('Formato de arquivo inválido')
    mime = m.group(1).lower()
    allow = {'image': {'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif'}, 'book': {'application/pdf': '.pdf'}}[kind]
    if mime not in allow: raise ValueError('Formato de arquivo não permitido')
    binary = base64.b64decode(m.group(2), validate=True)
    limit = 14 * 1024 * 1024 if kind == 'image' else 50 * 1024 * 1024
    if len(binary) > limit: raise ValueError('Arquivo grande demais')
    if kind == 'book' and not binary.startswith(b'%PDF-'): raise ValueError('Não parece ser um PDF válido')
    if kind == 'image' and not (binary.startswith(b'\x89PNG') or binary.startswith(b'\xff\xd8') or binary.startswith(b'RIFF') or binary.startswith(b'GIF8')): raise ValueError('Imagem inválida')
    return binary, allow[mime]


def save_file(data, kind):
    binary, ext = decode_data_url(data, kind)
    filename = uuid.uuid4().hex + ext
    (UPLOADS / filename).write_bytes(binary)
    return '/uploads/' + filename


def validate_trade(p):
    if not isinstance(p, dict): raise ValueError('Operação inválida')
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(p.get('date',''))): raise ValueError('Informe a data da operação')
    if not str(p.get('asset','')).strip() and not p.get('noTrade'): raise ValueError('Informe o ativo')
    if not p.get('noTrade'):
        if not p.get('accountId'): raise ValueError('Selecione uma conta (com capital inicial)')
        try: float(p.get('pnl') or 0)
        except (ValueError, TypeError): raise ValueError('Resultado financeiro inválido')
    if len(json.dumps(p, ensure_ascii=False)) > 100000: raise ValueError('Dados da operação grandes demais')


def settings_get(c):
    return {row['key']: json.loads(row['value']) for row in c.execute('SELECT * FROM settings')}


def clean_upload(path):
    if isinstance(path, str) and re.fullmatch(r'/uploads/[a-f0-9]{32}\.(?:png|jpg|webp|gif|pdf)',path):
        filepath = UPLOADS / path.split('/')[-1]
        if filepath.exists(): filepath.unlink()


def referenced_uploads(c):
    paths = set()
    for row in c.execute('SELECT payload FROM trades'):
        p=json.loads(row['payload'])
        paths.update(x for x in (p.get('images') or []) if isinstance(x,str))
    for row in c.execute('SELECT file FROM books'):
        paths.add(row['file'])
    profile = settings_get(c).get('profile',{})
    if profile.get('avatar'): paths.add(profile['avatar'])
    return paths


def remove_unreferenced(c, paths):
    needed = referenced_uploads(c)
    for path in paths:
        if path not in needed: clean_upload(path)


CLOUD = None

class Handler(BaseHTTPRequestHandler):
    server_version = 'DTradingLocal/1.0'
    def log_message(self, fmt, *args):
        if not str(args[1] if len(args)>1 else '').startswith('200'):
            print('[HTTP]', fmt % args)

    def send_json(self, obj, code=200):
        b=json.dumps(obj,ensure_ascii=False,default=str).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(b)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers(); self.wfile.write(b)

    def data_in(self):
        n=int(self.headers.get('Content-Length','0'))
        if n < 0 or n > 75*1024*1024: raise ValueError('Envio excedeu o limite de 75 MB')
        try: return json.loads(self.rfile.read(n).decode('utf-8'))
        except (ValueError,UnicodeError): raise ValueError('Dados JSON inválidos')

    def do_GET(self):
        try: self.handle_get()
        except Exception as e: self.send_json({'error':str(e)},500)
    def do_POST(self):
        try:
            data=self.data_in()
            result=self.handle_post(urlparse(self.path).path, data)
            self.send_json(result)
        except ValueError as e: self.send_json({'error':str(e)},400)
        except sqlite3.IntegrityError as e: self.send_json({'error':'Este nome já está cadastrado. Use um nome diferente.'},409)
        except Exception as e: self.send_json({'error':str(e)},500)

    def handle_get(self):
        path=urlparse(self.path).path
        if path=='/api/state':
            with db() as c:
                trades=[dict(id=r['id'], **json.loads(r['payload'])) for r in c.execute('SELECT * FROM trades ORDER BY id DESC')]
                accounts=[dict(r) for r in c.execute('SELECT * FROM accounts ORDER BY id DESC')]
                strategies=[dict(r) for r in c.execute('SELECT * FROM strategies ORDER BY name COLLATE NOCASE')]
                books=[dict(r) for r in c.execute('SELECT * FROM books ORDER BY id DESC')]
                sessions=[dict(r) for r in c.execute('SELECT day,SUM(seconds) seconds FROM time_sessions GROUP BY day')]
                timer=dict(c.execute('SELECT * FROM timer WHERE id=1').fetchone())
                settings=settings_get(c)
            return self.send_json(dict(trades=trades,accounts=accounts,strategies=strategies,books=books,sessions=sessions,timer=timer,settings=settings,cloud=CLOUD.status() if CLOUD else {}))
        if path=='/api/cloud/status':
            return self.send_json(CLOUD.status())
        if path=='/api/cloud/conflicts':
            return self.send_json({'items':CLOUD.engine.conflicts()})
        if path=='/api/backup':
            with db() as c:
                temp=io.BytesIO()
                dump='\n'.join(c.iterdump()).encode('utf-8')
                with zipfile.ZipFile(temp,'w',compression=zipfile.ZIP_DEFLATED) as z:
                    z.writestr('diario.sql',dump)
                    for fp in UPLOADS.iterdir():
                        if fp.is_file(): z.write(fp,'uploads/'+fp.name)
            b=temp.getvalue()
            self.send_response(200)
            self.send_header('Content-Type','application/zip')
            self.send_header('Content-Disposition','attachment; filename="D_Trading_backup_%s.zip"'%dt.date.today().isoformat())
            self.send_header('Content-Length',str(len(b)))
            self.end_headers(); self.wfile.write(b)
            return
        if path.startswith('/uploads/'):
            filename=path[len('/uploads/'):]
            if not re.fullmatch(r'[a-f0-9]{32}\.(png|jpg|webp|gif|pdf)',filename): return self.send_error(404)
            return self.serve_file(UPLOADS/filename)
        if path=='/': path='/index.html'
        safe=(WEB/path.lstrip('/')).resolve()
        if not safe.is_relative_to(WEB.resolve()): return self.send_error(403)
        return self.serve_file(safe)

    def serve_file(self, filepath):
        if not filepath.is_file(): return self.send_error(404)
        typ=mimetypes.guess_type(str(filepath))[0] or 'application/octet-stream'
        self.send_response(200)
        self.send_header('Content-Type',typ + ('; charset=utf-8' if typ in ('text/html','text/css','application/javascript') else ''))
        self.send_header('Content-Length',str(filepath.stat().st_size))
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers()
        with filepath.open('rb') as f: shutil.copyfileobj(f,self.wfile)

    def handle_post(self, path, d):
        if path=='/api/cloud/login':
            result=CLOUD.login(str(d.get('url','')),str(d.get('key','')),str(d.get('email','')),str(d.get('password','')))
            threading.Thread(target=CLOUD.sync,daemon=True).start()
            return result
        if path=='/api/cloud/signup':
            data=CLOUD.register(str(d.get('url','')),str(d.get('key','')),str(d.get('email','')),str(d.get('password','')))
            return {'ok':True,'message':'Conta criada. Confira seu e-mail se a confirmação estiver habilitada.'}
        if path=='/api/cloud/logout':
            return CLOUD.logout()
        if path=='/api/cloud/sync':
            threading.Thread(target=CLOUD.sync,daemon=True).start()
            return {'ok':True,'message':'Sincronização solicitada. Consulte o status em alguns segundos.'}
        if path=='/api/cloud/resolve':
            return CLOUD.resolve(str(d.get('kind','')),str(d.get('id','')),str(d.get('choice','')))
        if path=='/api/upload':
            return {'path':save_file(d.get('data'), 'image')}
        if path=='/api/accounts':
            name=str(d.get('name','')).strip()[:80]
            if not name: raise ValueError('Informe o nome da conta')
            cap=float(d.get('initial_capital') or 0)
            if cap<0: raise ValueError('Capital inicial não pode ser negativo')
            with db() as c:
                cr=c.execute('INSERT INTO accounts(name,kind,initial_capital,currency) VALUES (?,?,?,?)',(name,str(d.get('kind') or 'Pessoal')[:50],cap,str(d.get('currency') or 'USD')[:6]))
                stamp(c,'account',cr.lastrowid)
                return {'id':cr.lastrowid}
        if path=='/api/accounts/delete':
            iid=int(d.get('id'))
            with db() as c:
                if any(int(json.loads(r['payload']).get('accountId') or -1)==iid for r in c.execute('SELECT payload FROM trades')):
                    raise ValueError('Esta conta tem operações. Exclua ou transfira as operações antes.')
                row=c.execute('SELECT sync_id FROM accounts WHERE id=?',(iid,)).fetchone()
                if row:
                    c.execute('DELETE FROM accounts WHERE id=?',(iid,))
                    stamp(c,'account',deleted=True,sync_id=row['sync_id'])
                return {'ok':True}
        if path=='/api/strategies':
            name=str(d.get('name','')).strip()[:90]
            if not name: raise ValueError('Informe a estratégia')
            with db() as c:
                cr=c.execute('INSERT INTO strategies(name) VALUES (?)',(name,))
                stamp(c,'strategy',cr.lastrowid)
                return {'id':cr.lastrowid}
        if path=='/api/strategies/delete':
            with db() as c:
                iid=int(d.get('id'))
                row=c.execute('SELECT sync_id FROM strategies WHERE id=?',(iid,)).fetchone()
                if row:
                    c.execute('DELETE FROM strategies WHERE id=?',(iid,))
                    stamp(c,'strategy',deleted=True,sync_id=row['sync_id'])
                return {'ok':True}
        if path=='/api/trades':
            p=d.get('trade',{}); validate_trade(p)
            with db() as c:
                if not p.get('noTrade') and not c.execute('SELECT 1 FROM accounts WHERE id=?',(int(p['accountId']),)).fetchone():
                    raise ValueError('Conta não encontrada')
                before=[]
                if d.get('id'):
                    rid=int(d['id'])
                    row=c.execute('SELECT payload FROM trades WHERE id=?',(rid,)).fetchone()
                    if not row: raise ValueError('Operação não encontrada')
                    before=json.loads(row['payload']).get('images',[])
                    c.execute('UPDATE trades SET payload=?, updated=CURRENT_TIMESTAMP WHERE id=?',(json.dumps(p,ensure_ascii=False),rid))
                else:
                    cr=c.execute('INSERT INTO trades(payload) VALUES (?)',(json.dumps(p,ensure_ascii=False),))
                    rid=cr.lastrowid
                remove_unreferenced(c,before)
                stamp(c,'trade',rid)
                return {'id':rid}
        if path=='/api/trades/delete':
            with db() as c:
                row=c.execute('SELECT payload FROM trades WHERE id=?',(int(d.get('id')),)).fetchone()
                if not row: raise ValueError('Operação não encontrada')
                before=json.loads(row['payload']).get('images',[])
                sid=c.execute('SELECT sync_id FROM trades WHERE id=?',(int(d['id']),)).fetchone()['sync_id']
                c.execute('DELETE FROM trades WHERE id=?',(int(d['id']),))
                stamp(c,'trade',deleted=True,sync_id=sid)
                remove_unreferenced(c,before)
                return {'ok':True}
        if path=='/api/books':
            title=str(d.get('title','')).strip()[:160]
            if not title: raise ValueError('Informe o título do livro')
            file=save_file(d.get('data'),'book')
            with db() as c:
                cr=c.execute('INSERT INTO books(title,file,page_count) VALUES (?,?,?)',(title,file,int(d.get('page_count') or 0)))
                stamp(c,'book',cr.lastrowid)
                return {'id':cr.lastrowid}
        if path=='/api/books/page':
            with db() as c:
                iid=int(d['id'])
                c.execute('UPDATE books SET current_page=? WHERE id=?',(max(1,int(d.get('page') or 1)),iid))
                if c.execute('SELECT 1 FROM books WHERE id=?',(iid,)).fetchone(): stamp(c,'book',iid)
                return {'ok':True}
        if path=='/api/books/delete':
            with db() as c:
                row=c.execute('SELECT file FROM books WHERE id=?',(int(d.get('id')),)).fetchone()
                if not row: raise ValueError('Livro não encontrado')
                sid=c.execute('SELECT sync_id FROM books WHERE id=?',(int(d['id']),)).fetchone()['sync_id']
                c.execute('DELETE FROM books WHERE id=?',(int(d['id']),))
                stamp(c,'book',deleted=True,sync_id=sid)
                remove_unreferenced(c,[row['file']])
                return {'ok':True}
        if path=='/api/settings':
            key=str(d.get('key',''))
            if not re.fullmatch(r'[a-z][a-z0-9_]{0,40}',key): raise ValueError('Configuração inválida')
            val=json.dumps(d.get('value'),ensure_ascii=False)
            if len(val)>200000: raise ValueError('Configuração muito grande')
            with db() as c:
                c.execute('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(key,val))
                if key in ('profile','plan','preferences'):stamp(c,'settings',key)
                return {'ok':True}
        if path=='/api/timer':
            action=d.get('action')
            with db() as c:
                r=dict(c.execute('SELECT * FROM timer WHERE id=1').fetchone())
                now=time.time()
                if action=='start' and not r['running']:
                    c.execute('UPDATE timer SET running=1,started_at=? WHERE id=1',(now,))
                elif action=='pause' and r['running']:
                    seconds=max(0,int(now-r['started_at']))
                    c.execute('UPDATE timer SET running=0,started_at=NULL,elapsed=elapsed+? WHERE id=1',(seconds,))
                    # Segmento de sessão atribuído ao dia em que foi pausado
                    cr=c.execute('INSERT INTO time_sessions(day,seconds) VALUES (?,?)',(dt.date.today().isoformat(),seconds))
                    stamp(c,'session',cr.lastrowid)
                elif action=='reset':
                    if r['running']:
                        seconds=max(0,int(now-r['started_at']))
                        cr=c.execute('INSERT INTO time_sessions(day,seconds) VALUES (?,?)',(dt.date.today().isoformat(),seconds))
                        stamp(c,'session',cr.lastrowid)
                    c.execute('UPDATE timer SET running=0,started_at=NULL,elapsed=0 WHERE id=1')
                elif action not in ('start','pause','reset'): raise ValueError('Comando inválido')
                return dict(c.execute('SELECT * FROM timer WHERE id=1').fetchone())
        if path=='/api/backup/restore':
            if CLOUD.cfg.get('user_id'):
                raise ValueError('Para proteger a sincronização, a restauração direta de backup está desabilitada nesta instalação vinculada à nuvem. Faça uma cópia de segurança e siga o guia de migração.')
            raw=d.get('data') or ''
            m=re.fullmatch(r'data:application/(?:zip|x-zip-compressed|octet-stream);base64,([a-zA-Z0-9+/=\s]+)',raw)
            if not m: raise ValueError('Selecione um backup .zip válido')
            b=base64.b64decode(m.group(1), validate=True)
            if len(b)>100*1024*1024: raise ValueError('Backup grande demais')
            try: z=zipfile.ZipFile(io.BytesIO(b))
            except zipfile.BadZipFile: raise ValueError('Arquivo ZIP inválido')
            with z:
                if 'diario.sql' not in z.namelist(): raise ValueError('Este ZIP não é um backup do D_Trading')
                sql=z.read('diario.sql').decode('utf-8')
                if len(sql)>20*1024*1024: raise ValueError('Backup excede o limite')
                up={}
                for item in z.infolist():
                    if item.filename=='diario.sql': continue
                    if not re.fullmatch(r'uploads/[a-f0-9]{32}\.(png|jpg|webp|gif|pdf)',item.filename): raise ValueError('Arquivo não permitido no backup')
                    if item.file_size>50*1024*1024: raise ValueError('Arquivo anexado muito grande')
                    up[item.filename.split('/')[1]]=z.read(item)
            # Validar SQL em arquivo temporário antes de substituir
            tempdb=DATA/'_temp_import.db'
            if tempdb.exists(): tempdb.unlink()
            tc=sqlite3.connect(tempdb)
            try:
                tc.executescript(sql)
                for required in ('trades','accounts','strategies','books','timer','settings','time_sessions'):
                    tc.execute('SELECT 1 FROM '+required+' LIMIT 1')
                tc.close()
            except Exception:
                tc.close(); tempdb.unlink(missing_ok=True)
                raise ValueError('Banco de dados do backup é inválido')
            with db() as c: c.execute('PRAGMA wal_checkpoint(TRUNCATE)')
            shutil.copy2(DB,DATA/'backup_antes_restaurar.db')
            os.replace(tempdb,DB)
            for fname,content in up.items(): (UPLOADS/fname).write_bytes(content)
            init_db()
            with db() as c:
                c.execute('UPDATE sync_meta SET remote_revision=0,dirty=1,conflict=0,remote_copy=NULL')
                c.execute('DELETE FROM sync_uploaded')
            return {'ok':True, 'message':'Backup restaurado. A tela será atualizada.'}
        raise ValueError('Rota desconhecida')


def main():
    global CLOUD
    init_db()
    CLOUD=CloudController(DATA,connect,UPLOADS)
    threading.Thread(target=CLOUD.loop,daemon=True).start()
    port=PORT
    while True:
        try:
            server=ThreadingHTTPServer((LOCAL_HOST,port),Handler)
            break
        except OSError:
            port+=1
            if port>PORT+20: raise
    url=f'http://{LOCAL_HOST}:{port}'
    print('D_Trading Local iniciado:',url,flush=True)
    print('Dados mantidos na pasta:',DATA,flush=True)
    print('Para encerrar, feche esta janela ou pressione Ctrl+C.',flush=True)
    threading.Timer(1.1,lambda: webbrowser.open(url)).start()
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__=='__main__': main()