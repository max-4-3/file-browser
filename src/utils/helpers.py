import os
import asyncio
from rich import print
from src.utils.video_processing import generate_video_info
from src.data_store import Session, VideoServer, Video
from src import ALLOWED_FILES, ROOT_DIRS
from sqlmodel import select


def is_subpath(child, parent):
    try:
        return os.path.commonpath([child, parent]) == parent
    except ValueError:
        return False


async def make_data(session: Session):
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

    async def proc_wrapper(sem, before: str, fp, *args, **kwargs) -> tuple[Video, VideoServer] | None:
        print(before)
        try:
            return await generate_video_info(sem, fp)
        except Exception as e:
            print(f"[red]Error \"{fp}\"[/red]: {e}")

    sem = asyncio.Semaphore(os.cpu_count())
    tasks = [asyncio.create_task(proc_wrapper(sem, f"Making thumbnail for: {os.path.basename(file)}", file)) for file in files_to_add]

    data = []
    for result in await asyncio.gather(*tasks):
        if not result:
            print("[yellow]Skipping[/yellow]...")
            continue
        data.append(result)

    for video, video_server in data:
        try:
            session.add(video)
            session.add(video_server)
        except Exception as e:
            print(f"Exception while inseting to db:", e)
            
    session.commit()
    return True


async def reload_data(session: Session, hard_reload: bool = False):
    if hard_reload:
        print("[yellow bold]Performing hard reload: wiping DB and thumbnails...[/bold yellow]")

        # Delete all thumbnails
        all_thumbs = session.exec(select(VideoServer)).all()
        for entry in all_thumbs:
            if os.path.exists(entry.thumbnail_path):
                try:
                    os.remove(entry.thumbnail_path)
                except Exception as e:
                    print(f"[red]Failed to delete thumbnail {entry.thumbnail_path}[/red]: {e}")
            session.delete(entry)

        # Delete all DB entries        
        for entry in session.exec(select(Video)).all():
            session.delete(entry)

        session.commit()
        filename_exists = []  # We want to re-add everything

    else:
        # Partial reload: remove stale or orphaned entries only
        prev_db_data: list[VideoServer] = session.exec(select(VideoServer)).all()
        filename_exists = []

        for data_old in prev_db_data:
            vid_path = os.path.expanduser(data_old.video_path)
            if (
                not os.path.exists(vid_path) or
                os.path.splitext(vid_path)[1] not in ALLOWED_FILES or
                not any(is_subpath(vid_path, _root_path) for _root_path in ROOT_DIRS)
            ):
                if os.path.exists(data_old.thumbnail_path):
                    os.remove(data_old.thumbnail_path)
                print(f"[red bold]File Removed: {data_old.video.title} [!Exist][/bold red]")
                session.delete(data_old)
                continue

            filename_exists.append(data_old.video.title)

        session.commit()

    # Discover new video files
    new_files = []
    for root_path in ROOT_DIRS:
        for root, _, files in os.walk(root_path):
            for file in files:
                name, ext = os.path.splitext(file)

                if name in filename_exists:  # Already exists
                    continue
                if (not ext) or (ext not in ALLOWED_FILES):
                    continue

                print(f"[bold green] File Added: {name + ext}[/green bold]")
                new_files.append(os.path.join(root, name + ext))

    if not new_files:
        return True

    # Run generate_video_info concurrently with sem-limiting
    async def proc_wrapper(sem, before: str, fp, *args, **kwargs) -> tuple[Video, VideoServer] | None:
        print(before)
        try:
            return await generate_video_info(sem, fp)
        except Exception as e:
            print(f"[red]Error \"{fp}\"[/red]: {e}")

    sem = asyncio.Semaphore(os.cpu_count())
    tasks = [
        asyncio.create_task(
            proc_wrapper(sem, f"Making thumbnail for: {os.path.basename(file)}", file)
        )
        for file in new_files
    ]

    data = []
    for result in await asyncio.gather(*tasks):
        if not result:
            print("[yellow]Skipping[/yellow]...")
            continue
        data.append(result)

    # Add new data to DB
    for video, video_server in data:
        try:
            session.add(video)
            session.add(video_server)
        except Exception as e:
            print(f"[red]Exception while inserting into DB[/red]: {e}")

    session.commit()
    return True