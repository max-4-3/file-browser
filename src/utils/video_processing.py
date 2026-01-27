import asyncio
from collections.abc import Mapping
from hashlib import sha512
import json
from pathlib import Path
from typing import Optional
from uuid import uuid4

from src.config import PERFORMANCE, THUMB_DIR
from src.models import VideosDataBase


def convert_time(time_float: float) -> str:
    """120.0 -> 02:00"""
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
    vid_path: str | Path,
    stream_idx: int,
    vid_duration: str | float,
    root_path: Path | str | None = None,
    file_name_prefix: str = "thumbnail_",
) -> Optional[Path]:
    """Generates a thumbnail from vid_path, fully resolves the vid_path and returns a fully resolved Path on success"""
    vid_path = Path(vid_path).expanduser().resolve()
    root_path = Path(root_path or THUMB_DIR or Path.cwd()).expanduser().resolve()
    root_path.mkdir(parents=True, exist_ok=True)

    # Add .webp for faster loading (client side) & less storage
    output_path = root_path / (
        file_name_prefix + uuid4().hex + (PERFORMANCE and ".webp" or ".png")
    )

    # Prepare the command base
    cmd: list = ["ffmpeg", "-hide_banner", "-y"]

    if stream_idx < -1:
        # Fast seek before input
        midpoint = float(vid_duration) / 2
        cmd.extend(
            [
                "-ss",
                midpoint,
                "-t",
                "1",  # Optional: only decode 1s
                "-i",
                vid_path,
                "-frames:v",
                "1",
            ]
        )
    else:
        # Stream index selection — no midpoint
        cmd.extend(
            [
                "-i",
                vid_path,
                "-map",
                f"0:{stream_idx}",
            ]
        )

    if PERFORMANCE:
        # Scales the image down to 640 (maintaing ar)
        cmd.extend(["-vf", "scale=640:-1"])

    # Append output and other to cmd
    cmd.extend(["-frames:v", "1", output_path])

    # Run the command
    process = await asyncio.create_subprocess_exec(
        *map(str, cmd),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await process.wait()
    return output_path if output_path.exists() else None


async def probe_video(vid_path: Path | str) -> bytes:
    """Uses ffprobe to probe the given the video and returns the process output as is"""
    vid_path = Path(vid_path).expanduser().resolve()

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
        *map(str, format_command),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        raise Exception(f"FFprobe failed on {vid_path}")

    return stdout or stderr or b""


async def generate_video_info(
    sem: asyncio.Semaphore, vid_path: Path | str
) -> VideosDataBase | None:

    async with sem:
        probe = await probe_video(vid_path)

    vid_path = Path(vid_path).expanduser().resolve()
    video_probe = json.loads(probe.decode(errors="ignore"))
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

    # Both `vid_path` & `thumb_path` are expanded and resolved
    return VideosDataBase(
        id=sha512((str(vid_path) + str(thumb_path)).encode()).hexdigest(),
        title=vid_path.stem,
        video_path=str(vid_path),
        thumbnail_path=str(thumb_path),
        duration=duration,
        filesize=size,
        modified_time=vid_path.stat().st_mtime,
        extras=create_extras(ffprobe=video_probe),
    )
