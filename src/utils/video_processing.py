import asyncio
import json
import os
from hashlib import sha512
from pathlib import Path
from uuid import uuid4
from collections.abc import Mapping

from src import THUMB_PATH, PERFORMANCE
from src.models import VideosDataBase


def convert_time(time_float: float) -> str:
    total_seconds = max(int(time_float), 0)
    minutes = total_seconds // 60
    secs = total_seconds % 60
    return f"{minutes:02}:{secs:02}"


def create_extras(ffprobe: dict) -> dict:
    #fmt: off
    stream_keys = [
        "id",                 # 0x1 (str)
        "index",              # 0 (int)
        "codec_type",         # video
        "codec_name",         # h264
        "codec_long_name",    # H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
        "profile",            # Main
        "codec_tag_string",   # avc1
        "is_avc",             # "true" (str)
        "width",              # 1920 (int)
        "height",             # 1080 (int)
        "pix_fmt",            # yuv420p
        "level",              # 40 (int, can be -ve)
        "has_b_frames",       # 0 (int)
        "r_frame_rate",       # 25/1 (str)
        "avg_frame_rate",     # number/number (str)
        "start_time",         # 0.00 (str)
        "duration",           # float (str)
        "start_pts",          # 20 (int)
        "duration_ts",        # 12290291 (int)
        "bit_rate",           # 1213131 (str)
        "tags",               # {...}
    ]
    format_keys = [
        "format_name",        # mov,mp4,m4a,3gp,3g2,mj2
        "format_long_name",   # QuickTime / MOV
        "start_time",         # 0.0 (str)
        "duration",           # float (str)
        "size",               # int (str)
        "bit_rate",           # int (str)
        "probe_score",        # int
        "tags",               # {...}
    ]
    disp_keys = [
        "attached_pic",       # int (0/1)
        "still_image",        # int (0/1)
        "metadata",           # int (0/1)
    ]
    #fmt: on

    def pick_attrs(obj: object, *keys: str, default=None) -> dict:
        data = {}
        if isinstance(obj, Mapping):
            get_key = obj.get
        else:
            get_key = lambda key: getattr(obj, key)

        for key in keys:
            value = get_key(key)
            data[key] = default if value is None else value

        return data

    streams = []
    for stream in ffprobe.get("streams") or []:
        disp = pick_attrs(stream.get("disposition") or {}, *disp_keys)

        streams.append({**pick_attrs(stream, *stream_keys), "disposition": disp})

    format = pick_attrs(ffprobe.get("format"), *format_keys)
    del ffprobe["streams"], ffprobe["format"]

    return {"streams": streams, "format": format, **ffprobe}


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
    root_path: str | None = None,
    file_name_prefix: str = "thumbnail_",
):

    root_path = root_path or THUMB_PATH

    os.makedirs(root_path, exist_ok=True)
    output_path = os.path.join(
        root_path or os.getcwd(),
        # Add .webp for faster loading (client side) & less storage
        file_name_prefix + uuid4().hex + (".webp" if PERFORMANCE else ".png"),
    )

    if stream_idx < -1:
        # Fast seek before input
        midpoint = str(int(float(vid_duration) / 2))
        cmd = [
            "ffmpeg",
            "-ss",
            midpoint,
            "-t",
            "1",  # Optional: only decode 1s
            "-i",
            vid_path,
            "-frames:v",
            "1",
            "-y",
            output_path,
        ]
    else:
        # Stream index selection — no midpoint
        cmd = [
            "ffmpeg",
            "-i",
            vid_path,
            "-map",
            f"0:{stream_idx}",
            "-frames:v",
            "1",
            "-y",
            output_path,
        ]

    if PERFORMANCE:
        # Scales the image down to 640 (maintaing ar)
        optimization = ["-vf", "scale=640:-1"]
        # Add optimization before output
        cmd = cmd[:-1] + optimization + [cmd[-1]]

    process = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
    )
    await process.wait()
    return output_path if os.path.exists(output_path) else None


async def generate_video_info(
    sem: asyncio.Semaphore, vid_path: str
) -> VideosDataBase | None:

    async with sem:
        _vid_path = Path(vid_path)

        format_command = [
            "ffprobe",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            "-select_streams",
            "v",
            "-show_entries",
            "stream_tags:format_tags",
            "-v",
            "quiet",
            vid_path,
        ]

        proc = await asyncio.create_subprocess_exec(
            *format_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise Exception(f"FFprobe failed on {vid_path}")

        video_probe = json.loads((stdout or stderr or b"{}").decode(errors="ignore"))
        format_info = video_probe.get("format", {})
        duration = int(float(format_info.get("duration", 0)))
        size = int(format_info.get("size", 0))

        # find likely static image stream
        thumb_stream_index = -2
        for stream in video_probe.get("streams", []):
            if is_likely_static_image(stream):
                thumb_stream_index = int(stream["index"])
                break

        thumb_path = await generate_thumbnail(vid_path, thumb_stream_index, duration)
        if not thumb_path:
            raise OSError("Thumbnail generation failed")

        return VideosDataBase(
            id=sha512((vid_path + thumb_path).encode()).hexdigest(),
            title=_vid_path.stem,
            video_path=vid_path,
            thumbnail_path=thumb_path,
            duration=duration,
            filesize=size,
            modified_time=_vid_path.stat().st_mtime,
            extras=create_extras(ffprobe=video_probe),
        )
