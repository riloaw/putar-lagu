const storage = window.localStorage;
const socket = io('https://socket.yuk.party');
//const socket = io('localhost:3000');
const sessionName = 'putarlagu_session';

var app = new Vue({
    el: '#app',
    data: {
        searchValue: '',
        onFocus: false,
        currentPlaying: null,
        queueList: [],
        historyList: [],
        searchResults: [],
        currentUser: null,
        users: [],
        state: null,
        selectedQueue: null,
        selectedHistory: null,
        mode: null
    },
   
    mounted() {
        this.currentUser = window.localStorage.getItem(sessionName);
        this.mode = window.localStorage.getItem('putarlagu_mode');
    },
    methods: {
        addQueueVue(queue) {
            this.historyList = this.historyList.filter(function(el) { return el.idVideo != queue.idVideo; });
            addQueueByData(queue);
        },
        randomAddQueue() {
            var item = this.historyList[Math.floor(Math.random() * this.historyList.length)];
            addQueueByData(item);
        },
        addQueueSearch(search) {
            const queue = {
                idVideo: search.id.videoId,
                urlVideo: search.url,
                title: search.title
            }
            this.searchValue = '';
            addQueueByData(queue);
        },
        removeQueueVue(queue) {
            if (queue.addedBy != this.currentUser.name) {
                return false;
            }
            this.queueList = this.queueList.filter(function(el) { return el.idVideo != queue.idVideo; });
            removeQueue(queue);
        },
        falseDelay() {
            setTimeout(() => {
                if (this.searchValue == '') {
                    this.searchResults = [];
                }
                this.onFocus = false;
            }, 500);
        },

        toggleMode() {
            if (this.mode != "dark-mode") {
                this.mode = 'dark-mode';
            } else {
                this.mode = 'light-mode';
            }
            storage.setItem('putarlagu_mode', this.mode);
        }
    }
})

socket.on('connect', function () {
    console.log('Connected');
    getQueue();
    getHistory();
    getCurrentPlaying();
    login();
    getUsers();
});

socket.on('putarlagu_queueList', function (data) {
    app.queueList = data;
    getHistory();
});

socket.on('putarlagu_users', function (data) {
    app.users = data;
});

socket.on('putarlagu_search', function (data) {
    app.searchResults = data;
    const searchHistory = app.historyList.filter((history) => history.title.toLowerCase().includes(app.searchValue.toLowerCase()) || getYoutubeID(app.searchValue) == history.idVideo);
    if (searchHistory) {
        searchHistory.forEach((history) => {
            app.searchResults.unshift({
                snippet: {
                    thumbnails: {
                        default: {
                            url: history.thumbnailVideo
                        }
                    },
                    publishedAt: "Play Count: " + history.playingCount
                },
                id: history.idVideo,
                title: history.title,
                duration_raw: "From History"
            });
        });
    }
});

socket.on('putarlagu_historyList', function (data) {
    app.historyList = data;
});

socket.on('putarlagu_notification', function (data) {
    showNotification(data);
});

function sendnotif() {
    socket.emit('putarlagu_notification', 'hehehehe');
}
socket.on('putarlagu_updateState', function (data) {
    app.state = data;
});


socket.on('putarlagu_currentPlaying', function (data) {
    app.currentPlaying = data;
    if (!data && app.queueList.length > 0) {
        play();
    }
    if (data) {
        document.title = "Putar Lagu > " + data.title;
    } else {
        document.title = "Putar Lagu";
    }
});

var inputUrl = document.getElementById("url");
var btnAddQueue = document.getElementById("btnAddQueue");
var delayTimer;
inputUrl.addEventListener("keyup", function (event) {
    btnAddQueue.innerHTML = "Loading...";
    clearTimeout(delayTimer);
    if (event.key === 13) {
        event.preventDefault();
        addQueue();
    }

    delayTimer = setTimeout(function () {
        var inputVal = document.getElementById("url").value;
        if (!inputVal.includes('http') && inputVal.length > 3) {
            search(inputVal);
        } else {
            app.searchResults = [];
        }
        if (inputVal.length < 1) {
            app.searchResults = [];
        }
        btnAddQueue.innerHTML = "Add Queue";
    }, 500);

});

function getYoutubeID(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    var match = url.match(regExp);
    return (match && match[7].length == 11) ? match[7] : '';
}

function validURL(url) {
    var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    var match = url.match(regExp);
    return (match) ? true : false;
}

function addQueue() {
    if (validURL(document.getElementById("url").value)) {
        var urlVideo = document.getElementById("url").value;
        socket.emit('putarlagu_addQueue', {
            urlVideo
        });
        document.getElementById("url").value = "";
        app.searchValue = "";
    }
}

function addQueueByData(data) {
    if (data) {
        socket.emit('putarlagu_addQueue', data);
    }
}

function removeQueue(data) {
    if (data) {
        socket.emit('putarlagu_removeQueue', data);
    }
}

function getQueue() {
    socket.emit('putarlagu_queueList', {});
}

function getHistory() {
    socket.emit('putarlagu_historyList', {});
}

function getUsers() {
    socket.emit('putarlagu_users');
}

function getCurrentPlaying() {
    socket.emit('putarlagu_currentPlaying');
}

function stop() {
    socket.emit('putarlagu_stop');
}

function play() {
    socket.emit('putarlagu_play');
}

function search(q) {
    socket.emit('putarlagu_search', q);
}

function skip() {
    var r = confirm("Are you sure to skip this song : " + app.currentPlaying.title);
    if (r == true) {
        socket.emit('putarlagu_skip');
        var audio = new Audio('notif.wav');
        audio.play();
    }
}

async function login(forceUpdateName = false) {
    const fpPromise = import('https://openfpcdn.io/fingerprintjs/v3')
        .then(FingerprintJS => FingerprintJS.load())
    fpPromise
        .then(fp => fp.get())
        .then(async result => {
            // This is the visitor identifier:
            const visitorID = result.visitorId

            let session = await window.localStorage.getItem(sessionName);
            let updateSession = session ? JSON.parse(session) : {};
            updateSession.visitorID = visitorID;
            if (!updateSession.name || forceUpdateName) {
                var name = prompt("Please enter your name", generateName());
                if (app.users.find((user) => user.name == name) && app.currentUser.name != name) {
                    return login(true);
                }
                updateSession.name = name;
            }
            if (!updateSession.name) {
                window.location.reload();
            }
            await window.localStorage.setItem(sessionName, JSON.stringify(updateSession));
            socket.emit('putarlagu_login', updateSession);
            app.currentUser = updateSession;
            if (forceUpdateName) {
                window.location.reload();
            }
        });
}

function showNotification(msg) {
    var x = document.getElementById("snackbar");
    x.innerHTML = msg;
    x.className = "show";
    setTimeout(function () {
        x.className = x.className.replace("show", "");
    }, 3000);
}

function capFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function generateName() {
    var catsName = [
        "Abby",
        "Angel",
        "Annie",
        "Baby",
        "Bailey",
        "Bandit",
        "Bear",
        "Bella",
        "Bob",
        "Boo",
        "Boots",
        "Bubba",
        "Buddy",
        "Buster",
        "Cali",
        "Callie",
        "Casper",
        "Charlie",
        "Chester",
        "Chloe",
        "Cleo",
        "Coco",
        "Cookie",
        "Cuddles",
        "Daisy",
        "Dusty",
        "Felix",
        "Fluffy",
        "Garfield",
        "George",
        "Ginger",
        "Gizmo",
        "Gracie",
        "Harley",
        "Jack",
        "Jasmine",
        "Jasper",
        "Kiki",
        "Kitty",
        "Leo",
        "Lilly",
        "Lily",
        "Loki",
        "Lola",
        "Lucky",
        "Lucy",
        "Luna",
        "Maggie",
        "Max",
        "Mia",
        "Midnight",
        "Milo",
        "Mimi",
        "Miss kitty",
        "Missy",
        "Misty",
        "Mittens",
        "Molly",
        "Muffin",
        "Nala",
        "Oliver",
        "Oreo",
        "Oscar",
        "Patches",
        "Peanut",
        "Pepper",
        "Precious",
        "Princess",
        "Pumpkin",
        "Rascal",
        "Rocky",
        "Sadie",
        "Salem",
        "Sam",
        "Samantha",
        "Sammy",
        "Sasha",
        "Sassy",
        "Scooter",
        "Shadow",
        "Sheba",
        "Simba",
        "Simon",
        "Smokey",
        "Snickers",
        "Snowball",
        "Snuggles",
        "Socks",
        "Sophie",
        "Spooky",
        "Sugar",
        "Tiger",
        "Tigger",
        "Tinkerbell",
        "Toby",
        "Trouble",
        "Whiskers",
        "Willow",
        "Zoe",
        "Zoey"
    ];
    var name = capFirst(catsName[getRandomInt(0, catsName.length + 1)]);
    return name;
}