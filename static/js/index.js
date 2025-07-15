let favourites = JSON.parse(localStorage.getItem("favourites") || "[]");
let sortDescending = true;
let videos = [];

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
    <img src="/api/thumbnail?video_id=${video.id}" loading="lazy" onclick="window.open(${`watch?id=${video.id}`})" alt="${video.title}">
    <div class="duration-badge">${video.duration}</div>
    `;
    const favBtn = thumbnailContainer.querySelector("#addFavBtn");
    favBtn.addEventListener("click", () => toggleFavourite(favBtn, video.id));
    thumbnailContainer.querySelector("img").addEventListener("click", () => window.open(`watch?id=${video.id}`));

    const titleContainer = document.createElement("div");
    titleContainer.className = "title";
    titleContainer.innerText = video.title;

    card.appendChild(thumbnailContainer);
    card.appendChild(titleContainer);

    return card;
}

async function fetchVideos(apiEndpoint = "/api/videos") {
    const res = await fetch(apiEndpoint);
    if (!res.ok) {
        throw new Error("Request Wasn't Ok!")
    }
    const data = await res.json()
    return data.videos
}

function renderVideos(videos, gridId = "videoGrid", sortVideos = true, sortCallback = (a, b) => {
    return sortDescending
        ? b.modified_time - a.modified_time
        : a.modified_time - b.modified_time;
}) {

    console.log("Video Rendering Triggered!")
    console.log(videos)
    const videoGrid = document.getElementById(gridId);
    videoGrid.innerHTML = "";

    if (!videos || videos.length === 0 || !Array.isArray(videos)) {
        console.warn("Either no videos found or length is zero or Array.isArray for videos is False.")
        videoGrid.innerHTML = "<h1> No Video Available! </h1>";
        return;
    }

    let sorted = videos;
    if (sortVideos && sortCallback) {
        sorted = videos.sort(sortCallback)
    }

    sorted.forEach((video) => {
        const cardElem = renderVideo(video);
        videoGrid.appendChild(cardElem);
    })
}

document.addEventListener("DOMContentLoaded", async () => {

    videos = await fetchVideos();
    renderVideos(videos);

    document.getElementById("vidCount").innerText = `${videos.length} Videos`;

    document.getElementById("sortBtn").addEventListener("click", () => {
        sortDescending = !sortDescending;
        document.getElementById("sortBtn").textContent = sortDescending
            ? "👇🏻👶🏻"
            : "👇🏻🧑🏻";
        renderVideos(videos);
    });

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
