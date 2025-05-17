from typing import Dict, Any

# Initialize your data dictionary
video_data: Dict[str, Any] = {}

def get_video_data() -> Dict[str, Any]:
    return video_data

def update_video_data(new_data: Dict[str, Any]) -> None:
    global video_data
    video_data = new_data