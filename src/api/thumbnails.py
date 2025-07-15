from fastapi import APIRouter, HTTPException, Depends
from src.data_store import get_session, Session, Video, VideoServer, os
from fastapi.responses import FileResponse
from sqlmodel import select

router = APIRouter()

@router.get('/thumbnail')
async def get_thumbnail(video_id: str, session: Session = Depends(get_session)):
    video: VideoServer | None = session.exec(select(VideoServer).where(VideoServer.video_id == video_id)).first()
    if not video:
        raise HTTPException(400, detail="Unable to find video's infor related to id: {}".format(video_id))

    if not os.path.exists(video.video_path):
        raise HTTPException(404, detail="File doesn't exist on server!")

    return FileResponse(
        video.thumbnail_path,
        filename=video.video.title,
        media_type="video/mp4"
    )

    # data = get_video_data()

    # video_data = data.get(video_id)
    # if not video_data:
    #     raise HTTPException(400, detail="Unable to find video's info related to id: {}".format(video_id))
    
    # fp = video_data.get('thumb_path')
    # if not fp:
    #     raise HTTPException(404, detail="File doesn't exist on server!")
    
    # return FileResponse(
    #     fp,
    #     filename=video_data.get('title'),
    #     media_type='image/png'
    # )

