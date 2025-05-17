import os, json
from uuid import uuid4
from rich import print
from src.utils.video_processing import extract_thumbnail
from src import ALLOWED_FILES, ROOT_DIRS, DATA_FOLDER

def save_data(data, fp):
    with open(fp, 'w', errors='ignore', encoding='utf-8') as file:
        json.dump(data, file, indent=4, ensure_ascii=False)

def load_data(fp):
    with open(fp, 'r', errors='ignore', encoding='utf-8') as file:
        return json.load(file)

async def make_data():
    ummm = []
    
    for root_dir in ROOT_DIRS:
        for root, _, files in os.walk(root_dir):
            for file in files:
                name, ext = os.path.splitext(file)
                
                if not ext or ext not in ALLOWED_FILES:
                    continue

                print(f'[[green]+[/green]] {name + ext}')
                ummm.append(os.path.join(root, file))

    if not files:
        return
    
    data = {}
    os.makedirs(DATA_FOLDER, exist_ok=True)
    for file in ummm:
        print(f'Making thumbnail for: {os.path.basename(file)}')
        vid_id = uuid4().hex
        thumb_path = await extract_thumbnail(file, vid_id)
        if not thumb_path:
            continue

        data[vid_id] = {
            "id": vid_id,
            "title": os.path.splitext(os.path.basename(file))[0],
            "thumb_path": thumb_path,
            "video_path": file
        }
    
    save_data(data, os.path.join(DATA_FOLDER, 'video_data.json'))
    return data
