from fastapi import APIRouter, HTTPException
from src.data_store import get_video_data
from fastapi.responses import FileResponse
from src.models import Directory, VideoPreview

router = APIRouter()

@router.get('/video')
async def get_video(video_id: str):
    data = get_video_data()

    video_data = data.get(video_id)
    if not video_data:
        raise HTTPException(400, detail="Unable to find video's info related to id: {}".format(video_id))

    fp = video_data.get('video_path')
    if not fp:
        raise HTTPException(404, detail="File doesn't exist on server!")
    
    return FileResponse(
        fp,
        filename=video_data.get('title'),
        media_type='video/mp4'
    )

@router.get('/videos', response_model=Directory)
async def get_videos():
    data = get_video_data()

    return Directory(
        videos = [
            VideoPreview(
                id = id,
                title = d.get('title'),
                modified_time = d.get('m_time')
            ) for id, d in zip(data.keys(), data.values())
        ]
    )

@router.get('/stats', response_model=VideoPreview)
async def get_stat(video_id: str):
    data = get_video_data()

    video_data = data.get(video_id)
    if not video_data:
        raise HTTPException(400, detail="Unable to find video's info related to id: {}".format(video_id))

    fp = video_data.get('video_path')
    if not fp:
        raise HTTPException(404, detail="File doesn't exist on server!")
  
    return VideoPreview(
        id=video_data["id"], title=video_data["title"], modified_time=video_data["m_time"]
    )

