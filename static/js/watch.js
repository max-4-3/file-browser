document.addEventListener("DOMContentLoaded", async () => {
    // Get elements
    const playerElement = document.getElementById("player");
    const loadingState = document.getElementById("loadingState");
    const errorState = document.getElementById("errorState");
    const errorMessage = document.getElementById("errorMessage");
    const retryButton = document.getElementById("retryButton");
    const refreshButton = document.getElementById("refreshVideos");
    const videoGrid = document.getElementById("videoGrid");
    const sortBtn = document.getElementById("sortBtn");

    // Get video ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get("id");

    // Sort
    let sortDescending = true;
    let videos = [];

    if (!videoId) {
        showError("Error: No video ID provided");
        return;
    }

    // Initialize player
    let player;

    async function setPageTitle() {
        let stat_res = await fetch(`/api/stats?video_id=${videoId}`);
        let title = await stat_res.json();
        document.title = title.title;
    }

    function initializePlayer() {
        loadingState.style.display = "flex";
        errorState.style.display = "none";
        playerElement.style.display = "none";

        try {
            player = new Plyr("#player", {
                autoplay: false,
                seekTime: 10,
                debug: false,
                iconUrl: "https://cdn.plyr.io/3.7.8/plyr.svg",
                blankVideo: "https://cdn.plyr.io/static/blank.mp4",
            });

            // Set video source
            player.source = {
                type: "video",
                sources: [
                    {
                        src: `/api/video?video_id=${videoId}`,
                        type: "video/mp4",
                    },
                ],
                poster: `/api/thumbnail?video_id=${videoId}`,
            };

            player.on("ready", () => {
                loadingState.style.display = "none";
                playerElement.style.display = "block";
            });
        } catch (err) {
            console.error(`Player initialization failed: ${err.message}`);
            playerElement.className = "video";
            playerElement.style.width = "100%";
            playerElement.style.height = "100%";
            playerElement.src = `/api/video?video_id=${videoId}`;
            loadingState.style.display = "none";
            playerElement.style.display = "block";
        }
    }

    // Error handling
    function showError(message) {
        console.error(message);
        loadingState.style.display = "none";
        playerElement.style.display = "none";
        errorState.style.display = "flex";
        errorMessage.textContent = message;
    }

    retryButton.addEventListener("click", initializePlayer);
    initializePlayer();

    // Video library functions
    async function fetchVideos() {
        try {
            videoGrid.innerHTML = `
        <div class="grid-placeholder">
          <div class="placeholder-card"></div>
          <div class="placeholder-card"></div>
          <div class="placeholder-card"></div>
          <div class="placeholder-card"></div>
        </div>
      `;

            const res = await fetch("/api/videos");
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

            const data = await res.json();
            videos = data.videos;
			document.getElementById("vidCount").innerText = `${videos.length} Videos`
			renderVideos(videos);
        } catch (error) {
            console.error("Failed to fetch videos:", error);
            videoGrid.innerHTML = `
        <div class="fetch-error">
          <i class="fas fa-exclamation-circle"></i>
          <p>Failed to load videos. <button class="text-button" id="retryFetch">Retry</button></p>
        </div>
      `;
            document
                .getElementById("retryFetch")
                .addEventListener("click", fetchVideos);
        }
    }

    function renderVideos(videos) {
        videoGrid.innerHTML = ""

        if (!videos || videos.length === 0) {
            videoGrid.innerHTML =
                '<div class="no-videos">No videos available</div>';
            return;
        }

        const sorted = [...videos].sort((a, b) => {
            return sortDescending
                ? b.modified_time - a.modified_time
                : a.modified_time - b.modified_time;
        }); videoGrid.innerHTML = "";

        sorted.forEach((video) => {
            if (video.id != videoId) {
                const card = document.createElement("div");
                card.className = "card";

                const link = document.createElement("a");
                link.href = `watch?id=${video.id}`;

                const thumb = document.createElement("img");
                thumb.src = `/api/thumbnail?video_id=${video.id}`;
                thumb.alt = video.title;
                thumb.setAttribute("loading", "lazy");

                const title = document.createElement("div");
                title.className = "title";
                title.textContent = video.title;

                link.appendChild(thumb);
                card.appendChild(link);
                card.appendChild(title);
                videoGrid.appendChild(card);
            }
        });
    }

    refreshButton.addEventListener("click", fetchVideos);
    fetchVideos();

    sortBtn.addEventListener("click", async () => {
        sortBtn.innerText = sortDescending ? "👇🏻🧑🏻" : "👇🏻👶🏻";
        sortDescending = !sortDescending;
        renderVideos(videos);
    });

    setPageTitle();

});
