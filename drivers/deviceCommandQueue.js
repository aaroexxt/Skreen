/*
* deviceCommandQueue.js by Aaron Becker
* Implements a basic priority queueing system/command execution framework for external devices
*
* Dedicated to Marc Perkel
*
* Copyright (C) 2020, Aaron Becker <aaron.becker.developer@gmail.com>
*
*/

/*

CLIENT 1: requests Event 1
Server: queue empty, sends event 1 to device
CLIENT 2: request Event 2
Server: adds event 2 to queue (pending event 1)
CLINET 1: requests Event 3
Server: adds event 3 to queue (pending event 1)
CLIENT 2: requests event 1
Server: adds event 1 to queue (pending event 1)
Server: recieves event 1
Server: sends event 1 response to client 1 and 2
Server: proceeds to next element in queue, sends event 2 to device
ETC
*/

const debugLog = (msg, name) => {
	console.log("[DEVCMDQ"+(name ? ("-"+name) : "")+"]: "+JSON.stringify(msg).replace(/\"/g,""));
}

//Janky hack to allow resolving promises externally and to allow checking their state
//From a number of sources on google lol (I don't really remember)
function deferAndQuerableAndTimeout(timeout) {
	var res, rej;

	// Set initial state
    var isPending = true;
    var isRejected = false;
    var isFulfilled = false;

	var promise = new Promise((resolve, reject) => {
		res = resolve;
		rej = reject;

		if (timeout && timeout > 0) {
			debugLog("Timeout being set for "+timeout+"ms");
			setTimeout(() => {
				reject("TIMEOUT");
			}, timeout);
		} else {
			debugLog("No timeout set; doesn't meet conditions");
		}
	});

	// Observe the promise, saving the fulfillment in a closure scope.
    var result = promise.then(
        function(v) {
            isFulfilled = true;
            isPending = false;
            return v; 
        }, 
        function(e) {
            isRejected = true;
            isPending = false;
            throw e; 
        }
    );

    //Set accesor functions on promise (querable portion)
    promise.isFulfilled = function() { return isFulfilled; }
    promise.isPending = function() { return isPending; };
    promise.isRejected = function() { return isRejected; };

    //Set resolve/reject functions on promise (externally resolvable/rejectable)
	promise.resolve = res;
	promise.reject = rej;


	return promise;
}

class QueueItem {
	constructor(idx, lf, strictEqCheck, timeout) {
		//Initialize stuff
		this.index = idx || -1;
		this.timeout = timeout || -1;
		this.promises = [];
		this.strictEqCheck = strictEqCheck || false;

		this.lookingFor = lf;
	}

	addPromise() {
		let retPromise = deferAndQuerableAndTimeout(this.timeout);
		this.promises.push(retPromise);
		return retPromise;
	}

	checkCompletion(toMatch) {
		if (typeof this.lookingFor == "string") {
			if (this.strictEqCheck) {
				return (this.lookingFor == toMatch);
			} else {
				return (this.lookingFor.indexOf(toMatch) >= 0);
			}
		} else {
			if (toMatch.length == this.lookingFor.length) {
				for (let i=0; i<this.lookingFor.length; i++) {
					if (this.strictEqCheck) {
						if (this.lookingFor[i] != toMatch[i]) { //If any element differs
							return false;
						}
					} else {
						if (this.lookingFor[i].indexOf(toMatch[i]) < 0) { //If any element differs
							return false;
						}
					}
				}
				return true;
			} else {
				return false;
			}
		}
	}

	complete() {
		for (let i=0; i<this.promises.length; i++) {
			this.promises[i].resolve(this.lookingFor);
		}
	}
}

class DeviceQueue {
	constructor(queueName, timeout, strictEqCheck) {
		this.queueName = queueName || "unspecified";
		this.strictEqCheck = strictEqCheck || false;
		this.timeout = timeout || -1;
		debugLog("Initializing new DeviceQueue with name='"+queueName+"', timeout='"+timeout+"', strictEqCheck='"+(strictEqCheck ? "true" : "false")+"'");

		//Perform intialization
		this.queue = [];
	}

	checkCompletions(lookingFor) {
		this.prune(lookingFor); //First prune the queue tree

		let i = 0;
		while (i < this.queue.length) {
			let elem = this.queue[i];
			if (elem.checkCompletion(lookingFor)) {
				elem.complete(); //call complete on it
				this.queue.splice(i, 1); //remove the element
			} else { //If we didn't find it, increment the index
				i++;
			}
		}
	}

	prune(lookingFor) {
		//Iterate through elements in queue list
		//Iterate through each element's promises
		//If a promise has timed out/errored out, remove it
		//If all promises have been removed, then remove the queue element

		let i = 0;
		while (i < this.queue.length) {
			let elem = this.queue[i];
			let j = 0;
			while (j < elem.promises.length) {
				if (elem.promises[j].isRejected()) { //use querable property that's been added to promise
					debugLog("Pruned promise in queue idx="+i+" looking for string '"+elem.lookingFor+"' at promise index "+j, this.queueName);
					elem.promises.splice(j, 1); //remove the promise
				} else {
					j++;
				}
			}
			if (elem.promises.length == 0) {
				debugLog("Element in queue idx="+i+" looking for string '"+elem.lookingFor+"' has no more promises; removing it"), this.queueName;
				this.removeItem(i);
			} else {
				i++;
			}
		}
	}

	removeItem(idx) {
		this.queue.splice(idx, 1); //remove the element
	}

	addItem(lookingFor) {
		return new Promise((resolve, reject) => {
			debugLog("AddItem called, checking queue...", this.queueName);

			let foundQueueElem = false;
			for (let i=0; i<this.queue.length; i++) {
				let queueElem = this.queue[i];
				if (queueElem.lookingFor == lookingFor) { //We found a command in the list already
					foundQueueElem = true;
					debugLog("QueueElem matching lf string '"+lookingFor+"' found, adding promise", this.queueName);
					queueElem.addPromise().then(resp => {
						debugLog("QueueElem returned resp "+resp, this.queueName);
						return resolve(resp);
					}).catch(err => {
						debugLog("QueueElem returned err "+err, this.queueName);
						return reject(err);
					});
					break;
				}
			}

			if (!foundQueueElem) { //It wasn't in the already existent queue list
				debugLog("No matching queueElem found, adding to command list (idx: '"+this.length+"', lookingFor: '"+lookingFor+"', strictEqCheck: '"+this.strictEqCheck+"', timeout: '"+this.timeout+"'", this.queueName);
				let newItem = new QueueItem(this.length, lookingFor, this.strictEqCheck, this.timeout);
				newItem.addPromise().then(resp => {
					debugLog("QueueElem returned resp "+resp, this.queueName);
					return resolve(resp);
				}).catch(err => {
					debugLog("QueueElem returned err "+err, this.queueName);
					return reject(err);
				});
				this.queue.push(newItem);
			}
		})
	}
}

module.exports = DeviceQueue;

/*
//TEST CODE
var arduinoQueue = new DeviceQueue("TheTestQueue2", 10000, true);

arduinoQueue.addItem("testBoi1").then(() => {
	console.log("TestBoi1 A resolved");
}).catch(e => {
	console.log("TestBoi1 A error: "+e)
})
arduinoQueue.addItem("testBoi2").then(() => {
	console.log("TestBoi2 resolved");
}).catch(e => {
	console.log("TestBoi2 error: "+e)
})
arduinoQueue.addItem("testBoi1").then(() => {
	console.log("TestBoi1 B resolved");
}).catch(e => {
	console.log("TestBoi1 B error: "+e)
})

//console.log("Shoudl see testboi 1 A and B resolve...");
//pQueueManager.queue[0].complete();
*/