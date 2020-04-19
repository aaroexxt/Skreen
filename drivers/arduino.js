/*
* arduino.js by Aaron Becker
* Arduino driver to communicate with external arduino, using protocol and command buffering
*
* Dedicated to Marc Perkel
*
* Copyright (C) 2018, Aaron Becker <aaron.becker.developer@gmail.com>
*/

const serialPort = require('serialport'); //require serialport driver

var arduinoUtilities = {
    debugMode: true,
    arduinoCommandSplitChar: ";",
    arduinoCommandValueChar: "|",

    arduinoCommandBuffer: "",  //need buffer because might not recieve whole command in one recieve

    arduinoObject: undefined,
    extSettings: {},
    extInformation: {},

    sensorOverloaded: false,
    sensorUpdateListener: undefined,

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
            return reject("THIS NEEDS TO BE FINISHED TODO");
        })
    },

    connectArduino: function(arduinoAddr, extSettings, extInformation) { //start new arduino connection with
        return new Promise((resolve, reject) => {
            if (typeof extSettings == "undefined" || typeof extInformation == "undefined") {
                return reject("ExtSettings or ExtInformation undefined on arduino ConnectArduino")
            }
            try {
                arduinoUtilities.arduinoObject.close(); //attempt to close previous connection
            } catch(e){}
            arduinoUtilities.arduinoObject = new serialPort(arduinoAddr, {
                baudRate: extSettings.arduinoBaudRate,
                autoOpen: false //don't open it yet
            });
            arduinoUtilities.arduinoObject.open(function (err) { //and open the port
                if (err) { //arduino was connected in previous server iteration and was disconnected?
                    extInformation.arduinoConnected = false;
                    console.warn("[WARNING] Server running without valid arduino. Errors may occur. Once you have reconnected an arduino, you have to relaunch the start script (unless it is on the same port).");
                    arduinoUtilities.setArduinoFakeClass();
                    reject("Error opening serial port to arduino at "+arduinoAddr+" (err="+err+")");
                } else {
                    console.log("Arduino connected successfully");
                    extInformation.arduinoConnected = true;
                    arduinoUtilities.arduinoObject.on('readable', function(data) {
                        arduinoUtilities.handleArduinoData(arduinoUtilities.arduinoObject.read(), extSettings, extInformation).catch(e => {
                            console.error("[ARDUINO] HandleArduinoData failed with message: "+e);
                        }); //pass reference
                    });
                    resolve();
                }
            })
        });
    },

    handleArduinoData: function(data, extSettings, extInformation) {
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
                            arduinoUtilities.processFullCommand(arduinoUtilities.arduinoCommandBuffer,null, extSettings, extInformation);
                            resolve();
                        } catch(e) {
                            reject("Arduino handle of data failed with error message '"+e+"'");
                        }
                    } else if (split.length == 2) {
                        if (arduinoUtilities.debugMode) {
                            console.log("ARDUINO buf "+arduinoUtilities.arduinoCommandBuffer+", single value found");
                        }
                        try {
                            arduinoUtilities.processFullCommand(split[0],split[1], extSettings, extInformation);
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
                            arduinoUtilities.processFullCommand(split[0], values, extSettings, extInformation);
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

    processFullCommand: function(command, value) {

        if (arduinoUtilities.debugMode) {
            console.log("Complete command recognized: "+command+", value(s): "+JSON.stringify(value));
        }
    },

    sendCommand: function(command,value) {
        if (typeof arduinoUtilities.arduinoObject == "undefined") {
            arduinoUtilities.setArduinoFakeClass(); //if it's undefined set the fake class
        }
        if (typeof value == "undefined") {
            arduinoUtilities.arduinoObject.write(command+arduinoUtilities.arduinoCommandSplitChar);
        } else {
            arduinoUtilities.arduinoObject.write(command+arduinoUtilities.arduinoCommandValueChar+value+arduinoUtilities.arduinoCommandSplitChar);
        }
    },

    setArduinoFakeClass: function() {
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
    
