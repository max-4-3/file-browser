from src.models import SQLModel
from sqlalchemy.engine import Engine
from pathlib import Path


def create_models(
    base_class: SQLModel,
    engine: Engine,
    *,
    excludes: list[type[SQLModel]] | None = None,
    includes: list[type[SQLModel]] | None = None,
):
    # collect all available table names
    all_tables = base_class.metadata.tables

    # if includes provided → only those
    if includes:
        tables_to_create = [t.__tablename__ for t in includes]
    else:
        # otherwise start with all and exclude the given ones
        excluded_names = [t.__tablename__ for t in (excludes or [])]
        tables_to_create = [name for name in all_tables if name not in excluded_names]

    # fetch the actual Table objects
    tables = [all_tables[name] for name in tables_to_create]

    SQLModel.metadata.create_all(engine, tables=tables)


def create_engine_url(
    file_name: str, root_dir: str | None = None, suffix: str = "sqlite:///"
) -> str:
    # Use file's path if root_dir not given
    db_path = Path(root_dir) if root_dir else Path(__file__)

    # Check if the current path is dir or not if not get the parent
    db_path = db_path if db_path.is_dir() else db_path.parent
    db_path.mkdir(exist_ok=True, parents=True)

    # Return the resolved absolute path
    return suffix + str((db_path / file_name).resolve().absolute())
