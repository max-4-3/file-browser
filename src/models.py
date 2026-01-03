from typing import Optional
from sqlmodel import SQLModel, Column, JSON, Field
from pydantic import BaseModel
import os
from datetime import datetime


class VideosDataBase(SQLModel, table=True):
    id: str = Field(default=None, primary_key=True)
    title: str = Field(...)
    video_path: str = Field(...)
    thumbnail_path: str = Field(...)

    filesize: int = Field(default=-1)
    modified_time: float = Field(default_factory=datetime.now().timestamp)
    duration: int = Field(default=-1)
    timestamp: float = Field(default_factory=datetime.now().timestamp)

    extras: dict = Field(sa_column=Column(JSON), default_factory=dict)

    def exist(self) -> bool:
        return os.path.exists(self.video_path)

    def exist_thumb(self) -> bool:
        return os.path.exists(self.thumbnail_path)

    def delete_thumb(self):
        if self.exist_thumb():
            os.remove(self.thumbnail_path)
    
    def delete(self):
        if self.exist():
            os.remove(self.video_path)

class VideoResponse(BaseModel):
    id: str = Field(...)
    title: str

    duration: int
    filesize: int
    modified_time: float
    extras: dict

class VideoUpdate(BaseModel):
    title: Optional[str]

class DeletedVideo(SQLModel, table=True):
    id: str = Field(default=None, primary_key=True)
    title: str = Field(...)
    video_path: str = Field(...)
    duration: int = Field(...)
    filesize: int = Field(...)
    timestamp: float = Field(default_factory=datetime.now().timestamp)
    extras: dict = Field(sa_column=Column(JSON), default_factory=dict)

class DeletedVideoResponse(BaseModel):
    id: str = Field(default_factory=str)
    title: str = Field(...)
    duration: int = Field(...)
    filesize: int = Field(...)
    timestamp: float = Field(...)
    extras: dict = Field(...)
