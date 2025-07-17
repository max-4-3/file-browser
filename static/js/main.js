export const MainModule = (() => {
    let favourites = JSON.parse(localStorage.getItem("favourites") || "[]");
    if (!Array.isArray(favourites)) {
        favourites = [];
    }

    function saveFavourites() {
        localStorage.setItem("favourites", JSON.stringify(favourites));
    }

    function toggleFavourite(element, id) {
        const index = favourites.indexOf(id);
        if (index > -1) {
            favourites.splice(index, 1);
            element.classList.remove("active");
            element.innerText = "🤍";
        } else {
            favourites.push(id);
            element.classList.add("active");
            element.innerText = "🩷";
        }
        saveFavourites();
    }

    function isFavourite(id) {
        return favourites.includes(id);
    }

    function renderVideo({
        video,
        favouriteBtnCallback = (element, videoData) => { toggleFavourite(element, videoData.id) },
        isFavouriteCallback = (videoData) => { return isFavourite(videoData.id) },
        thumbnailCallback = (videoData) => { window.open(`watch?id=${videoData.id}`) }
    }) {
        const card = document.createElement("div");
        const isFav = isFavouriteCallback(video);
        card.className = "card";
        card.dataset.videoId = video.id;

        if (isFav) {
            card.classList.add("favourite")
        }

        const thumbnailContainer = document.createElement("div");
        thumbnailContainer.className = "thumbnail-box";
        thumbnailContainer.innerHTML = `
        <div class="overlays">
        <div id="addFavBtn" class="overlay-item ${isFav ? 'active' : ''}">
        ${isFav ? '🩷' : '🤍'}
        </div>
        <a id="downloadVidBtn" class="overlay-item" href="/api/video/?video_id=${video.id}" download="${video.title}.mp4">🔽</a>
        </div>
        <img src="/api/thumbnail?video_id=${video.id}" loading="lazy" alt="${video.title}">
        <div class="duration-badge">${video.duration}</div>
        `;
        const favBtn = thumbnailContainer.querySelector("#addFavBtn");
        favBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            favouriteBtnCallback(favBtn, video);
            card.classList.toggle("favourite")
        });
        thumbnailContainer.querySelector("img").addEventListener("click", () => thumbnailCallback(video));

        const titleContainer = document.createElement("div");
        titleContainer.className = "title";
        titleContainer.innerText = video.title;

        card.appendChild(thumbnailContainer);
        card.appendChild(titleContainer);

        return card;
    }

    function renderVideos({
        videos,
        gridId = 'videoGrid',
        sortingFunction = (a, b) => {
            return true
                ? b.modified_time - a.modified_time
                : a.modified_time - b.modified_time;
        },
        applyFunctionOnCard = (card, videoData) => { card.dataset.video_id = videoData.id },
        favouriteBtnCallback = (favBtnElem, videoData) => { toggleFavourite(favBtnElem, videoData.id) },
        isFavouriteCallback = (videoData) => { return isFavourite(videoData.id) },
        thumbnailCallback = (videoData) => { window.open(`watch?id=${videoData.id}`) },
        excludeIds = null
    }) {

        const videoGrid = document.getElementById(gridId);

        if (!videoGrid) {
            throw new Error(`Grid with id: ${gridId} doesn't exist!`)
        }

        // Clear Video Grid
        videoGrid.innerHTML = '';

        if (!videos || !Array.isArray(videos) || videos.length === 0) {
            console.warn("Either no videos found or length is zero or Array.isArray for videos is False.")
            videoGrid.innerHTML = "<h1> No Video Available! </h1>";
            return;
        }

        let excludeIdSet = new Set();
        if (Array.isArray(excludeIds) && excludeIds.length > 0) {
            excludeIdSet = new Set(excludeIds)
        }
        let filteredVideos = [...videos].filter(video => !excludeIdSet.has(video.id));

        let sortedVideos = filteredVideos;
        if (sortingFunction) {
            try {
                sortedVideos = filteredVideos.sort(sortingFunction);
            } catch (error) {
                console.log(`Error in sorting videos: ${error}`)
            }
        }

        sortedVideos.forEach(video => {
            const videoCard = renderVideo({
                video: video,
                favouriteBtnCallback: favouriteBtnCallback,
                isFavouriteCallback: isFavouriteCallback,
                thumbnailCallback: thumbnailCallback
            });
            if (videoCard && videoCard instanceof Element) {
                try {
                    applyFunctionOnCard(videoCard, video)
                } catch (error) {
                    console.error(`Unable to aplly function to card: ${videoCard}: ${error}`)
                }
                videoGrid.appendChild(videoCard);
            }
        });
    }
    return {
        renderVideos: renderVideos
    }
})();

export function sortDescending() {
    return JSON.parse(localStorage.getItem('sortDescending') || 'true')
}

export function saveSortingConfig(sortDescending) {
    localStorage.setItem('sortDescending', JSON.stringify(sortDescending))
}

