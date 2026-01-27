from pathlib import Path

# Extension of files to search for (use video format if possible)
ALLOWED_FILES = {".mp4"}

# The directories from where files to find (can use ~)
ROOT_DIRS = [
    Path("~/Videos/.hidden").expanduser().resolve(),
    Path("~/.copyparty/uploads").expanduser().resolve(),
]

# The directory where the '.db' file(s) will be saved
DATA_DIR = Path("~/Extras/web/file-browser/data").expanduser().resolve()

# The directory where the thumbnails will be saved of indexed media files
THUMB_DIR = Path("~/Extras/web/file-browser/static/.thumbs").expanduser().resolve()

# Seting this to True, will use '.webp' and size of '640x360' for thumbnails creation; .png with no commpression if False
PERFORMANCE = True
