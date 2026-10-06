import hashlib
import hmac
import secrets
import time
from fastapi import HTTPException, Request
from .db import connect

SESSION_TTL = 60 * 60 * 24 * 7

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return f"scrypt${salt}${hashed}"

def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt, expected = stored.split('$')
        if scheme != 'scrypt':
            return False
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False

def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

def user_dict(row):
    return {k:row[k] for k in ('id','name','email','role','box_id','box_name','box_type')}

USER_SQL = "SELECT u.*, b.name box_name, b.type box_type FROM users u LEFT JOIN boxes b ON b.id=u.box_id"

def current_user(request: Request):
    token = request.cookies.get('vector_session')
    if not token:
        return None
    with connect() as c:
        row = c.execute(USER_SQL+" JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?",(token_hash(token),time.time())).fetchone()
    return user_dict(row) if row else None

def require_user(request: Request, *roles):
    user = current_user(request)
    if not user:
        raise HTTPException(401,'Inicia sesión para continuar.')
    if roles and user['role'] not in roles:
        raise HTTPException(403,'Tu perfil no tiene permiso para esta acción.')
    return user

# Only stores failed-login counters, no password or session values.
_failures: dict[str, list[float]] = {}

def check_login_limit(key: str):
    now = time.time()
    attempts = [t for t in _failures.get(key,[]) if now-t<900]
    _failures[key] = attempts
    if len(attempts)>=10:
        raise HTTPException(429,'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.')
    if len(_failures)>10000:
        stale = [k for k,v in _failures.items() if not v or now-v[-1]>900]
        for k in stale:
            _failures.pop(k,None)

def record_login_failure(key: str):
    _failures.setdefault(key,[]).append(time.time())
