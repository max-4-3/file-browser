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
            element.querySelector('i').className = "fa-solid fa-heart";
			element.querySelector('i').style.color = '';
        } else {
            favourites.push(id);
            element.classList.add("active");
            element.querySelector('i').className = "fa-solid fa-heart";
			element.querySelector('i').style.color = 'var(--favourite)';
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
        thumbnailCallback = (videoData) => { window.open(`watch?id=${videoData.id}`) },
        deleteBtnCallback = (video, cardElement) => { console.log('Video Deleted: ' + video.id); cardElement.remove() },
    }) {
        const card = document.createElement("div");
		card.href = `/watch?id=${video.id}`;
        const isFav = isFavouriteCallback(video);
        card.className = "card";
        card.dataset.videoId = video.id;

        if (isFav) {
            card.classList.add("favourite")
        }

		function convertDuration(rawDuration) {
		  if (typeof rawDuration === "string") return rawDuration;

		  const totalSeconds = Math.max(parseInt(rawDuration, 10) || 0, 0);
		  const minutes = Math.floor(totalSeconds / 60);
		  const seconds = totalSeconds % 60;

		  // Return formatted string like "2:05"
		  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
		}

        const thumbnailContainer = document.createElement("div");
        thumbnailContainer.className = "thumbnail-box";
        thumbnailContainer.innerHTML = `
        <img id="vidThumbnail" src="/api/thumbnail?video_id=${video.id}" loading="lazy" alt="${video.title}">
        <div class="overlays">
        <div id="addFavBtn" class="overlay-item ${isFav ? 'active' : ''}">
			<i class="fa-solid fa-heart"></i>
        </div>
        <a id="downloadVidBtn" class="overlay-item" href="/api/video/?video_id=${video.id}" download="${video.title}.mp4">
			<i class="fa-solid fa-download"></i>
		</a>
        <div id="deleteVidBtn" class="overlay-item">
			<i class="fa-solid fa-trash"></i>
        </div>
        </div>
        <div class="duration-badge">${convertDuration(video.duration)}</div>
        `;
        const favBtn = thumbnailContainer.querySelector("#addFavBtn");
        favBtn.addEventListener("click", (event) => {
            event.stopPropagation();
            favouriteBtnCallback(favBtn, video);
            card.classList.toggle("favourite")
        });
        thumbnailContainer.querySelector("img").addEventListener("click", () => thumbnailCallback(video));
		
        const delBtn = thumbnailContainer.querySelector("#deleteVidBtn")
        if (delBtn instanceof Element) {
            delBtn.addEventListener("click", () => {deleteBtnCallback(video, card)})
        } else { console.error("Unable to attach delete callback to button!\n" + `Type of delBtn = ${typeof Element}`) }

		const videoInfoContaier = document.createElement("div");
		videoInfoContaier.className = "video-info";

        const titleContainer = document.createElement("p");
        titleContainer.className = "title";
        titleContainer.innerText = video.title;

		const sizeChip = document.createElement("div");
		sizeChip.className = "video-size chip";
		sizeChip.innerHTML = `<p class="icon"><i class="fa-solid fa-database"></i></p><p class="content">${(parseInt(video.filesize) / (1024 ** 2)).toFixed(2)}MB</p>`

		const timeDiffChip = document.createElement("div");
		timeDiffChip.className = "time-diff chip"
		timeDiffChip.innerHTML = `<p class="icon"><i class="fa-solid fa-clock"></i></p><p class="content">${getRelativeTime(video.modified_time)}</p>`

		const chipContainer = document.createElement("div");
		chipContainer.className = "chips-container";

		chipContainer.appendChild(timeDiffChip);
		chipContainer.appendChild(sizeChip);

		videoInfoContaier.appendChild(titleContainer);
		videoInfoContaier.appendChild(chipContainer);
		
        card.appendChild(thumbnailContainer);
        card.appendChild(videoInfoContaier);

        return card;
    }

    function renderVideos({
        videos,
        gridId = 'videoGrid',
        applyFunctionOnCard = (card, videoData) => { card.dataset.video_id = videoData.id },
        favouriteBtnCallback = (favBtnElem, videoData) => { toggleFavourite(favBtnElem, videoData.id) },
        isFavouriteCallback = (videoData) => { return isFavourite(videoData.id) },
        thumbnailCallback = (videoData) => { window.open(`watch?id=${videoData.id}`) },
		deleteBtnCallback = (video, cardElement) => { console.log('Video Deleted: ' + video.id); cardElement.remove() },
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
            videoGrid.classList.add("no-videos");
            videoGrid.innerHTML = "<h1> No Video Available! </h1>";
            return;
        }

        let excludeIdSet = new Set();
        if (Array.isArray(excludeIds) && excludeIds.length > 0) {
            excludeIdSet = new Set(excludeIds)
        }
        let filteredVideos = [...videos].filter(video => !excludeIdSet.has(video.id));
        let sortedVideos = filteredVideos;

        sortedVideos.forEach(video => {
            const videoCard = renderVideo({
                video: video,
                favouriteBtnCallback: favouriteBtnCallback,
                isFavouriteCallback: isFavouriteCallback,
                thumbnailCallback: thumbnailCallback,
				deleteBtnCallback: deleteBtnCallback,
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

    function showToast(message, type = 'primary', interval = 2000) {
        let toastContainer = document.querySelector("#toast-container");

        const icons = {
            primary: 'ℹ️',
            success: '✅',
            danger: '❌',
            warning: '⚠️'
        };

        if (toastContainer == null) {
            toastContainer = document.createElement("div");
            toastContainer.id = "toast-container";
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement("div");
        toast.className = "toast " + type;
        toast.innerHTML = `
        <p class="icon">${icons[type] || 'ℹ️'}</p>
        <p class="message">${message}</p>
        `
        function removeToast() {
            if (toast.classList.contains("hide")) {
                toast.remove();
                return;
            }

            toast.classList.add("hide")
            toast.addEventListener("animationend", removeToast)
        }

        toastContainer.appendChild(toast)
        setTimeout(removeToast, interval)

    }

	function getRelativeTime(timestampInSeconds) {
		const currentTime = Date.now() / 1000; // seconds
		const diff = currentTime - timestampInSeconds;

		// Just Now condition
		if (diff < 600) return "Just Now";

		const units = [
			{ name: "decade", secs: 315569260 }, // ~10 years
			{ name: "year", secs: 31556926 },    // ~365.24 days
			{ name: "month", secs: 2629743 },    // ~30.44 days
			{ name: "week", secs: 604800 },
			{ name: "day", secs: 86400 },
			{ name: "hour", secs: 3600 },
			{ name: "minute", secs: 60 }
		];

		for (const unit of units) {
			if (diff >= unit.secs) {
				const value = Math.floor(diff / unit.secs);
				return `${value} ${unit.name}${value > 1 ? "s" : ""} ago`;
			}
		}

		return "A Long Time Ago..."; // fallback 
	}

    return {
		renderVideo: renderVideo,
        renderVideos: renderVideos,
        showToast: showToast,
		getRelativeTime: getRelativeTime,
    }
})();

export function sortingState() {
    const defaultSortState = {
        newerFirst: true,
        olderFirst: false,
        biggerFirst: false,
        smallerFirst: false,
		longerFirst: false,
		shorterFirst: false
    }
    const sortingState = localStorage.getItem('sortingState')
    if (sortingState) {
        return JSON.parse(sortingState)
    } else {
        return defaultSortState
    }
}

export function saveSortingConfig(sortingState) {
    localStorage.setItem('sortingState', JSON.stringify(sortingState))
}

export function showStatsBottom(videos) {
    let statsBottom = document.getElementById("statsBottom");

    if (!statsBottom) {
        statsBottom = document.createElement("div");
        statsBottom.id = "statsBottom";
        document.body.appendChild(statsBottom);
    }

    const totalVideos = videos.length;
    const totalSizeInBytes = videos.reduce((acc, video) => acc + Number(video.filesize || 0), 0);
    const totalSizeMB = (totalSizeInBytes / 1024 ** 2).toFixed(2);
    const totalSizeGB = (totalSizeInBytes / 1024 ** 3).toFixed(2);

    const favourites = JSON.parse(localStorage.getItem("favourites") || "[]");
    const totalFavourites = favourites.length;

    statsBottom.innerHTML = `
        <span>Total Videos: <strong>${totalVideos}</strong></span>
        <span>Total Size: <strong>${totalSizeMB}</strong> <span style="text-transform: uppercase;">MB</span> 
        (<strong>${totalSizeGB}</strong> <span style="text-transform: uppercase;">GB</span>)</span>
        <span>Total Favourites: <strong>${totalFavourites}</strong></span>
    `;
}

if (window.innerWidth <= 400) {
	let newWidth = Math.max(200, window.innerWidth) - 20
	document.querySelectorAll('.video-grid').forEach(elem => elem.style.setProperty('--card-size', newWidth + 'px'))
}

export function getUserName() {
	return localStorage.getItem("login");
}

export function setUserName(userName) {
	userName ? localStorage.setItem("login", userName) : {};
}

export function loginUser() {
	const userLoginModal = document.createElement("div");
	userLoginModal.classList.add("modal");
	
	const userLoginModalContent = document.createElement("div");
	userLoginModalContent.classList.add("modal-content");

	const userLoginForm = document.createElement("form");
	const userNameInput = document.createElement("input");
	const userNameSubmitButton = document.createElement("button");

	userLoginModalContent.textContent = localStorage.getItem("login") ? `Welcome, ${localStorage.getItem('login')}!` : "";
	userNameInput.placeholder = "New Username";
	userNameInput.type = "text";
	userNameSubmitButton.type = "submit";
	userNameSubmitButton.classList.add("cool-button");
	userNameSubmitButton.disabled = true;
	userLoginForm.classList.add("user-login-form");

	userNameSubmitButton.innerHTML = "<i class='fa-solid fa-check'></i>"

	function closeModal(postFn = () => {}) {
		document.body.classList.remove("modal-shown");

		userLoginModal.remove();
		
		// Call post fn
		postFn?.();
	}

	function closeModal1(e) {
		if (e.target === userLoginModal) {
			window.removeEventListener("click", closeModal1);
			closeModal();
		}
	}

	userLoginForm.addEventListener("submit", e => {
		e.preventDefault();
		let prevUserName = getUserName();
		let newUserName = userNameInput.value.trim();

		if (!newUserName || newUserName === prevUserName) { // Handle error 
			MainModule.showToast("Invalid or Already Existing!", "danger")
			return;
		}

		console.log(prevUserName, "changed to", newUserName);
		setUserName(newUserName);
		MainModule.showToast("Success!");
		setTimeout(() => closeModal(() => window.location.reload()), 500);
	})

	userNameInput.addEventListener("input", () => {
		userNameSubmitButton.disabled = userNameInput.value.trim() ? false : true
	})

	userLoginModal.appendChild(userLoginModalContent);
	userLoginModalContent.appendChild(userLoginForm);
	userLoginForm.append(userNameInput, userNameSubmitButton);
	document.body.appendChild(userLoginModal);
	document.body.classList.add("modal-shown");

	window.addEventListener("click", closeModal1)
}

