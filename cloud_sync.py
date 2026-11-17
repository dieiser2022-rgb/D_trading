"""D_Trading v1.1 — sincronização local-first via Supabase.

A base SQLite é a fonte de leitura para a interface. Cada alteração local marca um registro
como pendente; uma escrita condicional (revisão no Postgres) detecta edições concorrentes.
A conexão é apenas de saída, HTTPS. Sem rede o diário continua trabalhando normalmente.
"""
import base64
import ctypes
import ctypes.wintypes
import datetime as dt
import json
import mimetypes
import os
from pathlib import Path
from contextlib import contextmanager
import re
import sqlite3
import sys
import threading
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, quote, urlparse
from urllib.request import Request, urlopen

SYNC_NAMESPACE = uuid.UUID('c8a9a1ea-3771-4419-872a-b9b0b8f472ca')
TABLE = {'account':'accounts', 'strategy':'strategies', 'trade':'trades', 'book':'books', 'session':'time_sessions'}
KINDS = ('account','strategy','settings','book','session','trade')
SYNCABLE_SETTING_KEYS = ('preferences','profile','plan')
FILE_RE = re.compile(r'^/uploads/[a-f0-9]{32}\.(?:png|jpg|webp|gif|pdf)$')


def deterministic(kind, value):
    return str(uuid.uuid5(SYNC_NAMESPACE, f'{kind}:{value}'))


def migrate(c):
    """Idempotent upgrade of existing v1.0 SQLite files (never drops user records)."""
    for kind, table in TABLE.items():
        cols = [row[1] for row in c.execute('PRAGMA table_info('+table+')')]
        if 'sync_id' not in cols:
            c.execute('ALTER TABLE '+table+' ADD COLUMN sync_id TEXT')
        c.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_syncid ON {table}(sync_id)')
    c.execute('''CREATE TABLE IF NOT EXISTS sync_meta (
       kind TEXT NOT NULL, sync_id TEXT NOT NULL, remote_revision INTEGER NOT NULL DEFAULT 0,
       local_version INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 1,
       deleted INTEGER NOT NULL DEFAULT 0, conflict INTEGER NOT NULL DEFAULT 0,
       remote_copy TEXT, PRIMARY KEY(kind,sync_id))''')
    c.execute('''CREATE TABLE IF NOT EXISTS sync_uploaded (path TEXT PRIMARY KEY)''')
    # Migrated copies of the same v1 directory get the same IDs, avoiding duplicated history.
    for kind,table in TABLE.items():
        for row in c.execute(f'SELECT * FROM {table} WHERE sync_id IS NULL').fetchall():
            rid=row['id']
            if kind in ('account','strategy'):
                key=row['name'].strip().casefold()
            elif kind=='trade':
                key=f"{rid}|{row['created']}|{row['payload']}"
            elif kind=='book':
                key=f"{rid}|{row['created']}|{row['file']}"
            else:
                key=f"{rid}|{row['day']}|{row['seconds']}"
            uid=deterministic(kind,key)
            c.execute(f'UPDATE {table} SET sync_id=? WHERE id=?',(uid,rid))
    for kind,table in TABLE.items():
        c.execute('''INSERT OR IGNORE INTO sync_meta(kind,sync_id,dirty) SELECT ?,sync_id,1 FROM '''+table+' WHERE sync_id IS NOT NULL',(kind,))
    for key in SYNCABLE_SETTING_KEYS:
        if c.execute('SELECT 1 FROM settings WHERE key=?',(key,)).fetchone():
            c.execute('INSERT OR IGNORE INTO sync_meta(kind,sync_id,dirty) VALUES (?,?,1)',('settings',deterministic('settings',key)))


def stamp(c,kind,local_id=None,deleted=False,sync_id=None):
    if sync_id is None:
        if kind=='settings':
            sync_id=deterministic('settings',local_id)
        else:
            table=TABLE[kind]
            row=c.execute(f'SELECT sync_id FROM {table} WHERE id=?',(local_id,)).fetchone()
            if row is None: raise ValueError('Registro não encontrado ao marcar sincronização')
            sync_id=row['sync_id']
            if not sync_id:
                sync_id=str(uuid.uuid4())
                c.execute(f'UPDATE {table} SET sync_id=? WHERE id=?',(sync_id,local_id))
    c.execute('''INSERT INTO sync_meta(kind,sync_id,local_version,dirty,deleted,conflict,remote_copy)
       VALUES(?,?,1,1,?,0,NULL)
       ON CONFLICT(kind,sync_id) DO UPDATE SET
       local_version=local_version+1,dirty=1,deleted=excluded.deleted,
       conflict=0,remote_copy=NULL''',(kind,sync_id,int(deleted)))
    return sync_id


def as_payload(c,kind,sid):
    if kind=='settings':
        for key in SYNCABLE_SETTING_KEYS:
            if deterministic('settings',key)==sid:
                r=c.execute('SELECT value FROM settings WHERE key=?',(key,)).fetchone()
                return {'key':key,'value':json.loads(r['value'])} if r else None
        return None
    r=c.execute('SELECT * FROM '+TABLE[kind]+' WHERE sync_id=?',(sid,)).fetchone()
    if not r: return None
    if kind=='account': return {k:r[k] for k in ('name','kind','initial_capital','currency','created')}
    if kind=='strategy': return {'name':r['name']}
    if kind=='book': return {k:r[k] for k in ('title','file','current_page','page_count','created')}
    if kind=='session': return {'day':r['day'],'seconds':r['seconds']}
    if kind=='trade':
        p=json.loads(r['payload'])
        aid=p.pop('accountId',None)
        ref=c.execute('SELECT sync_id FROM accounts WHERE id=?',(aid,)).fetchone() if aid else None
        p['accountSyncId']=ref['sync_id'] if ref else None
        return {'payload':p,'created':r['created'],'updated':r['updated']}
    raise ValueError('Tipo desconhecido')


def refs(kind,data):
    paths=[]
    if kind=='trade': paths=data.get('payload',{}).get('images',[]) or []
    elif kind=='book': paths=[data.get('file')]
    elif kind=='settings' and data.get('key')=='profile': paths=[(data.get('value') or {}).get('avatar')]
    return sorted({v for v in paths if isinstance(v,str) and FILE_RE.fullmatch(v)})


def _unique_name(c,table,name,sid):
    existing=c.execute(f'SELECT sync_id FROM {table} WHERE name=?',(name,)).fetchone()
    if existing is None or existing['sync_id']==sid: return name
    # Never silently merge two distinct accounts with different capital/trade histories.
    base=name
    for i in range(1,500):
        candidate=f'{base} (sincronizada {i})'
        if not c.execute(f'SELECT 1 FROM {table} WHERE name=?',(candidate,)).fetchone(): return candidate
    raise ValueError('Não foi possível diferenciar nomes iguais')


def apply_remote(c, kind, sid, data, deleted):
    if kind=='settings':
        if deleted:
            # Don't delete local UI defaults for a removed cloud setting.
            return
        key=data.get('key')
        if key not in SYNCABLE_SETTING_KEYS or deterministic('settings',key)!=sid:
            raise ValueError('Configuração remota inválida')
        c.execute('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                  (key,json.dumps(data.get('value'),ensure_ascii=False)))
        return
    table=TABLE[kind]
    found=c.execute(f'SELECT id FROM {table} WHERE sync_id=?',(sid,)).fetchone()
    if deleted:
        if found: c.execute(f'DELETE FROM {table} WHERE sync_id=?',(sid,))
        return
    if kind=='account':
        name=_unique_name(c,table,data['name'],sid)
        vals=(name,data['kind'],float(data['initial_capital']),data['currency'],data.get('created') or dt.datetime.now().isoformat())
        if found: c.execute('UPDATE accounts SET name=?,kind=?,initial_capital=?,currency=?,created=? WHERE sync_id=?',(*vals,sid))
        else: c.execute('INSERT INTO accounts(name,kind,initial_capital,currency,created,sync_id) VALUES (?,?,?,?,?,?)',(*vals,sid))
    elif kind=='strategy':
        name=_unique_name(c,table,data['name'],sid)
        if found: c.execute('UPDATE strategies SET name=? WHERE sync_id=?',(name,sid))
        else: c.execute('INSERT INTO strategies(name,sync_id) VALUES (?,?)',(name,sid))
    elif kind=='book':
        vals=(data['title'],data['file'],int(data.get('current_page') or 1),int(data.get('page_count') or 0),data.get('created') or dt.datetime.now().isoformat())
        if found: c.execute('UPDATE books SET title=?,file=?,current_page=?,page_count=?,created=? WHERE sync_id=?',(*vals,sid))
        else: c.execute('INSERT INTO books(title,file,current_page,page_count,created,sync_id) VALUES (?,?,?,?,?,?)',(*vals,sid))
    elif kind=='session':
        vals=(data['day'],max(0,int(data['seconds'])))
        if found: c.execute('UPDATE time_sessions SET day=?,seconds=? WHERE sync_id=?',(*vals,sid))
        else: c.execute('INSERT INTO time_sessions(day,seconds,sync_id) VALUES (?,?,?)',(*vals,sid))
    elif kind=='trade':
        p=dict(data['payload'])
        uid=p.pop('accountSyncId',None)
        if uid:
            ref=c.execute('SELECT id FROM accounts WHERE sync_id=?',(uid,)).fetchone()
            if not ref: raise ValueError('Conta da operação ainda não foi sincronizada')
            p['accountId']=ref['id']
        else: p['accountId']=None
        vals=(json.dumps(p,ensure_ascii=False),data.get('created') or dt.datetime.now().isoformat(),data.get('updated') or dt.datetime.now().isoformat())
        if found: c.execute('UPDATE trades SET payload=?,created=?,updated=? WHERE sync_id=?',(*vals,sid))
        else: c.execute('INSERT INTO trades(payload,created,updated,sync_id) VALUES (?,?,?,?)',(*vals,sid))


class CloudError(Exception): pass
class CloudConflict(CloudError): pass


def _dpapi(data, decrypt=False):
    """Windows DPAPI: refresh token encrypted for the current Windows account."""
    if sys.platform != 'win32': raise CloudError('Gravação de sessão automática disponível apenas no Windows')
    class BLOB(ctypes.Structure):
        _fields_=[('cbData',ctypes.wintypes.DWORD),('pbData',ctypes.POINTER(ctypes.c_byte))]
    source=ctypes.create_string_buffer(data)
    src=BLOB(len(data),ctypes.cast(source,ctypes.POINTER(ctypes.c_byte)))
    dst=BLOB()
    fn=ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    args=(ctypes.byref(src),None,None,None,None,0,ctypes.byref(dst)) if decrypt else (ctypes.byref(src),None,None,None,None,0,ctypes.byref(dst))
    fn.restype=ctypes.wintypes.BOOL
    if not fn(*args): raise CloudError('Falha ao proteger credenciais com Windows DPAPI')
    try: return ctypes.string_at(dst.pbData,dst.cbData)
    finally:
        free=ctypes.windll.kernel32.LocalFree
        free.argtypes=[ctypes.c_void_p]; free.restype=ctypes.c_void_p
        free(ctypes.cast(dst.pbData,ctypes.c_void_p))


class CloudClient:
    def __init__(self, base_url, public_key, user_id=None, access=None, refresh=None, expires=0, secret_path=None):
        self.base=base_url.rstrip('/')
        host=urlparse(self.base)
        if host.scheme!='https' or not (host.hostname or '').endswith('.supabase.co') or host.username or host.password or host.path not in ('','/'):
            raise CloudError('Informe a URL HTTPS do projeto, terminando em .supabase.co')
        if not re.fullmatch(r'(?:sb_publishable_[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9._-]+)',public_key or ''):
            raise CloudError('Use a chave publishable (pública) do Supabase; nunca a service_role/secret')
        self.key=public_key
        self.user_id=user_id
        self.access=access
        self.refresh_token=refresh
        self.expires=expires
        self.secret_path=secret_path
        self.lock=threading.RLock()

    def request(self, method, path, body=None, auth=True, raw=False, ctype='application/json', extra=None):
        with self.lock:
            if auth: self.ensure_auth()
            headers={'apikey':self.key,'Accept':'*/*' if raw else 'application/json'}
            if auth: headers['Authorization']='Bearer '+self.access
            if body is not None: headers['Content-Type']=ctype
            if extra: headers.update(extra)
            if isinstance(body,(dict,list)): body=json.dumps(body,ensure_ascii=False).encode('utf8')
            req=Request(self.base+path,method=method,data=body,headers=headers)
            try:
                with urlopen(req,timeout=25) as res:
                    content=res.read()
                    if raw:return content
                    return json.loads(content.decode('utf8')) if content else None
            except HTTPError as e:
                message=e.read(2048).decode('utf8','replace')
                try: message=json.loads(message).get('message') or json.loads(message).get('error_description') or message
                except (ValueError,TypeError): pass
                if 'SYNC_CONFLICT' in str(message) or e.code==409: raise CloudConflict('O registro mudou em outro computador') from e
                raise CloudError(f'Erro da nuvem ({e.code}): {message}') from e
            except (URLError,TimeoutError,OSError) as e:
                raise CloudError(f'Sem conexão com o Supabase: {str(e)[:120]}') from e

    def login(self,email,password):
        data=self.request('POST','/auth/v1/token?grant_type=password',{'email':email,'password':password},auth=False)
        if not data or not data.get('access_token') or not data.get('user',{}).get('id'):
            raise CloudError('Login não retornou sessão válida')
        self.set_tokens(data)
        return {'user_id':self.user_id,'email':data.get('user',{}).get('email') or email}

    def register(self,email,password):
        return self.request('POST','/auth/v1/signup',{'email':email,'password':password},auth=False)

    def set_tokens(self,data):
        self.access=data['access_token']; self.refresh_token=data['refresh_token']; self.expires=time.time()+int(data.get('expires_in',3600))-90
        if data.get('user',{}).get('id'): self.user_id=data['user']['id']
        self.save_secret()

    def save_secret(self):
        if not self.secret_path or not self.refresh_token or sys.platform!='win32':return
        enc=_dpapi(self.refresh_token.encode('utf8'))
        tmp=Path(str(self.secret_path)+'.tmp')
        tmp.write_bytes(base64.b64encode(enc));tmp.replace(self.secret_path)

    def ensure_auth(self):
        if self.access and time.time()<self.expires:return
        if not self.refresh_token: raise CloudError('Faça login para ativar a sincronização')
        data=self.request('POST','/auth/v1/token?grant_type=refresh_token',{'refresh_token':self.refresh_token},auth=False)
        self.set_tokens(data)

    def list_records(self):
        out=[]; offset=0
        while True:
            q=urlencode({'select':'kind,record_id,data,deleted,revision','order':'kind.asc,record_id.asc','limit':'500','offset':str(offset)})
            rows=self.request('GET','/rest/v1/dtrading_sync?'+q)
            out.extend(rows)
            if len(rows)<500:break
            offset+=500
            if offset>200000:raise CloudError('A sincronização excedeu o limite de registros')
        return out

    def write_record(self,kind,sid,data,deleted,expected):
        resp=self.request('POST','/rest/v1/rpc/dtrading_write',{'p_kind':kind,'p_record_id':sid,'p_data':data,'p_deleted':bool(deleted),'p_expected_revision':int(expected)})
        return int(resp)

    def upload(self,path,binary):
        name=path.split('/')[-1]
        dest=quote(self.user_id,safe='')+'/'+quote(name,safe='')
        self.request('POST','/storage/v1/object/dtrading-private/'+dest,binary,ctype=mimetypes.guess_type(name)[0] or 'application/octet-stream',extra={'x-upsert':'false'})

    def download(self,path):
        name=path.split('/')[-1]
        dest=quote(self.user_id,safe='')+'/'+quote(name,safe='')
        return self.request('GET','/storage/v1/object/authenticated/dtrading-private/'+dest,raw=True)


class SyncEngine:
    def __init__(self, conn_factory, uploads):
        self.connect=conn_factory
        self.uploads=Path(uploads)
        self.lock=threading.Lock()
        self.last_sync=None
        self.last_error=''
        self.data_version=0

    @contextmanager
    def _conn(self):
        conn=self.connect()
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def state(self):
        with self._conn() as c:
            pending=c.execute('SELECT count(*) FROM sync_meta WHERE dirty=1 AND conflict=0').fetchone()[0]
            conflicts=c.execute('SELECT count(*) FROM sync_meta WHERE conflict=1').fetchone()[0]
            files_missing=0
            return {'pending':pending,'conflicts':conflicts,'last_sync':self.last_sync,'last_error':self.last_error,'data_version':self.data_version}

    def _file_push(self,client,kind,data):
        for path in refs(kind,data):
            with self._conn() as c:
                if c.execute('SELECT 1 FROM sync_uploaded WHERE path=?',(path,)).fetchone():continue
            fp=self.uploads/path.split('/')[-1]
            if not fp.exists():raise CloudError(f'Anexo não encontrado neste computador: {fp.name}')
            try:client.upload(path,fp.read_bytes())
            except CloudConflict:pass # Already exists (e.g. copied installation).
            except CloudError as e:
                if not any(s in str(e).lower() for s in ('resource already exists','asset already exists','duplicate')): raise
            with self._conn() as c:c.execute('INSERT OR IGNORE INTO sync_uploaded(path) VALUES (?)',(path,))

    def _file_pull(self,client,kind,data):
        for path in refs(kind,data):
            fp=self.uploads/path.split('/')[-1]
            if fp.is_file(): continue
            b=client.download(path)
            if len(b)>52*1024*1024:raise CloudError('Anexo remoto excede o limite permitido')
            tmp=self.uploads/('_download_'+uuid.uuid4().hex)
            tmp.write_bytes(b);tmp.replace(fp)
            with self._conn() as c:c.execute('INSERT OR IGNORE INTO sync_uploaded(path) VALUES (?)',(path,))

    def pull(self,client):
        remote=client.list_records()
        # Account foreign keys must exist before trades.
        remote.sort(key=lambda r: (KINDS.index(r['kind']) if r['kind'] in KINDS else 99,r['record_id']))
        for r in remote:
            kind,sid=r['kind'],r['record_id']
            if kind not in KINDS:continue
            revision=int(r['revision']); data=r['data'] or {}; deleted=bool(r['deleted'])
            with self._conn() as c:
                m=c.execute('SELECT * FROM sync_meta WHERE kind=? AND sync_id=?',(kind,sid)).fetchone()
                if m and revision<=m['remote_revision'] and not m['conflict']:continue
                if m and m['dirty']:
                    if m['remote_revision']==revision:continue
                    local=as_payload(c,kind,sid) if not m['deleted'] else None
                    if bool(m['deleted'])==deleted and (deleted or local==data):
                        c.execute('UPDATE sync_meta SET remote_revision=?,dirty=0,conflict=0,remote_copy=NULL WHERE kind=? AND sync_id=?',(revision,kind,sid))
                        continue
                    c.execute('''UPDATE sync_meta SET conflict=1, remote_copy=? WHERE kind=? AND sync_id=?''',
                              (json.dumps({'kind':kind,'record_id':sid,'data':data,'deleted':deleted,'revision':revision},ensure_ascii=False),kind,sid))
                    continue
                # Do not remove an account still referenced by local trades (perhaps
                # recorded offline while the other computer deleted the account).
                if kind=='account' and deleted:
                    account=c.execute('SELECT id FROM accounts WHERE sync_id=?',(sid,)).fetchone()
                    if account:
                        used=any(json.loads(x['payload']).get('accountId')==account['id']
                                 for x in c.execute('SELECT payload FROM trades').fetchall())
                        if used:
                            c.execute('''INSERT INTO sync_meta(kind,sync_id,dirty,conflict,remote_copy)
                              VALUES(?,?,1,1,?) ON CONFLICT(kind,sync_id) DO UPDATE SET
                              dirty=1,conflict=1,remote_copy=excluded.remote_copy''',
                              (kind,sid,json.dumps({'kind':kind,'record_id':sid,'data':data,'deleted':deleted,'revision':revision})))
                            continue
                if m and m['conflict']:
                    c.execute('UPDATE sync_meta SET remote_copy=? WHERE kind=? AND sync_id=?',
                              (json.dumps({'kind':kind,'record_id':sid,'data':data,'deleted':deleted,'revision':revision},ensure_ascii=False),kind,sid))
                    continue
            if not deleted:self._file_pull(client,kind,data)
            with self._conn() as c:
                # State could have changed while downloading.
                m=c.execute('SELECT * FROM sync_meta WHERE kind=? AND sync_id=?',(kind,sid)).fetchone()
                if m and (m['dirty'] or m['conflict']):continue
                apply_remote(c,kind,sid,data,deleted)
                c.execute('''INSERT INTO sync_meta(kind,sync_id,dirty,deleted,remote_revision)
                  VALUES(?,?,0,?,?) ON CONFLICT(kind,sync_id) DO UPDATE SET dirty=0,deleted=excluded.deleted,
                  remote_revision=excluded.remote_revision,conflict=0,remote_copy=NULL''',(kind,sid,int(deleted),revision))
            self.data_version+=1

    def push(self,client):
        with self._conn() as c:
            pending=c.execute('SELECT * FROM sync_meta WHERE dirty=1 AND conflict=0 ORDER BY CASE kind WHEN \'account\' THEN 1 WHEN \'strategy\' THEN 2 WHEN \'settings\' THEN 3 WHEN \'book\' THEN 4 WHEN \'session\' THEN 5 ELSE 6 END, rowid').fetchall()
            items=[dict(r) for r in pending]
        for m in items:
            kind,sid=m['kind'],m['sync_id']
            with self._conn() as c:
                current=c.execute('SELECT * FROM sync_meta WHERE kind=? AND sync_id=?',(kind,sid)).fetchone()
                if not current or not current['dirty'] or current['conflict']:continue
                version=current['local_version'];expected=current['remote_revision'];deleted=bool(current['deleted'])
                data=as_payload(c,kind,sid) if not deleted else {}
                if data is None and not deleted:continue
            if not deleted:self._file_push(client,kind,data)
            try: rev=client.write_record(kind,sid,data,deleted,expected)
            except CloudConflict:
                # Fetch latest remote on next pull for a user-visible conflict.
                self.pull(client)
                continue
            with self._conn() as c:
                current=c.execute('SELECT local_version FROM sync_meta WHERE kind=? AND sync_id=?',(kind,sid)).fetchone()
                if current:
                    if current['local_version']==version:
                        c.execute('UPDATE sync_meta SET dirty=0,conflict=0,remote_copy=NULL,remote_revision=? WHERE kind=? AND sync_id=?',(rev,kind,sid))
                    else:
                        c.execute('UPDATE sync_meta SET remote_revision=? WHERE kind=? AND sync_id=?',(rev,kind,sid))

    def synchronize(self,client):
        if not self.lock.acquire(blocking=False):return self.state()
        try:
            self.pull(client)
            self.push(client)
            self.pull(client)
            self.last_sync=dt.datetime.now().isoformat(timespec='seconds')
            self.last_error=''
        except Exception as e:
            self.last_error=str(e)[:320]
        finally:self.lock.release()
        return self.state()

    def conflicts(self):
        with self._conn() as c:
            rs=c.execute('SELECT kind,sync_id,remote_copy FROM sync_meta WHERE conflict=1 ORDER BY kind LIMIT 50').fetchall()
            ret=[]
            for r in rs:
                local=as_payload(c,r['kind'],r['sync_id'])
                remote=json.loads(r['remote_copy']) if r['remote_copy'] else {}
                ret.append({'kind':r['kind'],'sync_id':r['sync_id'],'local':local,'remote':remote})
            return ret

    def resolve(self,client,kind,sid,choice):
        if kind not in KINDS or choice not in ('local','cloud'):raise ValueError('Opção inválida')
        with self._conn() as c:
            m=c.execute('SELECT * FROM sync_meta WHERE kind=? AND sync_id=?',(kind,sid)).fetchone()
            if not m or not m['conflict'] or not m['remote_copy']:raise ValueError('Conflito não encontrado')
            remote=json.loads(m['remote_copy'])
        if choice=='cloud' and remote['deleted'] and kind=='account':
            with self._conn() as c:
                account=c.execute('SELECT id FROM accounts WHERE sync_id=?',(sid,)).fetchone()
                if account and any(json.loads(x['payload']).get('accountId')==account['id'] for x in c.execute('SELECT payload FROM trades')):
                    raise ValueError('Há operações vinculadas à conta neste computador. Para manter esses trades, escolha Manter minha versão local.')
        if choice=='cloud' and not remote['deleted']:
            self._file_pull(client,kind,remote['data'])
        with self._conn() as c:
            m=c.execute('SELECT * FROM sync_meta WHERE kind=? AND sync_id=?',(kind,sid)).fetchone()
            if not m or not m['conflict']:raise ValueError('Conflito já resolvido')
            if choice=='cloud':
                apply_remote(c,kind,sid,remote['data'],bool(remote['deleted']))
                c.execute('UPDATE sync_meta SET dirty=0,deleted=?,remote_revision=?,conflict=0,remote_copy=NULL WHERE kind=? AND sync_id=?',
                          (int(remote['deleted']),int(remote['revision']),kind,sid))
            else:
                # Intentional overwrite, but still uses revision-based compare-and-swap.
                c.execute('UPDATE sync_meta SET remote_revision=?,conflict=0,remote_copy=NULL,dirty=1 WHERE kind=? AND sync_id=?',
                          (int(remote['revision']),kind,sid))


class CloudController:
    def __init__(self,data_dir,db_factory,uploads):
        self.data=Path(data_dir)
        self.cfg_path=self.data/'cloud_config.json'
        self.token_path=self.data/'.cloud_session'
        self.engine=SyncEngine(db_factory,uploads)
        self.client=None
        self.cfg={}
        self.slock=threading.RLock()
        self.load()

    def load(self):
        if not self.cfg_path.exists():return
        try:
            self.cfg=json.loads(self.cfg_path.read_text('utf8'))
            refresh=None
            if self.token_path.exists() and sys.platform=='win32':
                refresh=_dpapi(base64.b64decode(self.token_path.read_bytes())).decode('utf8')
            self.client=CloudClient(self.cfg['url'],self.cfg['key'],self.cfg.get('user_id'),refresh=refresh,secret_path=self.token_path)
        except Exception as e:
            self.engine.last_error='Não foi possível abrir a sessão segura: '+str(e)

    def save_config(self):
        temp=Path(str(self.cfg_path)+'.tmp')
        temp.write_text(json.dumps(self.cfg,ensure_ascii=False,indent=2),'utf8')
        os.chmod(temp,0o600)
        temp.replace(self.cfg_path)

    def login(self,url,key,email,password):
        client=CloudClient(url,key)
        auth=client.login(email,password)
        with self.slock:
            previous=self.cfg.get('user_id')
            if previous and auth['user_id']!=previous:
                raise CloudError('Este banco local já pertence a outro usuário da nuvem. Use a mesma conta para evitar mistura de dados.')
            client.secret_path=self.token_path
            client.save_secret()
            self.cfg={'url':client.base,'key':key,'user_id':auth['user_id'],'email':auth['email']}
            self.save_config()
            self.client=client
        return self.status()

    def register(self,url,key,email,password):
        client=CloudClient(url,key)
        return client.register(email,password)

    def logout(self):
        with self.slock:
            if self.client:self.client.access=None;self.client.refresh_token=None
            if self.token_path.exists():self.token_path.unlink()
        return self.status()

    def status(self):
        info=self.engine.state()
        info.update({'configured':bool(self.cfg),'signed_in':bool(self.client and (self.client.access or self.client.refresh_token)),
                     'email':self.cfg.get('email',''), 'url':self.cfg.get('url',''),
                     'online':bool(self.engine.last_sync and not self.engine.last_error)})
        return info

    def sync(self):
        client=self.client
        if not client or not (client.access or client.refresh_token):
            return self.status()
        self.engine.synchronize(client)
        return self.status()

    def resolve(self,kind,sid,choice):
        if not self.client or not (self.client.access or self.client.refresh_token):
            raise CloudError('Entre na nuvem antes de resolver conflitos')
        self.engine.resolve(self.client,kind,sid,choice)
        return self.sync()

    def loop(self):
        while True:
            time.sleep(20)
            if self.client and (self.client.access or self.client.refresh_token):self.sync()
