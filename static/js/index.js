import { MainModule, saveSortingConfig, sortDescending as isSortDescending } from './main.js';

let sortDescending = isSortDescending();
let videos = [];

async function fetchVideos(apiEndpoint = "/api/videos") {
    const res = await fetch(apiEndpoint);
    if (!res.ok) {
        throw new Error("Request Wasn't Ok!")
    }
    const data = await res.json()
    return data.videos
}

function deleteVideo(videoData, cardElement) {
    fetch('/api/video?video_id=' + videoData.id, {
        method: "DELETE",
        headers: {
            user: "maxim",
        }
    }).then((response) => {
        if (response.ok) {
            let index = -1;
            videos.forEach((val, idx) => {
                if (val.id === videoData.id) {
                    index = idx
                }
            })

            if (index !== -1) {
                videos.splice(index, 1)
                cardElement.remove()
                MainModule.showToast('Video Removed!', 'success')
            }
        }
    }).catch(err => {MainModule.showToast('Failed to Remove Video!', 'danger'); console.log(err)})
}

function renderVideos() {
    MainModule.renderVideos({
        videos: videos,
        sortingFunction: (a, b) => {
            return sortDescending
                ? b.modified_time - a.modified_time
                : a.modified_time - b.modified_time;
        },
        deleteBtnCallback: deleteVideo,
        applyFunctionOnCard: (card, videoData) => {
            card.addEventListener('mousedown', e => {
                if (e.button === 1) {   // 0,1,2 = left, middle, right
                    e.preventDefault();
                    window.open(`/watch?id=${videoData.id}`);
                }
            })
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {

    videos = await fetchVideos();
    renderVideos();

    document.getElementById("vidCount").innerText = `${videos.length} Videos`;

    document.getElementById("sortBtn").addEventListener("click", () => {
        sortDescending = !sortDescending;
        document.getElementById("sortBtn").textContent = sortDescending
            ? "👇🏻👶🏻"
            : "👇🏻🧑🏻";
        renderVideos();
        saveSortingConfig(sortDescending);
    });
    document.getElementById("sortBtn").textContent = sortDescending ? "👇🏻👶🏻" : "👇🏻🧑🏻";

    document.getElementById("reloadBtn").addEventListener("click", async (e) => {
        const textSpan = document.getElementById("reloadText");

        const ogTxt = textSpan.textContent;

        textSpan.textContent = "Reloading...";
        const spinner = document.createElement("span");
        spinner.className = "spinner";
        textSpan.after(spinner);

        try {
            const response = await fetch("/reload" + (e.shiftKey ? "?hard=true" : ""), { method: "POST" });
            if (response.ok) {
                location.reload(); // Reload the page
            } else {
                alert("Server returned error: " + response.status);
            }
        } catch (err) {
            console.error("Fetch failed:", err);
            alert("Request failed");
        } finally {
            spinner.remove();
            textSpan.textContent = ogTxt;
        }
    });
})
