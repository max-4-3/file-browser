from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from src.api import normal_session, router, Session
import uvicorn
import src.api.videos
import src.api.thumbnails
from src.utils.helpers import reload_data

app = FastAPI()

# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Disable CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


# Endpoint to reload
@app.post("/reload")
async def update_data_store(
        hard: bool = False,
        session: Session = Depends(normal_session.get_session)
):
    if await reload_data(session, hard):
        return 200
    else:
        raise HTTPException(500, detail="Internal Server Error!")


@app.get("/favicon.ico")
async def favicon():
    return FileResponse("static/favicon.ico")


# Serve index.html at root
@app.get("/", response_class=FileResponse)
async def read_root():
    return FileResponse("pages/index.html")


# Serve watch.html at /watch
@app.get("/watch", response_class=FileResponse)
async def watch_video():
    return FileResponse("pages/watch.html")

app.include_router(router, prefix="/api")

if __name__ == "__main__":
    uvicorn.run("main:app", reload=True, host="0.0.0.0", port=8000)
