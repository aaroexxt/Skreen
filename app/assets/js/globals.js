//globals.js? should be modules.js lol
//I'm updating this rn to use a much better "modules" system that will be more efficient

if (typeof utils == "undefined") {
    console.error("utils object undefined, did it load?");
}
const SRH = new utils.serverResponseHandler("http://"+window.location.host); //setup server response handler
SRH.debugMode = false;

const globals = {
    constants: {
        sessionData: undefined,
        readySteps: {
            connectedToServer: false,
            validSession: false,
            pageLoad: true,
            gotRuntimeInformation: false,
            modulesOK: false
        },
        defaultApp: "music",
        runtimeInformation: {
            frontendVersion: "? (Should Not Happen)",
            backendVersion: "? (Should Not Happen)",
            nodeConnected: "? (Should Not Happen)",
            pythonConnected: "? (Should Not Happen)",
            arduinoConnected: "? (Should Not Happen)",
            uptime: "? (Should Not Happen)",
            status: "NotConnected",
            users: "? (Should Not Happen)",
            odometer: "? (Should Not Happen)",
            dynamicMusicMenu: true
        },
    },
    modules: {
        master: {
            moduleName: "master",
            debugMode: true,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
                init: function(moduleReference) {
                    moduleReference.state = "checkConnection"; //set state
                    /*Steps to init:
                        first check if we are connected to server.
                        Then get the runtimeInformation/session information and store it
                        After that check each module
                    */
                },
                end: function() {},
                checkConnection: function(moduleReference) {
                    console.log("Master init: begin");
                    console.log("Checking connection to server...");
                    globals.constants.readySteps.connectedToServer = false;
                    globals.constants.readySteps.validSession = false;
                    SRH.request("api/isup")
                    .then(response => {
                        console.log("Successfully connected to server");
                        globals.constants.readySteps.connectedToServer = true;
                        SRH.request("api/session")
                        .then(sessionDat => {
                            console.log("sessionData: "+JSON.stringify(sessionDat));
                            if (sessionDat.id) {
                                globals.constants.readySteps.validSession = true;
                            }
                            globals.constants.sessionData = sessionDat;
                            //change state
                            moduleReference.state = "initializeLoadListener";
                        });
                    }).catch(error => {
                        console.error("Server is not up. Cannot continue with initialization (e="+error+")");
                    })
                },
                initializeLoadListener: function(moduleReference) {
                    //setup vars
                    let loadMessages = document.getElementById(moduleReference.properties.loadMessagesElementName);
                    let readySteps = Object.keys(globals.constants.readySteps);
                    moduleReference.properties.previousReadySteps = JSON.parse(JSON.stringify(globals.constants.readySteps));

                    //setup elements
                    loadMessages.innerHTML = "<h2 style='text-decoration: underline'>Loading Scripts</h2>"; //sets via js to let user know that js works
                    for (var i=0; i<readySteps.length; i++) {
                        var title = document.createElement("h3"); //create h3 tag
                        title.setAttribute("style","display: inline;");
                        var text = document.createTextNode(readySteps[i]+": ");
                        title.appendChild(text);

                        var img = document.createElement("img"); //create image element
                        img.setAttribute("width",String(moduleReference.properties.imageWidth)+"px");
                        img.setAttribute("height",String(moduleReference.properties.imageHeight)+"px");
                        img.setAttribute("id","loadImg"+readySteps[i])
                        if (globals.constants.readySteps[readySteps[i]]) { //dynamically add check or noncheck
                            img.setAttribute("src",moduleReference.properties.imageCheckPath);
                        } else {
                            img.setAttribute("src",moduleReference.properties.imageNoCheckPath);
                        }

                        var br = document.createElement("br");
                        var br2 = document.createElement("br");

                        loadMessages.appendChild(title);
                        loadMessages.appendChild(img);
                        loadMessages.appendChild(br);
                        loadMessages.appendChild(br2);
                    }
                    var progressBar = document.createElement("progress");
                    progressBar.setAttribute("id",moduleReference.properties.loadBarElementName);
                    progressBar.setAttribute("class","loadBar");
                    progressBar.setAttribute("value","0");

                    loadMessages.appendChild(progressBar);

                    moduleReference.state = "initializeModules";
                
                },
                initializeModules: function(moduleReference) {
                    let modules = Object.keys(globals.modules);
                    let requiredProperties = moduleReference.properties.requiredProperties;

                    var modulesOK = true;
                    for (var i=0; i<modules.length; i++) {
                        let moduleName = modules[i];
                        let module = globals.modules[moduleName];
                        if (module == moduleReference) { //don't initialize the master module
                            continue;
                        }
                        console.log("checking module: "+moduleName);

                        var moduleOK = true;
                        for (var j=0; j<requiredProperties.length; j++) {
                            if (!module.hasOwnProperty(requiredProperties[j])) {
                                console.log("Module name '"+moduleName+"' is missing property "+requiredProperties[j]);
                                moduleOK = false;
                                modulesOK = false;
                            }
                        }

                        if (moduleOK) { //module is ok
                            console.log("Initializing module "+moduleName);
                            module.state = "init"; //set state
                        } else {
                            console.warn("Cannot initialize module "+moduleName+" because it is missing properties");
                        }

                    }

                    moduleReference.state = "updateLoadListeners";

                    if (modulesOK || true) { //ADD READTSTEPS
                        globals.constants.readySteps.modulesOK = true;
                    }
                },
                updateLoadListeners: function(moduleReference) {
                    //setup vars
                    let loadMessages = document.getElementById(moduleReference.properties.loadMessagesElementName);
                    let readySteps = Object.keys(globals.constants.readySteps);

                    //actually do the checks
                    let ready = true;
                    var stepsReady = readySteps.length; //represents the steps left before load is ready
                    for (var i=0; i<readySteps.length; i++) {
                        if (!globals.constants.readySteps[readySteps[i]]) { //iterate through readySteps
                            ready = false;
                            stepsReady--;
                        }
                        if (moduleReference.properties.previousReadySteps[readySteps[i]] !== readySteps[readySteps[i]]) {
                            let imageElement = document.getElementById("loadImg"+readySteps[i]);
                            try {
                                if (globals.constants.readySteps[readySteps[i]]) { //dynamically add check or noncheck
                                    imageElement.setAttribute("src",moduleReference.properties.imageCheckPath);
                                } else {
                                    imageElement.setAttribute("src",moduleReference.properties.imageNoCheckPath);
                                }
                            } catch(e) {
                                console.error("Error setting attrib for key "+readySteps[i])
                            }
                        }
                    }
                    document.getElementById(moduleReference.properties.loadBarElementName).value = (stepsReady/readySteps.length);
                    moduleReference.properties.previousReadySteps = JSON.parse(JSON.stringify(globals.constants.readySteps));
                    
                    moduleReference.state = ready ? "pageReady" : "waitLoadListener";
                },
                waitLoadListener: function(moduleReference) {
                    setTimeout( () => {
                        moduleReference.state = "updateLoadListeners";
                    },moduleReference.properties.loadListenerWaitTime);
                },
                pageReady: function(moduleReference) {
                    document.getElementById(moduleReference.properties.loadContainerElementName).style.display = "none";
                    var loaders = document.getElementsByClassName(moduleReference.properties.loadElementClass);
                    for (var i=0; i<loaders.length; i++) {
                        loaders[i].style.display = "none";
                    }
                    document.getElementById(moduleReference.properties.mainElementName).style.display = "block";
                }
            },
            properties: {
                imageCheckPath: "/images/check.png",
                imageNoCheckPath: "/images/nocheck.png",
                imageWidth: 16,
                imageHeight: 16,
                loadBarElementName: "main_loadBar",
                loadListenerWaitTime: 200,
                mainElementName: "main",
                loadContainerElementName: "loading",
                loadElementClass: "loader",
                loadMessagesElementName: "loadMessages",
                requiredProperties: ["moduleName","debugMode","realState","methods"]
            }
        },
        music: {
            moduleName: "soundManager",
            debugMode: false,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
                init: function(mR) {
                    document.getElementById(mR.properties.trackTitleElement).innerHTML = "Server is loading tracks.";

                    var volumeBar = new ProgressBar.Line('#'+mR.properties.volumeBarElement, {
                        strokeWidth: 2,
                        easing: 'easeInOut',
                        duration: 500,
                        color: '#FFEA82',
                        trailColor: '#eee',
                        trailWidth: 1,
                        svgStyle: {width: '100%', height: '100%'},
                        from: {color: '#39CE3C'},
                        to: {color: '#ED6A5A'},
                        step: (state, bar) => {
                            bar.path.setAttribute('stroke', state.color);
                        }
                    });
                    volumeBar.animate(0);
                    mR.properties.volumeBar = volumeBar;

                    var trackProgressBar = new ProgressBar.Line("#"+mR.properties.trackProgressBarElement, {
                        strokeWidth: 5,
                        duration: 500,
                        color: '#FFEA82',
                        trailColor: '#eee',
                        trailWidth: 3,
                        svgStyle: {width: '100%', height: '100%'}
                    });
                    trackProgressBar.animate(0);
                    mR.properties.trackProgressBar = trackProgressBar;

                    clearInterval(mR.properties.trackDataUpdateTimeout); //in case user is being changed
                    new SRH.requestInterval(1000, "api/SC/clientReady", data => {

                        if (typeof data != "undefined" && data.hasTracks && data.likedTracks.length > 0 && data.trackList.length > 0) { //is the data valid?
                            mR.properties.likedTracks = data.likedTracks;
                            mR.properties.trackList = data.trackList;

                            var sd = data.settingsData;
                            mR.properties.currentUser = sd.currentUser;
                            mR.properties.noArtworkUrl = sd.noArtworkUrl;
                            mR.properties.volStep = sd.volStep;
                            mR.properties.currentVolume = sd.currentVolume;
                            mR.properties.playMusicOnServer = sd.playMusicOnServer;
                            mR.properties.nextTrackShuffle = sd.nextTrackShuffle;
                            mR.properties.soundcloudStatus = sd.soundcloudStatus;
                            mR.properties.nextTrackLoop = sd.nextTrackLoop;
                            mR.properties.tracksFromCache = sd.tracksFromCache;

                            mR.properties.volumeBar.animate(mR.properties.currentVolume/100);

                            if (mR.properties.nextTrackShuffle) { //check if trackShuffle is already set from server
                                document.getElementById(mR.properties.shuffleButtonElement).className+=' activeLoopShuffle';
                            }
                            
                            if (mR.properties.nextTrackLoop) { //check if trackLoop is already set from server
                                document.getElementById(mR.properties.loopButtonElement).className+=' activeLoopShuffle';
                            }
                            console.log("server->client trackLoop:"+mR.properties.nextTrackLoop+",trackShuffle: "+mR.properties.nextTrackShuffle);

                            if (!mR.properties.currentPlayingTrack) { //only if not playing track so as to not change message
                                document.getElementById(mR.properties.trackTitleElement).innerHTML = "Select a track"; //set tracktitle to simple message
                            }
                            mR.methods.updateTrackList(mR.properties.likedTracks); //update the trackList
                        } else {
                            console.error("Server said that it had tracks but there are no tracks provided (track response may be malformed)");
                        }
                    }, wait => {
                        console.log("Waiting for server to be ready for soundcloud...",wait);
                        document.getElementById(mR.properties.trackAuthorElement).innerHTML = "Loading percent: "+wait.percent;
                    }, error => {
                        console.error("Soundcloud Server Error: "+JSON.stringify(error.message));
                        bootbox.alert("Soundcloud Server Error: "+JSON.stringify(error.message));
                    }, -1);

                    mR.state = "trackDataUpdate";
                },
                updateTrackList: function(tracklist) {
                    var tklElem = document.getElementById(globals.modules.music.properties.trackListElement);
                    tklElem.innerHTML = "";
                    for (var i=0; i<tracklist.length; i++) {
                        var p = document.createElement("p");
                        var txt = document.createTextNode(String(i+1)+"): "+tracklist[i].title);
                        p.setAttribute("onclick","globals.modules.music.methods.playTrackRequested("+JSON.stringify(tracklist[i])+");");
                        p.setAttribute("tabindex","0");
                        p.setAttribute("class","songTitle");
                        p.appendChild(txt);
                        tklElem.appendChild(p);
                    }
                    //globals.music.soundManager.startTrackManager(); //start the manager
                },
                trackDataUpdate: function(mR) {
                    SRH.request("api/SC/clientUpdate").then(data => {
                        //console.log(data.playing)
                        mR.properties.playingTrack = data.playingTrack; //upd playing since it's not in the settings part
                        mR.properties.playingAirplay = data.playingAirplay; //upd playing since it's not in the settings part

                        let mRP = mR.properties;
                        let buttonList = [mRP.shuffleButtonElement, mRP.loopButtonElement, mRP.backButtonElement, mRP.forwardButtonElement, mRP.playPauseButtonElement];

                        if (data.playingAirplay && !data.playingTrack) {
                            for (let i=0; i<buttonList.length; i++) {
                                let elem = document.getElementById(buttonList[i]);
                                if (elem.className.indexOf("disableMenuElement") < 0) {
                                    elem.className += " disableMenuElement";
                                }
                            }
                        } else if (!data.playingAirplay && data.playingTrack) {
                            for (let i=0; i<buttonList.length; i++) {
                                let elem = document.getElementById(buttonList[i]);
                                elem.className = elem.className.replace(new RegExp('(?:^|\\s)'+ 'disableMenuElement' + '(?:\\s|$)'), ' ');
                            }
                        }

                        if (JSON.stringify(mR.properties.oldSettingsData) != JSON.stringify(data.settingsData)) {
                            console.log("DataChange");
                            mR.properties.currentUser = data.settingsData.currentUser;
                            mR.properties.currentVolume = data.settingsData.currentVolume;

                            mR.properties.volumeBar.animate(mR.properties.currentVolume/100);

                            if (mR.properties.oldSettingsData.nextTrackShuffle != data.settingsData.nextTrackShuffle) { //check if the track data has changed and if so update the class
                                mR.properties.nextTrackShuffle = data.settingsData.nextTrackShuffle;
                                if (mR.properties.nextTrackShuffle) {
                                    document.getElementById(mR.properties.shuffleButtonElement).className+=' activeLoopShuffle';
                                } else {
                                    document.getElementById(mR.properties.shuffleButtonElement).className = "controlButton";
                                }
                            }
                            if (mR.properties.oldSettingsData.nextTrackLoop != data.settingsData.nextTrackLoop) {
                                mR.properties.nextTrackLoop = data.settingsData.nextTrackLoop;
                                if (mR.properties.nextTrackLoop) {
                                    document.getElementById(mR.properties.loopButtonElement).className+=' activeLoopShuffle';
                                } else {
                                    document.getElementById(mR.properties.loopButtonElement).className = "controlButton";
                                }
                            }
                            mR.properties.oldSettingsData = data.settingsData; //set old settings data
                        }
                        
                        if (JSON.stringify(mR.properties.currentPlayingTrack) != JSON.stringify(data.currentPlayingTrack)) {
                            console.log("TrackChange");
                            var nTrack = data.currentPlayingTrack;
                            if (nTrack) {
                                mR.properties.currentPlayingTrack = nTrack;
                                if (typeof nTrack.artwork != "undefined") {
                                    document.getElementById(mR.properties.trackArtElement).src = (!nTrack.artwork.artworkUrl) ? mR.properties.noArtworkUrl : "http://"+window.location.host+"/api/sc/trackArt/"+nTrack.id+".jpg";//track.artwork.artworkUrl;
                                } else {
                                    document.getElementById(mR.properties.trackArtElement).src = mR.properties.noArtworkUrl;
                                }

                                if (typeof nTrack.id != "undefined") {
                                    document.getElementById(mR.properties.waveformArtElement).src = "http://"+window.location.host+"/api/sc/trackWaveform/"+nTrack.id+".png";
                                }

                                if (typeof nTrack.title != "undefined") {
                                    document.getElementById(mR.properties.trackTitleElement).innerHTML = nTrack.title;
                                } else {
                                    console.warn("nTrack missing title property; has a valid track been recieved from the server?");
                                    document.getElementById(mR.properties.trackTitleElement).innerHTML = "Unknown";
                                }

                                if (typeof nTrack.author != "undefined") {
                                     document.getElementById(mR.properties.trackAuthorElement).innerHTML = "By: "+nTrack.author;
                                } else {
                                    console.warn("nTrack missing author peroperty; has a valid track been recieved from the server?");
                                    document.getElementById(mR.properties.trackAuthorElement).innerHTML = "By: Unknown";
                                }
                                
                            }
                        }

                        if (JSON.stringify(mR.properties.trackTiming) != JSON.stringify(data.trackTiming)) {
                            mR.properties.trackTiming = data.trackTiming;
                            console.log("TimingChange");

                            let timestamp = data.trackTiming.timeStamp || "TstampErr";
                            let duration = data.trackTiming.duration || "DurErr";
                            document.getElementById(mR.properties.trackTimestampElement).innerHTML = timestamp+" / "+duration;

                            let percent = Number(data.trackTiming.percent/100) || -1;
                            mR.properties.trackProgressBar.animate(percent);
                        }
                    }).catch( err => {
                        console.error("Error getting sound update: "+err);
                    });

                    mR.state = "waitTrackDataUpdate";
                },
                waitTrackDataUpdate: function(mR) {
                    clearInterval(mR.properties.trackDataUpdateTimeout);
                    mR.properties.trackDataUpdateTimeout = setTimeout( () => {
                        mR.state = "trackDataUpdate";
                    }, 200);
                },
                changeSoundcloudUser: function() {
                    let mR = globals.modules.music;
                    bootbox.prompt("New soundcloud user? (Enter nothing if you don't want to change users)",function(user) {
                        if (user != "" && typeof user != "undefined" && user != null) {
                            console.log("Changing soundcloud user to: "+user);
                            SRH.request("/api/sc/changeUser/"+user);
                            mR.state = "init"; //reinit
                        }
                    });
                },
                playPauseTrack: function() {
                    SRH.request("/api/sc/event/playPause");
                },
                volUp: function() {
                    SRH.request("/api/sc/event/volumeUp");
                },
                volDown: function() {
                    SRH.request("/api/sc/event/volumeDown");
                },
                backTrack: function() {
                    SRH.request("/api/sc/event/trackBackward");
                },
                forwardTrack: function() { //can go forward one or shuffle to get to next track
                    SRH.request("/api/sc/event/trackForward");
                },
                changeLoopState: function() {
                    let mR = globals.modules.music;
                    mR.properties.nextTrackLoop = !mR.properties.nextTrackLoop;
                    SRH.request("/api/sc/event/changeTrackLoopState");
                },
                changeShuffleState: function() {
                    let mR = globals.modules.music;
                    mR.properties.nextTrackShuffle = !mR.properties.nextTrackShuffle;
                    SRH.request("/api/sc/event/changeTrackShuffleState");
                },
                playTrackRequested: function(track) {
                    let mR = globals.modules.music;
                    
                    SRH.request("/api/sc/event/clientTrackSelected?data="+track.id)
                    .then(data => {
                        mR.properties.currentPlayingTrack = track;
                        document.getElementById(mR.properties.trackArtElement).src = (!track.artwork.artworkUrl) ? mR.properties.noArtworkUrl : "http://"+window.location.host+"/api/sc/trackArt/"+track.id+".jpg";//track.artwork.artworkUrl;
                        document.getElementById(mR.properties.waveformArtElement).src = "http://"+window.location.host+"/api/sc/trackWaveform/"+track.id+".png";
                        document.getElementById(mR.properties.trackTitleElement).innerHTML = track.title;
                        document.getElementById(mR.properties.trackAuthorElement).innerHTML = "By: "+track.author;
                    })
                    .catch(error => {
                        console.error("Couldn't play track: ",error);
                        document.getElementById(mR.properties.trackTitleElement).innerHTML = "";
                        document.getElementById(mR.properties.trackAuthorElement).innerHTML = "Failed to play track because: "+((error.error)?(error.message):error);
                    })
                }
                
            },

            properties: {
                shuffleButtonElement: "music_shuffleButton",
                loopButtonElement: "music_loopButton",
                trackTitleElement: "music_trackTitle",
                trackArtElement: "music_trackArt",
                trackTimestampElement: "music_trackTimestamp",
                waveformArtElement: "music_waveformArt",
                trackListElement: "music_trackList",
                trackAuthorElement: "music_trackAuthor",
                volumeBarElement: "music_bottomVolumeBar",
                trackProgressBarElement: "music_trackProgressBar",
                backButtonElement: "music_backButton",
                forwardButtonElement: "music_forwardButton",
                playPauseButtonElement: "music_playPauseButton",

                trackDataUpdateTimeout: 0,
                oldSettingsData: {},


                playingTrack: false,
                currentVolume: 50,
                currentPlayingTrack: {},
                playerObject: { //fake so that no errors occur
                    play: function(){},
                    pause: function(){},
                    setVolume: function(){},
                    currentTime: function(){
                        return 0;
                    },
                    getDuration: function(){
                        return 1;
                    }
                }
            }
        },
        runtimeEvents: {
            moduleName: "runtimeEventListener",
            debugMode: true,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
                init: function(moduleReference) {
                    moduleReference.state = "getRuntimeInformation"; //perform initial fetch
                },
                getRuntimeInformation: function(moduleReference) {
                    if (!moduleReference) { //bck
                        moduleReference = globals.modules.runtimeEvents;
                    }

                    SRH.request("api/runtime")
                    .then(data => {
                        if (moduleReference.debugMode) {
                            console.log("RuntimeInfo: ",data);
                        }

                        moduleReference.disconnAlert = false; //reset disconn alert
                        bootbox.hideAll(); //hide the dialog if it's still up

                        globals.constants.readySteps.gotRuntimeInformation = true;
                        var keys = Object.keys(data); //only override keys from jsondat
                        for (var i=0; i<keys.length; i++) {
                            globals.constants.runtimeInformation[keys[i]] = data[keys[i]];
                        }

                        if (typeof globals.constants.runtimeInformation.heartbeatMS == "undefined") {
                            console.warn("HeartbeatMS not defined in globals; not setting timeout");
                        } else {
                            if (moduleReference.debugMode) {
                                console.log("[HB] set heartbeat timeout: "+globals.constants.runtimeInformation.heartbeatMS);
                            }

                            moduleReference.properties.heartbeatMS = Number(globals.constants.runtimeInformation.heartbeatMS)

                        }
                    }).catch( err => {
                        if (!moduleReference.disconnAlert) {
                            moduleReference.disconnAlert = true; //disable disconn alert
                            bootbox.alert("Warning: Server Currently Offline")
                        }
                        console.error("Error fetching runtime information: "+err);
                    })
                    moduleReference.state = "wait";
                },
                wait: function(moduleReference) {
                    clearTimeout(moduleReference.properties.waitTimeout); //clear previous timeout
                    moduleReference.properties.waitTimeout = setTimeout( () => {
                        if (moduleReference.debugMode) {
                            console.log("[HB] Heartbeat request runtimeinfo");
                        }
                        moduleReference.state = "getRuntimeInformation"; //set state
                    },moduleReference.properties.heartbeatMS);
                },
            },
            properties: {
                heartbeatMS: 10000,
                disconnAlert: false,
                waitTimeout: 0
            }
        },
        menu: {
            moduleName: "menuManager",
            debugMode: true,

            //STATE MACHINE LOGIC
            realState: "uninit",
            methodArguments: undefined,
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;

                    try {
                        this.realState = state;
                        if (this.methodArguments) {
                            this.methods[state](this.methodArguments,this);
                            this.methodArguments = undefined;
                        } else {
                            this.methods[state](this);
                        }
                        
                        
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },
            set arguments(args) {
                this.methodArguments = args;
            },
            get arguments() {
                return this.methodArguments;
            },

            //METHOD LOGIC
            methods: {
                init: function(moduleReference) {
                    moduleReference.arguments = globals.constants.defaultApp; //set arguments for app
                    moduleReference.state = "changeMenu";
                },
                changeMenu: function(newState, moduleReference) {
                    if (!moduleReference) { //backup moduleRef
                        moduleReference = globals.modules.menu;
                    }

                    
                    var menuStates = Object.keys(moduleReference.properties.states);
                    if (menuStates.indexOf(newState) > -1) {
                        for (var i=0; i<menuStates.length; i++) {
                            moduleReference.properties.states[menuStates[i]] = false; //set key to false
                            var uppercaseKey = (menuStates[i].substring(0,1).toUpperCase()+menuStates[i].substring(1,menuStates[i].length));
                            //console.log("resetting "+uppercaseKey+" elem and button");
                            document.getElementById(moduleReference.properties.menuButtonElement+uppercaseKey).className = "circle"; //reset button className
                            document.getElementById(moduleReference.properties.mainAppElement+uppercaseKey).style.display = "none"; //reset element display
                        }
                        moduleReference.properties.states[newState] = true;
                        var uppercaseState = (newState.substring(0,1).toUpperCase()+newState.substring(1,newState.length));
                        document.getElementById(moduleReference.properties.menuButtonElement+uppercaseState).className += " selected";
                        document.getElementById(moduleReference.properties.mainAppElement+uppercaseState).style.display = "block";


                        if (moduleReference.properties.states.music) { //enable music menu
                            document.getElementById(moduleReference.properties.musicBottomMenuElement).style.display = "block";
                            document.getElementById(moduleReference.properties.secondaryMusicVolumeBar).style.display = "block";
                        } else if (!globals.constants.runtimeInformation.dynamicMusicMenu) { //no dynamic music menu so hide it
                            document.getElementById(moduleReference.properties.musicBottomMenuElement).style.display = "none";
                            document.getElementById(moduleReference.properties.secondaryMusicVolumeBar).style.display = "none";
                        } else {
                            if (!globals.modules.music.properties.playingTrack && !globals.modules.music.properties.playingServer) {
                                document.getElementById(moduleReference.properties.musicBottomMenuElement).style.display = "none";
                                document.getElementById(moduleReference.properties.secondaryMusicVolumeBar).style.display = "none";
                            }
                        }
                        console.log("Menu newState: '"+newState+"'");
                    } else {
                        console.error("NewState for menu switch is invalid: "+newState);
                    }
                }
            },
            properties: {
                musicBottomMenuElement: "music_bottomMenu",
                secondaryMusicVolumeBar: "music_bottomVolumeBar",
                menuButtonElement: "menuButton",
                mainAppElement: "main",
                states: {
                    music: false,
                    musicLights: false,
                    roomLights: false,
                    settings: false
                }
            }
        },
        musicLightsManager: {
            moduleName: "musicLightsManager",
            debugMode: true,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
                init: function(moduleReference) {},

                lightsOn: function() {
                    SRH.request("/api/ardu/on");
                },

                lightsOff: function() {
                    SRH.request("/api/ardu/off");
                },

                lightMode: function(newMode) {
                    SRH.request("/api/ardu/settings/lightMode/"+newMode);
                },

                newValueMin: function(newVM) {
                    SRH.request("/api/ardu/settings/valueMinimum/"+newVM);
                },

                ledUpdateCount: function(newUC) {
                    SRH.request("/api/ardu/settings/ledUpdateCount/"+newUC);
                }
            },
            properties: {}
        },
        roomLightsManager: {
            moduleName: "roomLightsManager",
            debugMode: true,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
                init: function(moduleReference) {
                    moduleReference.state = "getLocationsList";
                },
                getLocationsList: function(mR) {
                    SRH.request("/api/light/locationsList").then(resp => {
                        mR.properties.locations = resp;
                        mR.state = "createLocationElements";
                    }).catch(e => {
                        console.error("Error getting location list for lights on init: "+e);
                    });
                },
                createLocationElements: function(mR) {
                    let locKeys = Object.keys(mR.properties.locations);
                    let locationContainer = document.getElementById(mR.properties.locationsContainerID);
                    for (let i=0; i<locKeys.length; i++) {
                        console.info("LOCKEY init processing: "+locKeys[i]);
                        //Part 1: create title w/text
                        let title = document.createElement("h4");
                        title.className = "leftPad";
                        title.id = "LOC"+locKeys[i];
                        let titleText = document.createTextNode(locKeys[i]+": ");
                        title.appendChild(titleText);

                        //Part 2: create up button
                        let upButton = document.createElement("button");
                        upButton.className = "PUpButton";
                        upButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.deltaLocationValue(locKeys[i], 25));
                        }
                        let upButtonText = document.createTextNode("Up 25%");
                        upButton.appendChild(upButtonText);

                        //Part 3: create down button
                        let downButton = document.createElement("button");
                        downButton.className = "PDownButton leftPad";
                        downButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.deltaLocationValue(locKeys[i], -25));
                        }
                        let downButtonText = document.createTextNode("Down 25%");
                        downButton.appendChild(downButtonText);

                        //Part 4: create on button
                        let onButton = document.createElement("button");
                        onButton.className = "POnButton";
                        onButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.sendLocationCommand(locKeys[i], 100));
                        }
                        let onButtonText = document.createTextNode("On");
                        onButton.appendChild(onButtonText);

                        //Part 5: create off button
                        let offButton = document.createElement("button");
                        offButton.className = "POffButton leftPad";
                        offButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.sendLocationCommand(locKeys[i], 0));
                        }
                        let offButtonText = document.createTextNode("Off");
                        offButton.appendChild(offButtonText);

                        //Part 6: add element to container in order
                        locationContainer.appendChild(title);
                        locationContainer.appendChild(upButton);
                        locationContainer.appendChild(downButton);
                        locationContainer.appendChild(document.createElement("br"));
                        locationContainer.appendChild(document.createElement("br"));
                        locationContainer.appendChild(onButton);
                        locationContainer.appendChild(offButton);
                    }

                    mR.state = "getDevicesList";
                },
                getDevicesList: function(mR) {
                    SRH.request("/api/light/devicesList").then(resp => {
                        mR.properties.devices = resp;
                        mR.state = "createDeviceElements";
                    }).catch(e => {
                        console.error("Error getting location list for lights on init: "+e);
                    });
                },
                createDeviceElements: function(mR) {
                    let devKeys = Object.keys(mR.properties.devices);
                    let deviceContainer = document.getElementById(mR.properties.devicesContainerID);
                    for (let i=0; i<devKeys.length; i++) {
                        console.info("DEVKEY init processing: "+devKeys[i]);
                        //Part 1: create title w/text
                        let title = document.createElement("h4");
                        title.className = "leftPad";
                        title.id = "RM"+devKeys[i];
                        let titleText = document.createTextNode(devKeys[i]+": ");
                        title.appendChild(titleText);

                        //Part 2: create up button
                        let upButton = document.createElement("button");
                        upButton.className = "PUpButton";
                        upButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.deltaDeviceNameValue(devKeys[i], 25));
                        }
                        let upButtonText = document.createTextNode("Up 25%");
                        upButton.appendChild(upButtonText);

                        //Part 3: create down button
                        let downButton = document.createElement("button");
                        downButton.className = "PDownButton leftPad";
                        downButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.deltaDeviceNameValue(devKeys[i], -25));
                        }
                        let downButtonText = document.createTextNode("Down 25%");
                        downButton.appendChild(downButtonText);

                        //Part 4: create on button
                        let onButton = document.createElement("button");
                        onButton.className = "POnButton";
                        onButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.sendDeviceNameCommand(devKeys[i], 100));
                        }
                        let onButtonText = document.createTextNode("On");
                        onButton.appendChild(onButtonText);

                        //Part 5: create off button
                        let offButton = document.createElement("button");
                        offButton.className = "POffButton leftPad";
                        offButton.onclick = function() {
                            mR.methods.domDisableOnPromise(this, mR.methods.sendDeviceNameCommand(devKeys[i], 0));
                        }
                        let offButtonText = document.createTextNode("Off");
                        offButton.appendChild(offButtonText);

                        //Part 6: add element to container in order
                        deviceContainer.appendChild(title);
                        deviceContainer.appendChild(upButton);
                        deviceContainer.appendChild(downButton);
                        deviceContainer.appendChild(document.createElement("br"));
                        deviceContainer.appendChild(document.createElement("br"));
                        deviceContainer.appendChild(onButton);
                        deviceContainer.appendChild(offButton);
                    }

                    mR.state = "updateIndices";
                },
                updateIndices: function() {
                    let mR = globals.modules.roomLightsManager;
                    mR.methods.updateIndexLocations(0); //start updating
                    mR.methods.updateIndexRooms(0); //start updating
                },
                //Workarounds for location auto percentage updating
                updateIndexLocations: index => {
                    let mR = globals.modules.roomLightsManager;
                    let hElems = document.getElementsByTagName("h4");
                    if (hElems[index].id.indexOf("LOC") > -1) {
                        mR.methods.getLocationValue(hElems[index].id.replace("LOC","")).then(value => {
                            let ih = hElems[index].innerHTML;
                            hElems[index].innerHTML = ih.split(":")[0]+": "+value+"%";
                        });
                    }

                    if (index < hElems.length-1) {
                        mR.methods.updateIndexLocations(index+1);
                    } else {
                        console.log("Index updating done for locations");
                    }
                },
                
                updateIndexRooms: index => {
                    let hElems = document.getElementsByTagName("h4");
                    let mR = globals.modules.roomLightsManager;
                    //console.log(hElems[index].id)
                    if (hElems[index].id.indexOf("RM") > -1) {
                        mR.methods.getDeviceNameValue(hElems[index].id.replace("RM","")).then(value => {
                            let ih = hElems[index].innerHTML;
                            hElems[index].innerHTML = ih.split(":")[0]+": "+value+"%";
                        })
                    }

                    if (index < hElems.length-1) {
                        mR.methods.updateIndexRooms(index+1);
                    } else {
                        console.log("Index updating done for rooms");
                    }
                },

                //Helper function to make buttons grey out while we're waiting for a response
                domDisableOnPromise: function(elem, promise) {
                    if (elem.getAttribute("disabled") != null) {
                        console.log("click registered on disabled button");
                        return false;
                    }
                    let originalClassName = JSON.parse(JSON.stringify(elem.className)); //use json hack to prevent memory from being copied
                    elem.setAttribute("disabled","");
                    elem.className+=" disabled";

                    let mR = globals.modules.roomLightsManager;
                    promise.then(() => {
                        elem.removeAttribute("disabled","");
                        elem.className = originalClassName;
                        //Update both location powers and room powers
                        mR.methods.updateIndexLocations(0);
                        mR.methods.updateIndexRooms(0);
                    }).catch(() => {
                        elem.removeAttribute("disabled","");
                        elem.className = originalClassName;
                    });
                },

                /*
                * GENERAL DEVICE ACCESSOR FUNCTIONS
                */

                getDeviceValue: function(device) {
                    return new Promise((resolve, reject) => {
                        let response = fetch("http://"+document.location.host+"/api/light/device/"+device, {
                            method: 'get'
                        }).then(res => res.json()).then(res => {
                            return resolve(res.message);
                        }).catch(e => {
                            return reject(e);
                        });
                    })
                },
                getDeviceNameValue: function(deviceName) {
                    return new Promise((resolve, reject) => {
                        let response = fetch("http://"+document.location.host+"/api/light/deviceName/"+deviceName, {
                            method: 'get'
                        }).then(res => res.json()).then(res => {
                            return resolve(res.message);
                        }).catch(e => {
                            return reject(e);
                        });
                    })
                },
                getLocationValue: function(location) {
                    return new Promise((resolve, reject) => {
                        let response = fetch("http://"+document.location.host+"/api/light/locationName/"+location, {
                            method: 'get'
                        }).then(res => res.json()).then(res => {
                            return resolve(res.message);
                        }).catch(e => {
                            return reject(e);
                        });
                    });
                },
                sendDeviceNameCommand: function(deviceName, value) { 
                    return new Promise((resolve, reject) => {
                        let response = fetch("http://"+document.location.host+"/api/light/deviceName/"+deviceName+"/"+value, {
                            method: 'post'
                        }).then(res => res.json()).then(res => {
                            console.log(JSON.stringify(res));
                            return resolve(res);
                        }).catch(e => {
                            console.error(JSON.stringify(e));
                            return reject(e);
                        });
                    });
                },
                sendDeviceCommand: function(device, value) {
                    return new Promise((resolve, reject) => {
                        let response = fetch("http://"+document.location.host+"/api/light/device/"+device+"/"+value, {
                            method: 'post'
                        }).then(res => res.json()).then(res => {
                            console.log(JSON.stringify(res));
                            return resolve(res);
                        }).catch(e => {
                            console.error(JSON.stringify(e));
                            return reject(e);
                        });
                    });
                },
                sendLocationCommand: function(loc, value) {
                    return new Promise((resolve, reject) => {
                        let response = fetch("http://"+document.location.host+"/api/light/locationName/"+loc+"/"+value, {
                            method: 'post'
                        }).then(res => res.json()).then(res => {
                            console.log(JSON.stringify(res));
                            return resolve(res);
                        }).catch(e => {
                            console.error(JSON.stringify(e));
                            return reject(e);
                        });
                    });
                },
                deltaDeviceNameValue: function(deviceName, delta) {
                    let mR = globals.modules.roomLightsManager;
                    return new Promise((resolve, reject) => {
                        mR.methods.getDeviceNameValue(deviceName).then(value => {
                            mR.methods.sendDeviceNameCommand(deviceName, Number(value)+delta).then(res => {
                                console.log(JSON.stringify(res));
                                return resolve(res);
                            }).catch(e => {
                                console.error(e);
                                return reject(e);
                            });
                        }).catch(e => {
                            console.error(e);
                        });
                    });
                },
                deltaDeviceValue: function(device, delta) {
                    let mR = globals.modules.roomLightsManager;
                    return new Promise((resolve, reject) => {
                        mR.methods.getDeviceValue(device).then(value => {
                            mR.methods.sendDeviceCommand(device, Number(value)+delta).then(res => {
                                console.log(JSON.stringify(res));
                                return resolve(res);
                            }).catch(e => {
                                console.error(e);
                                return reject(e);
                            });
                        }).catch(e => {
                            console.error(e);
                        });
                    });
                },
                deltaLocationValue: function(name, delta) {
                    let mR = globals.modules.roomLightsManager;
                    return new Promise((resolve, reject) => {
                        mR.methods.getLocationValue(name).then(value => {
                            mR.methods.sendLocationCommand(name, Number(value)+delta).then(res => {
                                console.log(JSON.stringify(res));
                                return resolve(res);
                            }).catch(e => {
                                console.error(e);
                                return reject(e);
                            });
                        }).catch(e => {
                            console.error(e);
                        });
                    });
                }
            },
            properties: {
                locations: {},
                devices: {},
                locationsContainerID: "mainRoomLights-locationsContainer",
                devicesContainerID: "mainRoomLights-devicesContainer"
            }
        },
        deviceSettingsManager: {
            moduleName: "deviceSettingsManager",
            debugMode: true,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
                init: function(mR) {
                    mR.properties.rpiTempGauge = new RadialGauge({
                        renderTo: mR.properties.rpiTempStatID,
                        width: mR.properties.gaugeWidth,
                        height: mR.properties.gaugeHeight,
                        units: "°C",
                        minValue: 0,
                        startAngle: 90,
                        ticksAngle: 180,
                        valueBox: false,
                        maxValue: 100,
                        majorTicks: [
                            "0",
                            "10",
                            "20",
                            "30",
                            "40",
                            "50",
                            "60",
                            "70",
                            "80",
                            "90",
                            "100"
                        ],
                        minorTicks: 5,
                        strokeTicks: true,
                        highlights: [
                            {
                                "from": 86,
                                "to": 100,
                                "color": "rgba(200, 50, 50, .75)"
                            }
                        ],
                        colorPlate: "#fff",
                        borderShadowWidth: 0,
                        borders: false,
                        needleType: "arrow",
                        needleWidth: 2,
                        needleCircleSize: 7,
                        needleCircleOuter: true,
                        needleCircleInner: false,
                        animationDuration: 500,
                        animationRule: "linear"
                    }).draw();


                    //Add the rest of the gauges here

                    mR.state = "statUpdate";
                },
                statUpdate: function(mR) {
                    SRH.request("/api/stat/temp").then(temp => {
                        mR.properties.rpiTempGauge.value = temp;
                    }).catch(e => {
                        mR.properties.rpiTempGauge.value = 0;
                        console.warn("Warning: error getting RPI temp for stats:",e);
                    })

                    //Add the rest of the gauges here

                    mR.state = "waitStatUpdate";
                },
                waitStatUpdate: function(mR) {
                    clearTimeout(mR.properties.statUpdateTimeout);
                    mR.properties.statUpdateTimeout = setTimeout(() => {
                        mR.state = "statUpdate";
                    }, mR.properties.statUpdateDelay);
                },
                killServer: function() {
                    bootbox.confirm("Do you want to kill the server?", res => {
                        if (res) {
                            SRH.request("/api/action/kill") //lol die server (but forever should restart it)
                        }
                    })
                }
            },
            properties: {
                gaugeWidth: 300,
                gaugeHeight: 300,

                statUpdateDelay: 1000,
                statUpdateTimeout: undefined,

                rpiTempStatID: "stats_rpiTemp",
                rpiTempGauge: undefined
            }
        },
        speechManager: {
            moduleName: "speechManager",
            debugMode: true,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
            },
            properties: {}
        },
        UIIndicators: {
            moduleName: "UIIndicators",
            debugMode: false,

            //STATE MACHINE LOGIC
            realState: "uninit",
            set state(state) { //use getter/setter logic
                if (this.debugMode) {
                    console.log("changing state in module '"+this.moduleName+"' to '"+state+"'");
                }

                if (!this.methods[state]) {
                    console.error("Cannot change state in module name "+this.moduleName+" to new state "+state+" because that method does not exist");
                } else {
                    let prevState = this.realState;
                    try {
                        this.realState = state;
                        this.methods[state](this); //run method exposed in methods
                    } catch(e) {
                        this.realState = prevState;
                        console.error("Error changing state in module name "+this.moduleName+" to new state "+state+" because '"+e+"'");
                    }
                }
            },
            get state() {
                return this.realState; //return state
            },

            //METHOD LOGIC
            methods: {
                init: function(moduleReference) { //it's okay to do this stuff concurrently because they don't depend on each other
                    moduleReference.state = "getReferenceTime";
                    moduleReference.state = "updateTime";
                },
                getReferenceTime: function(moduleReference) {
                    var timeIndicator = document.getElementById(moduleReference.properties.timeIndicatorElement);
                    SRH.request("/api/time").then(response => {
                        if (moduleReference.debugMode) {
                            console.log("Got reference time from server:",response);
                        }
                        moduleReference.properties.currentHours = response.hours;
                        moduleReference.properties.currentMinutes = response.minutes;
                        moduleReference.properties.currentSeconds = response.seconds;
                    }).catch(e => {
                        console.error("Error fetching time from server:",e);
                        timeIndicator.innerHTML = "TimeError";
                    })
                    moduleReference.state = "waitUpdateReferenceTime";
                },
                updateTime: function(moduleReference) {
                    let mP = moduleReference.properties;
                    var timeIndicator = document.getElementById(moduleReference.properties.timeIndicatorElement);
                    mP.currentSeconds += mP.timeIndicatorUpdateTime/1000; //Advance seconds
                    if (mP.currentSeconds >= 60) {
                        mP.currentSeconds = mP.currentSeconds-60;
                        mP.currentMinutes++;
                    }
                    if (mP.currentMinutes >= 60) {
                        mP.currentMinutes = mP.currentMinutes-60;
                        mP.currentHours++;
                    }
                    if (mP.currentHours >= 24) {
                        mP.currentHours = mP.currentHours-24;
                    }

                    if (moduleReference.debugMode) {
                        console.log("updateTime called; refHours="+mP.currentHours+", refMinutes="+mP.currentMinutes+", refSeconds="+mP.currentSeconds);
                    }
                    let AMPM = mP.currentHours > 12 ? "PM" : "AM";
                    let hours = ((mP.currentHours + 11) % 12 + 1); //do 24h to 12h time conversion
                    hours = Math.round(hours);
                    if (hours < 10) {
                        hours = "0"+hours;
                    }
                    let minutes = Math.round(mP.currentMinutes);
                    if (minutes < 10) {
                        minutes = "0"+minutes;
                    }
                    let seconds = Math.round(mP.currentSeconds);
                    if (seconds < 10) {
                        seconds = "0"+seconds;
                    }
                    timeIndicator.innerHTML = hours+":"+minutes+":"+seconds+" "+AMPM;

                    moduleReference.state = "waitUpdateTime";
                },
                waitUpdateTime: function(mR) {
                    clearTimeout(mR.properties.timeUpdateTimeout); //just in case
                    mR.properties.timeUpdateTimeout = setTimeout( () => {
                        mR.state = "updateTime";
                    },mR.properties.timeIndicatorUpdateTime);
                },
                waitUpdateReferenceTime: function(mR) {
                    clearTimeout(mR.properties.timeReferenceUpdateTimeout);
                    mR.properties.timeReferenceUpdateTimeout = setTimeout(() => {
                        mR.state = "getReferenceTime";
                    }, mR.properties.timeIndicatorGetReferenceTimeDelay);
                }
            },
            properties: {
                timeIndicatorGetReferenceTimeDelay: 3600*1000, //get new reference from server every hour
                timeIndicatorUpdateTime: 1000,
                timeIndicatorElement: "time",

                currentHours: 0,
                currentMinutes: 0,
                currentSeconds: 0,

                timeReferenceUpdateTimeout: 0,
                timeUpdateTimeout: 0
            }
        },

    },
    masterInit: function() {
        globals.modules.master.state = "init"; //go 4 it
    }
}