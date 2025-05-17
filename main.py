from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from src.api import videos, thumbnails
import uvicorn
import asyncio
import os
from src.data_store import update_video_data
from src.utils.helpers import make_data, load_data, reload_data
from src import DATA_FOLDER

app = FastAPI()

# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Endpoint to reload
@app.post('/update')
async def update_data_store():
    await reload_data()
    return "Ok"

# Serve index.html at root
@app.get("/", response_class=FileResponse)
async def read_root():
    return FileResponse('template/index.html')

# Serve watch.html at /watch
@app.get("/watch", response_class=FileResponse)
async def watch_video():
    return FileResponse("template/watch.html")

async def load_video_data():
    if os.path.exists(os.path.join(DATA_FOLDER, 'video_data.json')):
        data = load_data(os.path.join(DATA_FOLDER, 'video_data.json'))
    else:
        data = await make_data()
    update_video_data(data)


app.include_router(videos.router, prefix='/api')
app.include_router(thumbnails.router, prefix='/api')


if __name__ == "__main__":
    asyncio.run(load_video_data())
    uvicorn.run(app, host="0.0.0.0", port=8000)