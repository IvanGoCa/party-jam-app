from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid

# 1. Tabla de ANFITRIONES (Quienes tienen Spotify Premium)
class Host(Base):
    __tablename__ = "hosts"

    id = Column(Integer, primary_key=True, index=True)
    spotify_id = Column(String, unique=True, index=True) # ID único de Spotify
    email = Column(String, nullable=True)
    access_token = Column(String) # Token para controlar la música
    refresh_token = Column(String) # Token para renovar el acceso
    is_premium = Column(Boolean, default=False)
    
    # Relación: Un Host tiene muchas Rooms (aunque normalmente activa solo una)
    rooms = relationship("Room", back_populates="host")

# 2. Tabla de SALAS (Las fiestas activas)
class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True) # El código del QR (ej: 4X9Z)
    name = Column(String) # "Cumple de Pablo"
    host_id = Column(Integer, ForeignKey("hosts.id"))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    host = relationship("Host", back_populates="rooms")
    guests = relationship("Guest", back_populates="room")
    queue = relationship("QueueItem", back_populates="room")

# 3. Tabla de INVITADOS (Guest Mode)
class Guest(Base):
    __tablename__ = "guests"

    id = Column(String, primary_key=True, index=True, default=lambda: str(uuid.uuid4()))
    room_id = Column(Integer, ForeignKey("rooms.id"))
    nickname = Column(String, nullable=True) # "Usuario Anonimo"
    
    room = relationship("Room", back_populates="guests")
    votes = relationship("Vote", back_populates="guest")

# 4. Tabla de CANCIONES EN COLA
class QueueItem(Base):
    __tablename__ = "queue_items"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"))
    spotify_track_id = Column(String) # ID de la canción en Spotify
    title = Column(String)
    artist = Column(String)
    image_url = Column(String)
    vote_count = Column(Integer, default=1) # ¡Aquí ocurre la magia de la democracia!
    status = Column(String, default="WAITING") # WAITING, PLAYING, PLAYED
    
    room = relationship("Room", back_populates="queue")
    votes = relationship("Vote", back_populates="queue_item")

# 5. Tabla de VOTOS (Para evitar trampas)
class Vote(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    guest_id = Column(String, ForeignKey("guests.id"))
    queue_item_id = Column(Integer, ForeignKey("queue_items.id"))
    
    guest = relationship("Guest", back_populates="votes")
    queue_item = relationship("QueueItem", back_populates="votes")