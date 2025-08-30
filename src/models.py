from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from uuid import uuid4


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


class DeletedVideo(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    title: str = Field(...)
    video_path: str = Field(...)
    filesize: int = Field(...)
    extra_info: str = Field(default="{}")
    
