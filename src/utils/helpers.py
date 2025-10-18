import os
import asyncio
from rich import print
from rich.progress import (
    Progress,
    TextColumn,         # For displaying text
    BarColumn,          # For the actual progress bar
    MofNCompleteColumn,  # For Displaying: completed/total
    TimeElapsedColumn,  # How much time elapsed
    TimeRemainingColumn  # How much time remaning
)
from src.utils.video_processing import generate_video_info
from src.models import Video, VideoServer
from src import ALLOWED_FILES, ROOT_DIRS
from sqlmodel import select, Session


def is_subpath(child, parent):
    try:
        return os.path.commonpath([child, parent]) == parent
    except ValueError:
        return False


async def make_data(session: Session):
    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TextColumn("•"),
        TimeElapsedColumn(),
        TextColumn("•"),
        TimeRemainingColumn(),
    ) as progress_bar:

        files_to_add = []

        # Video discovery task
        video_discovery_task = progress_bar.add_task(
            "[cyan]Discovering[/cyan]", total=0)

        for root_dir in ROOT_DIRS:
            for root, _, files in os.walk(root_dir):
                for file in files:
                    name, ext = os.path.splitext(file)

                    if (not ext) or (ext not in ALLOWED_FILES):
                        continue

                    # print(f"[[green]+[/green]] {name + ext}")
                    progress_bar.update(video_discovery_task, advance=1)
                    files_to_add.append(os.path.join(root, file))

        progress_bar.update(video_discovery_task, total=len(files_to_add))

        if not files_to_add:
            return

        video_generation_task = progress_bar.add_task(
            "[green]Generating Models[/green]", total=len(files_to_add))

        async def proc_wrapper(
                sem, before: str, fp, *args, **kwargs
        ) -> tuple[Video, VideoServer] | None:

            try:
                generated_video_info = await generate_video_info(sem, fp)
                progress_bar.update(video_generation_task, advance=1)
                return generated_video_info
            except Exception as e:
                print(f"[red]Error \"{fp}\"[/red]: {e}")

        sem = asyncio.Semaphore(os.cpu_count() or 3)
        tasks = [
            asyncio.create_task(
                proc_wrapper(
                    sem,
                    f"Making thumbnail for: {os.path.basename(file)}",
                    file
                )
            ) for file in files_to_add
        ]

        data = []
        for result in await asyncio.gather(*tasks):
            if not result:
                print("[yellow]Skipping[/yellow]...")
                continue
            data.append(result)

        add_video_task = progress_bar.add_task(
            "[green]Adding[/green]", total=len(data)
        )

        for video, video_server in data:
            try:
                session.add(video)
                session.add(video_server)
                progress_bar.update(add_video_task, advance=1)
            except Exception as e:
                print("Exception while inseting to db:", e)

        session.commit()
        return True


async def reload_data(session: Session, hard_reload: bool = False):
    with Progress(
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        MofNCompleteColumn(),
        TextColumn("•"),
        TimeElapsedColumn(),
        TextColumn("•"),
        TimeRemainingColumn(),
    ) as progress_bar:

        if hard_reload:
            progress_bar.print(
                "[yellow bold]Performing hard reload: wiping DB and thumbnails...[/bold yellow]"
            )

            # Delete all thumbnails
            all_thumbs = session.exec(select(VideoServer)).all()

            # Add task to progress_bar
            thumb_remove_task = progress_bar.add_task(
                "[red]Remove thumbs[/red]", total=len(all_thumbs)
            )

            for entry in all_thumbs:
                if os.path.exists(entry.thumbnail_path):
                    try:
                        os.remove(entry.thumbnail_path)
                    except Exception as e:
                        print(f"[red]Failed to delete thumbnail {
                              entry.thumbnail_path}[/red]: {e}")

                # Update the progress bar's 'n'
                progress_bar.update(thumb_remove_task, advance=1)
                session.delete(entry)

            # Delete all DB entries
            for entry in session.exec(select(Video)).all():
                session.delete(entry)

            session.commit()
            filename_exists = []  # We want to re-add everything

        else:
            # Partial reload: remove stale or orphaned entries only
            prev_db_data: list[VideoServer] = session.exec(
                select(VideoServer)
            ).all()
            filename_exists = []

            for data_old in prev_db_data:
                vid_path = os.path.expanduser(data_old.video_path)
                if (
                    not os.path.exists(vid_path)
                    or os.path.splitext(vid_path)[1] not in ALLOWED_FILES
                    or not any(
                        is_subpath(vid_path, _root_path)
                        for _root_path in ROOT_DIRS
                    )
                ):
                    if os.path.exists(data_old.thumbnail_path):
                        os.remove(data_old.thumbnail_path)
                    progress_bar.print(
                        f"[red bold]File Removed: {
                            data_old.video.title} [!Exist][/bold red]"
                    )
                    session.delete(data_old)    # Delete from "VideoServer" db
                    video_db_entries = session.exec(select(Video).where(Video.id == data_old.video_id)).all()
                    if video_db_entries:
                        for video_db_entry in video_db_entries:
                            session.delete(video_db_entry)
                    continue

                filename_exists.append(data_old.video.title)

            session.commit()

        # New Discover file task
        discover_file_task = progress_bar.add_task("[cyan]Discovering[/cyan]")

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

                    # print(f"[bold green] File Added: {name + ext}[/green bold]")
                    # Update the progress bar's 'n'
                    progress_bar.update(discover_file_task, advance=1)
                    new_files.append(os.path.join(root, name + ext))

        progress_bar.update(discover_file_task, total=len(new_files))

        if not new_files:
            return True

        video_info_task = progress_bar.add_task(
            "[green]Generating Models[/green]", total=len(new_files)
        )

        # Run generate_video_info concurrently with sem-limiting
        async def proc_wrapper(
                sem, before: str, fp, *args, **kwargs
        ) -> tuple[Video, VideoServer] | None:

            try:
                generated_video_info = await generate_video_info(sem, fp)

                # Update the progress bar's 'n'
                progress_bar.update(video_info_task, advance=1)
                return generated_video_info
            except Exception as e:
                print(f"[red]Error \"{fp}\"[/red]: {e}")

        sem = asyncio.Semaphore(os.cpu_count() or 2)
        tasks = [
            asyncio.create_task(
                proc_wrapper(
                    sem,
                    f"Making thumbnail for: {os.path.basename(file)}",
                    file
                )
            )
            for file in new_files
        ]

        data = []
        for result in await asyncio.gather(*tasks):
            if not result:
                print("[yellow]Skipping[/yellow]...")
                continue
            data.append(result)

        add_video_task = progress_bar.add_task(
            "[green]Adding[/green]", total=len(data)
        )

        # Add new data to DB
        for video, video_server in data:
            try:
                session.add(video)
                session.add(video_server)
                progress_bar.update(add_video_task, advance=1)
            except Exception as e:
                print(f"[red]Exception while inserting into DB[/red]: {e}")

        session.commit()
    return True
