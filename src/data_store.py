from src.models import DeletedVideo, SQLModel, VideoServer, Video
from src import DATA_FOLDER
from sqlmodel import create_engine, Session
from typing import Generator, Any
import os

os.makedirs(os.path.expanduser(DATA_FOLDER), exist_ok=True)
database_file = "video_store.db"
database_abs_path = os.path.abspath(
    os.path.join(
        os.path.expanduser(DATA_FOLDER),
        database_file
    )
)

engine_url = f"sqlite:///{database_abs_path}"
engine = create_engine(engine_url)
SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, Any, Any]:
    with Session(engine) as session:
        yield session
