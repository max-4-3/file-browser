import os
import json
import asyncio
from uuid import uuid4
from rich import print
from src.utils.video_processing import extract_thumbnail
from src.data_store import get_video_data, update_video_data
from src import ALLOWED_FILES, ROOT_DIRS, DATA_FOLDER


def save_data(data, fp):
    with open(fp, "w", errors="ignore", encoding="utf-8") as file:
        json.dump(data, file, indent=4, ensure_ascii=False)


def load_data(fp):
    with open(fp, "r", errors="ignore", encoding="utf-8") as file:
        return json.load(file)


async def _process_video(vid_path: str) -> dict:
    vid_id = uuid4().hex
    thumb_path = await extract_thumbnail(vid_path, vid_id)
    if not thumb_path:
        return None

    return {
        "id": vid_id,
        "title": os.path.splitext(os.path.basename(vid_path))[0],
        "thumb_path": thumb_path,
        "video_path": vid_path,
        "m_time": os.path.getmtime(vid_path),
    }


async def make_data():
    files_to_add = []

    for root_dir in ROOT_DIRS:
        for root, _, files in os.walk(root_dir):
            for file in files:
                name, ext = os.path.splitext(file)

                if (not ext) or (ext not in ALLOWED_FILES):
                    continue

                print(f"[[green]+[/green]] {name + ext}")
                files_to_add.append(os.path.join(root, file))

    if not files_to_add:
        return

    os.makedirs(DATA_FOLDER, exist_ok=True)

    async def proc_wrapper(sem, before: str, *args, **kwargs):
        print(before)
        async with sem:
            return await _process_video(*args, **kwargs)

    sem = asyncio.Semaphore(10)
    tasks = [asyncio.create_task(proc_wrapper(sem, f"Making thumbnail for: {os.path.basename(file)}", file)) for file in files_to_add]
    data = {}
    for result in await asyncio.gather(*tasks):
        if not result:
            print("Skipping...")
            continue
        data[result["id"]] = result
    
    save_data(data, os.path.join(DATA_FOLDER, "video_data.json"))
    return data


async def reload_data():

    data = {}
    filenames = []

    # This creates a new "data" dict without files that doesn't exist
    for vid_data in get_video_data().values():
        vid_path = vid_data["video_path"]
        if not os.path.exists(vid_path) or os.path.splitext(vid_path)[1] not in ALLOWED_FILES:
            if os.path.exists(vid_data["thumb_path"]):
                os.remove(vid_data["thumb_path"])
            print(f"[red bold]File Removed: {vid_data["title"]}[!Exist][/bold red]")
            continue
        filenames.append(vid_data["title"])
        data[vid_data["id"]] = {k:v for k, v in vid_data.items()}


    new_files = []
    for root_path in ROOT_DIRS:
        for root, _, files in os.walk(root_path):
            for file in files:
                name, ext = os.path.splitext(file)

                if name in filenames:  # Already exists
                    continue

                if (not ext) or (ext not in ALLOWED_FILES):
                    continue

                print(f"[bold green] File Added: {name + ext}[/green bold]")
                new_files.append(os.path.join(root, name + ext))

    async def proc_wrapper(sem, before: str, *args, **kwargs):
        print(before)
        async with sem:
            return await _process_video(*args, **kwargs)

    sem = asyncio.Semaphore(10)
    tasks = [asyncio.create_task(proc_wrapper(sem, f"Making thumbnail for: {os.path.basename(file)}", file)) for file in new_files]
    for vid_data in await asyncio.gather(*tasks):
        if not vid_data:
            print("Skipping...")
            continue
        data[vid_data["id"]] = vid_data

    update_video_data(data)
    save_data(data, os.path.join(DATA_FOLDER, "video_data.json"))

    return data
