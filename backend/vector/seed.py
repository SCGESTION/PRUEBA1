"""Explicit, repeatable initialization. Demo data is never created on server startup."""
from datetime import datetime, timedelta, timezone
import argparse
import getpass
import sqlite3
from .db import connect, init_db
from .security import hash_password

DEMO_PASSWORD = 'VectorDemo2026!'

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def seed_equipment():
    items=[
        ('SkiErg Concept2','apex',12,4500,'ski','Trabajo de ski para estaciones híbridas. Por unidad y día.'),
        ('Remo Concept2','both',16,4500,'row','Ergómetro para pruebas Forge y Apex.'),
        ('Trineo de competición','apex',8,3500,'sled','Trineo para empuje y arrastre. Discos se solicitan aparte.'),
        ('Pack barra + discos','forge',20,3000,'barbell','Barra olímpica y juego de discos hasta 100 kg.'),
        ('Wall ball 6 kg','both',30,800,'ball','Balón de competición para wall balls.'),
        ('Kettlebell 24 kg','both',24,1000,'kettlebell','Peso libre para carries y fuerza.'),
        ('Cajón pliométrico','forge',15,1200,'box','Cajón de madera de tres alturas.'),
        ('Sandbag 20 kg','apex',20,1200,'sandbag','Saco para zancadas y estaciones híbridas.'),
    ]
    with connect() as c:
        if not c.execute('SELECT 1 FROM equipment LIMIT 1').fetchone():
            c.executemany('INSERT INTO equipment(name,category,stock,price_cents,image_key,description) VALUES (?,?,?,?,?,?)',items)

def seed_demo():
    init_db()
    seed_equipment()
    with connect() as c:
        if c.execute("SELECT 1 FROM settings WHERE key='demo'").fetchone():
            return
        if c.execute('SELECT 1 FROM users LIMIT 1').fetchone():
            raise RuntimeError('No se pueden añadir cuentas demo a una base de datos con usuarios reales.')
        stamp=now_iso()
        today=datetime.now(timezone.utc).date()
        official=c.execute("INSERT INTO boxes(name,city,type,created_at) VALUES ('Forge District','Madrid','official',?)",(stamp,)).lastrowid
        standard=c.execute("INSERT INTO boxes(name,city,type,created_at) VALUES ('Norte Training Club','Bilbao','standard',?)",(stamp,)).lastrowid
        accounts=[('Equipo Vector','admin@vector.local','admin',None),('Álex · Forge District','forge@vector.local','box_owner',official),('Nora · Norte Training','norte@vector.local','box_owner',standard),('Dani Martín','atleta@vector.local','athlete',official),('Lucía García','libre@vector.local','athlete',None)]
        hashed=hash_password(DEMO_PASSWORD)
        ids=[]
        for name,email,role,box in accounts:
            ids.append(c.execute('INSERT INTO users(name,email,password_hash,role,box_id,created_at) VALUES (?,?,?,?,?,?)',(name,email,hashed,role,box,stamp)).lastrowid)
        workouts=[
            ('Engine starter','apex','vector',None,today,'amrap',24,'all','4 rondas. Mantén un ritmo que puedas sostener y cuida las transiciones.',[("run",800,0),("wall_ball",30,6),("row",500,0)]),
            ('Built in the fire','forge','vector',None,today,'for_time',18,'rx','5 rondas. Escala la carga para mantener la técnica.',[("deadlift",10,60),("burpee",12,0),("box_jump",15,0)]),
            ('The long game','apex','vector',None,today+timedelta(days=2),'for_time',40,'all','3 rondas con descanso de 90 segundos entre rondas.',[("run",1000,0),("ski",500,0),("farmer_carry",200,24)]),
            ('Forge foundations','forge','vector',None,today+timedelta(days=1),'emom',20,'scaled','Alterna los movimientos cada minuto. Calidad antes que velocidad.',[("squat",15,0),("push_up",10,0),("row",200,0)]),
            ('District daily','forge','box',official,today,'amrap',12,'all','Entrenamiento exclusivo de Forge District. Calentamiento previo de 8 minutos.',[("thruster",8,30),("pull_up",6,0),("burpee",8,0)]),
            ('Norte hybrid flow','apex','box',standard,today,'for_time',25,'all','3 rondas a ritmo constante.',[("run",600,0),("lunge",20,20),("ski",400,0)]),
        ]
        for title,track,scope,box,day,fmt,duration,level,notes,exercises in workouts:
            author=ids[0] if not box else ids[1] if box==official else ids[2]
            wid=c.execute('INSERT INTO workouts(title,track,scope,box_id,scheduled_date,format,duration_minutes,level,notes,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',(title,track,scope,box,day.isoformat(),fmt,duration,level,notes,author,stamp)).lastrowid
            c.executemany('INSERT INTO workout_exercises(workout_id,position,movement,reps,load_kg) VALUES (?,?,?,?,?)',[(wid,i,*exercise) for i,exercise in enumerate(exercises)])
        opening=datetime.combine(today-timedelta(days=2),datetime.min.time(),tzinfo=timezone.utc)
        closing=opening+timedelta(days=30)
        challenge=c.execute('INSERT INTO challenges(title,track,movement,target_reps,opens_at,closes_at,description,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',('30 squats. All in.','forge','squat',30,opening.isoformat(),closing.isoformat(),'30 sentadillas al aire en el menor tiempo posible. Graba el cuerpo completo de perfil en una sola toma, con buena luz y extensión completa. El cronómetro comienza al iniciar la primera bajada y termina al completar la repetición 30. Revisión humana antes del ranking.',ids[0],stamp)).lastrowid
        c.executemany('INSERT INTO challenge_boxes VALUES (?,?,?)',[(challenge,official,stamp),(challenge,standard,stamp)])
        c.execute('INSERT INTO events(title,track,city,date,brand,box_id,description,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',('Vector Madrid Throwdown','both','Madrid',(today+timedelta(days=21)).isoformat(),'vector',official,'Una jornada de comunidad, fuerza y motor. Categorías Forge y Apex.',ids[1],stamp))
        c.execute('INSERT INTO events(title,track,city,date,brand,box_id,description,author_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',('Norte Hybrid Day','apex','Bilbao',(today+timedelta(days=28)).isoformat(),'independent',standard,'Competición independiente organizada por Norte Training Club.',ids[2],stamp))
        c.execute("INSERT INTO settings VALUES ('demo','1')")

def create_admin(email: str,name: str,password: str):
    from .models import Register
    validated=Register(name=name,email=email,password=password)
    init_db()
    seed_equipment()
    with connect() as c:
        if c.execute("SELECT 1 FROM settings WHERE key='demo'").fetchone():
            raise RuntimeError('La base demo debe mantenerse separada. Usa otro VECTOR_DATA_DIR para datos reales.')
        c.execute('INSERT INTO users(name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)',(validated.name,validated.email,hash_password(validated.password),'admin',now_iso()))

def main():
    p=argparse.ArgumentParser(description='Inicializa Vector sin modificar cuentas existentes.')
    p.add_argument('--demo',action='store_true')
    p.add_argument('--admin-email')
    p.add_argument('--admin-name',default='Administrador Vector')
    args=p.parse_args()
    try:
        if args.demo:
            seed_demo()
            print('Base demo preparada. Cuentas @vector.local; contraseña solo demo: VectorDemo2026!')
        elif args.admin_email:
            password=getpass.getpass('Contraseña del administrador (10+ caracteres): ')
            if password!=getpass.getpass('Repite la contraseña: '):
                p.error('Las contraseñas no coinciden.')
            create_admin(args.admin_email,args.admin_name,password)
            print('Administrador creado. Usa tu email para iniciar sesión.')
        else:
            init_db()
            seed_equipment()
            print('Base de datos preparada. No se han creado ni modificado usuarios. Si es nueva, crea un administrador o inicializa --demo.')
    except (RuntimeError,sqlite3.IntegrityError,ValueError) as e:
        p.error(str(e))

if __name__=='__main__':
    main()
