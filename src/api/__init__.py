from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from src.sessions import NormalSession, DeletedVideosSession, Session
from sqlmodel import select
from src.api.exceptions import VideoInfoNotFound, FileNotFoundOnServer


router = APIRouter()
normal_session = NormalSession()
deleted_video_session = DeletedVideosSession()

__all__ = (
    "router",
    "HTTPException",
    "Depends",
    "FileResponse",
    "select",
    "normal_session",
    "deleted_video_session",
    "Session",
    "VideoInfoNotFound",
    "FileNotFoundOnServer"
)
