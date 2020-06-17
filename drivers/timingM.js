const http = require('http');

const debugMode = false;
const timingLog = log => {
	if (debugMode) {
		console.log("Timer: "+log);
	}
}

class timingM {
	constructor(tsArr, hubInstance) {
		console.log("timingM instantiated");
		this.tsArr = tsArr;
		this.hubInstance = hubInstance;

		//Save reference to "this"
		var self = this;

		//Determine local time by first getting public IP addr
		this.ipAddr = "0.0.0.0";
		this.ipLoc = "";
		http.get({
			host: 'ipv4bot.whatismyipaddress.com',
			port: 80,
			path: '/'
		}, function(res) {
			if (res.statusCode != 200) {
				console.error("unable to get IpAddr; exiting");
				process.exit(1);
			}

			res.on("data", function(chunk) {
				self.ipAddr = chunk;
				timingLog("Ip Addr get OK: '"+chunk+"'");

				let getFirstUpdate = (timeWait) => {
					//Start with a single time update
					self.getReferenceTime().then(time => {
						self.currentHours = time.hours;
						self.currentMinutes = time.minutes;
						self.currentSeconds = time.seconds;

						self.checkEvents(); //check for outstanding events
					}).catch(e => {
						console.error("Error: failed to get reference time for timingM e="+e+", trying again in "+timeWait+"ms (exp backoff)");
						setTimeout(() => {
							getFirstUpdate(timeWait*2);
						}, timeWait)
					})
				}

				getFirstUpdate(1000);
			});
		}).on('error', function(e) {
			console.error("unable to get cur IpAddr; exiting (e= "+e.message+")");
			process.exit(1);
		});

		//First we need to convert times to 24h date format
		var times = [];
		var level = [];
		var devices = [];
		for (let i=0; i<tsArr.length; i++) {
			let rawTime = tsArr[i].at;
			//Parse time
			let splitTime = rawTime.split(",");
			let parsedHours = Number(splitTime[0].split(":")[0]);
			let parsedMinutes = Number(splitTime[0].split(":")[1]);

			if (splitTime[1].toLowerCase() == "pm") {
				parsedHours+=12;
			} else if (parsedHours == 12 && splitTime[1].toLowerCase() == "am") {
				parsedHours = 0; //12am special case
			}

			times.push([parsedHours, parsedMinutes]);

			let maxLevel = tsArr[i].maxLevel;
			//let minLevel = tsArr[i].minLevel; TODO MINLEVEL
			level.push(maxLevel);

			let deviceList = tsArr[i].devices;
			devices.push(deviceList);
		}
		this.trgTimes = times;
		this.trgLevels = level;
		this.trgDevices = devices;
		this.enabled = true; //set enabled flag

		this.currentHours = 0;
		this.currentMinutes = 0;
		this.currentSeconds = 0;

		let internalTimeUpdateInterv = 1000; //update internal time every x ms
		let referenceTimeUpdateInterv = 3600*1000; //1 hr update reference time

		setInterval(() => {
			this.currentSeconds += internalTimeUpdateInterv/1000; //Advance seconds
            if (this.currentSeconds >= 60) {
                this.currentSeconds = this.currentSeconds-60;
                this.currentMinutes++;
            }
            if (this.currentMinutes >= 60) {
                this.currentMinutes = this.currentMinutes-60;
                this.currentHours++;
            }
            if (this.currentHours >= 24) {
                this.currentHours = this.currentHours-24;
            }
		},internalTimeUpdateInterv);

		setInterval(() => {
			this.getReferenceTime().then(time => {
				this.currentHours = time.hours;
				this.currentMinutes = time.minutes;
				this.currentSeconds = time.seconds;
			}).catch(e => {
				console.error("Error: failed to get reference time for timingM e="+e);
			})
		}, referenceTimeUpdateInterv);

		this.updateLoop = setInterval(function(){self.checkEvents()},60000); //setup interval handler to check minutes
	}

	checkEvents() {
		timingLog("CheckEvents called using ipAddr: "+this.ipAddr);
		if (!this.enabled) { //If we're not enabled
			return;
		}
		function reject(e) {
			console.warn("TimerSetting failed during event because "+e);
		}

		this.getCurrentTime().then(time => {
			//Process: once we have time, check which events could potentially be relevant and issue the appropriate request
			for (let i=0; i<this.tsArr.length; i++) {
				if (this.trgTimes[i][0] == time.hours && this.trgTimes[i][1] == time.minutes) { //event match
					timingLog("TimeEvent postcheck at "+JSON.stringify(time));
					var checkLight = index => {
						this.hubInstance.lookupDeviceName(this.trgDevices[i][index], this.trgLevels[i]).then(device => {
							//console.log("dN: "+device.identifier);
							this.hubInstance.getLightOutput(device.identifier).then(currentValue => {
								let ramp = (this.trgLevels[i] >= currentValue) ? device.rampUpTime : device.rampDownTime;
								
								var finish = () => {
									if (index < this.trgDevices[i].length-1) { //need to keep iterating
										checkLight(index+1);
									}
								}
								if (currentValue > this.trgLevels[i]) { //oop device has exceeded threshold then CLAMP it
									this.hubInstance.setLightOutput(device.identifier, this.trgLevels[i], ramp).then(() => {
										finish();
									}).catch(e => {
										return reject(e);
									});
								} else {
									finish();
								}
							}).catch(e => {
								return reject(e);
							})
						}).catch(e => {
							return reject(e); //send reject up chain
						})
					};
					checkLight(0); //start recursive function
				}
			}
		}).catch(e => console.log("Failed to getCurrentTime because: "+e));
	}

	enableTimers() {
		timingLog("Timing enabled");
		this.enabled = true;
	}

	disableTimers() {
		timingLog("Timing disabled");
		this.enabled = false;
	}

	getTimersEnabled() {
		return this.enabled;
	}

	getReferenceTime() {
		return new Promise((resolve, reject) => {
			http.get({
				host: 'worldtimeapi.org',
				port: 80,
				path: '/api/ip/'+this.ipAddr+'.json'
			}, function(res) {
				if (res.statusCode != 200) {
					console.warn("Warning: timer unable to get currentTime, statusCode="+res.statusCode);
					return reject("likely network error");
				}

				res.on("data", function(chunk) {
					try {
						var data = JSON.parse(chunk.toString());
						var d = new Date(Date.parse(data.datetime));//+(data.raw_offset*1000));
						return resolve({
							hours: d.getHours(),
							minutes: d.getMinutes(),
							seconds: d.getSeconds()
						});
					} catch(e) {
						return reject("JSON parsing error in timing time calculation");
					}
				});
			}).on('error', function(e) {
				console.warn("Warning: timer unable to get currentTime (e= "+e.message+")");
				return reject("likely network error");
			});
		});
	}

	getCurrentTime() {
		return new Promise((resolve, reject) => {
			return resolve({
				hours: this.currentHours,
				minutes: this.currentMinutes,
				seconds: this.currentSeconds
			})
		})
	}
}

module.exports = timingM;
