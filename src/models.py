from pydantic import BaseModel, Field
from uuid import uuid4

class VideoPreview(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex, description="The ID of the video item")
    title: str = Field(..., description="The title of the video")
    modified_time: float = Field(..., description="The unix timestamp of modified metadata of the file")

class Directory(BaseModel):
    videos: list[VideoPreview] = Field(..., description="The List Containing all the videos")
