from src.models import VideoServer
from src.api import (
    router,
    select,
    normal_session,
    Depends,
    Session,
    FileResponse,
    VideoInfoNotFound,
    FileNotFoundOnServer
)


@router.get('/thumbnail')
async def get_thumbnail(video_id: str, session: Session = Depends(normal_session.get_session)):
    video_server: VideoServer | None = session.exec(
        select(VideoServer).where(VideoServer.video_id == video_id)
    ).first()

    if not video_server:
        raise VideoInfoNotFound(video_id)

    if not video_server.exists():
        raise FileNotFoundOnServer()

    response = FileResponse(
        video_server.thumbnail_path,
        filename=video_server.video.title + ".jpg" if video_server.video else "Untitled_thumbnail.jpg"
    )
    response.headers["Access-Control-Allow-Origin"] = "*"

    return response
