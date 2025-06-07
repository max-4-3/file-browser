from src.utils.video_processing import extract_thumbnail
import asyncio


async def main():
    vid_file = "/home/max/Downloads/Videos/xnxx/videos/Big fucks gamer step sister.mp4"
    await extract_thumbnail(vid_file, "thumbnail_lmao")


if __name__ == "__main__":
    asyncio.run(main())
