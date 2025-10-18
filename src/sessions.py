from src.data_store import create_engine_url, create_models
from sqlmodel import create_engine, Session
from src.models import SQLModel, DeletedVideo
from src import DATA_FOLDER
from typing import Protocol, Generator


class DataBaseSession(Protocol):
    def get_session(self) -> Generator[Session, None, None]:
        ...


class NormalSession:
    def __init__(self):
        self.db_url = create_engine_url("videostore.db", DATA_FOLDER)
        self.engine = create_engine(self.db_url)
        create_models(SQLModel, self.engine, excludes=[DeletedVideo])

    def get_session(self) -> Generator[Session, None, None]:
        with Session(self.engine) as session:
            yield session


class DeletedVideosSession:
    def __init__(self):
        self.db_url = create_engine_url("deleted_videos.db", DATA_FOLDER)
        self.engine = create_engine(self.db_url)
        create_models(SQLModel, self.engine, includes=[DeletedVideo])

    def get_session(self) -> Generator[Session, None, None]:
        with Session(self.engine) as session:
            yield session
