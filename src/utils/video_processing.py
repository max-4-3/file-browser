import asyncio
import json
import os
from uuid import uuid4
from src import THUMB_PATH, PERFORMANCE
from src.models import Video, VideoServer


def convert_time(time_float: float) -> str:
    total_seconds = max(int(time_float), 0)
    minutes = total_seconds // 60
    secs = total_seconds % 60
    return f"{minutes:02}:{secs:02}"


def is_likely_static_image(stream):
    if stream.get("disposition", {}).get("attached_pic") == 1:
        return True
    if stream.get("codec_name") in {"mjpeg", "png", "bmp"}:
        return True
    if 0 < float(stream.get("duration", 0)) < 0.5:
        return True
    if int(stream.get("nb_frames", "2")) <= 1:
        return True
    if int(stream.get("bit_rate", "20000")) < 10000:
        return True
    if stream.get("codec_type") != "video":
        return False
    return False


async def generate_thumbnail(
        vid_path: str,
        stream_idx: int,
        vid_duration: str | float,
        root_path: str = None,
        file_name_prefix: str = "thumbnail_"
):

    root_path = root_path or THUMB_PATH

    os.makedirs(root_path, exist_ok=True)
    output_path = os.path.join(
        root_path or os.getcwd(),
        # Add .webp for faster loading (client side) & less storage
        file_name_prefix + uuid4().hex + (".webp" if PERFORMANCE else ".png")
    )

    if stream_idx < -1:
        # Fast seek before input
        midpoint = str(int(float(vid_duration) / 2))
        cmd = [
            "ffmpeg",
            "-ss", midpoint,
            "-t", "1",  # Optional: only decode 1s
            "-i", vid_path,
            "-frames:v", "1",
            "-y",
            output_path
        ]
    else:
        # Stream index selection — no midpoint
        cmd = [
            "ffmpeg",
            "-i", vid_path,
            "-map", f"0:{stream_idx}",
            "-frames:v", "1",
            "-y",
            output_path
        ]

    if PERFORMANCE:
        # Scales the image down to 640 (maintaing ar)
        optimization = ["-vf", "scale=640:-1"]
        # Add optimization before output
        cmd = cmd[:-1] + optimization + [cmd[-1]]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL
    )
    await process.wait()
    return output_path if os.path.exists(output_path) else None


async def generate_video_info(
        sem: asyncio.Semaphore,
        vid_path: str
) -> tuple[Video, VideoServer] | None:

    async with sem:
        format_command = [
            "ffprobe", "-print_format", "json", "-show_format",
            "-show_streams", "-select_streams", "v", "-show_entries",
            "stream_tags:format_tags", "-v", "quiet", vid_path
        ]

        proc = await asyncio.create_subprocess_exec(
            *format_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise Exception(f"FFprobe failed on {vid_path}")

        video_probe = json.loads(
            (stdout or stderr or b'{}').decode(errors="ignore"))
        format_info = video_probe.get("format", {})
        duration = float(format_info.get("duration", 0))
        size = int(format_info.get("size", 0))
        title = os.path.splitext(os.path.basename(vid_path))[0]

        video_obj = Video(
            title=title,
            duration=convert_time(duration),
            filesize=size,
            modified_time=os.path.getmtime(vid_path)
        )

        # find likely static image stream
        thumb_stream_index = -2
        for stream in video_probe.get("streams", []):
            if is_likely_static_image(stream):
                thumb_stream_index = int(stream["index"])
                break

        thumb_path = await generate_thumbnail(
            vid_path,
            thumb_stream_index,
            duration
        )
        if not thumb_path:
            raise OSError("Thumbnail generation failed")

        video_server = VideoServer(
            video_id=video_obj.id,
            video_path=vid_path,
            thumbnail_path=thumb_path
        )

        return video_obj, video_server
