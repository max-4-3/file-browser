import {
	MainModule,
	saveSortingConfig,
	sortingState as getSortingState,
	showStatsBottom,
	setUserName,
	getUserName,
	loginUser,
} from "./main.js";

// --- Global DOM Element References ---
const playerElement = document.getElementById("player");
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const retryButton = document.getElementById("retryButton");
const refreshButton = document.getElementById("refreshVideos");
const downloadBtn = document.getElementById("downloadBtn");
const playerType = document.getElementById("playerType");
const videoGrid = document.getElementById("videoGrid");

// --- Global / Module variables ---
let videoId = new URLSearchParams(window.location.search).get("id");
let sortingState = getSortingState();
let videos = [];
const isAndroid = (() => {
	const ua = navigator.userAgent || navigator.vendor || window.opera;
	return /android/i.test(ua);
})();
let prevBatch = [];
const batchSize = 10;
const renderVideoObserver = new IntersectionObserver(renderNextBatch, {
	rootMargin: "100px",
});
let player = null; // Plyr instance or null
let plyrTimeoutId = null;
let playerInitialized = false;
let currentVideoData = null;
let currentOrientation = "All";
let useNative =
	String(localStorage.getItem("playerType") || "").toLowerCase() === "native";

// Keyboard handler guard so we don't add multiple identical listeners
let keyboardShortcutsBound = false;

/* -------------------- Utils -------------------- */
const UtilsModule = (() => {
	function showPlayerError(message) {
		console.error(message);
		loadingState.style.display = "none";
		playerElement.style.display = "none";
		errorState.style.display = "flex";
		errorMessage.textContent = message;

		if (player && typeof player.destroy === "function") {
			try {
				player.destroy();
			} catch (e) {
				console.error("Error destroying player during error display:", e);
			}
		}
		player = null;
		playerInitialized = false;
	}

	return { showPlayerError };
})();

/* -------------------- Keyboard Shortcuts -------------------- */
/* one global handler, ignores typing targets */
function setupKeyboardShortcuts(videoElGetter = () => playerElement) {
	if (keyboardShortcutsBound) return;
	keyboardShortcutsBound = true;

	document.addEventListener("keydown", (e) => {
		// Ignore shortcuts while typing in inputs/textareas/selects/contenteditable
		if (
			e.target &&
			(e.target.matches?.("input, textarea, select") ||
				e.target.isContentEditable)
		) {
			return;
		}

		const vid = videoElGetter();
		if (!vid) return;

		switch (e.key) {
			case "k":
			case " ":
				// space also scrolls; prevent default only when video present/focused
				e.preventDefault();
				if (vid.paused) vid.play();
				else vid.pause();
				break;

			case "ArrowLeft":
				vid.currentTime = Math.max(0, vid.currentTime - 5);
				break;

			case "ArrowRight":
				vid.currentTime = Math.min(
					vid.duration || Infinity,
					vid.currentTime + 5,
				);
				break;

			case "j":
				vid.currentTime = Math.max(0, vid.currentTime - 10);
				break;

			case "l":
				vid.currentTime = Math.min(
					vid.duration || Infinity,
					vid.currentTime + 10,
				);
				break;

			case "m":
				vid.muted = !vid.muted;
				break;

			case "ArrowUp":
				e.preventDefault();
				vid.volume = Math.min(1, (vid.volume ?? 1) + 0.05);
				break;

			case "ArrowDown":
				e.preventDefault();
				vid.volume = Math.max(0, (vid.volume ?? 1) - 0.05);
				break;

			case "f":
				if (!document.fullscreenElement) {
					if (typeof vid.requestFullscreen === "function")
						vid.requestFullscreen();
				} else {
					document.exitFullscreen?.();
				}
				break;

			case ">":
				if (e.shiftKey)
					vid.playbackRate = Math.min(4, (vid.playbackRate ?? 1) + 0.25);
				break;

			case "<":
				if (e.shiftKey)
					vid.playbackRate = Math.max(0.25, (vid.playbackRate ?? 1) - 0.25);
				break;

			default:
				// number keys 0..9 -> jump to percent
				if (!isNaN(e.key)) {
					const num = Number(e.key);
					if (typeof vid.duration === "number" && isFinite(vid.duration)) {
						const pct = (num / 10) * vid.duration;
						vid.currentTime = pct;
					}
				}
				break;
		}
	});
}

/* -------------------- Player Module -------------------- */
const PlayerModule = (() => {
	function destroyPlayerSafe() {
		if (player && typeof player.destroy === "function") {
			try {
				player.destroy();
			} catch (e) {
				console.error("Error destroying Plyr instance:", e);
			}
		}
		player = null;
		playerInitialized = false;
	}

	function fallbackToNative() {
		// if already initialized (native or plyr), skip
		if (playerInitialized) {
			console.log("Player already initialized; skipping fallback.");
			return;
		}

		console.warn("Falling back to native video player.");

		destroyPlayerSafe();

		// basic styling / attributes for native element
		playerElement.className = "video";
		playerElement.style.width = "100%";
		playerElement.style.height = "70dvh";
		playerElement.style.border = "1px solid var(--gray)";
		playerElement.style.background = "black";
		playerElement.style.borderRadius = "var(--space-sm)";
		playerElement.style.boxShadow = "var(--shadow-md)";
		playerElement.src = `/api/video?video_id=${videoId}`;
		playerElement.setAttribute("preload", "metadata");
		playerElement.controls = true;

		loadingState.style.display = "none";
		playerElement.style.display = "block";
		playerInitialized = true;

		playerElement.onerror = () => {
			UtilsModule.showPlayerError(
				"Error playing video in native player. Please check the video source.",
			);
		};

		// ensure keyboard shortcuts bound and reference the native element
		setupKeyboardShortcuts(() => playerElement);

		// fullscreen change visual adjustment
		document.addEventListener("fullscreenchange", () => {
			// use document.fullscreenElement to know state
			playerElement.style.borderWidth = document.fullscreenElement
				? "0px"
				: "1px";
		});
	}

	function setVideoInfo() {
		const videoInfoContainer = document.querySelector("div.current.video-info");
		if (!videoInfoContainer) return;

		videoInfoContainer.innerHTML = "";
		if (!currentVideoData) return;

		const videoTitleContainer = document.createElement("p");
		videoTitleContainer.className = "current title";
		videoTitleContainer.innerText = currentVideoData.title || "";

		const videoModifiedTime = new Date(
			(currentVideoData.modified_time || 0) * 1000,
		);

		const chipsContainer = document.createElement("div");
		chipsContainer.className = "current chips-container";
		chipsContainer.innerHTML = `
			<div class="chip current">
				<p class="icon"><i class="fa-solid fa-video"></i></p>
				<p class="content">${currentVideoData.quality || "SD"} (${currentVideoData.orientation || "?"})</p>
			</div>
			<div class="chip current">
				<p class="icon"><i class="fa-solid fa-database"></i></p>
				<p class="content">${(currentVideoData.filesize ?? 0 / 1024 ** 2).toFixed(2)}MB</p>
			</div>
			<div class="chip current">
				<p class="icon"><i class="fa-solid fa-clock"></i></p>
				<p class="content">${videoModifiedTime.toLocaleString()} (${MainModule.getRelativeTime(videoModifiedTime.getTime() / 1000)})</p>
			</div>
		`;

		[...chipsContainer.children].forEach((elem) => {
			elem.addEventListener("click", (ev) => copyVidInfo(ev, elem));
		});

		// Repeat button
		const repeatVideoButton = document.createElement("div");
		repeatVideoButton.className = "cool-button";
		repeatVideoButton.innerHTML = `<i class="fa-regular fa-repeat"></i>`;
		const videoEl = document.querySelector("video");
		repeatVideoButton.addEventListener("click", () => {
			if (!videoEl) return;
			if (repeatVideoButton.classList.contains("active")) {
				repeatVideoButton.classList.remove("active");
				videoEl.loop = false;
			} else {
				repeatVideoButton.classList.add("active");
				videoEl.loop = true;
			}
		});

		// Copy button (visual only triggers copyVidInfo as well)
		const copyButton = document.createElement("div");
		copyButton.className = "cool-button";
		copyButton.innerHTML = `<i class="fa-regular fa-copy"></i>`;
		copyButton.addEventListener("click", (ev) => copyVidInfo(ev, copyButton));

		// Delete button
		const deleteVideoButton = document.createElement("div");
		deleteVideoButton.className = "cool-button";
		// fixed malformed HTML
		deleteVideoButton.innerHTML = `<i class="fa-regular fa-trash"></i>`;
		deleteVideoButton.style.background = "var(--danger, rgb(200,0,0))";
		deleteVideoButton.style.color = "var(--light, rgb(200,200,200))";

		deleteVideoButton.addEventListener(
			"click",
			(e) => {
				if (!currentVideoData) return;
				deleteVideo(currentVideoData, document.createElement("span"));
				// visual feedback
				deleteVideoButton.innerHTML = `<i class="fa-solid fa-trash"></i>`;
			},
			{ once: true },
		);

		// Share button
		const shareVideoButton = document.createElement("div");
		shareVideoButton.className = "cool-button";
		shareVideoButton.innerHTML = `<i class="fa-solid fa-share-from-square"></i>`;

		shareVideoButton.addEventListener("click", async () => {
			if (!currentVideoData) return;
			if (navigator.share) {
				try {
					const sharableUrl =
						new URL(window.location).origin +
						"?video_id=" +
						currentVideoData.id;
					await navigator.share({
						title: document.title,
						text: "Open Native",
						url: sharableUrl,
					});
					shareVideoButton.style.background = "var(--success)";
				} catch (e) {
					shareVideoButton.style.background = "var(--warning)";
				} finally {
					setTimeout(() => (shareVideoButton.style.background = ""), 1000);
				}
			} else {
				MainModule.showToast("Unable to share!", "warning");
			}
		});

		chipsContainer.append(
			repeatVideoButton,
			copyButton,
			shareVideoButton,
			deleteVideoButton,
		);
		videoInfoContainer.appendChild(videoTitleContainer);
		videoInfoContainer.appendChild(chipsContainer);
	}

	function copyVidInfo(evt, elem) {
		if (!currentVideoData) return;
		const videoModifiedTime = new Date(
			(currentVideoData.modified_time || 0) * 1000,
		);
		const origin = window.location.origin;
		const textToCopy = JSON.stringify({
			id: currentVideoData.id,
			title: currentVideoData.title,
			videoUrl: origin + "/api/video?video_id=" + currentVideoData.id,
			videoSize: currentVideoData.filesize,
			videoSizeNorm:
				((currentVideoData.filesize || 0) / 1024 ** 2).toFixed(2) + "MB",
			thumbnail: origin + "/api/thumbnail?video_id=" + currentVideoData.id,
			modified_time: currentVideoData.modified_time,
			modified_time_localized: videoModifiedTime.toLocaleString(),
			relative_time: MainModule.getRelativeTime(
				videoModifiedTime.getTime() / 1000,
			),
		});

		navigator.clipboard
			?.writeText(textToCopy)
			.then(() => {
				elem.innerHTML = `<i class="fa-solid fa-copy"></i>`;
			})
			.catch((err) => {
				elem.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i>`;
				console.error("Copy Error:", err);
			})
			.finally(() => {
				setTimeout(() => {
					// restore icon (best-effort)
					elem.innerHTML = `<i class="fa-regular fa-copy"></i>`;
				}, 2000);
			});
	}

	function initialize() {
		if (!videoId) {
			UtilsModule.showPlayerError("Error: No video ID provided");
			return;
		}

		playerInitialized = false;
		clearTimeout(plyrTimeoutId);
		downloadBtn.setAttribute("href", `/api/video?video_id=${videoId}`);

		destroyPlayerSafe();

		playerElement.src = "";
		playerElement.removeAttribute("controls");
		loadingState.style.display = "flex";
		errorState.style.display = "none";
		playerElement.style.display = "none";

		// fallback timer
		plyrTimeoutId = setTimeout(() => {
			if (!playerInitialized) fallbackToNative();
		}, 3000);

		try {
			if (useNative) throw new Error("Native Player Requested!");

			// initialize Plyr
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
				urls: { download: `/api/video?video_id=${videoId}` },
			});

			player.source = {
				type: "video",
				sources: [{ src: `/api/video?video_id=${videoId}` }],
				poster: `/api/thumbnail?video_id=${videoId}`,
			};

			// when Plyr metadata loaded
			player.on("loadedmetadata", () => {
				clearTimeout(plyrTimeoutId);
				if (!playerInitialized) {
					loadingState.style.display = "none";
					playerElement.style.display = "block";
					playerInitialized = true;
					console.log("Plyr loaded successfully.");
				}

				// wheel-to-seek on progress bar (if present)
				const videoElem = document.querySelector(".video-container video");
				const progressBar = document.querySelector(
					".video-container .plyr__controls__item.plyr__progress__container",
				);
				let seekTime = 10;
				progressBar?.addEventListener("wheel", (e) => {
					if (!videoElem) return;
					videoElem.currentTime = Math.max(
						0,
						Math.min(
							videoElem.currentTime - Math.sign(e.deltaY) * seekTime,
							videoElem.duration || Infinity,
						),
					);
					e.preventDefault();
				});
			});

			player.on("error", (event) => {
				console.error("Plyr error:", event);
				clearTimeout(plyrTimeoutId);
				fallbackToNative();
			});

			// ensure keyboard shortcuts reference the actual underlying <video> element
			setupKeyboardShortcuts(
				() => document.querySelector("video") || playerElement,
			);
		} catch (err) {
			console.error("Plyr init failed:", err);
			clearTimeout(plyrTimeoutId);
			fallbackToNative();
		}

		// disable dblclick fullscreen toggling by default
		const v = document.querySelector("video");
		if (v) {
			v.onloadedmetadata = function () {
				scrollTo(0, 0);
				this.addEventListener("dblclick", (e) => {
					e.preventDefault();
					e.stopPropagation();
				});
			};
		}
	}

	return { initialize, setVideoInfo };
})();

/* -------------------- Fetch & Prepare -------------------- */
async function fetchVideos(apiEndpoint = "/api/videos?extras=true") {
	try {
		const res = await fetch(apiEndpoint);
		if (!res.ok) throw new Error("Request wasn't ok");
		const data = await res.json();

		console.groupCollapsed("Video analysis...");
		const parsed = (Array.isArray(data.videos) ? data.videos : []).map(
			(vid) => {
				vid.quality = MainModule.determineQuality(vid);
				vid.orientation = MainModule.determineOrientation(vid);
				vid.skip = false;
				return vid;
			},
		);
		console.groupEnd();
		return parsed;
	} catch (error) {
		console.error("Fetch videos error:", error);
		return [];
	}
}

/* -------------------- Delete -------------------- */
function deleteVideo(videoData, cardElement) {
	fetch("/api/video?video_id=" + videoData.id, {
		method: "DELETE",
		headers: { user: getUserName() },
	})
		.then((response) => {
			if (response.ok) {
				const index = videos.findIndex((v) => v.id === videoData.id);
				if (index !== -1) {
					videos.splice(index, 1);
					cardElement.classList.add("deleted");
					MainModule.showToast("Video Removed!", "success");
				}
			} else if (response.status === 401) {
				MainModule.showToast("Unauthorized!", "danger");
			}
		})
		.catch((e) => {
			MainModule.showToast("Unable to Remove Video!", "danger");
			console.error(e);
		});
}

/* -------------------- Sorting / Preparing list -------------------- */
function prepareVideos() {
	// shallow copy so original `videos` is not mutated by sort
	const localVideos = [...videos];

	localVideos.sort((a, b) => {
		// helpers
		const differenceOfProperty = (
			propName,
			firstElem,
			secondElem,
			parseFunc = null,
		) => {
			let valA = firstElem[propName];
			let valB = secondElem[propName];
			if (parseFunc) {
				valA = parseFunc(valA);
				valB = parseFunc(valB);
			}
			return valA - valB;
		};

		const convertDurationToInt = (value) => {
			if (Number.isFinite(value)) return value;
			const [minutes = 0, seconds = 0] = String(value).split(":");
			return Number(minutes) * 60 + Number(seconds);
		};

		// favorites first
		const aFav = MainModule.isFavourite(a.id);
		const bFav = MainModule.isFavourite(b.id);
		if (aFav !== bFav) return aFav ? -1 : 1;

		// sorting by state
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
		}
		return 0;
	});

	return localVideos;
}

/* -------------------- Rendering -------------------- */
function renderVideos() {
	// Reset
	renderVideoObserver.disconnect();
	videoGrid.innerHTML = "";
	prevBatch = [];

	// prepare list according to current sorting
	const prepared = prepareVideos();

	// update global videos reference to prepared order (we'll keep base data in videos though)
	// (we intentionally keep `videos` as source-of-truth; prepared is ordered view)
	// Render first batch
	const newBatch = prepared.slice(0, batchSize);

	const videoCards = newBatch
		.map((videoData) => {
			if (videoData.skip) return null;
			return MainModule.renderVideo({
				video: videoData,
				deleteBtnCallback: deleteVideo,
				thumbnailCallback: () => { },
			});
		})
		.filter(Boolean);

	// Append cards
	videoCards.forEach((vidCard, idx) => {
		const vidData = newBatch[idx];
		if (!vidData) return;
		if (vidData.id === videoId) return; // don't re-add current playing video in grid

		const img = vidCard.querySelector("img");
		if (img) {
			img.addEventListener("click", async () => {
				const newVideoId = vidData.id;
				if (newVideoId && newVideoId !== videoId) {
					videoId = newVideoId;
					const newUrl = new URL(window.location.href);
					newUrl.searchParams.set("id", videoId);
					window.history.pushState({ path: newUrl.href }, "", newUrl.href);

					PlayerModule.initialize();
					renderVideos();
					setVideoInfoAndPageTitle();
				}
			});
		}

		vidCard.addEventListener("mousedown", (e) => {
			if (e.button === 1) {
				e.preventDefault();
				window.open(`/watch?id=${vidData.id}`);
			}
		});

		videoGrid.appendChild(vidCard);
	});

	prevBatch.push(...newBatch);
	// observe last child only if exists
	if (videoGrid.lastElementChild)
		renderVideoObserver.observe(videoGrid.lastElementChild);
}

function renderNextBatch(entries) {
	entries.forEach((entry) => {
		if (!entry.isIntersecting) return;

		renderVideoObserver.unobserve(entry.target);

		const prepared = prepareVideos();
		const nextBatch = prepared.slice(
			prevBatch.length,
			prevBatch.length + batchSize,
		);

		const videoCards = nextBatch
			.map((videoData) =>
				!videoData.skip
					? MainModule.renderVideo({
						video: videoData,
						deleteBtnCallback: deleteVideo,
						thumbnailCallback: () => { },
					})
					: null,
			)
			.filter(Boolean);

		videoCards.forEach((vidCard, idx) => {
			const vidData = nextBatch[idx];
			if (!vidData) return;

			const img = vidCard.querySelector("img");
			if (img) {
				img.addEventListener("click", async () => {
					const newVideoId = vidData.id;
					if (newVideoId && newVideoId !== videoId) {
						videoId = newVideoId;
						const newUrl = new URL(window.location.href);
						newUrl.searchParams.set("id", videoId);
						window.history.pushState({ path: newUrl.href }, "", newUrl.href);

						PlayerModule.initialize();
						renderVideos();
						setVideoInfoAndPageTitle();
					}
				});
			}

			vidCard.addEventListener("mousedown", (e) => {
				if (e.button === 1) {
					e.preventDefault();
					window.open(`/watch?id=${vidData.id}`);
				}
			});

			videoGrid.appendChild(vidCard);
		});

		prevBatch.push(...nextBatch);
		if (videoGrid.lastElementChild)
			renderVideoObserver.observe(videoGrid.lastElementChild);
	});
}

/* -------------------- Sort state setter -------------------- */
function setSortOrder(order) {
	Object.keys(sortingState).forEach((key) => {
		sortingState[key] = key === order;
	});
	saveSortingConfig(sortingState);
}

/* -------------------- Player info fetcher -------------------- */
function setVideoInfoAndPageTitle() {
	if (!videoId) return;
	fetch(`/api/stats?video_id=${videoId}&extras=true`)
		.then((resp) => {
			if (!resp.ok) throw new Error("Unable to get video stats!");
			return resp.json();
		})
		.then((vidData) => {
			currentVideoData = vidData || null;
			if (!currentVideoData) return;
			currentVideoData.quality = MainModule.determineQuality(currentVideoData);
			currentVideoData.orientation =
				MainModule.determineOrientation(currentVideoData);
			document.title = currentVideoData.title || document.title;
			PlayerModule.setVideoInfo();
		})
		.catch((error) => {
			console.error("setVideoInfo error:", error);
		});
}

/* -------------------- Orientation toggle -------------------- */
function toggleOrientation(event) {
	const orientations = ["All", "16:9", "9:16", "1:1"];
	const currentIdx = orientations.indexOf(currentOrientation);
	const nextIdx = (currentIdx + 1) % orientations.length;
	currentOrientation = orientations[nextIdx];

	const selected = currentOrientation.toLowerCase();
	videos.forEach((vid) => {
		if (selected === "all") {
			vid.skip = false;
			return;
		}
		// defensive: ensure vid.orientation exists
		vid.skip = String(vid.orientation || "").toLowerCase() !== selected;
	});

	if (event?.target) event.target.textContent = currentOrientation.trim();
	renderVideos();
}

/* -------------------- DOMContentLoaded -------------------- */
document.addEventListener("DOMContentLoaded", async () => {
	// sanity
	if (!videoId) {
		UtilsModule.showPlayerError("Error: No video ID provided in URL.");
		return;
	}

	// load player / data
	PlayerModule.initialize();
	setVideoInfoAndPageTitle();

	// fetch videos (global var)
	videos = await fetchVideos();
	renderVideos();

	// Player type UI: show actual active type
	playerType.textContent = useNative ? "Native" : "Modern";
	playerType.dataset.playerType = useNative ? "native" : "modern";
	playerType.addEventListener("click", () => {
		// toggle between native and modern
		useNative = !useNative;
		playerType.textContent = useNative ? "Native" : "Modern";
		playerType.dataset.playerType = useNative ? "native" : "modern";
		localStorage.setItem("playerType", useNative ? "native" : "modern");
		PlayerModule.initialize();
		setVideoInfoAndPageTitle();
	});

	// Retry button
	retryButton?.addEventListener("click", PlayerModule.initialize);

	// Refresh
	refreshButton?.addEventListener("click", async () => {
		videos = await fetchVideos();
		renderVideos();
	});

	// vidCount
	const vidCountEl = document.getElementById("vidCount");
	if (vidCountEl) {
		if (!isAndroid) vidCountEl.innerText = `${videos.length}`;
		else vidCountEl.remove();
	}

	// Filter DropDown
	const showDropDownBtn = document.querySelector("#showFilterDropDownButton");
	const filterDropDownOptions = document.querySelector(
		"#filterDropDownOptions",
	);
	showDropDownBtn?.addEventListener("click", () =>
		filterDropDownOptions?.classList.toggle("show"),
	);

	// initialize filter option handlers (sorting only - keep existing behaviour)
	document
		.querySelectorAll("#filterDropDownOptions .option")
		.forEach((elem) => {
			const sortKey = String(elem.dataset.sortOrder || "");
			if (sortKey && sortingState[sortKey]) elem.classList.add("selected");

			elem.addEventListener("click", (e) => {
				// only clear selection in same category (data attribute present)
				const datasetKeys = Object.keys(elem.dataset || {});
				if (datasetKeys.length) {
					const firstKey = datasetKeys[0]; // e.g. sortOrder, orientation, quality
					document
						.querySelectorAll(`#filterDropDownOptions [data-${firstKey}]`)
						.forEach((o) => o.classList.remove("selected"));
				} else {
					// fallback - clear all
					document
						.querySelectorAll("#filterDropDownOptions .option")
						.forEach((o) => o.classList.remove("selected"));
				}

				elem.classList.add("selected");

				// handle sorting only (existing flow). If more filters added, handle them here.
				if (elem.dataset.sortOrder) {
					setSortOrder(elem.dataset.sortOrder);
					renderVideos();
				}

				// orientation & quality handling were discussed earlier — you can call applyOrientationFilter / applyQualityFilter here
				if (elem.dataset.orientation) {
					// Simple in-place filter: set skip flags
					const orientation = elem.dataset.orientation;
					if (orientation === "all") videos.forEach((v) => (v.skip = false));
					else
						videos.forEach(
							(v) =>
							(v.skip =
								String(v.orientation || "").toLowerCase() !==
								orientation.toLowerCase()),
						);
					renderVideos();
				}

				if (elem.dataset.quality) {
					const quality = elem.dataset.quality;
					if (quality === "all") videos.forEach((v) => (v.skip = false));
					else
						videos.forEach(
							(v) =>
							(v.skip =
								String(v.quality || "").toLowerCase() !==
								quality.toLowerCase()),
						);
					renderVideos();
				}
			});
		});

	showStatsBottom(videos);

	// Search UI
	const searchDiv = document.querySelector("#searchVideos");
	if (searchDiv) {
		const clearSearch = searchDiv.querySelector('button[type="reset"]');
		const searchInput = searchDiv.querySelector("#search-input");
		const searchResults = document.querySelector("#searchResults");

		clearSearch?.addEventListener("click", () => {
			searchDiv.style.display = "none";
			if (searchInput) searchInput.value = "";
			videoGrid.style.display = "";
			if (searchResults) {
				searchResults.classList.add("empty");
				searchResults.innerHTML = "";
			}
		});

		function debounce(func, delay) {
			let timeout;
			return function (...args) {
				clearTimeout(timeout);
				timeout = setTimeout(() => func.apply(this, args), delay);
			};
		}

		searchInput?.addEventListener(
			"input",
			debounce(() => {
				const searchTerm = searchInput.value.trim();
				if (!searchResults) return;
				searchResults.innerHTML = "";

				if (!searchTerm) {
					videoGrid.style.display = "";
					searchResults.classList.add("empty");
					return;
				}

				const results = videos.filter((v) =>
					String(v.title || "")
						.toLowerCase()
						.includes(searchTerm.toLowerCase()),
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
		);
	}

	// User button
	document.querySelector("#userBtn")?.addEventListener("click", loginUser);

	// Orientation switcher
	document
		.querySelector("#orientation-btn")
		?.addEventListener("click", toggleOrientation);
});
