let favourites = JSON.parse(localStorage.getItem("favourites") || "[]");

function saveFavourites() {
    localStorage.setItem("favourites", JSON.stringify(favourites))
}

function toggleFavourite(element, videoId) {
    const index = favourites.indexOf(videoId);
    if (index > -1) {
        favourites.splice(index, 1);
        element.classList.remove('active');
        element.innerText = '🤍';
    } else {
        favourites.push(videoId);
        element.classList.add('active');
        element.innerText = '🩷';
    }
    saveFavourites()
}


document.addEventListener("DOMContentLoaded", async () => {
    // Get elements
    const playerElement = document.getElementById("player");
    const loadingState = document.getElementById("loadingState");
    const errorState = document.getElementById("errorState");
    const errorMessage = document.getElementById("errorMessage");
    const retryButton = document.getElementById("retryButton");
    const refreshButton = document.getElementById("refreshVideos");
    const sortBtn = document.getElementById("sortBtn");
    const downloadBtn = document.getElementById("downloadBtn");


    // Get video ID from URL
    let urlParams = new URLSearchParams(window.location.search);
    let videoId = urlParams.get("id");

    // Sort
    let sortDescending = true;
    let videos = [];

    // --- Global/module variables for player management and fallback ---
    let player; // Holds the Plyr instance
    let plyrTimeoutId; // Stores the ID for the Plyr initialization timeout
    let playerInitialized = false; // Flag to indicate if *any* player (Plyr or native) is active

    if (!videoId) {
        showError("Error: No video ID provided");
        return;
    }

    // --- Function to handle fallback to native HTML5 video player ---
    function fallbackToNative() {
        if (playerInitialized) {
            // If a player (Plyr or native) is already successfully initialized,
            // don't attempt fallback again to prevent duplicate setups.
            console.log("Player already initialized, skipping native fallback attempt.");
            return;
        }

        console.warn("Plyr initialization timed out or failed. Falling back to native video player.");

        // Clean up any existing Plyr instance to prevent conflicts
        if (player) {
            try {
                player.destroy();
                player = null; // Clear the Plyr instance reference
            } catch (e) {
                console.error("Error destroying Plyr instance during fallback:", e);
            }
        }

        // Configure the native <video> element
        playerElement.className = "video"; // Ensure it has appropriate styling
        playerElement.style.width = "100%";
        playerElement.style.height = "100%";
        playerElement.src = `/api/video?video_id=${videoId}`;
        playerElement.setAttribute('preload', 'metadata'); // Load metadata only to reduce initial load
        playerElement.controls = true; // Ensure native controls are visible for user interaction

        // Display the native player and hide loading state
        loadingState.style.display = "none";
        playerElement.style.display = "block";
        playerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

        playerInitialized = true; // Mark that a player is now active
        console.log("Native video player successfully loaded.");

        // Optional: Add an error listener for the native video element
        playerElement.onerror = () => {
            showError("Error playing video in native player. Please check the video source.");
        };
    }

    // --- Set Page Title Function ---
    async function setPageTitle() {
        if (videoId) {
            let stat_res = await fetch(`/api/stats?video_id=${videoId}`);
            let title = await stat_res.json();
            document.title = title.title;
            downloadBtn.setAttribute("download", document.title + ".mp4");
        } else {
            document.title = "Video Player"; // Default title if no videoId
        }
    }

    // --- Main player initialization function with Plyr and native fallback logic ---
    function initializePlayer() {
        // Reset state for a new initialization attempt
        playerInitialized = false; // Allow re-initialization
        clearTimeout(plyrTimeoutId); // Clear any previous pending timeout
        downloadBtn.setAttribute("href", `/api/video?video_id=${videoId}`)

        // If a Plyr instance exists from a previous call, destroy it for a clean start
        if (player) {
            try {
                player.destroy();
                player = null;
            } catch (e) {
                console.error("Error destroying previous Plyr instance:", e);
            }
        }

        // Clear previous video source and controls from the <video> element
        // to prevent flickering or native controls showing before Plyr takes over
        playerElement.src = '';
        playerElement.removeAttribute('controls');

        // Show loading state and hide other states
        loadingState.style.display = "flex";
        errorState.style.display = "none";
        playerElement.style.display = "none";

        // Set a timeout for Plyr initialization.
        // If Plyr doesn't become "ready" or throws a synchronous error within 3 seconds,
        // the `fallbackToNative` function will be called.
        plyrTimeoutId = setTimeout(() => {
            if (!playerInitialized) { // Only trigger fallback if Plyr hasn't succeeded yet
                fallbackToNative();
            }
        }, 3000); // 3-second timeout

        try {
            // Attempt to initialize Plyr
            player = new Plyr("#player", {
                autoplay: false,
                seekTime: 10,
                debug: false,
                iconUrl: "./static/local/plyr.svg",
                blankVideo: "./static/local/blank.mp4",
                preload: 'metadata', // Set preload to 'metadata' to load less initially
            });

            // Set video source for Plyr
            player.source = {
                type: "video",
                sources: [
                    {
                        src: `/api/video?video_id=${videoId}`,
                        type: "video/mp4",
                    },
                    // Consider adding WebM format for better compression and compatibility
                    // {
                    //     src: `/api/video?video_id=${videoId}&format=webm`,
                    //     type: "video/webm",
                    // },
                ],
                poster: `/api/thumbnail?video_id=${videoId}`,
            };

            // Event listener for Plyr becoming ready
            player.on("ready", () => {
                clearTimeout(plyrTimeoutId); // Clear the pending fallback timeout as Plyr is ready
                if (!playerInitialized) { // Ensure this is the first successful initialization
                    loadingState.style.display = "none";
                    playerElement.style.display = "block";
                    playerInitialized = true;
                    console.log("Plyr player loaded successfully.");
                }
            });

            // Event listener for Plyr errors during playback (e.g., source not found, network issues)
            player.on("error", (event) => {
                console.error("Plyr error event:", event);
                clearTimeout(plyrTimeoutId); // Clear any pending fallback timeout
                fallbackToNative(); // Immediately fallback to native on Plyr runtime error
            });

        } catch (err) {
            // This `catch` block handles synchronous errors that occur during the `new Plyr(...)` call itself
            console.error(`Synchronous Plyr initialization failed: ${err.message}`);
            clearTimeout(plyrTimeoutId); // Clear the pending fallback timeout
            fallbackToNative(); // Immediately fallback to native if Plyr constructor fails
        }
        scrollTo(0, 0)
    }

    // --- Error Handling Function ---
    function showError(message) {
        console.error(message);
        loadingState.style.display = "none";
        playerElement.style.display = "none";
        errorState.style.display = "flex";
        errorMessage.textContent = message;
        // Optionally, destroy any active player instance if an unrecoverable error occurs
        if (player) {
            try { player.destroy(); player = null; } catch (e) { console.error(e); }
        }
        playerInitialized = false; // Reset flag so a new attempt can be made
    }

    // Event listener for retry button
    retryButton.addEventListener("click", initializePlayer);

    // Initial call to load the player when the page loads
    initializePlayer();

    // --- Video library functions ---
    async function fetchVideos() {
        try {
            // Show placeholder cards while videos are being fetched
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
            renderVideos(videos); // Render fetched videos
        } catch (error) {
            console.error("Failed to fetch videos:", error);
            // Display an error message with a retry button if fetching fails
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

    function renderVideo(video) {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.videoId = video.id;

        const thumbnailContainer = document.createElement("div");
        thumbnailContainer.className = "thumbnail-box";
        thumbnailContainer.innerHTML = `
        <div class="overlays">
        <div id="addFavBtn" class="overlay-item ${favourites.includes(video.id) ? 'active' : ''}">
        ${favourites.includes(video.id) ? '🩷' : '🤍'}
        </div>
        <a id="downloadVidBtn" class="overlay-item" href="/api/video/?video_id=${video.id}" download="${video.title}.mp4">🔽</a>
        </div>
        <img src="/api/thumbnail?video_id=${video.id}" loading="lazy" alt="${video.title}">
        <div class="duration-badge">${video.duration}</div>
        `;
        const favBtn = thumbnailContainer.querySelector("div#addFavBtn")
        favBtn.addEventListener("click", () => toggleFavourite(favBtn, video.id))

        const titleContainer = document.createElement("div");
        titleContainer.className = "title";
        titleContainer.innerText = video.title;

        card.appendChild(thumbnailContainer);
        card.appendChild(titleContainer);

        return card;
    }


    function renderVideos(videosToRender) {
        videoGrid.innerHTML = ""; // Clear existing grid content

        if (!videosToRender || videosToRender.length === 0) {
            videoGrid.innerHTML =
                '<div class="no-videos">No videos available</div>';
            return;
        }

        // Sort videos based on the current sorting order
        const sorted = [...videosToRender].sort((a, b) => {
            return sortDescending
                ? b.modified_time - a.modified_time
                : a.modified_time - b.modified_time;
        });

        // Create and append video cards to the grid
        sorted.forEach((video) => {
            if (video.id !== videoId) { // Exclude the currently playing video from the grid
                const card = renderVideo(video);

                // Add click listener to each card
                card.querySelector("img").addEventListener("click", () => {
                    const newVideoId = card.dataset.videoId;
                    if (newVideoId && newVideoId !== videoId) {
                        videoId = newVideoId; // Update the global videoId
                        // Update the URL in the browser's history without reloading the page
                        const newUrl = new URL(window.location.href);
                        newUrl.searchParams.set('id', videoId);
                        window.history.pushState({ path: newUrl.href }, '', newUrl.href);

                        initializePlayer(); // Re-initialize the player with the new video ID
                        setPageTitle(); // Update the page title
                        renderVideos(videos); // Re-render the grid to update excluded video
                    }
                });

                videoGrid.appendChild(card);
            }
        });
    }

    // Event listeners for refresh and sort buttons
    refreshButton.addEventListener("click", fetchVideos);
    fetchVideos(); // Initial fetch of videos

    sortBtn.addEventListener("click", async () => {
        sortBtn.innerText = sortDescending ? "👇🏻🧑🏻" : "👇🏻👶🏻";
        sortDescending = !sortDescending;
        renderVideos(videos);
    });
    setPageTitle(); // Set the initial page title
});
