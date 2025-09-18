import { MainModule, saveSortingConfig, sortingState as getSortingState } from './main.js';

let sortingState = getSortingState();
let videos = [];
let isAndroid = (function () {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    return /android/i.test(userAgent);
})();  

async function fetchVideos(apiEndpoint = "/api/videos") {
    try {
        const res = await fetch(apiEndpoint);
        if (!res.ok) {
            throw new Error("Request Wasn't Ok!");
        }
        const data = await res.json();
        return data.videos;
    } catch (error) {
        console.error('Fetch videos error:', error);
        return [];
    }
}

function deleteVideo(videoData, cardElement) {
    fetch('/api/video?video_id=' + videoData.id, {
        method: "DELETE",
        headers: {
            user: "maxim",
        }
    }).then((response) => {
        if (response.ok) {
            let index = videos.findIndex(val => val.id === videoData.id);

            if (index !== -1) {
                videos.splice(index, 1);
                cardElement.remove();
                MainModule.showToast('Video Removed!', 'success');
            }
        } else {
            MainModule.showToast('Failed to remove video!', 'danger');
        }
    }).catch(err => {
        MainModule.showToast('Failed to remove video!', 'danger');
        console.error(err);
    });
}

function prepareVideos() {
    // Create a shallow copy of the videos array
    let localVideos = [...videos];
    localVideos.sort((a, b) => {
        function differenceOfProperty(propName, firstElem, secondElem, parseFunc = null) {
            let valA = firstElem[propName];
            let valB = secondElem[propName];

            if (parseFunc) {
                valA = parseFunc(valA);
                valB = parseFunc(valB);
            }
            return valA - valB;
        }


        if (sortingState.biggerFirst) {
            return differenceOfProperty('filesize', b, a);
        } else if (sortingState.smallerFirst) {
            return differenceOfProperty('filesize', a, b); 
        } else if (sortingState.newerFirst) {
            return differenceOfProperty('modified_time', b, a); 
        } else if (sortingState.olderFirst) {
            return differenceOfProperty('modified_time', a, b);
        } else {
            return 0;
        }
    });

    return localVideos;
}

function setSortOrder(order) {
    Object.keys(sortingState).forEach(key => {
        sortingState[key] = key === order;
    });
    saveSortingConfig(sortingState);
}

function renderVideos() {
    const sortedVideos = prepareVideos();
    MainModule.renderVideos({
        videos: sortedVideos,
        deleteBtnCallback: deleteVideo,
        applyFunctionOnCard: (card, videoData) => {
            card.addEventListener('mousedown', e => {
                if (e.button === 1) { // 0,1,2 = left, middle, right
                    e.preventDefault();
                    window.open(`/watch?id=${videoData.id}`);
                }
            });
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {

    videos = await fetchVideos();
    renderVideos();

    // Home Button
    if (isAndroid) {
        const homeButton = document.querySelector('.home-button');
        homeButton.textContent = homeButton.textContent.split(' ').splice(0, 1);
    }

    // Video Count Extra Element
    if (!isAndroid) {
        document.getElementById("vidCount").innerText = `${videos.length} Videos`
    } else {
        document.getElementById("vidCount").remove();
    }

    // Reload Button Element
    document.getElementById("reloadBtn").addEventListener("click", async (e) => {
        const textSpan = document.getElementById("reloadText");

        const ogTxt = textSpan.textContent;

        textSpan.textContent = "Reloading...";
        const spinner = document.createElement("span");
        spinner.className = "spinner";
        textSpan.after(spinner);

        try {
            const response = await fetch("/reload" + (e.shiftKey ? "?hard=true" : ""), { method: "POST" });
            if (response.ok) {
                MainModule.showToast('Reloading page...', 'primary');
                location.reload();
            } else {
                MainModule.showToast('Server reload failed!', 'danger');
                console.error("Server returned error: " + response.status);
            }
        } catch (err) {
            MainModule.showToast('Failed to send reload request!', 'danger');
            console.error("Fetch failed:", err);
        } finally {
            spinner.remove();
            textSpan.textContent = ogTxt;
        }
    });

    // Filter DropDown
    const showDropDownBtn = document.querySelector('#showFilterDropDownButton');
    const filterDropDownOptions = document.querySelector('#filterDropDownOptions');

    showDropDownBtn.textContent = isAndroid ? showDropDownBtn.textContent.split(' ').splice(0, 1) : showDropDownBtn.textContent;
    showDropDownBtn.addEventListener('click', () => {
        filterDropDownOptions.classList.toggle('show');
    });

    document.querySelectorAll('#filterDropDownOptions .option').forEach(elem => {
        if (sortingState[String(elem.dataset.sortOrder)]) elem.classList.add('selected');
        elem.textContent = isAndroid ? elem.textContent.split(' ').splice(0, 1) : elem.textContent;
        elem.addEventListener('click', (e) => {
            document.querySelectorAll('#filterDropDownOptions .option').forEach(opt => {
                opt.classList.remove('selected');
            });

            e.target.classList.add('selected');

            const orderBy = String(e.target.dataset.sortOrder);

            setSortOrder(orderBy);
            renderVideos();
        });
    });
});