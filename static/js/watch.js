import { MainModule, saveSortingConfig, sortDescending as isSortDescending } from "./main.js";

// --- Global DOM Element References (declared at top level) ---
const playerElement = document.getElementById("player");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const retryButton = document.getElementById("retryButton");
const refreshButton = document.getElementById("refreshVideos");
const sortBtn = document.getElementById("sortBtn");
const downloadBtn = document.getElementById("downloadBtn");
const vidCountElement = document.getElementById("vidCount");

// --- Global/Module Variables (declared at top level) ---
let videoId = new URLSearchParams(window.location.search).get("id");
let sortDescending = isSortDescending();
let videos = [];
let player; // Holds the Plyr instance
let plyrTimeoutId; // Stores the ID for the Plyr initialization timeout
let playerInitialized = false; // Flag to indicate if *any* player (Plyr or native) is active
let vidData = null;

// --- Utils Module (Global Scope) ---
const UtilsModule = (() => {
    function showPlayerError(message) {
        console.error(message);
        loadingState.style.display = "none";
        playerElement.style.display = "none";
        errorState.style.display = "flex";
        errorMessage.textContent = message;
        if (player) {
            try {
                player.destroy();
                player = null;
            } catch (e) {
                console.error("Error destroying Plyr instance during error display:", e);
            }
        }
        playerInitialized = false;
    }

    return {
        showPlayerError: showPlayerError,
    };
})();

// --- Player Module (Global Scope) ---
const PlayerModule = (() => {
    function fallbackToNative() {
        if (playerInitialized) {
            console.log("Player already initialized, skipping native fallback attempt.");
            return;
        }

        console.warn("Plyr initialization timed out or failed. Falling back to native video player.");

        if (player) {
            try {
                player.destroy();
                player = null;
            } catch (e) {
                console.error("Error destroying Plyr instance during fallback:", e);
            }
        }

        playerElement.className = "video";
        playerElement.style.width = "100%";
        playerElement.style.height = "100%";
        playerElement.src = `/api/video?video_id=${videoId}`;
        playerElement.setAttribute("preload", "metadata");
        playerElement.controls = true;

        loadingState.style.display = "none";
        playerElement.style.display = "block";
        playerElement.scrollIntoView({ behavior: "smooth", block: "start" });

        playerInitialized = true;
        console.log("Native video player successfully loaded.");

        playerElement.onerror = () => {
            UtilsModule.showPlayerError(
                "Error playing video in native player. Please check the video source.",
            );
        };
    }

    function initialize() {
        if (!videoId) {
            UtilsModule.showPlayerError("Error: No video ID provided");
            return;
        }

        playerInitialized = false;
        clearTimeout(plyrTimeoutId);
        downloadBtn.setAttribute("href", `/api/video?video_id=${videoId}`);

        if (player) {
            try {
                player.destroy();
                player = null;
            } catch (e) {
                console.error("Error destroying previous Plyr instance:", e);
            }
        }

        playerElement.src = "";
        playerElement.removeAttribute("controls");

        loadingState.style.display = "flex";
        errorState.style.display = "none";
        playerElement.style.display = "none";

        plyrTimeoutId = setTimeout(() => {
            if (!playerInitialized) {
                fallbackToNative();
            }
        }, 3000);

        try {
            player = new Plyr("#player", {
                autoplay: false,
                seekTime: 10,
                captions: { active: false },
                keyboard: { focused: true, global: true },
                controls: [
                    "play-large", "restart", "rewind", "play", "fast-forward",
                    "progress", "current-time", "duration", "mute", "volume",
                    "captions", "settings", "pip", "airplay", "download", "fullscreen",
                ],
                urls: {
                    download: `http://localhost:8000/api/video?video_id=${videoId}`
                }
            });

            player.source = {
                type: "video",
                sources: [{ src: `/api/video?video_id=${videoId}` }],
                poster: `/api/thumbnail?video_id=${videoId}`,
            };

            player.on("ready", () => {
                clearTimeout(plyrTimeoutId);
                if (!playerInitialized) {
                    loadingState.style.display = "none";
                    playerElement.style.display = "block";
                    playerInitialized = true;
                    console.log("Plyr player loaded successfully.");
                }
            });

            player.on("error", (event) => {
                console.error("Plyr error event:", event);
                clearTimeout(plyrTimeoutId);
                fallbackToNative();
            });
        } catch (err) {
            console.error(`Synchronous Plyr initialization failed: ${err.message}`);
            clearTimeout(plyrTimeoutId);
            fallbackToNative();
        }
        scrollTo(0, 0);
    }

    return {
        initialize: initialize,
    };
})();

async function fetchVideos(apiEndpoint = "/api/videos") {
    const res = await fetch(apiEndpoint);
    if (!res.ok) {
        throw new Error("Request Wasn't Ok!")
    }
    const data = await res.json()
    return data.videos
}

function renderVideos() {
    MainModule.renderVideos({
        videos: videos,
        sortingFunction: (a, b) => {
            return sortDescending
                ? b.modified_time - a.modified_time
                : a.modified_time - b.modified_time;
        },
        excludeIds: [videoId],
        applyFunctionOnCard: (vidCard, vidData) => {
            vidCard.querySelector("img").addEventListener("click", async () => {
                const newVideoId = vidData.id;
                if (newVideoId && newVideoId !== videoId) {
                    videoId = newVideoId; // Update the global videoId

                    // Update the URL in the browser's history without reloading the page
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.set('id', videoId);
                    window.history.pushState({ path: newUrl.href }, '', newUrl.href);

                    PlayerModule.initialize(); // Re-initialize the player with the new video ID
                    renderVideos();
                    await fetch(`/api/stats?video_id=${videoId}`).then(async (resp) => {
                        vidData = await resp.json()
                        document.title = vidData.title;
                    }).catch((error) => { console.error(error) })
                }
            });
        },
        thumbnailCallback: () => { },
    })
}

// --- DOMContentLoaded Event Listener ---
document.addEventListener("DOMContentLoaded", async () => {
    // Check if videoId is present; if not, show error and stop
    if (!videoId) {
        UtilsModule.showPlayerError("Error: No video ID provided in URL.");
        return;
    }

    // Initial call to load the player when the page loads
    PlayerModule.initialize();

    // Event listener for retry button
    retryButton.addEventListener("click", PlayerModule.initialize);

    await fetch(`/api/stats?video_id=${videoId}`).then(async (resp) => {
        vidData = await resp.json()
        document.title = vidData.title;
    }).catch((error) => { console.error(error) })
    videos = await fetchVideos()
    renderVideos();

    // Event listeners for refresh and sort buttons
    refreshButton.addEventListener("click", async () => {
        videos = await fetchVideos();
        renderVideos();
    });

    sortBtn.addEventListener("click", () => {
        sortDescending = !sortDescending;
        sortBtn.innerText = sortDescending ? "👇🏻🧑🏻" : "👇🏻👶🏻";
        renderVideos();
        saveSortingConfig(sortDescending)
    });
    sortBtn.innerText = sortDescending ? "👇🏻🧑🏻" : "👇🏻👶🏻";

    vidCountElement.innerText = `${videos.length} videos`
});