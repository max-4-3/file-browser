from fastapi import APIRouter, HTTPException
from src.data_store import get_video_data
from fastapi.responses import FileResponse

router = APIRouter()

@router.get('/thumbnail')
async def get_thumbnail(video_id: str):
    data = get_video_data()

    video_data = data.get(video_id)
    if not video_data:
        raise HTTPException(400, detail="Unable to find video's info related to id: {}".format(video_id))
    
    fp = video_data.get('thumb_path')
    if not fp:
        raise HTTPException(404, detail="File doesn't exist on server!")
    
    return FileResponse(
        fp,
        filename=video_data.get('title'),
        media_type='image/png'
    )

