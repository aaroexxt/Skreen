/*
* arduino.js by Aaron Becker
* Arduino driver to communicate with external arduino, using protocol and command buffering
*
* Dedicated to Marc Perkel
*
* Copyright (C) 2018, Aaron Becker <aaron.becker.developer@gmail.com>
*/

const serialPort = require('serialport'); //require serialport driver
const deviceCommandQueue = require('deviceCommandQueue');

var arduinoUtilities = {
    debugMode: true,
    arduinoCommandSplitChar: ";",
    arduinoCommandValueChar: "|",

    arduinoCommandBuffer: "",  //need buffer because might not recieve whole command in one recieve

    arduinoObject: undefined,
    extSettings: {},
    extInformation: {},

    existenceCheckPresent: false,
    arduinoExists: false,

    init: function(eRuntimeSettings, eRuntimeInformation, arduinoAddr) {
        return new Promise((resolve, reject) => {
            if (typeof eRuntimeSettings == "undefined") {
                return reject("[ARDUINO] runtimeSettings undefined on init");
            } else {
                arduinoUtilities.extSettings = eRuntimeSettings;
            }
            if (typeof eRuntimeInformation == "undefined") {
                return reject("[ARDUINO] runtimeInformation undefined on init");
            } else {
                arduinoUtilities.extInformation = eRuntimeInformation;
            }
            if (typeof arduinoAddr == "undefined") {
                console.warn("[ARDUINO] library init called without address specified, must be initialized seperately");
            } else {
                arduinoUtilities.connectArduino(arduinoAddr, eRuntimeSettings, eRuntimeInformation).catch( err => {
                    return reject("[ARDUINO] connection failed with err message: "+err);
                });
            }
            return resolve(); //if it wasn't rejected then it's ok
        });
    },

    findArduino: function() {
        return new Promise((resolve, reject) => {
            var portsList = [];

            serialPort.list().then( ports => {
                ports.forEach((port) => {
                    portsList.push(port.path);
                });

                var testPortN = portNum => { //test port at number n of portsList
                    let curPortID = portsList[portNum];
                    try {
                        let curPort = new serialPort(curPortID, {
                            baudRate: arduinoUtilities.extSettings.arduinoBaudRate,
                            autoOpen: false //don't open it yet
                        });
                        curPort.open(function (err) {
                            if (err) {
                                portFailed(portNum, curPortID, "OPENING_FAIL");
                            } else {
                                //Step 1: Set max data time recv timeout
                                let dataRecvTimeout = setTimeout(() => {
                                    curPort.close();
                                    portFailed(portNum, curPortID, "DATA_RECV_TIMEOUT");
                                    clearInterval(startCmdSendInterval); //remove data send interval
                                }, arduinoUtilities.extSettings.portCheckDataTimeout);

                                //Step 2: Start sending existence check commands every 100ms
                                let startCmdSendInterval = setInterval(() => {
                                    curPort.write(arduinoUtilities.extSettings.arduinoOKCommand+arduinoUtilities.arduinoCommandSplitChar);
                                },100);

                                //Step 3: Attach readable event for when we recieve data
                                curPort.on('readable', function(dataStream) {
                                    let realData = curPort.read();
                                    if (arduinoUtilities.debugMode) {
                                        console.log("[ARDUINO] init check data recieved: '"+realData+"'");
                                    }
                                    if (realData.indexOf("EXIST|true") >= 0) {
                                        curPort.close();
                                        clearTimeout(dataRecvTimeout); //remove data recieve timeout
                                        clearInterval(startCmdSendInterval); //remove data send interval
                                        if (arduinoUtilities.debugMode) {
                                            console.log("[ARDUINO] found port: "+curPortID);
                                        }
                                        return resolve(curPortID);
                                    } else {
                                        if (arduinoUtilities.debugMode) {
                                            console.log("[ARDUINO] Currently open testing port returned garbled data: '"+realData+"'");
                                        }
                                    }
                                });
                            }
                        })
                    } catch(error) {
                        portFailed(portNum, curPortID, "PORT_CREATE_ERR");
                    }
                }

                var portFailed = (portNum, curPortID, reason) => {
                    if (typeof reason == "undefined") {
                        reason = "not specified";
                    }
                    if (typeof curPortID == "undefined") {
                        curPortID = "not specified";
                    }

                    if (portNum >= portsList.length) { //have we reached the end of the ports list?
                        return reject("Testing all ports for arduino failed; is it connected properly?");
                    } else {
                        if (arduinoUtilities.debugMode) {
                            console.log("[ARDUINO] Testing port '"+curPortID+"' failed to open because: '"+reason+"'; moving on");
                        }
                        testPortN(portNum+1); //recurse lmao
                    }
                }

                //Proper response: EXIST|true;

                if (arduinoUtilities.debugMode) {
                    console.log("[ARDUINO] PortList: "+JSON.stringify(portsList));
                    console.log("Now testing ports...");
                }
                testPortN(0); //start testing ports
            }).catch(err => {
                return reject("Error getting portList: "+err);
            })
        })
    },

    connectArduino: function(arduinoAddr) { //start new arduino connection with
        return new Promise((resolve, reject) => {
            try {
                arduinoUtilities.arduinoObject.close(); //attempt to close previous connection
            } catch(e){}
            arduinoUtilities.arduinoObject = new serialPort(arduinoAddr, {
                baudRate: arduinoUtilities.extSettings.arduinoBaudRate,
                autoOpen: false //don't open it yet
            });
            arduinoUtilities.arduinoObject.open(function (err) { //and open the port
                if (err) { //arduino was connected in previous server iteration and was disconnected?
                    console.warn("[WARNING] Server running without valid arduino. Errors may occur. Once you have reconnected an arduino, you have to relaunch the start script (unless it is on the same port).");
                    arduinoUtilities.setArduinoFakeClass();
                    reject("Error opening serial port to arduino at "+arduinoAddr+" (err="+err+")");
                } else {
                    console.log("Arduino connected successfully");
                    arduinoUtilities.arduinoObject.on('readable', function(data) { //set up readable event
                        arduinoUtilities.handleArduinoData(arduinoUtilities.arduinoObject.read()).catch(e => {
                            console.error("[ARDUINO] HandleArduinoData failed with message: "+e);
                        }); //pass reference
                    });
                    resolve();
                }
            })
        });
    },

    handleArduinoData: function(data) {
        return new Promise( (resolve, reject) => {
            var sdata = String(data).split("");
            for (var i=0; i<sdata.length; i++) {
                if (sdata[i] == arduinoUtilities.arduinoCommandSplitChar) {
                    var split = arduinoUtilities.arduinoCommandBuffer.split(arduinoUtilities.arduinoCommandValueChar);
                    if (split.length == 1) {
                        if (arduinoUtilities.debugMode) {
                            console.log("ARDUINO buf "+arduinoUtilities.arduinoCommandBuffer+", no value in command");
                        }
                        try {
                            arduinoUtilities.processCommandNoArg(arduinoUtilities.arduinoCommandBuffer);
                            resolve();
                        } catch(e) {
                            reject("Arduino handle of data failed with error message '"+e+"'");
                        }
                    } else if (split.length == 2) {
                        if (arduinoUtilities.debugMode) {
                            console.log("ARDUINO buf "+arduinoUtilities.arduinoCommandBuffer+", single value found");
                        }
                        try {
                            arduinoUtilities.processCommandSingleArg(split[0], split[1]);
                            resolve();
                        } catch(e) {
                            reject("Arduino handle of data failed with error message '"+e+"'");
                        }
                    } else if (split.length > 2) {
                        if (arduinoUtilities.debugMode) {
                            console.log("ARDUINO buf "+arduinoUtilities.arduinoCommandBuffer+", multiple values found");
                        }
                        var values = [];
                        for (var i=1; i<split.length; i++) {
                            values.push(split[i]);
                        }
                        try {
                            arduinoUtilities.processCommandMultiArg(split[0], values);
                            resolve();
                        } catch(e) {
                            reject("Arduino handle of data failed with error message '"+e+"'");
                        }
                    }
                    arduinoUtilities.arduinoCommandBuffer = "";
                } else {
                    arduinoUtilities.arduinoCommandBuffer+=sdata[i]; //if it's not recognized, just add it to the buffer
                }
            }
        });
    },

    processCommandNoArg: function(command) {
    },

    processCommandSingleArg: function(command, value) {
        if (command.toLowerCase().indexOf("exist") >= 0) { //Set exists flag
            arduinoUtilities.arduinoExists = true;
        }
    },

    processCommandMultiArg: function(command, value) {

    },

    setupExistenceCheck: function(runtimeInfo) {
        return new Promise((resolve, reject) => {
            if (arduinoUtilities.existenceCheckPresent) {
                console.warn("[ARDUINO] Existence check has already been started");
                return reject();
            } else {
                arduinoUtilities.existenceCheckPresent = true;

                setInterval( () => {
                    if (arduinoUtilities.debugMode) {
                        console.log("[ARDUINO] existence check testing start");
                    }
                    //Step 0: set flag false
                    arduinoUtilities.arduinoExists = false;

                    //Step 1: Set max data time recv timeout
                    let dataRecvTimeout = setTimeout(() => {
                        console.log("[ARDUINO] existence testing finished; Arduino disconnected");
                        runtimeInfo.arduinoConnected = false;
                        clearInterval(startCmdSendInterval);
                    }, arduinoUtilities.extSettings.portCheckDataTimeout);

                    //Step 2: Start sending existence check commands every 100ms
                    let startCmdSendInterval = setInterval(() => {
                        arduinoUtilities.arduinoObject.write(arduinoUtilities.extSettings.arduinoOKCommand+arduinoUtilities.arduinoCommandSplitChar);
                        if (arduinoUtilities.arduinoExists) {
                            if (arduinoUtilities.debugMode) {
                                console.log("[ARDUINO] existence testing finished; arduino passed existence check");
                            }
                            //Clear intervals and timeouts
                            clearInterval(startCmdSendInterval);
                            clearTimeout(dataRecvTimeout);
                            runtimeInfo.arduinoConnected = true;
                        }
                    },100);

                }, arduinoUtilities.extSettings.arduinoCheckPresentInterval);

                return resolve();
            }
        });
    },

    sendCommand: function(command,value) {
        if (typeof arduinoUtilities.arduinoObject == "undefined") {
            arduinoUtilities.setArduinoFakeClass(); //if it's undefined set the fake class in case it hasn't been done already
        }
        if (typeof value == "undefined") {
            arduinoUtilities.arduinoObject.write(command+arduinoUtilities.arduinoCommandSplitChar);
        } else {
            arduinoUtilities.arduinoObject.write(command+arduinoUtilities.arduinoCommandValueChar+value+arduinoUtilities.arduinoCommandSplitChar);
        }
    },

    setArduinoFakeClass: function() { //Allows "emulation" of fake class in order to allow code to run normally on system without arduino connected
        arduinoUtilities.arduinoObject = { //make a fake arduino class so that server doesnt fail on write
            write: function(t) {
                console.warn("[WARNING] Arduino.write method called with no arduino connected, data is literally going nowhere");
            },
            read: function() {
                return "";
            }
        }
    }
}

module.exports = arduinoUtilities;
    
