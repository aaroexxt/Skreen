/*
* airplay.js by Aaron Becker
* Manages the airplay stream used to take audio from mobile phones or other devices and stream it to the car's speakers
*
* Dedicated to Marc Perkel
*
* Copyright (C) 2018, Aaron Becker <aaron.becker.developer@gmail.com>
*
*/

const airTunes = require('nodetunes'); //where all the real work is :)
//helpful util functions
const nMap = function (number, in_min, in_max, out_min, out_max) { //number mapping
    return (number - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

const airplayUtils = {
	serverName: undefined,
	clientConnectedListeners: [],
	clientDisconnectedListeners: [],
	clientVolumeListeners: [],
	clientMetadataListeners: [],
	state: {
		clientConnected: false,
		volume: 0,
		trackTitle: "",
		artist: "",
		producers: "",
		genre: "",
		album: "",
		duration: 0
	},
	debugMode: false,
	init: airplaySettings => {
		var _this = airplayUtils;
		return new Promise( (resolve,reject) => {
			if (!airplaySettings || !airplaySettings.serverName) {
				return reject("Missing serverName or airplaySettings");
			}
			if (_this.debugMode) {
				console.log("init airplay ok with servername "+airplaySettings.serverName);
			}
			_this.serverName = airplaySettings.serverName; //this points to airplayUtils
			return resolve();
		})
	},
	startServer: () => {
		var _this = airplayUtils;
		return new Promise( (resolve, reject) => {
			_this.server = new airTunes({serverName: _this.serverName});
			_this.server.on('error', err => {
				console.error("[AIRPLAY] fatal err:");
				throw err;
			});
			_this.server.on('clientConnected', stream => {
				if (_this.debugMode) {
					console.log("[AIRPLAY] client connected to airplay");
				}
				_this.state.clientConnected = true;

				for (var i=0; i<_this.clientConnectedListeners.length; i++) {
					try {
						_this.clientConnectedListeners[i](stream);
					} catch(e) {
						console.error("Error running clientConnectedListener: "+e);
					}
				}
			});
			_this.server.on('clientDisconnected', stream => {
				if (_this.debugMode) {
					console.log("[AIRPLAY] client disconnected from airplay");
				}
				_this.state.clientConnected = false;

				for (var i=0; i<_this.clientDisconnectedListeners.length; i++) {
					try {
						_this.clientDisconnectedListeners[i](stream);
					} catch(e) {
						console.error("Error running clientDisconnectedListener: "+e);
					}
				}
			});
			_this.server.on('volumeChange', newVolume => {
				let clampedVolume = (newVolume < -30) ? -30 : (newVolume > 0) ? 0 : newVolume;
				let mappedVolume = nMap(clampedVolume, -30, 0, 0, 100); //map to 0-100 std volume range
				if (_this.debugMode) {
					console.log("[AIRPLAY] volume change: "+mappedVolume);
				}
				_this.state.volume = mappedVolume;

				for (var i=0; i<_this.clientVolumeListeners.length; i++) {
					try {
						_this.clientVolumeListeners[i](mappedVolume);
					} catch(e) {
						console.error("Error running clientVolumeListener: "+e);
					}
				}
			});
			_this.server.on('metadataChange', meta => {
				function notUndefined(prop) {
					return (typeof prop != "undefined");
				}

				if (notUndefined(meta.asal)) {
					_this.state.album = meta.asal;
				}
				if (notUndefined(meta.asar)) {
					_this.state.artist = meta.asar;
				}
				if (notUndefined(meta.ascp)) {
					_this.state.producers = meta.ascp;
				}
				if (notUndefined(meta.asgn)) {
					_this.state.genre = meta.asgn;
				}
				if (notUndefined(meta.minm)) {
					_this.state.trackTitle = meta.minm;
				}
				if (notUndefined(meta.astm)) { //in ms
					_this.state.duration = meta.astm;
				}

				if (_this.debugMode) {
					console.log("[AIRPLAY] track metadata change (parsed):",_this.state);
				}
				for (var i=0; i<_this.clientMetadataListeners.length; i++) {
					try {
						_this.clientMetadataListeners[i](_this.state);
					} catch(e) {
						console.error("Error running clientMetadataListener: "+e);
					}
				}

			});

			/*
			// Potentially useful other listeners that didn't do anything from my testing (but could possibly?)
			_this.server.on('progressChange', chg => {
				console.log("PROGCHANGE: "+chg);
			})
			_this.server.on('artworkChange', chg => {
				console.log("ARTCHANGE: ",chg);
			});
			_this.server.on('clientNameChange', chg => {
				console.log("CLINAMECHANGE: "+chg);
			})
			*/

			//Go ahead and actually start the server
			_this.server.start();
			if (_this.debugMode) {
				console.log("airplay startServer ok");
			}
			return resolve();
		})
	},
	onClientConnected: fn => {
		var _this = airplayUtils;
		return new Promise( (resolve, reject) => {
			if (typeof fn == "function") {
				_this.clientConnectedListeners.push(fn);
				if (_this.debugMode) {
					console.log("airplay attach clientConnected listener");
				}
				return resolve();
			}
			return reject("fn is not a function");
		})
	},
	onClientDisconnected: fn => {
		var _this = airplayUtils;
		return new Promise( (resolve, reject) => {
			if (typeof fn == "function") {
				_this.clientDisconnectedListeners.push(fn);
				if (_this.debugMode) {
					console.log("airplay attach clientDisconnected listener");
				}
				return resolve();
			}
			return reject("fn is not a function");
		});
	},
	onClientVolumeChange: fn => {
		var _this = airplayUtils;
		return new Promise( (resolve, reject) => {
			if (typeof fn == "function") {
				_this.clientVolumeListeners.push(fn);
				if (_this.debugMode) {
					console.log("airplay attach clientVolume listener");
				}
				return resolve();
			}
			return reject("fn is not a function");
		});
	},
	onClientMetadataChange: fn => {
		var _this = airplayUtils;
		return new Promise( (resolve, reject) => {
			if (typeof fn == "function") {
				_this.clientMetadataListeners.push(fn);
				if (_this.debugMode) {
					console.log("airplay attach clientMetadata listener");
				}
				return resolve();
			}
			return reject("fn is not a function");
		});
	}
}

module.exports = airplayUtils;