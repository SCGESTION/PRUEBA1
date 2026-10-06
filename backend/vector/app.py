from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta, timezone
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from typing import Annotated
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from .db import connect, data_dir, init_db, ROOT
from .models import Login, Register, WorkoutInput, ChallengeInput, ReviewInput, EventInput, RentalInput, RentalStatus, BoxInput, BoxType
from .security import current_user, require_user, hash_password, verify_password, token_hash, user_dict, USER_SQL, SESSION_TTL, check_login_limit, record_login_failure
from .seed import now_iso, seed_equipment

TRACKS=[{'id':'forge','name':'Vector Forge','description':'Fuerza, técnica y CrossFit.'},{'id':'apex','name':'Vector Apex','description':'Carrera, resistencia y entrenamiento híbrido.'}]
_analysis_lock=threading.Lock()
MAX_VIDEO_BYTES=100*1024*1024

def ai_status():
    try:
        from .pose import ai_status as status
        return status()
    except ImportError:
        return {'available':False,'detail':'El análisis Pose no está instalado. Los vídeos requieren revisión humana.'}

@asynccontextmanager
async def lifespan(app):
    init_db()
    seed_equipment()
    for variable,folder in [('YOLO_CONFIG_DIR','.ultralytics'),('MPLCONFIGDIR','.matplotlib')]:
        location=data_dir()/folder
        location.mkdir(exist_ok=True)
        os.environ.setdefault(variable,str(location))
    with connect() as c:
        c.execute("UPDATE submissions SET status='review',analysis_note='El procesamiento se interrumpió al reiniciar. Revisión humana necesaria.' WHERE status IN ('queued','processing')")
        c.execute('DELETE FROM sessions WHERE expires_at<?',(time.time(),))
    yield

app=FastAPI(title='Vector API',version='0.1.0',lifespan=lifespan)

@app.middleware('http')
async def security_headers(request:Request,call_next):
    if request.method not in ('GET','HEAD','OPTIONS'):
        origin=request.headers.get('origin')
        allowed=set(os.environ.get('VECTOR_ALLOWED_ORIGINS','http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000').split(','))
        if origin and origin not in allowed:
            return JSONResponse({'detail':'Origen de la solicitud no permitido.'},status_code=403)
    if request.url.path.startswith('/api/'):
        length=request.headers.get('content-length')
        if length and (not length.isdigit() or int(length)>MAX_VIDEO_BYTES+5*1024*1024):
            return JSONResponse({'detail':'El vídeo no puede superar 100 MB.'},status_code=413)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['X-Frame-Options']='DENY'
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control']='no-store'
    return response

@app.exception_handler(RequestValidationError)
async def input_error(request,exc):
    # Do not echo input objects: login validation errors could otherwise expose passwords.
    fields=[]
    for err in exc.errors():
        label='.'.join(str(x) for x in err['loc'] if x!='body')
        fields.append(f"{label}: {err['msg']}")
    return JSONResponse({'detail':'Revisa el formulario. '+'; '.join(fields)},status_code=422)

@app.exception_handler(sqlite3.IntegrityError)
async def constraint_error(request,exc):
    return JSONResponse({'detail':'Los datos ya existen o una relación no es válida.'},status_code=409)

def row_or_404(c,sql,args=(),message='No se ha encontrado el recurso.'):
    row=c.execute(sql,args).fetchone()
    if not row:
        raise HTTPException(404,message)
    return dict(row)

def boxes_list(c):
    return [dict(r) for r in c.execute("SELECT b.*, (SELECT COUNT(*) FROM users u WHERE u.box_id=b.id AND u.role='athlete') athletes FROM boxes b ORDER BY b.name")]

@app.get('/api/health')
def health():
    with connect() as c:
        c.execute('SELECT 1').fetchone()
    return {'status':'ok','database':'ok','ai':ai_status()}

@app.get('/api/bootstrap')
def bootstrap(request:Request):
    with connect() as c:
        demo=bool(c.execute("SELECT 1 FROM settings WHERE key='demo' AND value='1'").fetchone())
        boxes=boxes_list(c)
    return {'demo':demo,'user':current_user(request),'tracks':TRACKS,'boxes':boxes}

def new_session(c,user_id,response):
    token=secrets.token_urlsafe(32)
    c.execute('DELETE FROM sessions WHERE expires_at<?',(time.time(),))
    c.execute('INSERT INTO sessions VALUES (?,?,?)',(token_hash(token),user_id,time.time()+SESSION_TTL))
    response.set_cookie('vector_session',token,max_age=SESSION_TTL,httponly=True,secure=os.environ.get('VECTOR_COOKIE_SECURE','false').lower()=='true',samesite='lax',path='/')

@app.post('/api/auth/login')
def login(body:Login,request:Request,response:Response):
    key=f"{request.client.host if request.client else 'unknown'}:{body.email.lower()}"
    check_login_limit(key)
    with connect() as c:
        user=c.execute(USER_SQL+' WHERE u.email=?',(body.email.lower(),)).fetchone()
        if not user or not verify_password(body.password,user['password_hash']):
            record_login_failure(key)
            raise HTTPException(401,'Email o contraseña incorrectos.')
        old=request.cookies.get('vector_session')
        if old:
            c.execute('DELETE FROM sessions WHERE token_hash=?',(token_hash(old),))
        new_session(c,user['id'],response)
        return user_dict(user)

@app.post('/api/auth/logout')
def logout(request:Request,response:Response):
    token=request.cookies.get('vector_session')
    if token:
        with connect() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?',(token_hash(token),))
    response.delete_cookie('vector_session',path='/')
    return {'ok':True}

@app.post('/api/auth/register',status_code=201)
def register(body:Register,response:Response):
    with connect() as c:
        if body.box_id:
            row_or_404(c,'SELECT id FROM boxes WHERE id=?',(body.box_id,),'Selecciona un box válido.')
        uid=c.execute("INSERT INTO users(name,email,password_hash,role,box_id,created_at) VALUES (?,?,?,'athlete',?,?)",(body.name,body.email,hash_password(body.password),body.box_id,now_iso())).lastrowid
        new_session(c,uid,response)
        return user_dict(c.execute(USER_SQL+' WHERE u.id=?',(uid,)).fetchone())

@app.get('/api/boxes')
def get_boxes():
    with connect() as c:
        return boxes_list(c)

@app.post('/api/boxes',status_code=201)
def create_box(body:BoxInput,request:Request):
    require_user(request,'admin')
    with connect() as c:
        bid=c.execute('INSERT INTO boxes(name,city,type,created_at) VALUES (?,?,?,?)',(body.name,body.city,body.type,now_iso())).lastrowid
        c.execute("INSERT INTO users(name,email,password_hash,role,box_id,created_at) VALUES (?,?,?,'box_owner',?,?)",(body.owner_name,body.owner_email,hash_password(body.owner_password),bid,now_iso()))
        return next(b for b in boxes_list(c) if b['id']==bid)

@app.patch('/api/boxes/{bid}')
def box_type(bid:int,body:BoxType,request:Request):
    require_user(request,'admin')
    with connect() as c:
        row_or_404(c,'SELECT id FROM boxes WHERE id=?',(bid,))
        c.execute('UPDATE boxes SET type=? WHERE id=?',(body.type,bid))
        return next(b for b in boxes_list(c) if b['id']==bid)

WORKOUT_SQL='SELECT w.*,u.name author_name,b.name box_name FROM workouts w JOIN users u ON u.id=w.author_id LEFT JOIN boxes b ON b.id=w.box_id'

def workout_dict(c,row):
    result=dict(row)
    result['exercises']=[dict(r) for r in c.execute('SELECT movement,reps,load_kg FROM workout_exercises WHERE workout_id=? ORDER BY position',(row['id'],))]
    return result

def visible_workout(user,w):
    return w['scope']=='vector' or user['role']=='admin' or (user['box_id'] is not None and user['box_id']==w['box_id'])

@app.get('/api/workouts')
def workouts(request:Request,track:str|None=None,scope:str|None=None):
    user=require_user(request)
    with connect() as c:
        rows=c.execute(WORKOUT_SQL+' ORDER BY w.scheduled_date,w.id').fetchall()
        return [workout_dict(c,r) for r in rows if visible_workout(user,r) and (not track or r['track']==track) and (not scope or r['scope']==scope)]

@app.post('/api/workouts',status_code=201)
def create_workout(body:WorkoutInput,request:Request):
    user=require_user(request,'admin','box_owner')
    box=body.box_id
    if user['role']=='box_owner':
        if body.scope!='box' or (box is not None and box!=user['box_id']):
            raise HTTPException(403,'Un box solo puede publicar sus entrenamientos diarios.')
        box=user['box_id']
    elif body.scope=='vector':
        box=None
    elif box is None:
        raise HTTPException(422,'Selecciona el box de este entrenamiento.')
    with connect() as c:
        if box:
            row_or_404(c,'SELECT id FROM boxes WHERE id=?',(box,))
        wid=c.execute('INSERT INTO workouts(title,track,scope,box_id,scheduled_date,format,duration_minutes,level,notes,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',(body.title,body.track.value,body.scope,box,body.scheduled_date.isoformat(),body.format,body.duration_minutes,body.level,body.notes,user['id'],now_iso())).lastrowid
        c.executemany('INSERT INTO workout_exercises(workout_id,position,movement,reps,load_kg) VALUES (?,?,?,?,?)',[(wid,i,e.movement,e.reps,e.load_kg) for i,e in enumerate(body.exercises)])
        return workout_dict(c,c.execute(WORKOUT_SQL+' WHERE w.id=?',(wid,)).fetchone())

@app.post('/api/workouts/{wid}/complete')
def complete_workout(wid:int,request:Request):
    user=require_user(request,'athlete')
    with connect() as c:
        w=row_or_404(c,'SELECT * FROM workouts WHERE id=?',(wid,))
        if not visible_workout(user,w):
            raise HTTPException(403,'Este entrenamiento pertenece a otro box.')
        c.execute('INSERT OR IGNORE INTO completions VALUES (?,?,?)',(user['id'],wid,now_iso()))
    return {'ok':True}

def challenge_status(row):
    now=datetime.now(timezone.utc)
    return 'upcoming' if now<datetime.fromisoformat(row['opens_at']) else 'closed' if now>datetime.fromisoformat(row['closes_at']) else 'open'

def challenge_dict(c,row,user):
    result=dict(row)
    result.update(status=challenge_status(row),box_count=c.execute('SELECT COUNT(*) FROM challenge_boxes WHERE challenge_id=?',(row['id'],)).fetchone()[0],submission_count=c.execute('SELECT COUNT(*) FROM submissions WHERE challenge_id=?',(row['id'],)).fetchone()[0],enrolled=bool(user['box_id'] and c.execute('SELECT 1 FROM challenge_boxes WHERE challenge_id=? AND box_id=?',(row['id'],user['box_id'])).fetchone()))
    return result

@app.get('/api/challenges')
def challenges(request:Request):
    user=require_user(request)
    with connect() as c:
        return [challenge_dict(c,r,user) for r in c.execute('SELECT * FROM challenges ORDER BY opens_at DESC')]

@app.post('/api/challenges',status_code=201)
def create_challenge(body:ChallengeInput,request:Request):
    user=require_user(request,'admin')
    with connect() as c:
        cid=c.execute('INSERT INTO challenges(title,track,movement,target_reps,opens_at,closes_at,description,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',(body.title,body.track.value,body.movement,body.target_reps,body.opens_at.isoformat(),body.closes_at.isoformat(),body.description,user['id'],now_iso())).lastrowid
        return challenge_dict(c,c.execute('SELECT * FROM challenges WHERE id=?',(cid,)).fetchone(),user)

@app.post('/api/challenges/{cid}/enroll')
def enroll_challenge(cid:int,request:Request):
    user=require_user(request,'box_owner')
    with connect() as c:
        challenge=row_or_404(c,'SELECT * FROM challenges WHERE id=?',(cid,))
        if challenge_status(challenge)=='closed':
            raise HTTPException(409,'El plazo del reto ha finalizado.')
        c.execute('INSERT OR IGNORE INTO challenge_boxes VALUES (?,?,?)',(cid,user['box_id'],now_iso()))
    return {'ok':True}

@app.get('/api/challenges/{cid}/leaderboard')
def leaderboard(cid:int,request:Request):
    require_user(request)
    with connect() as c:
        row_or_404(c,'SELECT id FROM challenges WHERE id=?',(cid,))
        rows=c.execute("SELECT s.*,u.name athlete_name,b.name box_name,b.type box_type FROM submissions s JOIN users u ON u.id=s.athlete_id LEFT JOIN boxes b ON b.id=s.box_id WHERE s.challenge_id=? AND s.status='approved' ORDER BY s.time_seconds,s.created_at,s.id",(cid,)).fetchall()
        seen=set()
        athletes=[]
        teams={}
        for r in rows:
            if r['athlete_id'] in seen:
                continue
            seen.add(r['athlete_id'])
            athletes.append({'rank':len(athletes)+1,'athlete_name':r['athlete_name'],'box_name':r['box_name'],'box_type':r['box_type'],'time_seconds':r['time_seconds'],'reps':r['reps'],'submission_id':r['id']})
            if r['box_id']:
                team=teams.setdefault(r['box_id'],{'box_name':r['box_name'],'box_type':r['box_type'],'athletes':0,'best_seconds':r['time_seconds']})
                team['athletes']+=1
        boxes=sorted(teams.values(),key=lambda x:(x['best_seconds'],x['box_name']))
        return {'athletes':athletes,'boxes':[dict(rank=i+1,**b) for i,b in enumerate(boxes)]}

SUBMISSION_SQL='SELECT s.*,c.title challenge_title,u.name athlete_name,b.name box_name FROM submissions s JOIN challenges c ON c.id=s.challenge_id JOIN users u ON u.id=s.athlete_id LEFT JOIN boxes b ON b.id=s.box_id'

def submission_dict(row):
    result={k:row[k] for k in ('id','challenge_id','challenge_title','athlete_name','box_name','status','reps','time_seconds','confidence','analysis_note','created_at')}
    result['video_url']=f"/api/submissions/{row['id']}/video"
    return result

def can_view_submission(user,row):
    return user['role']=='admin' or (user['role']=='athlete' and user['id']==row['athlete_id']) or (user['role']=='box_owner' and user['box_id']==row['box_id'])

def process_video(sid:int,path:str,target:int):
    with _analysis_lock:
        with connect() as c:
            c.execute("UPDATE submissions SET status='processing' WHERE id=? AND status='queued'",(sid,))
        try:
            from .pose import analyze_video, PoseUnavailable
            try:
                analysis=analyze_video(path,target)
                reps=analysis['reps']
                seconds=analysis['time_seconds']
                confidence=analysis['confidence']
                note=analysis['analysis_note']+' Recuento orientativo; requiere revisión humana antes de publicar.'
            except PoseUnavailable as e:
                reps=seconds=confidence=None
                note=f'Análisis automático no disponible: {e}. Revisión humana necesaria.'
            with connect() as c:
                c.execute("UPDATE submissions SET status='review',reps=?,time_seconds=?,confidence=?,analysis_note=? WHERE id=? AND status='processing'",(reps,seconds,confidence,note,sid))
        except Exception:
            # Error details belong in server logs, never expose paths or infer successful analysis.
            import logging
            logging.getLogger('vector').exception('Video analysis failed for submission %s',sid)
            with connect() as c:
                c.execute("UPDATE submissions SET status='failed',analysis_note='No se pudo analizar el vídeo. El administrador puede revisarlo manualmente.' WHERE id=? AND status='processing'",(sid,))

@app.post('/api/challenges/{cid}/submissions',status_code=201)
async def upload_submission(cid:int,request:Request,background:BackgroundTasks,video:Annotated[UploadFile,File()],consent:Annotated[str,Form()]):
    user=require_user(request,'athlete')
    if consent!='true':
        raise HTTPException(422,'Debes autorizar el análisis del vídeo y su revisión por Vector y tu box.')
    with connect() as c:
        challenge=row_or_404(c,'SELECT * FROM challenges WHERE id=?',(cid,))
        if challenge_status(challenge)!='open':
            raise HTTPException(409,'El reto no está abierto para recibir vídeos.')
        if user['box_id'] and not c.execute('SELECT 1 FROM challenge_boxes WHERE challenge_id=? AND box_id=?',(cid,user['box_id'])).fetchone():
            raise HTTPException(403,'Tu box debe inscribirse en el reto antes de enviar resultados.')
    ext=Path(video.filename or '').suffix.lower()
    if ext not in ('.mp4','.mov','.webm'):
        raise HTTPException(422,'Sube un vídeo MP4, MOV o WebM de hasta 100 MB.')
    first=await video.read(4096)
    if len(first)>MAX_VIDEO_BYTES:
        await video.close()
        raise HTTPException(413,'El vídeo no puede superar 100 MB.')
    valid=(ext in ('.mp4','.mov') and len(first)>=12 and first[4:8]==b'ftyp') or (ext=='.webm' and first[:4]==b'\x1a\x45\xdf\xa3')
    if not valid:
        raise HTTPException(422,'El archivo no tiene una cabecera de vídeo válida.')
    path=data_dir()/'videos'/(secrets.token_hex(20)+ext)
    size=len(first)
    try:
        with path.open('xb') as out:
            out.write(first)
            while chunk:=await video.read(1024*1024):
                size+=len(chunk)
                if size>MAX_VIDEO_BYTES:
                    raise HTTPException(413,'El vídeo no puede superar 100 MB.')
                out.write(chunk)
        with connect() as c:
            sid=c.execute("INSERT INTO submissions(challenge_id,athlete_id,box_id,status,video_path,consent_at,created_at) VALUES (?,?,?,'queued',?,?,?)",(cid,user['id'],user['box_id'],path.name,now_iso(),now_iso())).lastrowid
            result=submission_dict(c.execute(SUBMISSION_SQL+' WHERE s.id=?',(sid,)).fetchone())
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    finally:
        await video.close()
    background.add_task(process_video,sid,str(path),challenge['target_reps'])
    return result

@app.get('/api/submissions')
def submissions(request:Request):
    user=require_user(request)
    with connect() as c:
        return [submission_dict(r) for r in c.execute(SUBMISSION_SQL+' ORDER BY s.created_at DESC') if can_view_submission(user,r)]

@app.get('/api/submissions/{sid}')
def get_submission(sid:int,request:Request):
    user=require_user(request)
    with connect() as c:
        row=row_or_404(c,SUBMISSION_SQL+' WHERE s.id=?',(sid,))
        if not can_view_submission(user,row):
            raise HTTPException(403,'Este vídeo no pertenece a tu perfil.')
        return submission_dict(row)

@app.get('/api/submissions/{sid}/video')
def submission_video(sid:int,request:Request):
    user=require_user(request)
    with connect() as c:
        row=row_or_404(c,'SELECT * FROM submissions WHERE id=?',(sid,))
        if not can_view_submission(user,row):
            raise HTTPException(403,'No puedes acceder a este vídeo.')
    path=data_dir()/'videos'/row['video_path']
    if not path.is_file():
        raise HTTPException(404,'El archivo de vídeo no está disponible.')
    mime={'.mp4':'video/mp4','.mov':'video/quicktime','.webm':'video/webm'}[path.suffix]
    return FileResponse(path,media_type=mime,headers={'Cache-Control':'private, no-store'})

@app.post('/api/submissions/{sid}/review')
def review_submission(sid:int,body:ReviewInput,request:Request):
    user=require_user(request,'admin')
    with connect() as c:
        row=row_or_404(c,'SELECT s.*,c.target_reps FROM submissions s JOIN challenges c ON c.id=s.challenge_id WHERE s.id=?',(sid,))
        if row['status'] in ('queued','processing'):
            raise HTTPException(409,'Espera a que termine el procesamiento antes de revisar.')
        if body.decision=='approved' and body.reps!=row['target_reps']:
            raise HTTPException(422,'Para entrar al ranking debe completar exactamente el objetivo del reto.')
        c.execute('UPDATE submissions SET status=?,reps=?,time_seconds=?,reviewer_id=?,review_reason=?,reviewed_at=? WHERE id=?',(body.decision,body.reps,body.time_seconds,user['id'],body.reason,now_iso(),sid))
        c.execute('INSERT INTO review_audit(submission_id,reviewer_id,decision,reps,time_seconds,reason,created_at) VALUES (?,?,?,?,?,?,?)',(sid,user['id'],body.decision,body.reps,body.time_seconds,body.reason,now_iso()))
        return submission_dict(c.execute(SUBMISSION_SQL+' WHERE s.id=?',(sid,)).fetchone())

EVENT_SQL='SELECT e.*,b.name box_name FROM events e LEFT JOIN boxes b ON b.id=e.box_id'

def event_dict(c,row,user):
    result=dict(row)
    result['registration_count']=c.execute('SELECT COUNT(*) FROM event_registrations WHERE event_id=?',(row['id'],)).fetchone()[0]
    result['registered']=bool(c.execute('SELECT 1 FROM event_registrations WHERE event_id=? AND athlete_id=?',(row['id'],user['id'])).fetchone())
    return result

@app.get('/api/events')
def events(request:Request):
    user=require_user(request)
    with connect() as c:
        return [event_dict(c,r,user) for r in c.execute(EVENT_SQL+' ORDER BY e.date')]

@app.post('/api/events',status_code=201)
def create_event(body:EventInput,request:Request):
    user=require_user(request,'admin','box_owner')
    if body.date<datetime.now(timezone.utc).date():
        raise HTTPException(422,'La competición debe celebrarse hoy o en una fecha futura.')
    if user['role']=='box_owner' and user['box_type']!='official' and body.brand=='vector':
        raise HTTPException(403,'Solo los boxes oficiales pueden organizar competiciones con la marca Vector.')
    with connect() as c:
        eid=c.execute('INSERT INTO events(title,track,city,date,brand,box_id,description,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',(body.title,body.track,body.city,body.date.isoformat(),body.brand,user['box_id'],body.description,user['id'],now_iso())).lastrowid
        return event_dict(c,c.execute(EVENT_SQL+' WHERE e.id=?',(eid,)).fetchone(),user)

@app.post('/api/events/{eid}/register')
def register_event(eid:int,request:Request):
    user=require_user(request,'athlete')
    with connect() as c:
        event=row_or_404(c,'SELECT * FROM events WHERE id=?',(eid,))
        if event['date']<datetime.now(timezone.utc).date().isoformat():
            raise HTTPException(409,'La competición ya ha terminado.')
        c.execute('INSERT OR IGNORE INTO event_registrations VALUES (?,?,?)',(eid,user['id'],now_iso()))
    return {'ok':True}

@app.get('/api/equipment')
def equipment(request:Request):
    require_user(request)
    with connect() as c:
        result=[]
        for row in c.execute('SELECT * FROM equipment ORDER BY id'):
            item=dict(row)
            item['price_per_day']=item.pop('price_cents')/100
            result.append(item)
        return result

def rental_dict(c,row):
    result=dict(row)
    result['total']=result.pop('total_cents')/100
    result['items']=[{'equipment_id':r['equipment_id'],'name':r['name'],'quantity':r['quantity'],'price_per_day':r['price_cents']/100} for r in c.execute('SELECT ri.*,e.name FROM rental_items ri JOIN equipment e ON e.id=ri.equipment_id WHERE rental_id=?',(row['id'],))]
    return result

RENTAL_SQL='SELECT r.*,e.title event_title,b.name box_name FROM rentals r JOIN events e ON e.id=r.event_id JOIN boxes b ON b.id=r.box_id'

@app.get('/api/rentals')
def rentals(request:Request):
    user=require_user(request,'admin','box_owner')
    with connect() as c:
        return [rental_dict(c,r) for r in c.execute(RENTAL_SQL+' ORDER BY r.created_at DESC') if user['role']=='admin' or r['box_id']==user['box_id']]

@app.post('/api/rentals',status_code=201)
def create_rental(body:RentalInput,request:Request):
    user=require_user(request,'admin','box_owner')
    if body.start_date<datetime.now(timezone.utc).date():
        raise HTTPException(422,'El alquiler debe comenzar hoy o en una fecha futura.')
    with connect() as c:
        event=row_or_404(c,'SELECT * FROM events WHERE id=?',(body.event_id,))
        if user['role']=='box_owner' and event['box_id']!=user['box_id']:
            raise HTTPException(403,'Solo puedes solicitar material para competiciones de tu box.')
        if event['box_id'] is None:
            raise HTTPException(422,'El evento necesita un box organizador para solicitar material.')
        if not body.start_date.isoformat()<=event['date']<=body.end_date.isoformat():
            raise HTTPException(422,'Las fechas de alquiler deben incluir el día de la competición.')
        items=[]
        total=0
        days=(body.end_date-body.start_date).days+1
        for item in body.items:
            e=row_or_404(c,'SELECT * FROM equipment WHERE id=?',(item.equipment_id,))
            if item.quantity>e['stock']:
                raise HTTPException(409,f"No hay suficientes unidades de {e['name']}.")
            if event['track']!='both' and e['category'] not in ('both',event['track']):
                raise HTTPException(422,f"{e['name']} no corresponde a la disciplina del evento.")
            items.append((item.equipment_id,item.quantity,e['price_cents']))
            total+=item.quantity*e['price_cents']*days
        rid=c.execute("INSERT INTO rentals(event_id,box_id,start_date,end_date,status,total_cents,notes,created_at) VALUES (?,?,?,?,'pending',?,?,?)",(body.event_id,event['box_id'],body.start_date.isoformat(),body.end_date.isoformat(),total,body.notes,now_iso())).lastrowid
        c.executemany('INSERT INTO rental_items VALUES (?,?,?,?)',[(rid,*i) for i in items])
        return rental_dict(c,c.execute(RENTAL_SQL+' WHERE r.id=?',(rid,)).fetchone())

@app.post('/api/rentals/{rid}/status')
def rental_status(rid:int,body:RentalStatus,request:Request):
    require_user(request,'admin')
    with connect() as c:
        # Serializes inventory decisions across requests, preventing overselling on concurrent confirmations.
        c.execute('BEGIN IMMEDIATE')
        rental=row_or_404(c,'SELECT * FROM rentals WHERE id=?',(rid,))
        if rental['status']!='pending':
            raise HTTPException(409,'Esta solicitud ya ha sido resuelta.')
        if body.status=='confirmed':
            for item in c.execute('SELECT ri.*,e.stock,e.name FROM rental_items ri JOIN equipment e ON e.id=ri.equipment_id WHERE rental_id=?',(rid,)):
                # Availability is the peak booked quantity on each inclusive
                # rental day, not the sum of disjoint bookings in the window.
                days=(date.fromisoformat(rental['end_date'])-date.fromisoformat(rental['start_date'])).days+1
                used=0
                for offset in range(days):
                    day=(date.fromisoformat(rental['start_date'])+timedelta(days=offset)).isoformat()
                    daily=c.execute("SELECT COALESCE(SUM(ri.quantity),0) FROM rental_items ri JOIN rentals r ON r.id=ri.rental_id WHERE ri.equipment_id=? AND r.status='confirmed' AND r.start_date<=? AND r.end_date>=?",(item['equipment_id'],day,day)).fetchone()[0]
                    used=max(used,daily)
                if used+item['quantity']>item['stock']:
                    raise HTTPException(409,f"Stock insuficiente de {item['name']} en esas fechas. Revisa los alquileres confirmados.")
        c.execute('UPDATE rentals SET status=? WHERE id=?',(body.status,rid))
        return rental_dict(c,c.execute(RENTAL_SQL+' WHERE r.id=?',(rid,)).fetchone())

@app.get('/api/admin/overview')
def admin_overview(request:Request):
    require_user(request,'admin')
    with connect() as c:
        return {'users':c.execute('SELECT COUNT(*) FROM users').fetchone()[0],'boxes':c.execute('SELECT COUNT(*) FROM boxes').fetchone()[0],'official_boxes':c.execute("SELECT COUNT(*) FROM boxes WHERE type='official'").fetchone()[0],'pending_rentals':c.execute("SELECT COUNT(*) FROM rentals WHERE status='pending'").fetchone()[0],'pending_reviews':c.execute("SELECT COUNT(*) FROM submissions WHERE status IN ('review','failed')").fetchone()[0],'ai':ai_status(),'users_list':[user_dict(r) for r in c.execute(USER_SQL+' ORDER BY u.id')]}

@app.get('/api/dashboard')
def dashboard(request:Request):
    user=require_user(request)
    today=datetime.now(timezone.utc).date()
    since=(today-timedelta(days=6)).isoformat()
    with connect() as c:
        if user['role']=='admin':
            total=c.execute('SELECT COUNT(*) FROM users').fetchone()[0]
            boxes=c.execute('SELECT COUNT(*) FROM boxes').fetchone()[0]
            pending=c.execute("SELECT COUNT(*) FROM submissions WHERE status IN ('review','failed')").fetchone()[0]
            stats=[{'label':'Atletas y equipo','value':total,'detail':'Perfiles registrados'},{'label':'Boxes conectados','value':boxes,'detail':'Oficiales e independientes'},{'label':'Vídeos por revisar','value':pending,'detail':'Resultados pendientes de validar'}]
        elif user['role']=='box_owner':
            total=c.execute("SELECT COUNT(*) FROM users WHERE box_id=? AND role='athlete'",(user['box_id'],)).fetchone()[0]
            count=c.execute('SELECT COUNT(*) FROM workouts WHERE box_id=?',(user['box_id'],)).fetchone()[0]
            events=c.execute('SELECT COUNT(*) FROM events WHERE box_id=?',(user['box_id'],)).fetchone()[0]
            stats=[{'label':'Atletas de tu box','value':total,'detail':user['box_name']},{'label':'Entrenamientos propios','value':count,'detail':'Programación diaria del box'},{'label':'Competiciones','value':events,'detail':'Eventos de tu comunidad'}]
        else:
            total=c.execute('SELECT COUNT(*) FROM completions WHERE user_id=?',(user['id'],)).fetchone()[0]
            week=c.execute('SELECT COUNT(*) FROM completions WHERE user_id=? AND completed_at>=?',(user['id'],since)).fetchone()[0]
            events=c.execute('SELECT COUNT(*) FROM event_registrations WHERE athlete_id=?',(user['id'],)).fetchone()[0]
            stats=[{'label':'Sesiones completadas','value':total,'detail':'Tu trabajo, registrado'},{'label':'Sesiones esta semana','value':week,'detail':'Últimos 7 días'},{'label':'Eventos inscritos','value':events,'detail':'Tu próxima línea de salida'}]
        if user['role']=='admin':
            rows=c.execute('SELECT co.*,w.track,w.title,u.name FROM completions co JOIN workouts w ON w.id=co.workout_id JOIN users u ON u.id=co.user_id ORDER BY completed_at DESC LIMIT 10').fetchall()
        elif user['role']=='box_owner':
            rows=c.execute('SELECT co.*,w.track,w.title,u.name FROM completions co JOIN workouts w ON w.id=co.workout_id JOIN users u ON u.id=co.user_id WHERE u.box_id=? ORDER BY completed_at DESC LIMIT 10',(user['box_id'],)).fetchall()
        else:
            rows=c.execute('SELECT co.*,w.track,w.title,u.name FROM completions co JOIN workouts w ON w.id=co.workout_id JOIN users u ON u.id=co.user_id WHERE u.id=? ORDER BY completed_at DESC LIMIT 10',(user['id'],)).fetchall()
        activity=[{'id':f"{r['user_id']}-{r['workout_id']}",'kind':r['track'],'title':r['title'],'detail':f"{r['name']} ha completado una sesión",'date':r['completed_at']} for r in rows]
        weekly=[]
        for i in range(7):
            day=today-timedelta(days=6-i)
            values={'forge':0,'apex':0}
            sql='SELECT w.track,COUNT(*) n FROM completions co JOIN workouts w ON w.id=co.workout_id JOIN users u ON u.id=co.user_id WHERE substr(co.completed_at,1,10)=?'
            args=[day.isoformat()]
            if user['role']=='athlete':
                sql+=' AND u.id=?';args.append(user['id'])
            elif user['role']=='box_owner':
                sql+=' AND u.box_id=?';args.append(user['box_id'])
            for r in c.execute(sql+' GROUP BY w.track',args):
                values[r['track']]=r['n']
            weekly.append(dict(day=day.isoformat(),**values))
        challenge=c.execute('SELECT * FROM challenges ORDER BY CASE WHEN opens_at<=? AND closes_at>=? THEN 0 ELSE 1 END,opens_at DESC LIMIT 1',(now_iso(),now_iso())).fetchone()
        mine=[submission_dict(r) for r in c.execute(SUBMISSION_SQL+' WHERE s.athlete_id=? ORDER BY s.created_at DESC',(user['id'],))]
        box=next((b for b in boxes_list(c) if b['id']==user['box_id']),None)
        return {'stats':stats,'activity':activity,'weekly_activity':weekly,'challenge':challenge_dict(c,challenge,user) if challenge else None,'my_submissions':mine,'box':box}

# Serve the production React build with history fallback; API routes remain JSON/404.
DIST=ROOT/'web'/'dist'
if (DIST/'assets').is_dir():
    app.mount('/assets',StaticFiles(directory=DIST/'assets'),name='assets')

@app.get('/{path:path}',include_in_schema=False)
def frontend(path:str):
    if path=='api' or path.startswith('api/'):
        raise HTTPException(404,'La ruta API no existe.')
    resolved=(DIST/path).resolve()
    if resolved.is_relative_to(DIST.resolve()) and resolved.is_file():
        return FileResponse(resolved)
    if (DIST/'index.html').is_file():
        return FileResponse(DIST/'index.html')
    return JSONResponse({'detail':'Web sin compilar. Ejecuta npm run build en web/ o utiliza el servidor Vite.'},status_code=503)
