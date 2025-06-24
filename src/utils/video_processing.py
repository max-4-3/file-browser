import asyncio, json
from typing import Optional
import os
from src import THUMB_PATH
from rich import print
from uuid import uuid4


def is_likely_static_image(stream):
    if stream.get("codec_type") != "video":
        return False

    if stream.get("disposition", {}).get("attached_pic") == 1:
        return True

    codec = stream.get("codec_name", "")
    if codec in {"mjpeg", "png", "bmp"}:
        return True

    duration = float(stream.get("duration", 0))
    if duration > 0 and duration < 0.5:
        return True

    nb_frames = stream.get("nb_frames")
    if nb_frames and int(nb_frames) <= 1:
        return True

    bit_rate = int(stream.get("bit_rate", 0))
    if bit_rate > 0 and bit_rate < 10000:
        return True

    return False

async def gather_info_for(fp: str) -> dict:
    data = {
        "success": False
    }

    if not os.path.exists(fp):
        return data

    ffprobe_cmd = [
        "ffprobe",
        "-hide_banner",
        "-v",
        "error",  # Only show errors, helps keep stdout clean
        "-of",
        "json",
        "-show_streams",  # Crucial: include stream information
        "-select_streams",
        "v",  # Optional: filter to only video streams
        "-i",
        fp,
    ]
    ffprobe_proccess = await asyncio.create_subprocess_exec(
        *ffprobe_cmd, stderr=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE
    )
    stdout, stderr = await ffprobe_proccess.communicate()
    if ffprobe_proccess.returncode == 0:
        try:
            output = (stdout or stderr).decode("utf-8")
            ffprobe_data = json.loads(output)

            duration = 0 
            stream = None
            for s in ffprobe_data.get("streams", []):
                if is_likely_static_image(s):
                    stream = s
                duration = getattr(s, "duration", 0)

            if stream:
                print(
                    f"[Thumbnail] Likely Thumbnail Stream Found! Index: {stream['index']}"
                )
                data["success"] = True
                data["data"] = {
                    "thumbnail_stream": stream,
                    "contains_thumb": True,
                    "duration": duration
                }
                return data
            else:
                print("[Thumbnail] No attached thumbnail stream found.")
        except json.JSONDecodeError as e:
            print("[Error] ffprobe Unable to parse output:", e)
            print("Output:\n", stdout or stderr)
    else:
        print(
            f"[Error] ffprobe failed with exit code {ffprobe_proccess.returncode}:"
        )

    return data

async def extract_thumbnail(
    video_path: str, thumbnail_base_name: Optional[str] = None
) -> Optional[str] | bool:
    """
    Extracts a thumbnail from a video file using FFmpeg.

    Args:
        video_path: The path to the video file.
        thumbnail_base_name: An optional base name for the thumbnail file.
            If None, a UUID will be used.

    Returns:
        The path to the extracted thumbnail file on success, False on failure.
    """
    if not os.path.isfile(video_path):
        print(
            f"[Error] Video file not found: [cyan]{video_path}[/cyan]"
        )  # Added: Print the video path
        return False

    try:
        # Create a thumbnail output path
        os.makedirs(THUMB_PATH, exist_ok=True)
        thumb_filename = (
            f"{thumbnail_base_name if thumbnail_base_name else uuid4().hex}_thumb.png"
        )
        tmp_path = os.path.join(THUMB_PATH, thumb_filename)

        contains_thumb = False, -99
        
        # Extract info dict for current video file
        video_info = await gather_info_for(video_path)

        # Check whether the info extraction is succesful
        if video_info["success"]:
            try:
                contains_thumb = video_info["data"]["contains_thumb"], int(video_info["data"]["thumbnail_stream"]["index"])
            except:  # Can raise error in int conversion 
                pass

        if contains_thumb[0]:
            extract_cmd = [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-v",
                "error",
                "-i",
                video_path,
                "-map",
                f"0:{contains_thumb[1]}",
                "-c:v",
                "png",
                "-frames:v",
                "1",
                tmp_path,
            ]
        else:
            extract_cmd = [
                "ffmpeg",
                "-y",
                "-i",
                video_path,
                "-ss",
                "00:00:05",
                "-vf",
                "thumbnail",  
                "-frames:v",
                "1",
                tmp_path,
            ]

        extract_process = await asyncio.create_subprocess_exec(  # Use asyncio
            *extract_cmd,
            stdin=asyncio.subprocess.PIPE,  # Use asyncio
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,  # Capture stderr
        )
        await extract_process.wait()  # Wait for completion

        if extract_process.returncode != 0:
            print(
                f"[Error] ffmpeg failed with exit code {extract_process.returncode}:"
                f" [cyan]{' '.join(extract_cmd)}[/cyan]"
            )
            extract_stderr = (
                await extract_process.stderr.read() if extract_process.stderr else b""
            )  # Read stderr
            if extract_stderr:
                print(
                    f"[Error] ffmpeg stderr: {extract_stderr.decode('utf-8').strip()}"
                )
            return False

        if os.path.exists(tmp_path):
            print(
                f"[Success] Created thumbnail: [cyan]{os.path.basename(video_path)}[/cyan] [red]@[/red] [green]{THUMB_PATH}[/green]"
            )
            return tmp_path
        else:
            print(
                f"[Error] Thumbnail file was not created: [cyan]{tmp_path}[/cyan]"
            )  # Added
            return False

    except Exception as e:
        print(f"[Error] An unexpected error occurred: {e}")
        return False
