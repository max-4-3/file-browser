from fastapi import HTTPException


class VideoInfoNotFound(HTTPException):
    def __init__(self, video_id: int):
        super().__init__(
            status_code=400,
            detail=f"Unable to find video's info related to id: {video_id}",
        )


class FileNotFoundOnServer(HTTPException):
    def __init__(self, file_path: str | None = None):
        msg = "File doesn't exist on server!"
        if file_path:
            msg += f" (path: {file_path})"
        super().__init__(status_code=404, detail=msg)
