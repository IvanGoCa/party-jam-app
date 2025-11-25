import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# URL de conexión: postgresql://usuario:contraseña@servidor:puerto/nombre_db
db_url = os.getenv("DATABASE_URL", "postgresql://admin:adminpassword@localhost/jam_database")

if db_url:
    print(f"🚀 RENDER DETECTADO: Usando base de datos en la nube: {db_url.split('@')[1]}")
else:
    print("⚠️ VARIABLE NO ENCONTRADA: Usando localhost (Esto fallará en Render)")
    db_url = "postgresql://admin:adminpassword@localhost/jam_database"

if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql://", 1)

SQLALCHEMY_DATABASE_URL = db_url

# Creamos el motor de conexión
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# Creamos la sesión (la herramienta para hacer consultas)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# La clase base de la que heredarán nuestros modelos
Base = declarative_base()

# Dependencia para obtener la DB en cada petición
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()