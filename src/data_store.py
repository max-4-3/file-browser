from src.models import SQLModel, Video, VideoServer
from src import DATA_FOLDER
from sqlmodel import create_engine, Session
import os

os.makedirs(os.path.expanduser(DATA_FOLDER), exist_ok=True)
database_file = "video_store.db"
database_abs_path = os.path.abspath(os.path.join(os.path.expanduser(DATA_FOLDER), database_file))
engine_url = f"sqlite:///{database_abs_path}"
engine = create_engine(engine_url)
SQLModel.metadata.create_all(engine)

def get_session() -> Session:
    with Session(engine) as session:
        yield session
