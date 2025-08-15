from fastapi import APIRouter, HTTPException, Depends, Header
from src.data_store import get_session, Session, os
from fastapi.responses import FileResponse
from src.models import VideoServer, Video
from sqlmodel import select
from typing import Any

router = APIRouter()

@router.get('/video')
async def get_video(video_id: str, session: Session = Depends(get_session)):

    video: VideoServer | None = session.exec(select(VideoServer).where(VideoServer.video_id == video_id)).first()
    if not video:
        raise HTTPException(400, detail="Unable to find video's info related to id: {}".format(video_id))

    if not os.path.exists(video.video_path):
        raise HTTPException(404, detail="File doesn't exist on server!")

    response = FileResponse(
        video.video_path,
        filename=video.video.title,
        media_type="video/mp4"
    )
    response.headers["Access-Control-Allow-Origin"] = "*"

    return response

@router.delete('/video')
async def delete_video(video_id: str, user: str = Header(...), session: Session = Depends(get_session)):
    if user != "maxim":
        raise HTTPException(401, "Unauthorized")
    
    video: VideoServer | None = session.exec(select(VideoServer).where(VideoServer.video_id == video_id)).first()
    video_data = {
        **video.dict(),
        "related_video": video.video.dict() if video.video else None
    }

    if not video:
        raise HTTPException(400, detail="Unable to find video's info related to id: {}".format(video_id))

    if not os.path.exists(video.video_path):
        return video_data
    
    linked_video: Video | None = session.exec(select(Video).where(Video.id == video.id)).first()
    if linked_video:
        session.delete(linked_video)

    os.remove(video.video_path)
    session.delete(video)
    session.commit()

    return video_data

@router.get('/videos', response_model=dict[Any, list[Video] | Any])
async def get_videos(session: Session = Depends(get_session)):
    return {"videos": session.exec(select(Video)).all()}


@router.get('/stats', response_model=Video)
async def get_stat(video_id: str, session: Session = Depends(get_session)):
    video: VideoServer | None = session.exec(select(VideoServer).where(VideoServer.video_id == video_id)).first()
    if not video:
        raise HTTPException(400, detail="Unable to find video's infor related to id: {}".format(video_id))

    if not os.path.exists(video.video_path):
        raise HTTPException(404, detail="File doesn't exist on server!")

    return video.video
