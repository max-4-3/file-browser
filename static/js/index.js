document.addEventListener("DOMContentLoaded", async () => {
    let sortDescending = true;
    let videos = [];

    async function fetchVideos() {
        const res = await fetch("/api/videos");
        const data = await res.json();
        videos = data.videos;
        renderVideos();
    }

    function renderVideos() {
        const sorted = [...videos].sort((a, b) => {
            return sortDescending
                ? b.modified_time - a.modified_time
                : a.modified_time - b.modified_time;
        });

        const grid = document.getElementById("videoGrid");
        grid.innerHTML = ""; // Clear previous entries

        sorted.forEach((video) => {
            const card = document.createElement("div");
            card.className = "card";

            const link = document.createElement("a");
            link.href = `watch?id=${video.id}`;

            const thumb = document.createElement("img");
            thumb.src = `/api/thumbnail?video_id=${video.id}`;
            thumb.alt = video.title;

            const title = document.createElement("div");
            title.className = "title";
            title.textContent = video.title;

            link.appendChild(thumb);
            card.appendChild(link);
            card.appendChild(title);
            grid.appendChild(card);
        });
    }

    document.getElementById("sortBtn").addEventListener("click", () => {
        sortDescending = !sortDescending;
        document.getElementById("sortBtn").textContent = sortDescending
            ? "👇🏻👶🏻"
            : "👇🏻🧑🏻";
        renderVideos();
    });

    document.getElementById("reloadBtn").addEventListener("click", async () => {
        const btn = document.getElementById("reloadBtn");
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

    fetchVideos();
})