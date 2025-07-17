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

document.addEventListener("DOMContentLoaded", async () => {

    videos = await fetchVideos();
    MainModule.renderVideos({
        videos: videos,
        sortingFunction: (a, b) => {
            return sortDescending
                ? b.modified_time - a.modified_time
                : a.modified_time - b.modified_time;
        }
    });

    document.getElementById("vidCount").innerText = `${videos.length} Videos`;

    document.getElementById("sortBtn").addEventListener("click", () => {
        sortDescending = !sortDescending;
        document.getElementById("sortBtn").textContent = sortDescending
            ? "👇🏻👶🏻"
            : "👇🏻🧑🏻";
        MainModule.renderVideos({
            videos: videos,
            sortingFunction: (a, b) => {
                return sortDescending
                    ? b.modified_time - a.modified_time
                    : a.modified_time - b.modified_time;
            }
        });
        saveSortingConfig(sortDescending);
    });
    document.getElementById("sortBtn").textContent = sortDescending ? "👇🏻👶🏻" : "👇🏻🧑🏻";

    document.getElementById("reloadBtn").addEventListener("click", async () => {
        const textSpan = document.getElementById("reloadText");

        const ogTxt = textSpan.textContent;

        textSpan.textContent = "Reloading...";
        const spinner = document.createElement("span");
        spinner.className = "spinner";
        textSpan.after(spinner);

        try {
            const response = await fetch("/reload", { method: "POST" });
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
