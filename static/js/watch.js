import {
	MainModule,
	showStatsBottom,
	getUserName,
	loginUser,
	applyFilters,
	showModal,
	getSortingState,
} from "./main.js";

// --- Global DOM Element References ---
const playerElement = document.getElementById("player");
const retryButton = document.getElementById("retryButton");
const refreshButton = document.getElementById("refreshVideos");
const downloadBtn = document.getElementById("downloadBtn");
const videoGrid = document.getElementById("videoGrid");

// --- Global / Module variables ---
let videoId = new URLSearchParams(window.location.search).get("id");
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
let playerInitialized = false;
let currentVideoData = null;
let lastSelectedSort = null;
let sortingState = getSortingState();

// Keyboard handler guard so we don't add multiple identical listeners
let keyboardShortcutsBound = false;

/* -------------------- Utils -------------------- */
const UtilsModule = (() => {
	const playPrev = () => {
		let prevVideo = document.querySelector(
			`[data-video-id="${videoId}"]`,
		).previousSibling;
		if (!prevVideo) {
			console.info("No previous video from:", videoId);
			MainModule.showToast("No Previous Video", "warning");
			return;
		}

		console.info("Playing prev video:", prevVideo.dataset.videoId);
		videoId = prevVideo.dataset.videoId;
		PlayerModule.initialize(true);
		UtilsModule.updateVideoGrid();
	};
	const playNext = () => {
		let nextVideo = document.querySelector(
			`[data-video-id="${videoId}"]`,
		).nextSibling;
		if (!nextVideo) {
			console.info("No next video from:", videoId);
			MainModule.showToast("No Next Video", "warning");
			return;
		}

		console.info("Playing next video:", nextVideo.dataset.videoId);
		videoId = nextVideo.dataset.videoId;
		PlayerModule.initialize(true);
		UtilsModule.updateVideoGrid();
	};

	function updateVideoGrid() {
		videoGrid.childNodes.forEach((el) => {
			el.classList.remove("playing");
			el.dataset.videoId === videoId && el.classList.add("playing");
		});
	}

	function renderVideo(videoData, updateFunc) {
		const renderedVideo = MainModule.renderVideo({
			video: videoData,
			thumbnailCallback: () => { },
			deleteBtnCallback: deleteVideo,
		});
		videoData.id === videoId && renderedVideo.classList.add("playing");

		const img = renderedVideo.querySelector("img");
		if (img) {
			img.addEventListener("click", async () => {
				const newVideoId = videoData.id;
				if (newVideoId && newVideoId !== videoId) {
					videoId = newVideoId;

					PlayerModule.initialize(
						!(document.querySelector("video")?.paused || false),
					);
					UtilsModule.updateVideoGrid();
					setVideoInfoAndPageTitle();
				} else if (newVideoId === videoId) {
					window.scroll(0, 0);
				}
			});
		}

		renderedVideo.addEventListener("mousedown", (e) => {
			if (e.button === 1) {
				e.preventDefault();
				window.open(`/watch?id=${videoData.id}`);
			}
		});

		return updateFunc?.(renderedVideo, videoData) || renderedVideo;
	}

	function showPlayerError() { }

	return { playPrev, playNext, showPlayerError, updateVideoGrid, renderVideo };
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

			case "n":
				UtilsModule.playNext();
				break;
			case "p":
				UtilsModule.playPrev();
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
	function initialize(playOnDone = false) {
		if (!videoId) {
			UtilsModule.showPlayerError("Error: No video ID provided");
			return;
		}

		currentVideoData = videos.find((i) => i.id === videoId);
		const newUrl = new URL(window.location.href);
		newUrl.searchParams.set("id", videoId);
		window.history.pushState({ path: newUrl.href }, "", newUrl.href);

		playerInitialized = false;
		downloadBtn.setAttribute("href", `/api/video?video_id=${videoId}`);

		renderPlayer(playOnDone);
		setVideoInfo();
	}

	function renderPlayer(playOnDone) {
		if (!playerElement || !(playerElement instanceof HTMLVideoElement)) return;

		const videoUrl = `/api/video?video_id=${videoId}`;
		const thumbnailUrl = `/api/thumbnail?video_id=${videoId}`;
		playerElement.src = videoUrl;
		playerElement.poster = thumbnailUrl;

		playerElement.onloadedmetadata = () => {
			window.scroll(0, 0, { bahaviour: "smooth" });
			playerElement.focus();
			playOnDone && playerElement.play();
		};

		playerElement.onerror = (e) => {
			console.error(e);
			MainModule.showToast("Video loading failed!", "danger");
		};

		// ensure keyboard shortcuts bound and reference the native element
		setupKeyboardShortcuts(() => playerElement);

		// fullscreen change visual adjustment
		document.addEventListener("fullscreenchange", () => {
			playerElement.style.borderWidth = document.fullscreenElement
				? "0px"
				: "1px";
		});
	}

	function setVideoInfo() {
		const videoInfoContainer = document.querySelector("div.info-container");
		const videoTitleContainer = document.querySelector("div.title-container");
		const videoActionContainer = document.querySelector("div.action-container");
		if (!videoInfoContainer || !videoActionContainer || !videoTitleContainer)
			return;

		videoInfoContainer.innerHTML = "";
		videoActionContainer.innerHTML = "";
		if (!currentVideoData) return;

		videoTitleContainer.innerText = currentVideoData.title || "untitled video";
		videoTitleContainer.setAttribute("title", videoTitleContainer.innerText);

		const videoModifiedTime = new Date(
			(currentVideoData.modified_time || 0) * 1000,
		);

		function renderInfoChip({ chipIcon, chipContent, postFunc }) {
			const chipContainer = document.createElement("div");
			chipContainer.className = "current chip";
			chipContainer.innerHTML = `
			<p class="icon">${chipIcon}</p>
			<p class="content">${chipContent}</p>
			`;
			typeof postFunc === "function" && postFunc(chipContainer);
			return chipContainer;
		}

		const infoChips = [
			{
				icon: `<i class="fa-solid fa-video"></i>`,
				content: `${currentVideoData.quality || "SD"} (${currentVideoData.orientation || "?"})`,
			},
			{
				icon: `<i class="fa-solid fa-database"></i>`,
				content: `${((currentVideoData.filesize ?? 0) / 1024 ** 2).toFixed(2)}MB`,
			},
			{
				icon: `<i class="fa-solid fa-clock"></i>`,
				content: `${videoModifiedTime.toLocaleString()} (${MainModule.getRelativeTime(
					videoModifiedTime.getTime() / 1000,
				)})`,
			},
		]
			.map((item) =>
				renderInfoChip({
					chipIcon: item.icon,
					chipContent: item.content,
					postFunc: (elem) => {
						elem.addEventListener("click", () => copyVidInfo(elem));
					},
				}),
			)
			.filter(Boolean);
		// Append chips
		infoChips.forEach((el) => videoInfoContainer.appendChild(el));

		function renderActionButton({
			buttonContent,
			eventListeners,
			additionalProps,
			postFunc,
		}) {
			const actionButton = document.createElement("button");
			actionButton.className = "cool-button";
			actionButton.innerHTML = buttonContent;
			additionalProps.forEach(({ key, value }) =>
				actionButton.setAttribute(key, value),
			);
			eventListeners.forEach(({ event, handler, options }) =>
				actionButton.addEventListener(event, handler, options),
			);
			typeof postFunc === "function" && postFunc(actionButton);
			return actionButton;
		}

		const actionButtons = [
			{
				content: `<i class="fa-solid fa-pen"></i>`,
				props: [{ key: "title", value: "Edit video info" }],
				eventListeners: [
					{
						event: "click",
						handler: () => {
							let content = `
<h1>Edit</h1>
<form>
    <label for="title-update">Title</label>
    <input type="text" name="title" id="title-update"
           placeholder="New Video Title..." autocomplete="nope">
    <button id="submit" class="cool-button" type="submit">
        Update!
    </button>
</form>
`;

							showModal({
								content,
								applyFn: (modal, closeModal) => {
									const formEl = modal.querySelector("form");
									const submitBtn = modal.querySelector("#submit");

									formEl.addEventListener("submit", async (e) => {
										e.preventDefault();

										const data = Object.fromEntries(
											new FormData(e.currentTarget).entries(),
										);

										submitBtn.disabled = true;
										submitBtn.textContent = "Updating…";

										try {
											const res = await fetch(
												`/api/video?video_id=${videoId}`,
												{
													method: "PATCH",
													headers: {
														"Content-Type": "application/json",
													},
													body: JSON.stringify(data),
												},
											);

											if (!res.ok) throw new Error();

											MainModule.showToast("Success!", "success");
											setTimeout(
												() => closeModal() || window.location.reload(),
												600,
											);
										} catch (err) {
											console.error(err);
											MainModule.showToast("Failed!", "danger");
											submitBtn.disabled = false;
											submitBtn.textContent = "Update!";
										}
									});

									modal.style.width = "50dvw";
								},
							});
						},
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-solid fa-backward-step"></i>`,
				props: [{ key: "title", value: "Play previous video (if present)" }],
				eventListeners: [
					{
						event: "click",
						handler: UtilsModule.playPrev,
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-solid fa-forward-step"></i>`,
				props: [{ key: "title", value: "Play next video (if present)" }],
				eventListeners: [
					{
						event: "click",
						handler: UtilsModule.playNext,
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-solid fa-recycle"></i>`,
				props: [{ key: "title", value: "Reload current videos thumbnail" }],
				eventListeners: [
					{
						event: "click",
						handler: () => {
							fetch(`/api/thumbnail/${videoId}`, { method: "PATCH" }).then(
								(res) => res.ok && window.location.reload(),
							);
						},
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-solid fa-angle-down"></i>`,
				props: [{ key: "title", value: "Scroll to the video item in grid" }],
				eventListeners: [
					{
						event: "click",
						handler: () => {
							const cardElement = document.querySelector(
								`[data-video-id="${videoId}"]`,
							);
							!cardElement
								? MainModule.showToast("Video not found!", "danger")
								: cardElement.scrollIntoView({
									behavior: "smooth",
									block: "center",
									inline: "center",
								});
						},
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-solid fa-repeat"></i>`,
				props: [{ key: "title", value: "Repeat current video" }],
				eventListeners: [
					{
						event: "click",
						handler: (ev) => {
							const videoElem = document.querySelector("video");
							if (!videoElem) return;
							videoElem.loop = !videoElem.loop;
							ev.currentTarget.classList.toggle("active", videoElem.loop);
						},
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-regular fa-circle-right"></i>`,
				props: [{ key: "title", value: "Auto play next video" }],
				eventListeners: [
					{
						event: "click",
						handler: (ev) => {
							ev.currentTarget.classList.toggle("active");
							const isAutoPlay = ev.currentTarget.classList.contains("active");
							ev.currentTarget.innerHTML = `<i class="fa-${isAutoPlay ? "solid" : "regular"} fa-circle-right"></i>`;
							const videoElem = document.querySelector("video");

							if (isAutoPlay) {
								console.log("Autoplay enabled");
								videoElem.addEventListener("ended", UtilsModule.playNext);
							} else {
								console.log("Autoplay disabled");
								videoElem.removeEventListener("ended", UtilsModule.playNext);
							}
						},
					},
				],
			},
			{
				content: `<i class="fa-solid fa-link"></i>`,
				props: [{ key: "title", value: "Copy video url" }],
				eventListeners: [
					{
						event: "click",
						handler: (event) => {
							const target = event.currentTarget;
							const videoUrl = `${new URL(window.location).origin}/api/video?video_id=${videoId}`;
							copyToClipboard(target, () => videoUrl);
						},
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-solid fa-copy"></i>`,
				props: [{ key: "title", value: "Copy video info" }],
				eventListeners: [
					{
						event: "click",
						handler: (event) => {
							copyVidInfo(event.currentTarget);
						},
					},
				],
				postFunc: null,
			},
			{
				content: `<i class="fa-solid fa-trash"></i>`,
				props: [
					{
						key: "title",
						value: "Delete current video, requires authentication!",
					},
				],
				eventListeners: [
					{
						event: "click",
						handler: (event) => {
							if (!currentVideoData) return;
							deleteVideo(
								currentVideoData,
								document.querySelector(
									`[data-video-id="${currentVideoData.id}"]`,
								) || document.createElement("span"),
							);
							event.currentTarget.innerHTML = `<i class="fa-solid fa-trash"></i>`;
						},
						options: { once: true },
					},
				],
				postFunc: (deleteVideoButton) => {
					deleteVideoButton.style.background = "var(--danger, rgb(200,0,0))";
					deleteVideoButton.style.color = "var(--light, rgb(200,200,200))";
				},
			},
			{
				content: `<i class="fa-solid fa-share-from-square"></i>`,
				props: [{ key: "title", value: "Share current video" }],
				eventListeners: [
					{
						event: "click",
						handler: async (event) => {
							if (!currentVideoData) return;
							if (navigator.share && navigator.canShare) {
								const shareVideoButton = event.currentTarget;
								try {
									const sharableUrl =
										new URL(window.location).origin +
										"/api/video?video_id=" +
										currentVideoData.id;
									await navigator.share({
										title: document.title,
										text: "Playable Video Link",
										url: sharableUrl,
									});
									shareVideoButton.style.background = "var(--success)";
								} catch (e) {
									shareVideoButton.style.background = "var(--warning)";
								} finally {
									setTimeout(
										() => (shareVideoButton.style.background = ""),
										1000,
									);
								}
							} else {
								MainModule.showToast("Unable to share!", "warning");
							}
						},
					},
				],
				postFunc: null,
			},
		]
			.map((item) =>
				renderActionButton({
					buttonContent: item.content,
					eventListeners: item.eventListeners,
					additionalProps: item.props,
					postFunc: item.postFunc,
				}),
			)
			.filter(Boolean);
		actionButtons.forEach((el) => videoActionContainer.appendChild(el));
	}

	function copyToClipboard(
		parentElem,
		infoGetter,
		{ onSuccess, onFailure = console.error } = {},
	) {
		if (!(parentElem instanceof HTMLElement)) {
			onFailure?.(Error("Invalid parent element"));
			return;
		}

		const copyInfo = typeof infoGetter === "function" ? infoGetter() : "";

		if (typeof copyInfo !== "string" || !copyInfo.trim()) {
			onFailure?.(Error("Copy info must be a non-empty string"));
			return;
		}

		const originalContent = parentElem.innerHTML;
		parentElem.disabled = true;

		const success = () => {
			parentElem.innerHTML = `<i class="fa-solid fa-copy"></i> Copied!`;
			onSuccess?.();
		};

		const failure = (err) => {
			parentElem.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Error!`;
			onFailure?.(err);
		};

		const cleanup = () => {
			clearTimeout(parentElem.copyTimeout);
			parentElem.copyTimeout = setTimeout(() => {
				parentElem.innerHTML = originalContent;
				parentElem.disabled = false;
			}, 2000);
		};

		/* ---------- MODERN API ---------- */
		if (navigator.clipboard?.writeText) {
			navigator.clipboard
				.writeText(copyInfo)
				.then(success)
				.catch(() => {
					// fallback if modern API exists but fails (permissions, http, etc.)
					tryLegacyCopy(copyInfo, success, failure);
				})
				.finally(cleanup);
			return;
		}

		/* ---------- LEGACY FALLBACK ---------- */
		tryLegacyCopy(copyInfo, success, failure);
		cleanup();
	}

	/* ===== Legacy copy for older / lower devices ===== */
	function tryLegacyCopy(text, onSuccess, onFailure) {
		try {
			const textarea = document.createElement("textarea");
			textarea.value = text;

			// prevent scrolling / zoom issues
			textarea.style.position = "fixed";
			textarea.style.top = "-1000px";
			textarea.style.left = "-1000px";
			textarea.style.opacity = "0";

			document.body.appendChild(textarea);
			textarea.focus();
			textarea.select();

			const ok = document.execCommand("copy");
			document.body.removeChild(textarea);

			if (!ok) throw new Error("execCommand failed");

			onSuccess?.();
		} catch (err) {
			onFailure?.(err);
		}
	}

	function copyVidInfo(elem) {
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

		copyToClipboard(elem, () => textToCopy);
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
	videos = applyFilters(sortingState, videos);
	return videos;
}

/* -------------------- Rendering -------------------- */
function renderVideos() {
	// Reset DOM and scroll tracking
	renderVideoObserver.disconnect();
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
		const renderedVideo = UtilsModule.renderVideo(entry);
		videoGrid.appendChild(renderedVideo);
		return;
	});

	// 4. Update state and observer
	prevBatch.push(...newBatch);

	// Only observe if there are more videos left to load
	if (videosToRender.length > prevBatch.length && videoGrid.lastChild) {
		renderVideoObserver.observe(videoGrid.lastChild);
	}
}

function renderNextBatch(observerEntries) {
	observerEntries.forEach((entry) => {
		if (!entry.isIntersecting) return;
		renderVideoObserver.unobserve(entry.target);

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
			const renderedVideo = UtilsModule.renderVideo(vid);
			videoGrid.appendChild(renderedVideo);
			return;
		});

		// Update state and set up observer
		prevBatch.push(...newBatch);
		if (videoGrid.lastChild) {
			renderVideoObserver.observe(videoGrid.lastChild);
		}
	});
}

/* -------------------- Sort state setter -------------------- */
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
		el.classList.contains("hidden") && el.classList.remove("hidden");
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
			return function(...args) {
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
						...results
							.map((d) =>
								UtilsModule.renderVideo(d, (elem) => {
									elem.addEventListener("click", () => {
										searchResults.childNodes.forEach((el) => {
											el.classList.remove("playing");
											el.dataset.videoId === videoId &&
												el.classList.add("playing");
										});
									});
									return elem;
								}),
							)
							.filter(Boolean),
					);
				} else {
					searchResults.classList.add("empty");
					videoGrid.style.display = "none";
				}
			}, 150),
		);
	}

	// User button
	document.querySelector("#userBtn")?.addEventListener("click", loginUser);

	// Filter dropdown
	const filterDropdownToggle = document.querySelector(
		"#main-filter-toggle-btn",
	);
	const filterDropdown = document.querySelector("#filters-form");
	const sortSelect = document.querySelector(".sort-select");
	const sortSelected = document.getElementById("sort-selected");
	const sortOptions = document.querySelectorAll(".sort-option");
	const sortByInput = document.getElementById("sortBy"); // toggle dropdown
	const resetButton = filterDropdown.querySelector('[type="reset"]');

	resetButton?.addEventListener("click", () => {
		const data = {
			favFirst: false,
			sortBy: "date",
			sortAsc: false,
			orientation: "all",
			quality: "all",
		};
		applySorting(data);
		filterDropdown.classList.remove("show");
	});

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
