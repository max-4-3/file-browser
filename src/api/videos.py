from fastapi import Header
import json
from src.models import VideoServer, Video, DeletedVideo

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


@router.get("/video")
async def get_video(
    video_id: str, session: Session = Depends(normal_session.get_session)
):

    video_server: VideoServer | None = session.exec(
        select(VideoServer).where(VideoServer.video_id == video_id)
    ).first()

    if not video_server:
        raise VideoInfoNotFound(video_id)

    if not video_server.exists():
        raise FileNotFoundOnServer()

    response = FileResponse(
        video_server.video_path,
        filename=(
            video_server.video.title + ".mp4"
            if video_server.video
            else "Untitled_video.mp4"
        ),
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

    video: Video | None = session.exec(
        select(Video).where(Video.id == video_id)
    ).first()

    if not video:
        raise VideoInfoNotFound(video_id)

    video_server: VideoServer | None = session.exec(
        select(VideoServer).where(VideoServer.video_id == video.id)
    ).first()

    if not video_server:
        raise VideoInfoNotFound(f"{video_id} (2)")

    video_data = {
        **(video_server.model_dump()),
        "related_video": (
            video_server.video.model_dump() if video_server.video else None
        ),
    }

    if not video_server.exists():
        return video_data

    # Delete from database
    session.delete(video)
    session.delete(video_server)

    # Delete locally
    video_server.delete()
    video_server.delete_thumb()

    # Adds to deleted_videos_database
    second_session = next(deleted_video_session.get_session())
    second_session.add(
        DeletedVideo(
            id=video_data.get(
                "video_id", "No Valid Info, Check 'extra info'."
            ),
            title=video_data.get("related_video", {}).get(
                "title", "No Valid Info, Check 'extra info'."
            ),
            filesize=video_data.get("related_video", {}).get(
                "filesize", -1
            ),
            video_path=video_data.get(
                "video_path", "No Valid Info, Check 'extra info'."
            ),
            extra_info=json.dumps(video_data) if video_data else "{}",
        )
    )

    # Commit Changes to databases
    second_session.commit()
    session.commit()

    return video_data


@router.get("/videos")
async def get_videos(session: Session = Depends(normal_session.get_session)):
    return {"videos": session.exec(select(Video)).all()}


@router.get("/stats", response_model=Video)
async def get_stat(
    video_id: str, session: Session = Depends(normal_session.get_session)
):
    video_server: VideoServer | None = session.exec(
        select(VideoServer).where(VideoServer.video_id == video_id)
    ).first()

    if not video_server:
        raise VideoInfoNotFound(video_id)

    if not video_server.exists():
        raise FileNotFoundOnServer()

    return video_server.video
