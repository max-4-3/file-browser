from src.models import VideosDataBase
from src.api import (
    router,
    select,
    normal_session,
    Depends,
    Session,
    FileResponse,
    VideoInfoNotFound,
    FileNotFoundOnServer,
)


@router.get("/thumbnail")
async def get_thumbnail(
    video_id: str, session: Session = Depends(normal_session.get_session)
):
    video_server = session.exec(
        select(VideosDataBase).where(VideosDataBase.id == video_id)
    ).first()

    if not video_server:
        raise VideoInfoNotFound(video_id)

    if not video_server.exist():
        raise FileNotFoundOnServer()

    response = FileResponse(
        video_server.thumbnail_path,
        filename=(
            video_server.title + ".jpg"
        ),
    )
    response.headers["Access-Control-Allow-Origin"] = "*"

    return response
