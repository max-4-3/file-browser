from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from uuid import uuid4
import os, json


class Video(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    title: str
    duration: str
    filesize: int
    modified_time: float

    servers: List["VideoServer"] = Relationship(back_populates="video")


class VideoServer(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    video_id: str = Field(foreign_key="video.id")
    video: Optional[Video] = Relationship(back_populates="servers")
    video_path: str
    thumbnail_path: str

    def delete(self) -> bool:
        os.remove(self.video_path)
        return not os.path.exists(self.video_path)

    def delete_thumb(self) -> bool:
        os.remove(self.thumbnail_path)
        return not os.path.exists(self.thumbnail_path)

    def exists(self) -> bool:
        return os.path.exists(self.video_path)

    def thumb_exists(self) -> bool:
        return os.path.exists(self.thumbnail_path)


class DeletedVideo(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    title: str = Field(...)
    video_path: str = Field(...)
    filesize: int = Field(...)
    extra_info: str = Field(default="{}")

    def set_extra(self, extra: dict) -> str:
        self.extra_info = json.dumps(extra)
        return self.extra_info

    def get_extra(self) -> dict:
        return json.loads(self.extra_info)
