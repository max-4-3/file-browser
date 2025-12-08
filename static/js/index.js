import {
	MainModule,
	showStatsBottom,
	getUserName,
	loginUser,
	applyFilters,
	getSortingState,
} from "./main.js";

let videos = [];
let isAndroid = (function() {
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;
	return /android/i.test(userAgent);
})();
let prevBatch = [];
const batchSize = 10;
const videoGrid = document.querySelector("#videoGrid");
const renderVideosObserver = new IntersectionObserver(renderNextBatch, {
	rootMargin: "100px",
});
let lastSelectedSort = null;
let sortingState = getSortingState();

async function fetchVideos(apiEndpoint = "/api/videos?extras=true") {
	try {
		const res = await fetch(apiEndpoint);
		if (!res.ok) {
			throw new Error("Request Wasn't Ok!");
		}
		const data = await res.json();
		console.groupCollapsed("Video analysis...");
		const videos = data.videos.map((vid) => {
			vid.quality = MainModule.determineQuality(vid); // "4K" | "2K" | "FHD" | "HD" | "SD"
			vid.orientation = MainModule.determineOrientation(vid); // "16:9" | "9:16" | "1:1"
			vid.skip = false;
			return vid;
		});
		console.groupEnd();
		return videos;
	} catch (error) {
		console.error("Fetch videos error:", error);
		return [];
	}
}

function deleteVideo(videoData, cardElement) {
	fetch("/api/video?video_id=" + videoData.id, {
		method: "DELETE",
		headers: {
			user: getUserName(),
		},
	})
		.then((response) => {
			if (response.ok) {
				let index = videos.findIndex((val) => val.id === videoData.id);

				if (index !== -1) {
					videos.splice(index, 1);
					cardElement.classList.add("deleted");
					MainModule.showToast("Video Removed!", "success");
				}
			} else if (response.status === 400) {
				MainModule.showToast("Unauthorized!", "danger");
			}
		})
		.catch((err) => {
			MainModule.showToast("Failed to remove video!", "danger");
			console.error(err);
		});
}

function prepareVideos() {
	videos = applyFilters(sortingState, videos);
	return videos;
}

function renderVideos() {
	// Reset DOM and scroll tracking
	renderVideosObserver.disconnect();
	videoGrid.innerHTML = "";
	prevBatch = [];

	// 1. Get the current, filtered/sorted list of videos
	videos = prepareVideos();
	const videosToRender = videos.filter((v) => !v.skip);

	if (videosToRender.length === 0) {
		console.warn("No videos found matching criteria.");
		return;
	}

	// 2. Get the first batch using slice (from index 0, up to batchSize)
	const newBatch = videosToRender.slice(0, batchSize);

	// 3. Render the batch
	newBatch.forEach((entry) => {
		const renderedVideo = MainModule.renderVideo({
			video: entry,
			deleteBtnCallback: deleteVideo,
		});
		renderedVideo.dataset.quality = entry.quality;
		renderedVideo.dataset.orientation = entry.orientation;
		videoGrid.appendChild(renderedVideo);
	});

	// 4. Update state and observer
	prevBatch.push(...newBatch);

	// Only observe if there are more videos left to load
	if (videosToRender.length > prevBatch.length && videoGrid.lastChild) {
		renderVideosObserver.observe(videoGrid.lastChild);
	}
}

function renderNextBatch(observerEntries) {
	observerEntries.forEach((entry) => {
		if (!entry.isIntersecting) return;
		renderVideosObserver.unobserve(entry.target);

		const lastId = prevBatch.at(-1)?.id;
		const startIndex = videos.findIndex((v) => v.id === lastId) + 1;

		if (!startIndex) {
			console.error("Last rendered video not found");
			return;
		}

		const newBatch = videos
			.slice(startIndex)
			.filter((v) => !v.skip)
			.slice(0, batchSize)
			.filter(Boolean);

		if (newBatch.length === 0) {
			console.log("No more un-skipped videos to load in the remaining list.");
			return;
		}

		// Render the batch
		newBatch.forEach((vid) => {
			const renderedVideo = MainModule.renderVideo({
				video: vid,
				deleteBtnCallback: deleteVideo,
			});
			renderedVideo.dataset.quality = vid.quality;
			renderedVideo.dataset.orientation = vid.orientation;
			videoGrid.appendChild(renderedVideo);
		});

		// Update state and set up observer
		prevBatch.push(...newBatch);
		if (videoGrid.lastChild) {
			renderVideosObserver.observe(videoGrid.lastChild);
		}
	});
}

function applySorting(filters) {
	videos = applyFilters(filters, videos);
	sortingState = getSortingState();
	renderVideos();
}

function initilizeFilterDropdown() {
	const favFirst = document.querySelector("#fav-first");
	const sortOrder = document.querySelector("#sort-order");
	const sortBy = document.querySelector("#sortBy");
	const sortSelected = document.querySelector("#sort-selected");
	const sortOptions = document.querySelectorAll(".sort-option");

	favFirst.checked = sortingState.favFirst;
	sortOrder.checked = sortingState.sortAsc;
	sortBy.value = sortingState.sortBy;
	sortOptions.forEach((el) => {
		if (el.dataset.sort === sortBy.value) {
			el.classList.add("hidden");
			sortSelected.textContent = el.textContent;
			sortSelected.dataset.sort = el.dataset.sort;
		}
	});

	document.querySelectorAll(`[name="orientation"]`).forEach((el) => {
		el.checked = false;
		if (el.value.toLowerCase() === sortingState.orientation.toLowerCase()) {
			el.checked = true;
		}
	});
	document.querySelectorAll(`[name="quality"]`).forEach((el) => {
		el.checked = false;
		if (el.value.toLowerCase() === sortingState.quality.toLowerCase()) {
			el.checked = true;
		}
	});
}

document.addEventListener("DOMContentLoaded", async () => {
	videos = await fetchVideos();
	renderVideos(); // Home Button

	if (0) {
		const homeButton = document.querySelector(".home-button");
		homeButton.textContent = homeButton.textContent.split(" ").splice(0, 1);
	} // Video Count Extra Element

	if (!isAndroid) {
		document.getElementById("vidCount").textContent = `${videos.length}`;
	} else {
		document.getElementById("vidCount").remove();
	} // Reload Button Element

	document.getElementById("reloadBtn").addEventListener("click", async (e) => {
		const iElem = document.querySelector("#reloadBtn").querySelector("i");

		try {
			// Add spin class to icon
			iElem.classList.add("fa-spin");
			const response = await fetch(
				"/reload" + (e.shiftKey ? "?hard=true" : ""),
				{ method: "POST" },
			);
			if (response.ok) {
				MainModule.showToast("Reloading page...", "primary");
				location.reload();
			} else {
				MainModule.showToast("Server reload failed!", "danger");
				console.error("Server returned error: " + response.status);
			}
		} catch (err) {
			MainModule.showToast("Failed to send reload request!", "danger");
			console.error("Fetch failed:", err);
		} finally {
			// Remove spin class from icon
			iElem.classList.remove("fa-spin");
		}
	});
	showStatsBottom(videos); // Search

	const searchDiv = document.querySelector("#searchVideos");
	const clearSearch = searchDiv.querySelector('button[type="reset"]');
	const searchInput = searchDiv.querySelector("#search-input");
	const searchResults = document.querySelector("#searchResults");

	clearSearch.addEventListener("click", () => {
		searchDiv.style.display = "none";
		searchInput.value = "";
		videoGrid.style.display = "";
		searchResults.classList.add("empty");
		searchResults.innerHTML = ""; // clear any old results
	}); // Debounce (i.e. runs after the user stop firing enevts

	function debounce(func, delay) {
		let timeout;
		return function(...args) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), delay);
		};
	}

	searchInput.addEventListener(
		"input",
		debounce(() => {
			const searchTerm = searchInput.value.trim();
			searchResults.innerHTML = ""; // clear before rendering new results

			if (!searchTerm) {
				videoGrid.style.display = "";
				searchResults.classList.add("empty");
				return;
			}

			const results = videos.filter((v) =>
				v.title.toLowerCase().includes(searchTerm.toLowerCase()),
			);

			if (results.length > 0) {
				searchResults.classList.remove("empty");
				videoGrid.style.display = "none";

				searchResults.append(
					...results.map((d) => MainModule.renderVideo({ video: d })),
				);
			} else {
				searchResults.classList.add("empty");
				videoGrid.style.display = "none";
			}
		}, 650),
	); // UserLogin

	const userLoginButton = document.querySelector("#userBtn");
	userLoginButton.addEventListener("click", loginUser); // New FilterDropDown

	const filterDropdownToggle = document.querySelector(
		"#main-filter-toggle-btn",
	);
	const filterDropdown = document.querySelector("#filters-form");
	const sortSelect = document.querySelector(".sort-select");
	const sortSelected = document.getElementById("sort-selected");
	const sortOptions = document.querySelectorAll(".sort-option");
	const sortByInput = document.getElementById("sortBy"); // toggle dropdown
	const resetButton = filterDropdown.querySelector('[type="reset"]')

	resetButton.addEventListener("click", () => {
		const data = {
			favFirst: false,
			sortBy: "date",
			sortAsc: false,
			orientation: "all",
			quality: "all",
		};
		applySorting(data);
		filterDropdown.classList.remove("show");
	})

	filterDropdownToggle.addEventListener("click", () => {
		filterDropdownToggle.classList.toggle("active");
		filterDropdown.classList.toggle("show");
	});

	sortSelected.addEventListener("click", () => {
		sortSelect.classList.toggle("open");
	});

	sortOptions.forEach((option) => {
		if (option.dataset.sort === "date") {
			option.classList.add("hidden");
			lastSelectedSort = option;
		}
		option.addEventListener("click", () => {
			const label = option.textContent;
			const value = option.dataset.sort; // Update button + hidden input

			sortSelected.textContent = label;
			sortByInput.value = value; // Remove "hidden" from the last selected option

			if (lastSelectedSort) {
				lastSelectedSort.classList.remove("hidden");
			} // Hide the currently selected one

			option.classList.add("hidden");
			lastSelectedSort = option; // Close dropdown

			sortSelect.classList.remove("open");
		});
	}); // --- Main Form Submit Handler ---

	document.getElementById("filters-form").addEventListener("submit", (e) => {
		e.preventDefault();

		const form = new FormData(e.target);

		const data = {
			favFirst: form.get("favFirst") === "on",
			sortBy: form.get("sortBy"),
			sortAsc: form.get("sortAsc") === "on",
			orientation: form.get("orientation"),
			quality: form.get("quality"),
		};

		filterDropdown.classList.remove("show");
		filterDropdownToggle.classList.remove("active");
		applySorting(data);
	});

	initilizeFilterDropdown();

	// To up button
	const toUpButton = document.getElementById("to-up");
	toUpButton.addEventListener("click", () => window.scroll(0, 0));
	window.addEventListener("scroll", () => {
		toUpButton.classList.toggle("show", window.scrollY > window.innerHeight);
	});
});
