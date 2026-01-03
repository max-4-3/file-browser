from fastapi import HTTPException
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

@router.patch("/thumbnail/{video_id}")
async def patch_thumbnail(video_id: str, session: Session = Depends(normal_session.get_session)):
    video_server = session.exec(select(VideosDataBase).where(VideosDataBase.id == video_id)).first()

    if not video_server:
        raise VideoInfoNotFound(video_id)

    if not video_server.exist():
        raise FileNotFoundOnServer()

    from src.utils.video_processing import generate_thumbnail

    new_thumbnail = await generate_thumbnail(video_server.video_path, -2, video_server.duration)
    if not new_thumbnail:
        raise HTTPException(500, "Unable to generate thumbnail")

    video_server.delete_thumb()
    video_server.thumbnail_path = new_thumbnail
    session.commit()
    session.refresh(video_server)

    return await get_thumbnail(video_id, session)






