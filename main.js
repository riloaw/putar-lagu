const storage = window.localStorage;
const base_url = 'https://socket.putarlagu.co.in';
// const base_url = 'http://localhost:3000';
const apiKey = 'ajanf94n30viqpwimci034bvnwe';
const socket = io(base_url);
const sessionName = 'putarlagu_session';
const TYPING_TIMER_LENGTH = 400; // ms
let typing = false;
let lastTypingTime;
Vue.use(EmojiPicker);
Vue.use(VueClazyLoad);

var sum = function (arr) {
    return arr.reduce(function (acc, x) { return acc + x; }, 0);
};
var makeTokens = function (text) {
    if (text === null) { return []; }
    if (text.length === 0) { return []; }
    return text.toLowerCase().replace(
        /[~`’!@#$%^&*(){}\[\];:"'<,.>?\/\\|_+=-]/g
        , ''
    ).split(' ').filter(function (token) { return token.length > 0; });
};
var makeTfVector = function (countVector) {
    let total = sum(countVector);
    return countVector.map(
        function (count) {
            return total === 0 ? 0 : count / total;
        }
    );
};

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
        mode: null,
        chatList: [],
        typings: [],
        chatInput: '',
        searchEmoji: '',
        docs: [],
        query: null
    },
    watch: {
        chatInput: function (val) {
            updateTyping();
        },
        historyList: function (val) {
            if (this.docs.length === 0) {
                this.docs = val;
            }
        },
        bm25RankedDocs: function (val) {
            if (this.query != '' && this.query != null && val && val.length > 0) {
                if (val[0].score > 0) {
                    const song = this.historyList.find((d) => d.idVideo === val[0].idVideo);
                    if (song) {
                        showNotification("Added " + song.title);
                        addQueueByData(song);
                    }
                } else {
                    showNotification(this.query + " not found");
                }
            }
        }
    },
    mounted() {
        this.currentUser = window.localStorage.getItem(sessionName);
        this.mode = window.localStorage.getItem('putarlagu_mode');
    },
    methods: {
        rankScoredDocs: function (scores) {
            return scores
                .map(
                    function (score, index) {
                        let doc = this.docs[index];
                        doc.index = index;
                        return [score, doc];
                    }.bind(this)
                )
                .sort(function (a, b) { return -a[0] + b[0]; }).map(
                    function (elem) {
                        const el = elem[1];
                        el.score = elem[0];
                        return el;
                    }
                )
                .slice(0, 1);
        },
        addQueueVue(queue) {
            this.historyList = this.historyList.filter(function (el) {
                return el.idVideo != queue.idVideo;
            });
            addQueueByData(queue);
        },
        randomAddQueue() {
            var item = this.historyList[Math.floor(Math.random() * this.historyList.length)];
            addQueueByData(item);
        },
        addQueueSearch(search) {
            if (search && search.idVideo) {
                addQueueByData(search);
            } else {
                const queue = {
                    idVideo: search.id.videoId,
                    urlVideo: search.url,
                    title: search.title
                }
                addQueueByData(queue);
            }
            this.searchValue = '';
        },
        removeQueueVue(queue) {
            if (queue.addedBy != this.currentUser.name) {
                return false;
            }
            this.queueList = this.queueList.filter(function (el) {
                return el.idVideo != queue.idVideo;
            });
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
        },

        getIsTyping() {
            if (this.typings.length < 1) {
                return null;
            } else {
                const typer = this.typings.filter((typer) => typer != this.currentUser.name);
                if (typer.length > 0) {
                    return typer.join(", ") + " is typing...";
                }
            }
        },

        sendMessage() {
            if (this.chatInput && this.chatInput.length > 0) {
                sendMessage(this.chatInput);
                this.chatInput = '';
            }

        },
        insertEmoji(emoji) {
            this.chatInput += emoji
        },
    },
    computed: {
        parsedDocs: function () {
            return this.docs.map(
                function (doc) {
                    return {
                        tokens: makeTokens(doc.title)
                        , id: doc.idVideo
                    };
                }
            );
        },
        tokens: function () {
            return this.parsedDocs.map(
                function (parsedDoc) { return parsedDoc.tokens || []; }
            );
        },
        dictionary: function () {
            return this.tokens.reduce(
                function (acc, tokens) {
                    return acc.concat(tokens);
                }
                , []
            ).reduce(
                function (acc, word) {
                    if (acc.indexOf(word) === -1) {
                        acc.push(word);
                        return acc;
                    } else {
                        return acc;
                    }
                }
                , []
            ).sort();
        },
        numberOfDocs: function () {
            return this.countVectors.reduce(
                function (acc, x, index) {
                    return acc + (this.countVectors[index].length === 0 ? 0 : 1);
                }.bind(this)
                , 0
            );
        },
        countVectors: function () {
            return this.tokens.map(
                function (tokens) {
                    return this.dictionary.map(
                        function (word) {
                            return tokens.reduce(
                                function (acc, token) { return token === word ? acc + 1 : acc; }
                                , 0
                            );
                        }
                    );
                }.bind(this)
            );
        },
        countVectorsT: function () {
            let arr = [];
            this.countVectors.map(
                function (countVector, row, countVectors) {
                    countVector.map(
                        function (count, col, countVector) {
                            if (row === 0) { arr.push([]); }
                            arr[col].push(count);
                        }
                    );
                }
            );
            return arr;
        },
        tfVectors: function () {
            return this.countVectors.map(
                function (countVector) {
                    return makeTfVector(countVector);
                }
            );
        },
        idfVectors: function () {
            let total = this.numberOfDocs;
            if (total === 0) { return this.countVectors.map(function () { return []; }); }
            let idfVector = this.countVectors[0].map(
                function (count, col) {
                    let inDocCount = this.countVectorsT[col].reduce(
                        function (acc, x) {
                            return acc + (x > 0 ? 1 : 0);
                        }
                        , 0
                    );
                    if (total === 0) { return 0; }
                    if (inDocCount === 0) { return 0; }
                    return Math.log(total / inDocCount);
                }.bind(this)
            );
            return this.countVectors.map(function () { return idfVector; });
        },
        tfIdfVectors: function () {
            return this.tfVectors.map(
                function (tfVector, row) {
                    return tfVector.map(
                        function (tf, col) {
                            return tf * this.idfVectors[row][col];
                        }.bind(this)
                    );
                }.bind(this)
            );
        },
        docsVectors: function () {
            return this.countVectors.map(
                function (countVector, index) {
                    return [countVector, this.tfVectors[index], this.idfVectors[index], this.tfIdfVectors[index]];
                }.bind(this)
            );
        },
        queryTokens: function () {
            if (!this.query) {
                return [];
            }
            return makeTokens(this.query);
        },
        queryCountVector: function () {
            return this.dictionary.map(
                function (word) {
                    return this.queryTokens.reduce(
                        function (acc, token) { return token === word ? acc + 1 : acc; }
                        , 0
                    );
                }.bind(this)
            );
        },
        queryTfVector: function () {
            return makeTfVector(this.queryCountVector);
        }, queryIdfVector: function () {
            return this.idfVectors[0];
        },
        queryTfIdfVector: function () {
            return this.queryTfVector.map(
                function (tf, index) {
                    return tf * this.queryIdfVector[index];
                }.bind(this)
            );
        },
        bm25Scores: function () {
            let meanDocLen = 0;
            if (this.numberOfDocs > 0) {
                meanDocLen = sum(
                    this.countVectors.map(
                        function (countVector) {
                            return sum(countVector);
                        }
                    )
                ) / this.numberOfDocs;
            }
            let k1 = 1.2;
            let k2 = 100;
            let b = 0.75;
            return this.countVectors.map(
                function (countVector) {
                    return this.queryTokens.reduce(
                        function (acc, queryToken) {
                            let dictionaryIndex = this.dictionary.indexOf(queryToken);

                            let K = meanDocLen === 0 ? 0 : k1 * ((1 - b) + (b * (sum(countVector) / meanDocLen)));

                            let r = 0;
                            let R = 0;

                            let qf = dictionaryIndex < 0 ? 0 : this.queryCountVector[dictionaryIndex];
                            let n = 0;
                            if (dictionaryIndex >= 0) {
                                n = this.countVectorsT[dictionaryIndex].reduce(
                                    function (acc, x) { return acc + (x > 0 ? 1 : 0); }
                                    , 0
                                );
                            }
                            let N = this.numberOfDocs;
                            let f = dictionaryIndex < 0 ? 0 : countVector[dictionaryIndex];

                            let ai = r + 0.5;
                            let bi = R - r + 0.5;
                            let ci = n - r + 0.5;
                            let di = N - n - R + r + 0.5;
                            let ei = bi === 0 ? 0 : ai / bi;
                            let fi = di === 0 ? 0 : ci / di;
                            let gi = fi === 0 ? 0 : ei / fi;

                            let hi = (k1 + 1) * f;
                            let ii = K + f;
                            let ji = ii === 0 ? 0 : hi / ii;

                            let ki = (k2 + 1) * qf;
                            let li = k2 + qf;
                            let mi = li === 0 ? 0 : ki / li;

                            return acc + (Math.log(gi) * ji * mi);
                        }.bind(this)
                        , 0
                    );
                }.bind(this)
            );
        },
        bm25RankedDocs: function () {
            return this.rankScoredDocs(this.bm25Scores);
        }
    },
    directives: {
        focus: {
            inserted(el) {
                el.focus()
            },
        },
    },
})
var connected = false;
socket.on('connect', function () {
    console.log('Connected');
    connected = true;
    getQueue();
    getCurrentPlaying();
    login();
    getUsers();
    getMessageList();
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
                id: {
                    videoId: history.idVideo
                },
                url: history.urlVideo,
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

socket.on('putarlagu_messageList', function (data) {
    app.chatList = data;
    setTimeout(() => {
        document.getElementsByClassName('chat-messages')[0].scrollTop = document.getElementsByClassName('chat-messages')[0].scrollHeight;
    }, 0);
});

socket.on('putarlagu_newMessage', function (data) {
    app.chatList.push(data);
    setTimeout(() => {
        document.getElementsByClassName('chat-messages')[0].scrollTop = document.getElementsByClassName('chat-messages')[0].scrollHeight;
    }, 0);
});

socket.on('putarlagu_typing', function (data) {
    if (!app.typings.includes(data.name)) {
        app.typings.push(data.name);
    }
});

socket.on('putarlagu_stopTyping', function (data) {
    if (app.typings.includes(data.name)) {
        app.typings = arrayRemove(app.typings, data.name);
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
    // socket.emit('putarlagu_historyList', {});
    fetch(base_url + '/api/putarlagu/history-list', {headers:{'X-API-KEY': apiKey}} )
        .then((response) => response.json())
        .then((data) => app.historyList = data);
}

function getUsers() {
    socket.emit('putarlagu_users');
}

function getMessageList() {
    socket.emit('putarlagu_messageList', {});
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
        socket.emit('putarlagu_skip', app.currentPlaying.title);
        var audio = new Audio('notif.wav');
        audio.play();
    }
}

function goToLyric() {
    const title = app.currentPlaying.title;
    const regex1 = /\(.*\)/i;
    const regex2 = /\[.*\]/i;
    const regex3 = /\#.*/i;
    const q = title
        .replace(regex1, '')
        .replace(regex2, '')
        .replace(regex3, '')
        .replace(/[^a-zA-Z0-9 ]/g, '');
    $('#lyricIframe').attr('src', `https://www.google.com/search?q=lyric ${q}&igu=1`);
    $('#lyricModal').modal({
        backdrop: false,
        show: true
    });
    // reset modal if it isn't visible
    if (!($('#lyricModal .modal.in').length)) {
        $('#lyricModal .modal-dialog').css({
            top: 20,
            left: 100
        });
        $('#lyricModal .modal-content').css({
            width: '70vw',
            height: '90vh'
        });
    }

    $('#lyricModal .modal-dialog').draggable({
        cursor: "move",
        handle: ".dragable_touch"
    });
}

function restartServer() {
    swal({
        title: "Are you sure?",
        text: "The song playing will start all over again",
        icon: "warning",
        buttons: true,
        dangerMode: true,
    })
        .then((confirm) => {
            if (confirm) {
                stop();
                play();
            }
        });
}

function arrayRemove(arr, value) {
    return arr.filter(function (ele) {
        return ele != value;
    });
}

const updateTyping = () => {
    if (connected) {
        if (!typing) {
            typing = true;
            socket.emit('putarlagu_typing');
        }
        lastTypingTime = (new Date()).getTime();

        setTimeout(() => {
            const typingTimer = (new Date()).getTime();
            const timeDiff = typingTimer - lastTypingTime;
            if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
                socket.emit('putarlagu_stopTyping');
                typing = false;
            }
        }, TYPING_TIMER_LENGTH);
    }
}

const sendMessage = (message) => {
    socket.emit('putarlagu_newMessage', message);
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
                var name = await swal({
                    text: 'Insert Your Nickname.',
                    content: {
                        element: 'input'
                    },
                    button: {
                        text: "Submit",
                        closeModal: true,
                    },
                });
                //var name = prompt("Please enter your name", generateName());
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


var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var videoId;
var player;

function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        videoId: videoId ? videoId : 'ts8i-6AtDfc',
        playerVars: {
            'controls': 0,
            'playsinline': 1,
            'disablekb': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });

    function onPlayerReady(event) {
        //event.target.playVideo();
    }

    function onPlayerStateChange(event) {

    }
}

function voiceNote(time = 3000) {
    var constraints = { audio: true };
    navigator.mediaDevices.getUserMedia(constraints).then(function (mediaStream) {
        var mediaRecorder = new MediaRecorder(mediaStream);
        mediaRecorder.onstart = function (e) {
            this.chunks = [];
        };
        mediaRecorder.ondataavailable = function (e) {
            this.chunks.push(e.data);
        };
        mediaRecorder.onstop = function (e) {
            var blob = new Blob(this.chunks, { 'type': 'audio/ogg; codecs=opus' });
            socket.emit('putarlagu_voiceNote', blob);
        };

        // Start recording
        mediaRecorder.start();

        // Stop recording after 5 seconds and broadcast it to server
        setTimeout(function () {
            mediaRecorder.stop()
        }, time);
    });
}

socket.on('putarlagu_voiceNote', function (arrayBuffer) {
    var blob = new Blob([arrayBuffer], { 'type': 'audio/ogg; codecs=opus' });
    var audio = document.createElement('audio');
    audio.src = window.URL.createObjectURL(blob);
    audio.play();
});

var listenToo = false;
socket.on('putarlagu_play', function (data) {
    videoId = data.idVideo;
    if (listenToo == true) {
        player.loadVideoById(videoId, 0, "default");
    }
});

function listenTooFunc() {
    if (player && app.currentPlaying && listenToo == false) {
        $("#playerModal .modal-title").text(app.currentPlaying.title);
        player.loadVideoById(app.currentPlaying.idVideo, app.state.currentTime, "default");
        listenToo = true;
        $('#actionButton').html(`<i class="fas fa-stop"></i> Stop`);
    }
}

$('#playerModal').on('shown.bs.modal', function () {
    if (!app.state) {
        $('#playerModal').modal('hide')
    } else {
        listenTooFunc();
    }

});

$('#sendVoiceNote').on('click', function (e) {
    e.preventDefault();
    voiceNote(3000);
});

$('#syncTime').on('click', function (e) {
    e.preventDefault();
    if (player && listenToo == true) {
        player.seekTo(app.state.currentTime);
    }
});

$('#actionButton').on('click', function (e) {
    e.preventDefault();
    if (player && listenToo == false) {
        listenTooFunc();
        $(this).html(`<i class="fas fa-stop"></i> Stop`);
    } else {
        player.stopVideo();
        listenToo = false;
        $(this).html(`<i class="fas fa-play"></i> Play`);
    }
});


document.querySelector('#url').addEventListener('click', async function () {
    checkClipboard();
});
document.addEventListener('copy', function (e) {
    e.clipboardData.setData('text/plain', '');
    e.preventDefault(); // default behaviour is to copy any selected text
});
function checkClipboard() {
    if (navigator.clipboard) {

        navigator.clipboard.readText().then((urlVideo) => {
            if (validURL(urlVideo)) {
                socket.emit('putarlagu_addQueue', {
                    urlVideo
                });
                document.execCommand('copy');
            }
        });
    }
}

// $('#playerModal').on('hidden.bs.modal', function () {
//     player.stopVideo();
//     listenToo = false;
// });
$('#playerBtn').click(function () {
    $('#playerModal').modal({
        backdrop: false,
        show: true
    });
    // reset modal if it isn't visible
    if (!($('#playerModal .modal.in').length)) {
        $('#playerModal .modal-dialog').css({
            top: 20,
            left: 100
        });
    }

    $('#playerModal .modal-dialog').draggable({
        cursor: "move",
        handle: ".dragable_touch"
    });
});

$('#speechBtn').click(function () {
    $('#speechBtn').html('<i class="fa fa-spinner fa-spin"></i>');
    recognition.start();
});

try {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    var SpeechGrammarList = SpeechGrammarList || window.webkitSpeechGrammarList
    var SpeechRecognitionEvent = SpeechRecognitionEvent || window.webkitSpeechRecognitionEvent
    
    var recognition = new SpeechRecognition();
    var grammarList = ["rizal ganteng"];
    if (SpeechGrammarList) {
        // SpeechGrammarList is not currently available in Safari, and does not have any effect in any other browser.
        // This code is provided as a demonstration of possible capability. You may choose not to use it.
        var speechRecognitionList = new SpeechGrammarList();
        var grammar = '#JSGF V1.0; grammar colors; public <grammarList> = ' + grammarList.join(' | ') + ' ;'
        speechRecognitionList.addFromString(grammar, 1);
        recognition.grammars = speechRecognitionList;
    }
    recognition.continuous = false;
    recognition.lang = 'id-ID';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (event) {
        var res = event.results[0][0].transcript;
        if (res.length > 3) {
            app.query = res;
        }
    }
    
    recognition.onspeechend = function () {
        $('#speechBtn').html('<i class="fa fa-microphone"></i>');
        recognition.stop();
    }
    
    recognition.onnomatch = function (event) {
        $('#speechBtn').html('<i class="fa fa-microphone"></i>');
        showNotification("I didn't recognise that color.");
    }
    
    recognition.onerror = function (event) {
        $('#speechBtn').html('<i class="fa fa-microphone"></i>');
        showNotification('Error occurred in recognition: ' + event.error);
    }
} catch (error) {
    $('#speechBtn').hide();
}