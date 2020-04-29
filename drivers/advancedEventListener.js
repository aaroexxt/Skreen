/*
* advancedEventListener.js by Aaron Becker
* Enables custom event registration on sockets or other dynamic data
*
* Dedicated to Marc Perkel
*
* Copyright (C) 2018, Aaron Becker <aaron.becker.developer@gmail.com>
*/

var advancedEventListener = function(object,evt) {
    if (typeof object === "undefined") {
        console.error("[NODE_UTILS] Socket undefined in initialization");
        return "error";
    }
    if (typeof evt === "undefined") {
        console.error("[NODE_UTILS] Evt undefined in initialization");
        return "error";
    }
    this.listeners = [];
    var _this = this;
    this.recvData = function(data) {
        var dat = JSON.stringify(data);
        //console.log("recvdata event data: "+((dat.length > 100)?"'data too long to show'":dat)+", list "+JSON.stringify(_this.listeners))
        var nonpersist = [];
        for (var i=0; i<_this.listeners.length; i++) {
            if (_this.listeners[i][0] == data.action || _this.listeners[i][3]) {
                try {
                    if (_this.listeners[i][2] == false || _this.listeners[i][2] == "false") { //non persistent listener
                        nonpersist.push(i); //push it to nonpersist list to remove it later
                    }
                    _this.listeners[i][1](data); //run function
                } catch(e) {
                    console.error("[UTILS] Error running function in listenerRecieve, e: "+e);
                }
            }
        }
        //console.log("nonpersist: "+JSON.stringify(nonpersist))
        for (var i=0; i<nonpersist.length; i++) {
            _this.listeners.splice(nonpersist[i],1);
        }
    }
    this.addListener = function(ev,fn) {
        if (typeof ev !== "string") {
            console.error("[UTILS] AddListener ev type not string");
        } else if (typeof fn !== "function") {
            console.error("[UTILS] AddListener fn type not function");
        } else {
            var ignoreAction = false;
            if (ev == "*") {
                ignoreAction = true;
            }
            this.listeners[this.listeners.length] = [ev,fn,false,ignoreAction];
        }
    }
    this.addPersistentListener = function(ev,fn) {
        if (typeof ev !== "string") {
            console.error("[UTILS] AddListener ev type not string");
        } else if (typeof fn !== "function") {
            console.error("[UTILS] AddListener fn type not function");
        } else {
            var ignoreAction = false;
            if (ev == "*") {
                ignoreAction = true;
            }
            this.listeners[this.listeners.length] = [ev,fn,true,ignoreAction];
        }
    }
    try {
        object.addEventListener(evt,this.recvData); //set up listener on object
    } catch(e) {
        console.warn("[NODE_UTILS] AddEventListener failed, trying addListener");
        try {
            object.addListener(evt,this.recvData);
        } catch(e) {
            console.error("[NODE_UTILS] Failed to create the event");
        }
    }
}

module.exports = advancedEventListener;