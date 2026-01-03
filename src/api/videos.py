from datetime import datetime, timezone
from fastapi import Body, Header
from sqlalchemy.sql.base import SchemaEventTarget
from src.models import (
    DeletedVideo,
    VideoResponse,
    VideoUpdate,
    VideosDataBase,
    DeletedVideoResponse,
)
from src.utils.helpers import convert_db_to_response

from src.api import (
    router,
    select,
    normal_session,
    deleted_video_session,
    Session,
    Depends,
    FileResponse,
    HTTPException,
    VideoInfoNotFound,
    FileNotFoundOnServer,
)


@router.get("/deleted")
async def get_deleted(
    video_id: str | None = None,
    session: Session = Depends(deleted_video_session.get_session),
):
    if video_id:
        videos = session.exec(
            select(DeletedVideo).where(DeletedVideo.id == video_id)
        ).all()
    else:
        videos = session.exec(select(DeletedVideo)).all()

    return {"results": [DeletedVideoResponse(**de.model_dump()) for de in videos]}


@router.get("/video")
async def get_video(
    video_id: str, session: Session = Depends(normal_session.get_session)
):

    video = session.exec(
        select(VideosDataBase).where(VideosDataBase.id == video_id)
    ).first()

    if not video:
        raise VideoInfoNotFound(video_id)

    if not video.exist():
        raise FileNotFoundOnServer()

    response = FileResponse(
        video.video_path,
        filename=(video.title + ".mp4"),
        media_type="video/mp4",
    )
    response.headers["Access-Control-Allow-Origin"] = "*"

    return response


@router.delete("/video")
async def delete_video(
    video_id: str,
    user: str = Header(...),
    session: Session = Depends(normal_session.get_session),
):
    if user != "maxim":
        raise HTTPException(401, "Unauthorized")

    video = session.exec(
        select(VideosDataBase).where(VideosDataBase.id == video_id)
    ).first()

    if not video:
        raise VideoInfoNotFound(video_id)

    video_data = {**(convert_db_to_response(video, True).model_dump())}

    if not video.exist():
        return video_data

    # Adds to deleted_videos_database
    second_session = next(deleted_video_session.get_session())
    second_session.add(
        DeletedVideo(
            id=video.id,
            title=video.title,
            video_path=video.video_path,
            duration=video.duration,
            filesize=video.filesize,
            extras=video.extras,
        )
    )

    # Delete from database
    session.delete(video)

    # Commit Changes to databases
    second_session.commit()
    session.commit()

    # Delete locally
    video.delete()
    video.delete_thumb()

    return video_data


@router.patch("/video")
async def update_video(
    video_id: str,
    payload: VideoUpdate,
    session: Session = Depends(normal_session.get_session),
):
    video_db = session.exec(
        select(VideosDataBase).where(VideosDataBase.id == video_id)
    ).first()
    if not video_db:
        raise HTTPException(404, "Not found")

    def response_success(modal):
        return {
            "updated": (
                convert_db_to_response(modal)
                if not isinstance(modal, list)
                else list(map(convert_db_to_response, modal))
            )
        }

    updated_fields = {}
    for key, value in payload.model_dump(exclude_unset=True).items():
        if hasattr(video_db, key) and value is not None:
            updated_fields[f"prev_{key}"] = str(getattr(video_db, key))
            setattr(video_db, key, value)

    if not updated_fields:
        return response_success(video_db)

    if video_db.extras is None:
        video_db.extras = {}

    update_key = f"update_{datetime.now(tz=timezone.utc).timestamp()}"

    extras = dict(video_db.extras or {})
    extras[update_key] = updated_fields
    video_db.extras = extras

    session.commit()
    session.refresh(video_db)

    return response_success(video_db)


@router.get("/videos")
async def get_videos(
    extras: bool = False, session: Session = Depends(normal_session.get_session)
):
    videos = session.exec(select(VideosDataBase)).all()
    return {"videos": [convert_db_to_response(d, extras) for d in videos]}


@router.get("/stats", response_model=VideoResponse)
async def get_stat(
    video_id: str,
    extras: bool = False,
    session: Session = Depends(normal_session.get_session),
):
    video_server = session.exec(
        select(VideosDataBase).where(VideosDataBase.id == video_id)
    ).first()

    if not video_server:
        raise VideoInfoNotFound(video_id)

    if not video_server.exist():
        raise FileNotFoundOnServer()

    return convert_db_to_response(video_server, extras)
