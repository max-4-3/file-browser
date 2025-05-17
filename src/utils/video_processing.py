import asyncio
from typing import Optional
import os
from src import THUMB_PATH
from rich import print
from uuid import uuid4

async def extract_thumbnail(video_path: str, thumbnail_base_name: Optional[str] = None) -> Optional[str]:
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
        print(f"[Error] Video file not found: [cyan]{video_path}[/cyan]")  # Added: Print the video path
        return False

    try:
        # # Step 1: Check for attached thumbnail stream using ffprobe
        # probe_cmd = [
        #     "ffprobe",
        #     "-v",
        #     "error",
        #     "-select_streams",
        #     "v",
        #     "-show_entries",
        #     "stream=index:disposition_tags",
        #     "-of",
        #     "csv=p=0",
        #     "-hide_banner",
        #     video_path,
        # ]
        # probe_process = await asyncio.create_subprocess_exec(  # Use asyncio
        #     *probe_cmd,
        #     stdout=asyncio.subprocess.PIPE,  # Use asyncio
        #     stderr=asyncio.subprocess.PIPE,  # Use asyncio
        # )
        # probe_output, probe_stderr = await probe_process.communicate()  # Use asyncio

        # if probe_process.returncode != 0:
        #     print(
        #         f"[Error] ffprobe failed with exit code {probe_process.returncode}:"
        #         f" [cyan]{' '.join(probe_cmd)}[/cyan]"
        #     )
        #     if probe_stderr:
        #         print(f"[Error] ffprobe stderr: {probe_stderr.decode('utf-8').strip()}")
        #     return False

        # print(f"{probe_output = }; {probe_output.decode('utf-8') = }")
        # exit(0)
        # probe_output_str = probe_output.decode("utf-8").strip()  # Decode once
        # probe_lines = probe_output_str.splitlines()
        # attached_index = None

        # for line in probe_lines:
        #     index_str, disp_str = line.split("|", 1)
        #     if int(disp_str) & 32:  # 32 is the attached_pic bit
        #         attached_index = index_str
        #         break

        # Create a thumbnail output path
        os.makedirs(THUMB_PATH, exist_ok=True)
        thumb_filename = f"{thumbnail_base_name if thumbnail_base_name else uuid4().hex}_thumb.png"
        tmp_path = os.path.join(THUMB_PATH, thumb_filename)

        if False:
            extract_cmd = [
                "ffmpeg",
                "-y",
                "-i",
                video_path,
                "-map",
                f"0:v:{int(attached_index)}",
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
                "thumbnail",  # raw string for cross-platform compatibility
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
            extract_stderr = await extract_process.stderr.read() if extract_process.stderr else b""  # Read stderr
            if extract_stderr:
                print(f"[Error] ffmpeg stderr: {extract_stderr.decode('utf-8').strip()}")
            return False

        if os.path.exists(tmp_path):
            print(
                f"[Success] Created thumbnail: [cyan]{os.path.basename(video_path)}[/cyan] [red]@[/red] [green]{THUMB_PATH}[/green]"
            )
            return tmp_path
        else:
            print(f"[Error] Thumbnail file was not created: [cyan]{tmp_path}[/cyan]")  #Added
            return False

    except Exception as e:
        print(f"[Error] An unexpected error occurred: {e}")
        return False