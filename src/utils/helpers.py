import asyncio
import os
from pathlib import Path
from typing import Callable

from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from sqlmodel import Session, select

from src import ALLOWED_FILES, ROOT_DIRS
from src.models import VideoResponse, VideosDataBase
from src.utils.video_processing import generate_video_info


# Helper functions
def convert_db_to_response(
    db_entry: VideosDataBase, include_extras: bool = False
) -> VideoResponse:
    extras = {}
    for name, value in (db_entry.extras or {}).items():
        if str(name).startswith("update_") or not include_extras:
            continue

        extras[name] = value

    return VideoResponse(
        id=db_entry.id,
        title=db_entry.title,
        duration=db_entry.duration,
        filesize=db_entry.filesize,
        modified_time=db_entry.modified_time,
        extras=extras,
    )


def discover_files(
    file_validator: Callable[[Path], bool],
    progress_callback: Callable[[Path], None],
) -> list[Path]:
    discovered_files: list[Path] = []

    for root_dir in ROOT_DIRS:
        root_dir = Path(root_dir)

        # iter through `root_dir` files
        for file in root_dir.rglob("*"):

            if not file.is_file():
                continue

            if not file_validator(file):
                continue

            # `file` is valid and we should add it
            progress_callback(file)
            discovered_files.append(file.expanduser())  # ~ -> expand it

    return discovered_files


async def create_modals(
    files: list[Path],
    progress_callback: Callable[[], None],
    error_callback: Callable[[Path, Exception], None],
    *,
    sem_limit: int = os.cpu_count() or 4,
) -> list[VideosDataBase]:

    sem = asyncio.Semaphore(sem_limit)

    async def proc_wrapper(fp: Path):
        try:
            result = await generate_video_info(
                sem, str(fp.expanduser().absolute())      # skip resolving and add absolute path
            )
            progress_callback()
            return result
        except Exception as e:
            error_callback(fp, e)

    tasks = [proc_wrapper(file) for file in files]
    results = []
    for result in await asyncio.gather(*tasks):
        if result is not None:
            results.append(result)

    return results


def add_modals_to_db(
    session: Session,
    modals: list[VideosDataBase],
    progress_callback: Callable[[], None],
    error_callback: Callable[[VideosDataBase, Exception], None],
):
    for vid in modals:
        try:
            session.add(vid)
            progress_callback()
        except Exception as e:
            error_callback(vid, e)


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

        # Video discovery task
        video_discovery_task = progress_bar.add_task(
            "[cyan]Discovering files[/cyan]", total=0
        )

        # Validator
        def is_file_valid(file: Path) -> bool:
            return bool(file.suffix and file.suffix in ALLOWED_FILES)

        files_to_add = discover_files(
            is_file_valid, lambda _: progress_bar.advance(video_discovery_task)
        )
        progress_bar.update(video_discovery_task, total=len(files_to_add))
        progress_bar.stop_task(video_discovery_task)

        # Early exit
        if not files_to_add:
            return

        # Video modal generation
        video_generation_task = progress_bar.add_task(
            "[green]Generating models[/green]", total=len(files_to_add)
        )
        results = await create_modals(
            files_to_add,
            lambda: progress_bar.advance(video_generation_task),
            progress_bar.console.print,
        )
        progress_bar.stop_task(video_discovery_task)

        # Add generated video to database
        add_video_task = progress_bar.add_task(
            "[green]Inserting in db[/green]", total=len(results)
        )
        add_modals_to_db(
            session,
            results,
            lambda: progress_bar.advance(add_video_task),
            lambda v, e: progress_bar.console.print(
                "Error while inserting to db:", e, v
            ),
        )
        progress_bar.stop_task(add_video_task)

        session.commit()
        return True


async def reload_data(session: Session, hard_reload: bool = False) -> bool:
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
            progress_bar.console.print(
                "[yellow bold]Performing hard reload: wiping DB and thumbnails...[/bold yellow]"
            )

            # Delete all thumbnails
            all_thumbs = session.exec(select(VideosDataBase)).all()

            # Add task to progress_bar
            thumb_remove_task = progress_bar.add_task(
                "[red]Remove thumbs[/red]", total=len(all_thumbs)
            )

            for entry in all_thumbs:
                try:
                    entry.delete_thumb()
                except Exception as e:
                    progress_bar.console.print(
                        f"Unable to delete thumb: {entry.thumbnail_path}", e
                    )

                # Update the progress bar's 'n'
                progress_bar.advance(thumb_remove_task)
                session.delete(entry)

            progress_bar.stop_task(thumb_remove_task)
            session.commit()
            filename_exists = []  # We want to re-add everything

        else:
            # Partial reload: remove stale or orphaned entries only
            prev_db_data = session.exec(select(VideosDataBase)).all()
            filename_exists = []

            def valid_file(path: Path) -> bool:
                valid_file_rules = [
                    lambda: path.exists(),
                    lambda: path.suffix in ALLOWED_FILES,
                    lambda: path.is_symlink()
                    or any(path.is_relative_to(_root_path) for _root_path in ROOT_DIRS),
                ]
                return all(map(lambda x: x(), valid_file_rules))

            for data_old in prev_db_data:
                vid_path = Path(data_old.video_path)
                # if (
                #     not vid_path.exists()
                #     or vid_path.suffix not in ALLOWED_FILES
                #     or (
                #         not vid_path.is_symlink()
                #         or not any(
                #             vid_path.is_relative_to(_root_path)
                #             for _root_path in ROOT_DIRS
                #         )
                #     )
                # ):
                if not valid_file(vid_path):
                    try:
                        data_old.delete_thumb()
                    except:
                        pass

                    progress_bar.print(
                        f"[red bold]File Removed: {vid_path.stem} [!Exist][/bold red]"
                    )

                    session.delete(data_old)
                    continue

                filename_exists.append(vid_path.stem)

            session.commit()

        # New Discover file task
        discover_file_task = progress_bar.add_task("[cyan]Discovering[/cyan]")

        # Discover new files
        def is_file_valid(file: Path) -> bool:
            return bool(
                (file.stem not in filename_exists)
                and (file.suffix and file.suffix in ALLOWED_FILES)
            )

        new_files = discover_files(
            is_file_valid, lambda _: progress_bar.advance(discover_file_task)
        )
        progress_bar.update(discover_file_task, total=len(new_files))
        progress_bar.stop_task(discover_file_task)

        if not new_files:
            return True

        video_info_task = progress_bar.add_task(
            "[green]Generating Models[/green]", total=len(new_files)
        )

        results = await create_modals(
            new_files,
            lambda: progress_bar.advance(video_info_task),
            progress_bar.console.print,
        )
        progress_bar.advance(video_info_task, len(new_files) - len(results))
        progress_bar.stop_task(video_info_task)

        add_video_task = progress_bar.add_task(
            "[green]Inserting in db[/green]", total=len(results)
        )
        add_modals_to_db(
            session,
            results,
            lambda: progress_bar.advance(add_video_task),
            lambda v, e: progress_bar.console.print(
                "Error while inserting to db:", e, v
            ),
        )
        progress_bar.stop_task(add_video_task)

        session.commit()
    return True
