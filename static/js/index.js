import {
	MainModule,
	saveSortingConfig,
	sortingState as getSortingState,
	showStatsBottom,
} from "./main.js";

let sortingState = getSortingState();
let videos = [];
let isAndroid = (function () {
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;
	return /android/i.test(userAgent);
})();
let prevBatch = [];
const batchSize = 10;
const videoGrid = document.querySelector("#videoGrid");
const renderVideosObserver = new IntersectionObserver(renderNextBatch);

async function fetchVideos(apiEndpoint = "/api/videos") {
	try {
		const res = await fetch(apiEndpoint);
		if (!res.ok) {
			throw new Error("Request Wasn't Ok!");
		}
		const data = await res.json();
		return data.videos;
	} catch (error) {
		console.error("Fetch videos error:", error);
		return [];
	}
}

function deleteVideo(videoData, cardElement) {
	fetch("/api/video?video_id=" + videoData.id, {
		method: "DELETE",
		headers: {
			user: "maxim",
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
			} else {
				MainModule.showToast("Failed to remove video!", "danger");
			}
		})
		.catch((err) => {
			MainModule.showToast("Failed to remove video!", "danger");
			console.error(err);
		});
}

function prepareVideos() {
	console.log(videos.length);
	// Create a shallow copy of the videos array
	let localVideos = [...videos];
	localVideos.sort((a, b) => {
		function differenceOfProperty(
			propName,
			firstElem,
			secondElem,
			parseFunc = null,
		) {
			let valA = firstElem[propName];
			let valB = secondElem[propName];

			if (parseFunc) {
				valA = parseFunc(valA);
				valB = parseFunc(valB);
			}
			return valA - valB;
		}

		if (sortingState.biggerFirst) {
			return differenceOfProperty("filesize", b, a);
		} else if (sortingState.smallerFirst) {
			return differenceOfProperty("filesize", a, b);
		} else if (sortingState.newerFirst) {
			return differenceOfProperty("modified_time", b, a);
		} else if (sortingState.olderFirst) {
			return differenceOfProperty("modified_time", a, b);
		} else {
			return 0;
		}
	});

	return localVideos;
}

function setSortOrder(order) {
	Object.keys(sortingState).forEach((key) => {
		sortingState[key] = key === order;
	});
	saveSortingConfig(sortingState);
}

function renderVideos() {
	// Reset
	renderVideosObserver.disconnect();
	videoGrid.innerHTML = "";
	prevBatch = [];

	// Re-init
	videos = prepareVideos();

	// Rendering first batch
	const newBatch = [...videos].splice(prevBatch.length, batchSize);
	newBatch.forEach((entry) => {
		videoGrid.appendChild(
			MainModule.renderVideo({ video: entry, deleteBtnCallback: deleteVideo }),
		);
	});

	// First
	prevBatch.push(...newBatch);
	renderVideosObserver.observe(videoGrid.lastChild);
}

function renderNextBatch(observerEntries) {
	observerEntries.forEach((entry) => {
		if (!entry.isIntersecting) return;
		renderVideosObserver.unobserve(entry.target);
		const nextBatch = [...videos].splice(prevBatch.length, batchSize);

		// Create new cards
		const videoCards = nextBatch.map((videoData) =>
			MainModule.renderVideo({
				video: videoData,
				deleteBtnCallback: deleteVideo,
			}),
		);

		// Append newly created video card to grid
		videoCards.forEach((v) => {
			videoGrid.appendChild(v);
		});

		// Update for next batch rendering
		prevBatch.push(...nextBatch);
		renderVideosObserver.observe(videoGrid.lastChild); // Observer the last element
	});
}

document.addEventListener("DOMContentLoaded", async () => {
	videos = await fetchVideos();
	renderVideos();

	// Home Button
	if (0) {
		const homeButton = document.querySelector(".home-button");
		homeButton.textContent = homeButton.textContent.split(" ").splice(0, 1);
	}

	// Video Count Extra Element
	if (!isAndroid) {
		document.getElementById("vidCount").textContent = `${videos.length}`;
	} else {
		document.getElementById("vidCount").remove();
	}

	// Reload Button Element
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

	// Filter DropDown
	const showDropDownBtn = document.querySelector("#showFilterDropDownButton");
	const filterDropDownOptions = document.querySelector(
		"#filterDropDownOptions",
	);

	showDropDownBtn.addEventListener("click", () => {
		filterDropDownOptions.classList.toggle("show");
	});

	document
		.querySelectorAll("#filterDropDownOptions .option")
		.forEach((elem) => {
			if (sortingState[String(elem.dataset.sortOrder)])
				elem.classList.add("selected");
			elem.addEventListener("click", (e) => {
				document
					.querySelectorAll("#filterDropDownOptions .option")
					.forEach((opt) => {
						opt.classList.remove("selected");
					});

				e.target.classList.add("selected");

				const orderBy = String(e.target.dataset.sortOrder);

				setSortOrder(orderBy);
				renderVideos();
			});
		});

	showStatsBottom(videos);

	// Search
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
	});

	searchInput.addEventListener("input", (e) => {
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
	});
});
