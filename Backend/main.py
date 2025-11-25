from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from starlette.responses import RedirectResponse
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict

import random
import string
import os

# Librerías de Spotify
import spotipy
from spotipy.oauth2 import SpotifyOAuth

# Librería de CORS
from fastapi.middleware.cors import CORSMiddleware

# Importamos lo nuestro
from database import engine, get_db
import models

# --- GESTOR DE WEBSOCKETS ---
class ConnectionManager:
    def __init__(self):
        # Guardamos listas de conexiones por sala: {'X9Z2': [ws1, ws2], 'A1B2': [ws3]}
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_code: str):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = []
        self.active_connections[room_code].append(websocket)

    def disconnect(self, websocket: WebSocket, room_code: str):
        if room_code in self.active_connections:
            self.active_connections[room_code].remove(websocket)
            if len(self.active_connections[room_code]) == 0:
                del self.active_connections[room_code]

    async def broadcast(self, message: str, room_code: str):
        if room_code in self.active_connections:
            # Avisamos a todos los conectados a esa sala
            for connection in self.active_connections[room_code]:
                try:
                    await connection.send_text(message)
                except:
                    # Si falla, es que se desconectó mal, lo ignoramos por ahora
                    pass

manager = ConnectionManager()

# Cargar variables del archivo .env
load_dotenv()

# Inicializar DB
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# --- CONFIGURACIÓN DE SEGURIDAD (CORS) ---
# Permitimos que el frontend (puerto 3000) nos envíe peticiones
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.10.10:3000",  # <--- Tu IP local específica
    "*"                           # <--- COMODÍN: Permite todo (móviles, otros PCs, etc.)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIGURACIÓN SPOTIFY ---
# Estos permisos (scope) son vitales. Le pedimos permiso para:
# 1. Leer su perfil. 2. Modificar su reproducción (play/pause). 3. Leer qué suena ahora.
SCOPE = "user-read-private user-modify-playback-state user-read-currently-playing"

sp_oauth = SpotifyOAuth(
    client_id=os.getenv("SPOTIPY_CLIENT_ID"),
    client_secret=os.getenv("SPOTIPY_CLIENT_SECRET"),
    redirect_uri=os.getenv("SPOTIPY_REDIRECT_URI"),
    scope=SCOPE
)

@app.get("/")
def read_root():
    return {"mensaje": "Backend Party Jam Activo 🎵"}

# --- ENDPOINT 1: LOGIN ---
# El usuario entra aquí y lo mandamos a la web de Spotify
@app.get("/login")
def login():
    auth_url = sp_oauth.get_authorize_url()
    return RedirectResponse(auth_url)

# --- ENDPOINT 2: CALLBACK ---
# Spotify nos devuelve al usuario aquí con un código secreto
@app.get("/callback")
def callback(code: str, db: Session = Depends(get_db)):
    # 1. Canjeamos el código por el TOKEN real
    try:
        token_info = sp_oauth.get_access_token(code)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Error al obtener token de Spotify")

    access_token = token_info['access_token']
    refresh_token = token_info['refresh_token']

    # 2. Usamos el token para preguntar: "¿Quién eres?"
    sp = spotipy.Spotify(auth=access_token)
    user_info = sp.current_user()
    spotify_user_id = user_info['id']
    is_premium = (user_info.get('product') == 'premium')

    # 3. GUARDAMOS (O ACTUALIZAMOS) EL HOST EN LA BASE DE DATOS
    # Buscamos si ya existe este usuario
    db_host = db.query(models.Host).filter(models.Host.spotify_id == spotify_user_id).first()

    if db_host:
        # Si existe, actualizamos sus tokens
        db_host.access_token = access_token
        db_host.refresh_token = refresh_token
        print(f"Usuario {spotify_user_id} actualizado.")
    else:
        # Si no existe, lo creamos
        new_host = models.Host(
            spotify_id=spotify_user_id,
            access_token=access_token,
            refresh_token=refresh_token,
            is_premium=is_premium,
            email=user_info.get('email')
        )
        db.add(new_host)
        print(f"Usuario {spotify_user_id} creado.")
    
    db.commit()
    db.refresh(db_host if db_host else new_host) # Aseguramos tener el ID fresco
    
    el_host_id = db_host.id if db_host else new_host.id

    # --- CAMBIO IMPORTANTE PARA PRODUCCIÓN ---
    # Leemos la variable FRONTEND_URL. Si no existe, usamos localhost por defecto.
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    
    return RedirectResponse(url=f"{frontend_url}/dashboard?hostId={el_host_id}")

# --- UTILIDAD: GENERADOR DE CÓDIGOS ---
def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=4))

# --- ENDPOINT 3: CREAR SALA ---
# El frontend nos envía el ID del host y nosotros le damos una sala
@app.post("/create-room")
def create_room(host_id: int, db: Session = Depends(get_db)):
    # 1. Verificamos que el host existe
    host = db.query(models.Host).filter(models.Host.id == host_id).first()
    if not host:
        raise HTTPException(status_code=404, detail="Host no encontrado")

    # 2. Desactivamos salas anteriores de este host (solo 1 fiesta a la vez)
    old_rooms = db.query(models.Room).filter(models.Room.host_id == host_id, models.Room.is_active == True).all()
    for room in old_rooms:
        room.is_active = False
    
    # 3. Generamos código único (intentamos hasta que salga uno libre)
    while True:
        code = generate_room_code()
        # Verificamos si ya existe
        exists = db.query(models.Room).filter(models.Room.code == code).first()
        if not exists:
            break
    
    # 4. Guardamos la sala nueva
    new_room = models.Room(
        code=code,
        host_id=host_id,
        name=f"Fiesta de {host.spotify_id}",
        is_active=True
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)

    return {"status": "Sala Creada", "room_code": new_room.code, "room_id": new_room.id}

# --- ENDPOINT 4: UNIRSE A UNA SALA (INVITADO) ---
@app.get("/join/{code}")
def join_room(code: str, db: Session = Depends(get_db)):
    # Buscamos la sala por su código (y que esté activa)
    room = db.query(models.Room).filter(models.Room.code == code, models.Room.is_active == True).first()
    
    if not room:
        raise HTTPException(status_code=404, detail="Sala no encontrada o cerrada")
    
    return {
        "status": "ok", 
        "room_id": room.id, 
        "room_name": room.name, 
        "host_name": room.host.spotify_id
    }

# --- ENDPOINT 5: BUSCAR CANCIONES (PROXY) ---
@app.get("/search")
def search_spotify(query: str, code: str, db: Session = Depends(get_db)):
    # 1. Buscamos la sala
    room = db.query(models.Room).filter(models.Room.code == code.upper()).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    
    host = room.host

    # FUNCION INTERNA PARA INTENTAR BUSCAR
    def try_search(token):
        sp = spotipy.Spotify(auth=token)
        return sp.search(q=query, type='track', limit=10)

    try:
        # Intento 1: Con el token actual
        results = try_search(host.access_token)
    except Exception:
        print("Token caducado. Intentando refrescar...")
        # Intento 2: Si falla, refrescamos el token
        try:
            # Usamos el refresh_token para pedir uno nuevo
            new_token_info = sp_oauth.refresh_access_token(host.refresh_token)
            
            # Guardamos el nuevo token en la Base de Datos
            host.access_token = new_token_info['access_token']
            # A veces el refresh token también cambia, lo actualizamos por si acaso
            if 'refresh_token' in new_token_info:
                host.refresh_token = new_token_info['refresh_token']
            
            db.commit()
            
            # Reintentamos la búsqueda con el token nuevo
            results = try_search(host.access_token)
        except Exception as e:
            print(f"Error fatal refrescando token: {e}")
            raise HTTPException(status_code=401, detail="No se pudo renovar la sesión del anfitrión")

    # 3. Limpiamos la respuesta
    tracks = []
    if results and 'tracks' in results:
        for item in results['tracks']['items']:
            # Pequeña seguridad por si la canción no tiene imagen
            img = item['album']['images'][0]['url'] if len(item['album']['images']) > 0 else "https://via.placeholder.com/64"
            
            tracks.append({
                "id": item['id'],
                "title": item['name'],
                "artist": item['artists'][0]['name'],
                "image": img
            })
    
    return tracks

# --- MODELO DE DATOS (Para validar lo que nos envía el frontend) ---
class SongRequest(BaseModel):
    code: str
    guest_id: str
    spotify_id: str
    title: str
    artist: str
    image_url: str

class VoteRequest(BaseModel):
    code: str
    guest_id: str
    spotify_track_id: str

def get_or_create_guest(db: Session, guest_id: str, room_id: int):
    guest = db.query(models.Guest).filter(models.Guest.id == guest_id).first()
    if not guest:
        guest = models.Guest(id=guest_id, room_id=room_id)
        db.add(guest)
        db.commit()
    return guest

# --- ENDPOINT 6: AÑADIR CANCIÓN A LA COLA ---
@app.post("/add-song")
async def add_song(song: SongRequest, db: Session = Depends(get_db)):
    # 1. Buscamos la sala
    room = db.query(models.Room).filter(models.Room.code == song.code.upper()).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala no encontrada")

    get_or_create_guest(db, song.guest_id, room.id)

    # 2. ¿La canción YA está en la lista?
    existing_item = db.query(models.QueueItem).filter(
        models.QueueItem.room_id == room.id,
        models.QueueItem.spotify_track_id == song.spotify_id,
        models.QueueItem.status == "WAITING"
    ).first()

    if existing_item:
        # Si ya existe, en el futuro sumaremos un voto aquí. 
        # Por ahora devolvemos aviso.
        return {"status": "exists", "message": "La canción ya está en la lista"}

    # 3. Si no existe, la creamos
    new_item = models.QueueItem(
        room_id=room.id,
        spotify_track_id=song.spotify_id,
        title=song.title,
        artist=song.artist,
        image_url=song.image_url,
        vote_count=1, # Empieza con 1 voto
        status="WAITING"
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    # 4. IMPORTANTE: Registramos el voto en la tabla de votos
    new_vote = models.Vote(guest_id=song.guest_id, queue_item_id=new_item.id)
    db.add(new_vote)
    db.commit()
    
    await manager.broadcast("update_queue", room.code)
    
    return {"status": "added", "title": song.title}

# --- ENDPOINT 7: VER LA COLA (Para pintar la lista) ---
@app.get("/queue/{code}")
def get_queue(code: str, db: Session = Depends(get_db)):
    room = db.query(models.Room).filter(models.Room.code == code.upper()).first()
    if not room:
        return []
    
    # Sacamos las canciones ordenadas por votos (DESC) y luego por llegada (ASC)
    queue = db.query(models.QueueItem).filter(
        models.QueueItem.room_id == room.id,
        models.QueueItem.status == "WAITING"
    ).order_by(models.QueueItem.vote_count.desc(), models.QueueItem.id.asc()).all()

    return queue

# --- ENDPOINT 8: LANZAR LA SIGUIENTE (DJ AUTOMÁTICO) ---
@app.post("/play-next")
async def play_next_song(room_code: str, db: Session = Depends(get_db)):
    # 1. Buscamos la sala
    room = db.query(models.Room).filter(models.Room.code == room_code.upper()).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala no encontrada")

    # 2. Buscamos la canción GANADORA (Más votos, llegó antes)
    next_song = db.query(models.QueueItem).filter(
        models.QueueItem.room_id == room.id,
        models.QueueItem.status == "WAITING"
    ).order_by(models.QueueItem.vote_count.desc(), models.QueueItem.id.asc()).first()

    if not next_song:
        return {"status": "empty", "message": "No hay canciones en la cola"}

    # 3. CONECTAMOS CON SPOTIFY
    try:
        sp = spotipy.Spotify(auth=room.host.access_token)
        
        # --- LA MAGIA: Añadir a la cola oficial de Spotify ---
        # Nota: Spotify requiere que haya un dispositivo activo.
        sp.add_to_queue(uri=f"spotify:track:{next_song.spotify_track_id}")
        
        # 4. Actualizamos la base de datos
        next_song.status = "PLAYED"
        db.commit()
        
        await manager.broadcast("update_queue", room_code)
        
        return {"status": "playing", "title": next_song.title}

    except Exception as e:
        print(f"Error Spotify: {e}")
        # Si falla, suele ser porque no hay Spotify abierto o el token caducó
        raise HTTPException(status_code=400, detail="Asegúrate de tener Spotify abierto y sonando")
    
# --- ENDPOINT 9: SISTEMA DE VOTOS ---
@app.post("/vote")
async def toggle_vote(req: VoteRequest, db: Session = Depends(get_db)):
    room = db.query(models.Room).filter(models.Room.code == req.code.upper()).first()
    if not room:
        raise HTTPException(status_code=404, detail="Sala no encontrada")

    # Aseguramos el invitado
    get_or_create_guest(db, req.guest_id, room.id)

    # Buscamos la canción en la cola
    item = db.query(models.QueueItem).filter(
        models.QueueItem.room_id == room.id,
        models.QueueItem.spotify_track_id == req.spotify_track_id
    ).first()

    if not item:
        raise HTTPException(status_code=404, detail="Canción no encontrada")

    # VERIFICAMOS SI YA VOTÓ
    existing_vote = db.query(models.Vote).filter(
        models.Vote.guest_id == req.guest_id,
        models.Vote.queue_item_id == item.id
    ).first()

    if existing_vote:
        # SI YA VOTÓ -> RESTAMOS VOTO (Toggle Off)
        db.delete(existing_vote)
        item.vote_count -= 1
        action = "removed"
    else:
        # SI NO VOTÓ -> SUMAMOS VOTO (Toggle On)
        new_vote = models.Vote(guest_id=req.guest_id, queue_item_id=item.id)
        db.add(new_vote)
        item.vote_count += 1
        action = "added"

    db.commit()
    await manager.broadcast("update_queue", room.code)
    return {"status": "ok", "action": action, "new_count": item.vote_count}

# --- ENDPOINT 10: CANAL WEBSOCKET ---
@app.websocket("/ws/{room_code}")
async def websocket_endpoint(websocket: WebSocket, room_code: str):
    room_code = room_code.upper()
    await manager.connect(websocket, room_code)
    try:
        while True:
            # Nos quedamos escuchando (aunque realmente el cliente no envía nada por aquí, solo escucha)
            # Esto mantiene la conexión abierta ("ping-pong")
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_code)