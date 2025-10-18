import {
	MainModule,
	saveSortingConfig,
	sortingState as getSortingState,
	showStatsBottom,
	setUserName,
	getUserName,
	loginUser
} from "./main.js";

// --- Global DOM Element References (declared at top level) ---
const playerElement = document.getElementById("player");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const retryButton = document.getElementById("retryButton");
const refreshButton = document.getElementById("refreshVideos");
const downloadBtn = document.getElementById("downloadBtn");
const playerType = document.getElementById("playerType");
const videoGrid = document.getElementById("videoGrid");

// --- Global/Module Variables (declared at top level) ---
let videoId = new URLSearchParams(window.location.search).get("id");
let sortingState = getSortingState();
let videos = [];
let isAndroid = (function () {
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;
	return /android/i.test(userAgent);
})();
let prevBatch = [];
const batchSize = 10;
const renderVideoObserver = new IntersectionObserver(renderNextBatch)
let player; // Holds the Plyr instance
let plyrTimeoutId; // Stores the ID for the Plyr initialization timeout
let playerInitialized = false; // Flag to indicate if *any* player (Plyr or native) is active
let currentVideoData = null;
let useNative = String(localStorage.getItem("playerType")).toLowerCase() === "native";

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
				console.error(
					"Error destroying Plyr instance during error display:",
					e,
				);
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
			console.log(
				"Player already initialized, skipping native fallback attempt.",
			);
			return;
		}

		console.warn(
			"Plyr initialization timed out or failed. Falling back to native video player.",
		);

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

		playerInitialized = true;
		console.log("Native video player successfully loaded.");

		playerElement.onerror = () => {
			UtilsModule.showPlayerError(
				"Error playing video in native player. Please check the video source.",
			);
		};
	}

	function setVideoInfo() {
		const videoInfoContainer = document.querySelector("div.current.video-info");
		videoInfoContainer.innerHTML = "";

		if (currentVideoData === null) {
			return;
		}

		const videoTitleContainer = document.createElement("p");
		videoTitleContainer.className = "current title";
		videoTitleContainer.innerText = currentVideoData.title;

		const videoModifiedTime = new Date(currentVideoData.modified_time * 1000);

		const chipsContainer = document.createElement("div");
		chipsContainer.className = "current chips-container";
		chipsContainer.innerHTML = `
        <div class="chip current">
			<p class="icon"><i class="fa-solid fa-database"></i></p>
        <p class="content">${(currentVideoData.filesize / 1024 ** 2).toFixed(2)}MB</p>
        </div>
        <div class="chip current">
			<p class="icon"><i class="fa-solid fa-clock"></i></p>
        <p class="content">${videoModifiedTime.toLocaleString()} (${MainModule.getRelativeTime(videoModifiedTime.getTime() / 1000)})</p>
        </div>
		`;
		// Add Copy Event to all Chips!
		[...chipsContainer.children].forEach((elem) => {
			elem.addEventListener("click", copyVidInfo);
		});

		// Make Custom Buttons!
		const copyButton = document.createElement("div");
		copyButton.className = "cool-button";
		copyButton.innerHTML = `<i class="fa-regular fa-copy"></i>`;

		function copyVidInfo(event) {
			if (currentVideoData !== null && currentVideoData.id === videoId) {
				const origin = window.location.origin;
				const originalHTML = event.target.innerHTML;

				const textToCopy = JSON.stringify({
					id: currentVideoData.id,
					title: currentVideoData.title,
					videoUrl: origin + "/api/video?video_id=" + currentVideoData.id,
					videoSize: currentVideoData.filesize,
					videoSizeNorm:
						(currentVideoData.filesize / 1024 ** 2).toFixed(2) + "MB",
					thumbnail: origin + "/api/thumbnail?video_id=" + currentVideoData.id,
					modified_time: currentVideoData.modified_time,
					modified_time_localized: videoModifiedTime.toLocaleString(),
					relative_time: MainModule.getRelativeTime(
						videoModifiedTime.getTime() / 1000,
					),
				});
				navigator.clipboard
					.writeText(textToCopy)
					.then(() => {
						event.target.innerHTML = `<i class="fa-solid fa-copy"></i>`;
					})
					.catch((err) => {
						event.target.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i>`;
						console.error("Copy Error:", err);
					})
					.finally(() => {
						setTimeout(() => {
							event.target.innerHTML = originalHTML;
						}, 2000);
					});
			}
		}

		const deleteVideoButton = document.createElement("div");
		deleteVideoButton.className = "cool-button";
		deleteVideoButton.innerHTML = `<i class="fa-regular fa-trash"<i>`;
		deleteVideoButton.style.background = "var(--danger, rgb(200,0,0))";
		deleteVideoButton.style.color = "var(--light, rgb(200,200,200))";

		deleteVideoButton.addEventListener(
			"click",
			(e) => {
				deleteVideo(currentVideoData, document.createElement("span"));
				deleteVideoButton.innerHTML = `<i class="fa-solid fa-trash"<i>`;
			},
			{ once: true },
		);

		const shareVideoButton = document.createElement("div");
		shareVideoButton.className = "cool-button";
		shareVideoButton.innerHTML = `<i class="fa-solid fa-share-from-square"></i>`;
		
		shareVideoButton.addEventListener("click",async () => {
			if (navigator.share) {
				try {
					const sharableUrl = (new URL(window.location)).origin.toString() + "?video_id=" + videoId;
					await navigator.share({
						title: document.title,
						text: "Open Native",
						url: sharableUrl
					})
					shareVideoButton.style.background = "var(--success)";
				} catch (e) {
					shareVideoButton.style.background = "var(--warning)"
				} finally {
					setTimeout(()=> {
						shareVideoButton.style.background = "";
					}, 1000);
				}
			} else {
				MainModule.showToast("Unable to share!", "warning");
			}
		})

		chipsContainer.append(copyButton, shareVideoButton, deleteVideoButton);
		videoInfoContainer.appendChild(videoTitleContainer);
		videoInfoContainer.appendChild(chipsContainer);
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
			if (useNative) throw new Error("Native Player Requested!");
			player = new Plyr("#player", {
				autoplay: false,
				seekTime: 10,
				captions: { active: false },
				keyboard: { focused: true, global: true },
				controls: [
					"play-large",
					"restart",
					"rewind",
					"play",
					"fast-forward",
					"progress",
					"current-time",
					"duration",
					"mute",
					"volume",
					"captions",
					"settings",
					"pip",
					"airplay",
					"download",
					"fullscreen",
				],
				urls: {
					download: `/api/video?video_id=${videoId}`,
				},
			});

			player.source = {
				type: "video",
				sources: [{ src: `/api/video?video_id=${videoId}` }],
				poster: `/api/thumbnail?video_id=${videoId}`,
			};

			player.on("loadedmetadata", () => {
				clearTimeout(plyrTimeoutId);
				if (!playerInitialized) {
					loadingState.style.display = "none";
					playerElement.style.display = "block";
					playerInitialized = true;
					console.log("Plyr player loaded successfully.");
				}

				// Add Scroll Event to change video's duration
				// Cache the elements
				const videoElem = document.querySelector(".video-container video");
				const progressBar = document.querySelector(
					".video-container .plyr__controls__item.plyr__progress__container",
				);

				// Logic
				let seekTime = 10;
				progressBar?.addEventListener("wheel", (e) => {
					if (videoElem) {
						videoElem.currentTime = Math.max(
							0,
							Math.min(
								videoElem.currentTime - Math.sign(e.deltaY) * seekTime,
								videoElem.duration,
							),
						);
						e.preventDefault();
						return;
					}
				});
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

		// Slides to top on loaded video
		document.querySelector("video").onloadedmetadata = function () {
			scrollTo(0, 0);

			// disable double click fullscreen
			this.addEventListener("dblclick", (e) => {
				e.preventDefault();
				e.stopPropagation();
			});
		};
	}

	return {
		initialize: initialize,
		setVideoInfo: setVideoInfo,
	};
})();

async function fetchVideos(apiEndpoint = "/api/videos") {
	const res = await fetch(apiEndpoint);
	if (!res.ok) {
		throw new Error("Request Wasn't Ok!");
	}
	const data = await res.json();
	return data.videos;
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
				let index = -1;
				videos.forEach((val, idx) => {
					if (val.id === videoData.id) {
						index = idx;
					}
				});

				if (index !== -1) {
					videos.splice(index, 1);
					cardElement.classList.add('deleted');
					MainModule.showToast("Video Removed!", "success");
				}
			} else if (response.status === 401) {
				MainModule.showToast("Unauthorized!", "danger");
			}
		})
		.catch((e) => {
			MainModule.showToast("Unable to Remove Video!", "danger");
			console.log(e);
		});
}

function prepareVideos() {
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

		function convertDurationToInt(value) {
			const [m, s] = String(value).split(":");
			return m * 60 + s;
		}

		if (sortingState.biggerFirst) {
			return differenceOfProperty("filesize", b, a);
		} else if (sortingState.smallerFirst) {
			return differenceOfProperty("filesize", a, b);
		} else if (sortingState.newerFirst) {
			return differenceOfProperty("modified_time", b, a);
		} else if (sortingState.olderFirst) {
			return differenceOfProperty("modified_time", a, b);
		} else if (sortingState.longerFirst) {
			return differenceOfProperty("duration", b, a, convertDurationToInt);
		} else if (sortingState.shorterFirst) {
			return differenceOfProperty("duration", a, b, convertDurationToInt);
		} else {
			return 0;
		}
	});

	return localVideos;
}

function renderVideos() {
	// Reset
	renderVideoObserver.disconnect();
	videoGrid.innerHTML = '';
	prevBatch = [];

	// Re-init
	videos = prepareVideos();
	
	// Rendering first batch
	const newBatch = [...videos].splice(prevBatch.length, batchSize)

	// Create new cards
	const videoCards = newBatch.map(videoData => MainModule.renderVideo({
		video: videoData,
		deleteBtnCallback: deleteVideo,
		thumbnailCallback: () => {},
	}));

	// Append newly created video card to grid or apply any function to card ( e.g. middle click handler )
	videoCards.forEach((vidCard, index) => {
		const vidData = newBatch[index]
		if (vidData.id === videoId) return

		vidCard.querySelector("img").addEventListener("click", async () => {
			const newVideoId = vidData.id;
			if (newVideoId && newVideoId !== videoId) {
				videoId = newVideoId; // Update the global videoId

				// Update the URL in the browser's history without reloading the page
				const newUrl = new URL(window.location.href);
				newUrl.searchParams.set("id", videoId);
				window.history.pushState({ path: newUrl.href }, "", newUrl.href);

				PlayerModule.initialize(); // Re-initialize the player with the new video ID
				renderVideos();
				setVideoInfoAndPageTitle();
			}
		});
		vidCard.addEventListener("mousedown", (e) => {
			if (e.button === 1) {
				// 0,1,2 = left, middle, right
				e.preventDefault();
				window.open(`/watch?id=${vidData.id}`);
			}
		});
		videoGrid.appendChild(vidCard)
	})

	// First
	prevBatch.push(...newBatch);
	renderVideoObserver.observe(videoGrid.lastChild);
}

function renderNextBatch(observerEntries) {
	observerEntries.forEach(entry => {
		if (!entry.isIntersecting) return

		renderVideoObserver.unobserve(entry.target)
		const nextBatch = [...videos].splice(prevBatch.length, batchSize)

		// Create new cards
		const videoCards = nextBatch.map(videoData => MainModule.renderVideo({
			video: videoData,
			deleteBtnCallback: deleteVideo,
			thumbnailCallback: () => {},
		}));

		// Append newly created video card to grid or apply any function to card ( e.g. middle click handler )
		videoCards.forEach((vidCard, index) => {
			const vidData = nextBatch[index]
			vidCard.querySelector("img").addEventListener("click", async () => {
				const newVideoId = vidData.id;
				if (newVideoId && newVideoId !== videoId) {
					videoId = newVideoId; // Update the global videoId

					// Update the URL in the browser's history without reloading the page
					const newUrl = new URL(window.location.href);
					newUrl.searchParams.set("id", videoId);
					window.history.pushState({ path: newUrl.href }, "", newUrl.href);

					PlayerModule.initialize(); // Re-initialize the player with the new video ID
					renderVideos();
					setVideoInfoAndPageTitle();
				}
			});
			vidCard.addEventListener("mousedown", (e) => {
				if (e.button === 1) {
					// 0,1,2 = left, middle, right
					e.preventDefault();
					window.open(`/watch?id=${vidData.id}`);
				}
			});
			videoGrid.appendChild(vidCard)
		})

		// Update for next batch rendering
		prevBatch.push(...nextBatch)
		renderVideoObserver.observe(videoGrid.lastChild)  // Observer the last element
	})
}

function setSortOrder(order) {
	Object.keys(sortingState).forEach((key) => {
		sortingState[key] = key === order;
	});
	saveSortingConfig(sortingState);
}

function setVideoInfoAndPageTitle() {
	fetch(`/api/stats?video_id=${videoId}`)
		.then((resp) => {
			if (!resp.ok) {
				throw new Error("Unable to get video stats!");
			}
			resp.json().then((vidData) => {
				currentVideoData = vidData;
				document.title = currentVideoData.title;
				PlayerModule.setVideoInfo();
			});
		})
		.catch((error) => {
			console.error(error);
		});
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
	setVideoInfoAndPageTitle();
	videos = await fetchVideos();
	renderVideos();

	// Change Player Type Button
	playerType.textContent = useNative ? "Modern" : "Native";
	playerType.dataset.playerType = useNative ? "modern" : "native";
	playerType.addEventListener("click", () => {
		useNative = playerType.dataset.playerType.toLowerCase() === "native";
		playerType.textContent = useNative ? "Modern" : "Native";
		playerType.dataset.playerType = useNative ? "modern" : "native";
		localStorage.setItem("playerType", useNative ? "native" : "modern");
		PlayerModule.initialize();
		setVideoInfoAndPageTitle();
	});

	// Retry Button
	retryButton.addEventListener("click", PlayerModule.initialize);

	// Refresh Button
	refreshButton.addEventListener("click", async () => {
		videos = await fetchVideos();
		renderVideos();
	});

	// Video Count Extra Element
	if (!isAndroid) {
		document.getElementById("vidCount").innerText = `${videos.length}`;
	} else {
		document.getElementById("vidCount").remove();
	}

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
	
	// Debounce (i.e. runs after the user stop firing enevts
	function debounce(func, delay) {
		let timeout;
		return function (...args) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), delay)
		}
	}

	searchInput.addEventListener("input", debounce(() => {
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
	}, 650));


	// User
	document.querySelector("#userBtn")?.addEventListener("click", loginUser)
});
