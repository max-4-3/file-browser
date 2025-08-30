from fastapi import APIRouter, HTTPException, Depends, Header
from src.data_store import get_session, Session, os
from fastapi.responses import FileResponse
from src.models import VideoServer, Video, DeletedVideo
from sqlmodel import select
from typing import Any
import json

router = APIRouter()


@router.get('/video')
async def get_video(video_id: str, session: Session = Depends(get_session)):

    video_server: VideoServer | None = session.exec(
        select(VideoServer).where(VideoServer.video_id == video_id)
    ).first()
    
    if not video_server:
        raise HTTPException(
            400, detail="Unable to find video's info related to id: {}".format(video_id))

    if not os.path.exists(video_server.video_path):
        raise HTTPException(404, detail="File doesn't exist on server!")

    response = FileResponse(
        video_server.video_path,
        filename=video_server.video.title if video_server.video else 'Untitled_video.mp4',
        media_type="video/mp4"
    )
    response.headers["Access-Control-Allow-Origin"] = "*"

    return response


@router.delete('/video')
async def delete_video(video_id: str, user: str = Header(...), session: Session = Depends(get_session)):
    if user != "maxim":
        raise HTTPException(401, "Unauthorized")

    video: Video | None = session.exec(
        select(Video).where(Video.id == video_id)
    ).first()

    if not video:
        raise HTTPException(
            400, detail="Unable to find video's info related to id: {}".format(video_id)
        )

    video_server: VideoServer | None = session.exec(
        select(VideoServer).where(VideoServer.video_id == video.id)
    ).first()

    if not video_server:
        raise HTTPException(
            400, detail="Unable to find video's(2) info related to id: {}".format(video_id)
        )

    video_data = {
        **(video_server.video.model_dump() if video_server.video else {}),
        "related_video": video_server.video.model_dump() if video_server.video else None
    }

    if not os.path.exists(video_server.video_path):
        return video_data

    session.delete(video)
    os.remove(video_server.video_path)
    session.delete(video_server)
    session.add(
        DeletedVideo(
            id=video_data.get("related_video", {}).get("id", "No Valid Info, Check 'extra info'."),
            title=video_data.get("related_video", {}).get("title", "No Valid Info, Check 'extra info'."), 
            filesize=video_data.get("related_video", {}).get("filesize", -1), 
            video_path=video_data.get("video_path", "No Valid Info, Che`ck 'extra info'."), 
            extra_info=json.dumps(video_data) if video_data else "{}"
        )
    )
    session.commit()

    return video_data


@router.get('/videos', response_model=dict[Any, list[Video] | Any])
async def get_videos(session: Session = Depends(get_session)):
    return {"videos": session.exec(select(Video)).all()}


@router.get('/stats', response_model=Video)
async def get_stat(video_id: str, session: Session = Depends(get_session)):
    video_server: VideoServer | None = session.exec(
        select(VideoServer).where(VideoServer.video_id == video_id)
    ).first()
    
    if not video_server:
        raise HTTPException(
            400, detail="Unable to find video's info related to id: {}".format(video_id))

    if not os.path.exists(video_server.video_path):
        raise HTTPException(404, detail="File doesn't exist on server!")

    return video_server.video
