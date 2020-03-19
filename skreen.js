#!/usr/bin/env node
/*
* COSserver.js by Aaron Becker
* Skreen Node.JS Server
*
* Dedicated to Marc Perkel
*/

/*
 * Copyright (c) 2018 Aaron Becker <aaron.becker.developer@gmail.com>
 *
 * This software is provided 'as-is', without any express or implied
 * warranty. In no event will the authors be held liable for any damages
 * arising from the use of this software.
 *
 * Permission is granted to anyone to use this software for any purpose,
 * including commercial applications, and to alter it and redistribute it
 * freely, subject to the following restrictions:
 *
 *    1. The origin of this software must not be misrepresented; you must not
 *    claim that you wrote the original software. If you use this software
 *    in a product, an acknowledgment in the product documentation would be
 *    appreciated but is not required.
 *
 *    2. Altered source versions must be plainly marked as such, and must not
 *    be misrepresented as being the original software.
 *
 *    3. This notice may not be removed or altered from any source
 *    distribution.
 */

/*
---- CODE LAYOUT ----

This descriptor describes the layout of the code in this file.
2 main phases: Initialization (I1-I16) and Runtime Code (R1)

Initialization (16 steps):
1) Module Initialization: initalizes modules that are required later on, root check, very early stuff
2) Runtime Info/Settings: Reads and parses runtime information and settings from external JSON file, essential for later on
3) State Machine Init: Initializes state machine that keeps track of the state of each module
4) Console Colors: overrides prototypes for console to provide colors in console
5) File Logging Setup: Initializes file logging handlers for functions that output to console
6) Serial Device Logic: Reads command line arguments and determines valid serial devices to connect to. Also opens a serial port if a valid device is found
7) Arduino Command Handling: defines handling of arduino commands
8) Data File Parsers: parses files that contain information like data for commands and responses for speech matching
9) Neural Network Setup: sets up and trains neural network for processing of speech commands
10) Reading From Stdin: initializes handlers for reading from stdin (arduino commands from stdin)
11) Error and Exit Handling: initializes error & exit (Ctrl+C) handlers
12) Soundcloud Init Code: Initializes soundcloud (from ext file soundManager) and starts caching of soundcloud files to server
13) OpenCV Init Code: Initializes and trains OpenCV model for facial recognition
14) Mapping Init Code: Initializes and loads offline map data for display in Leaflet maps
15) Oled Driver Init: Initializes OLED driver for external oled display. (update set in misc init code)
16) Misc. Init Code: Initializes loops for tracking runtimeInformation and sending to clients, as well as listener for terminal resize. Also sends information to oled

Runtime Code (1 step):
1) HTTP Server Setup/Handling: sets up server
-Initializes all dependencies for secure server, including
	- Passport.js
	- Express.js
	- and a bunch of other stuff
-Initializes all HTTP paths and exposes API
-Initializes Passport.JS and sets up routing to user database
*/

/**********************************
--I1-- MODULE INITIALIZATION --I1--
**********************************/
const fs = require('fs');
const utils = require('./drivers/utils.js'); //include the utils file
const path = require('path');
const singleLineLog = require('single-line-log').stdout; //single line logging

var cwd = __dirname;
process.title = "Skreen V1";

/**********************************
--I2-- RUNTIME INFO/SETTINGS --I2--
**********************************/
var PRODUCTIONMODE = false;
var runtimeSettings = {}; //holds settings like maximum passcode tries
var runtimeInformation = {}; //holds information like version, arduino. Updated while running
var soundcloudSettings = {};
var neuralSettings = {};
var airplaySettings = {};

try {
	var settingsData = JSON.parse(fs.readFileSync(path.join(cwd,"/data/settings.json")));
} catch(e) {
	console.error("[FATAL] Error reading info/settings file");
	throw "[FATAL] Error reading info/settings file";
}

function shallowCopy(from, to) {
	let keys = Object.keys(from); //only override keys from settingsData
	for (var i=0; i<keys.length; i++) {
		to[keys[i]] = from[keys[i]];
	}
}

shallowCopy(settingsData.information, runtimeInformation);
shallowCopy(settingsData.soundcloudSettings, soundcloudSettings);
shallowCopy(settingsData.settings, runtimeSettings);
shallowCopy(settingsData.neuralSettings, neuralSettings);
shallowCopy(settingsData.airplaySettings, airplaySettings);

PRODUCTIONMODE = settingsData.PRODUCTION; //production mode?
runtimeSettings.loginMessage = settingsData.loginMessage;

//console.clear();
console.log("~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-\nSkreen V1\nBy Aaron Becker\nPORT: "+runtimeSettings.serverPort+"\nCWD: "+cwd+"\nPID: "+process.pid+"\n~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-\n");

/*******************************
--I3-- STATE MACHINE INIT --I3--
*******************************/
//UNNEEDED COMPLEXITY, so I didn't implement it
//const stateMachine = require('./drivers/stateMachine.js');

/***************************
--I4-- CONSOLE COLORS --I4--
****************************/

var colors = require('colors');

const originalWarn = console.warn;
const originalErr = console.error;
const originalInfo = console.info;
const originalLog = console.log;

if (runtimeSettings.loginMessage && runtimeSettings.loginMessage[0] && runtimeSettings.loginMessage[1]) {
	originalLog(colors.italic.bold.green(runtimeSettings.loginMessage[0]));
	for (var i=1; i<runtimeSettings.loginMessage.length-1; i++) {
		originalLog(runtimeSettings.loginMessage[i]);
	}
	originalLog(colors.italic.bold.green(runtimeSettings.loginMessage[runtimeSettings.loginMessage.length-1]));
} else {
	originalErr(colors.red("No runtimeMessage provided in json config when it is required"));
}
if (PRODUCTIONMODE) {
	originalLog(colors.blue("PRODUCTION_MODE is enabled, will only show important information"));
	runtimeSettings.logLevel = 1; //set to errors only
	singleLineLog.clear();
	setInterval( () => {
		var statusStr = "-- Status: "+colors.green(runtimeInformation.status)+" ~~ Uptime: "+colors.green(runtimeInformation.uptime)+" ~~ Users: "+colors.green(runtimeInformation.users)+" --";
		singleLineLog(statusStr);
	},500);
}

if (runtimeSettings.logLevel < 4) {
	originalLog(colors.cyan("Overriding console.log because logLevel="+runtimeSettings.logLevel+" is too low"));
	console.log = function(){};
}

if (runtimeSettings.logLevel >= 3) {
	console.info = function(){
		if (arguments.length > 1) {
			var firstArg = arguments[0];
			var restArgs = [];
			for (var i=1; i<arguments.length; i++) {
				restArgs.push(arguments[i]);
			}
			originalInfo(colors.blue.underline(firstArg),restArgs);
		} else {
			originalInfo(colors.blue.underline(arguments[0]));
		}
	}
} else {
	originalLog(colors.cyan("Overriding console.info because logLevel="+runtimeSettings.logLevel+" is too low"));
	console.info = function(){};
}

if (runtimeSettings.logLevel >= 2) {
	console.warn = function(){
		if (arguments.length > 1) {
			var firstArg = arguments[0];
			var restArgs = [];
			for (var i=1; i<arguments.length; i++) {
				restArgs.push(arguments[i]);
			}
			originalWarn(colors.yellow.underline(firstArg),restArgs);
		} else {
			originalWarn(colors.yellow.underline(arguments[0]));
		}
	}
} else {
	originalLog(colors.cyan("Overriding console.warn because logLevel="+runtimeSettings.logLevel+" is too low"));
	console.warn = function(){}; //redir to empty function
}

if (runtimeSettings.logLevel >= 1) {
	console.error = function(){
		if (arguments.length > 1) {
			var firstArg = arguments[0];
			var restArgs = [];
			for (var i=1; i<arguments.length; i++) {
				restArgs.push(arguments[i]);
			}
			originalErr(colors.red.underline(firstArg),restArgs);
		} else {
			originalErr(colors.red.underline(arguments[0]));
		}
	}
} else {
	originalLog(colors.cyan("Overriding console.error because logLevel="+runtimeSettings.logLevel+" is too low"));
	originalWarn(colors.yellow.underline("[WARNING] No logging enabled, will not show any more messages. You might want to disable this to logLevel=1 because you won't see any errors"));
	console.error = function(){}; //redir to empty function
}

console.importantInfo = function(){
	if (arguments.length > 1) {
		var firstArg = arguments[0];
		var restArgs = [];
		for (var i=1; i<arguments.length; i++) {
			restArgs.push(arguments[i]);
		}
		originalInfo("\n"+colors.cyan.bold.underline(firstArg),restArgs);
	} else {
		originalInfo("\n"+colors.cyan.bold.underline(arguments[0]));
	}
}
console.importantLog = function(){
	if (arguments.length > 1) {
		var firstArg = arguments[0];
		var restArgs = [];
		for (var i=1; i<arguments.length; i++) {
			restArgs.push(arguments[i]);
		}
		originalLog("\n"+colors.white.bold(firstArg),restArgs);
	} else {
		originalLog("\n"+colors.white.bold(arguments[0]));
	}
}

/********************************
--I5-- FILE LOGGING SETUP --I5--
********************************/

const loggingUtils = require("./drivers/logging.js");

const semiOriginalLog = console.log;
const semiOriginalWarn = console.warn;
const semiOriginalInfo = console.info;
const semiOriginalError = console.error;
const semiOriginalIInfo = console.importantInfo;
const semiOriginalILog = console.importantLog;

loggingUtils.init(cwd, runtimeSettings).then( () => {
	console.importantLog("Logging master init ok (1/4)");

	try {
		console.log = function() {
			loggingUtils.log(arguments,"log");
			semiOriginalLog.apply(null, arguments);
		}

		console.warn = function() {
			loggingUtils.warn(arguments,"warn");
			semiOriginalWarn.apply(null, arguments);
		}

		console.error = function() {
			loggingUtils.error(arguments,"error");
			semiOriginalError.apply(null, arguments);
		}

		console.importantLog = function() {
			loggingUtils.ilog(arguments,"ilog");
			semiOriginalILog.apply(null, arguments);
		}

		console.importantInfo = function() {
			loggingUtils.iinfo(arguments,"iinfo");
			semiOriginalIInfo.apply(null, arguments);
		}

		console.importantLog("Logging commands init ok (2/4)");

		loggingUtils.registerValidationInterval();
		console.importantLog("Logging validationListener init ok (3/4)");



		console.importantInfo("LOGGING INIT OK");
	} catch(e) {
		console.error("Logging init error: "+e);
	}
	
}).catch( err => {
	console.error("Error initializing logger: "+err);
});

/*************************************
--I7-- ARDUINO COMMAND HANDLING --I7--
*************************************/

var arduinoUtils = require('./drivers/arduino.js'); //require the driver
//console.log("Serial device from start script: "+serialDevice);
arduinoUtils.init(runtimeSettings, runtimeInformation).then(() => {
	console.importantLog("Arduino driver initialized successfully (1/4)");
	arduinoUtils.findArduino().then(arduinoAddr) {
		console.importantLog("Arduino located on serial port successfully (2/4)");
		arduinoUtils.connectArduino(serialDevice, runtimeSettings, runtimeInformation).then( () => {
			console.importantLog("Arduino connected successfully (3/4)");
			arduinoUtils.enableSensorUpdates(runtimeSettings, runtimeInformation).then( () => {
				console.importantLog("Arduino sensor updates enabled (4/4)");
				console.importantInfo("ARDU INIT OK");
			}).catch( err => {
				console.error("Ardu init error (enabling sensorupdates): "+err);
			});
		}).catch( err => {
			console.error("Failed to connect to arduino for the following reason: '"+err+"'");
		});
	}.catch(err) => {
		console.warn("[WARNING] Server running without arduino. Errors may occur. Once you have connected an arduino, you have to relaunch the start script.");
		console.importantInfo("ARDU INIT ERR: NO ARDU CONNECTED (reason: "+err+")");
		arduinoUtils.setArduinoFakeClass();
	}
}).catch( err => {
	console.error("Arduino driver failed to initialize for the following reason: '"+err+"'");
}) //setup arduino object and libs

/*********************************
--I9-- NEURAL NETWORK SETUP --I9--
*********************************/

const NeuralMatcher = require('./drivers/neuralMatcherCommandWrapper.js');
NeuralMatcher.init(neuralSettings)
.then( () => {
	console.importantInfo("NEURAL_MATCHER INIT OK");
})
.catch( err => {
	console.error("Error initializing NeuralCommandMatcher: "+err);
});

/*******************************
--I10-- READING FROM STDIN --I10--
*******************************/

var stdinput = process.openStdin();
var stdinputListener = new utils.advancedEventListener(stdinput,"data");
var sendArduinoMode = false;
stdinputListener.addPersistentListener("*",function(d) {
	var uI = d.toString().trim();
	console.log("you entered: [" + uI + "]");
	if (uI == "help") {
		console.importantLog("Right now, sA or sendArduinoMode toggles sending raw to arduino.")
	} else if (uI == "sA" || uI == "sendArduinoMode") {
		sendArduinoMode = !sendArduinoMode;
		console.importantLog("Send arduino mode toggled ("+sendArduinoMode+")");
	} else {
		if (sendArduinoMode) {
			arduinoUtils.sendCommand(uI);
		} else {
			console.importantLog("Command not recognized");
		}
	}
});

/************************************
--I11-- ERROR AND EXIT HANDLING --I11--
************************************/

process.on('SIGINT', function (code) { //on ctrl+c or exit
	console.importantLog("\nSIGINT signal recieved, graceful exit (garbage collection) w/code "+code);
	runtimeInformation.status = "Exiting";
	arduinoUtils.sendCommand("status","Exiting");
	console.importantLog("Exiting in 1500ms");
	setTimeout(function(){
		process.exit(); //exit completely
	},1500);
});

process.on('uncaughtException', function (err) { //on error
	console.importantLog("\nCRASH REPORT\n-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~\nError:\n"+err+"\n-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~-~\n");
	console.importantLog("Exiting in 1500ms");
	console.importantLog("\nError signal recieved, graceful exiting (garbage collection)");
	arduinoUtils.sendCommand("status","Error");
	runtimeInformation.status = "Error";
	process.exit();
});
process.on('unhandledRejection', (reason, p) => {
    console.error("Unhandled Promise Rejection at: Promise ", p, " reason: ", reason);
    process.exit();
});

/***********************************
--I12-- MUSIC INIT CODE --I12--
***********************************/
var soundManager = require('./drivers/soundManager.js');


console.info("Starting SC MASTER");
soundManager.init(soundcloudSettings, airplaySettings, cwd).then( () => {
	console.importantInfo("SM INIT OK");
}).catch( err => {
	console.error("Error initializing SC: "+err);
});

/*******************************
--I14-- Mapping Init Code --I14--
*******************************/

var mapReady = false;

console.log("Initializing Mapping");
const mapUtils = require('./drivers/mapping.js');
mapUtils.init(cwd, runtimeSettings).then( () => {
	console.importantInfo("MAP INIT OK");
	mapReady = true; //set ready flag
}).catch( err => {
	console.error("Error initializing map: "+err);
	mapReady = false;
}); //initialize (async)



/******************************
--I16-- MISC. INIT CODE --I16--
******************************/

var statusUpdateInterval = setInterval(function(){
	var time = process.uptime();
	var uptime = utils.formatHHMMSS(time); //rts.uptime
	runtimeInformation.uptime = uptime;
	sessionFileStore.length(function session_count(a,len) {
		runtimeInformation.users = len;
	});  //rts.users
},1000);
runtimeInformation.status = "Running";

/***************************************
--R1-- HTTP SERVER SETUP/HANDLING --R1--
***************************************/

//Much love to Evan Gow for his great tutorial at https://medium.com/@evangow/server-authentication-basics-express-sessions-passport-and-curl-359b7456003d

/****
DEPS
*****/

//express deps
const express = require("express");
const errorHandler = require('errorhandler');
//init the routers
var APIrouter = express.Router();
var SCrouter = express.Router();
var AUTHrouter = express.Router();
var MAProuter = express.Router();

const session = require('express-session');
const FileStore = require('session-file-store')(session);

//create app instance
const app = express();
const server = require('http').Server(app);

//express modules
const serveFavicon = require('serve-favicon');
const bodyParser = require('body-parser');
const cors = require('cors');

//authentication deps
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const CustomStrategy = require('passport-custom').Strategy;

const bcrypt = require('bcrypt');
const jsonDB = require('node-json-db');

const db = new jsonDB(runtimeSettings.jsonDBPath, true, false); //connect to json-database

/****
CONSTANTS
****/

const RequestHandler = {
	SUCCESS: function(message) {
		if (typeof message == "undefined") {
			message = "";
		}
		return JSON.stringify({"error": false, "wait": false, "message": message});
	},
	FAILURE: function(message) {
		if (typeof message == "undefined") {
			message = "";
		}
		return JSON.stringify({"error": true, "wait": false, "message": message});
	},
	WAIT: function(message) {
		if (typeof message == "undefined") {
			message = "";
		}
		return JSON.stringify({"error": false, "wait": true, "message": message});
	}
}

/****
INIT MODS
*****/

console.log("[AUTH] Init modules begun");

app.use(errorHandler({ dumpExceptions: true, showStack: true })); 
app.use(serveFavicon(path.join(cwd,runtimeSettings.faviconDirectory))); //serve favicon
app.use(cors()); //enable cors

app.use(express.static(path.join(cwd,runtimeSettings.assetsDirectory))); //define a static directory

app.use(bodyParser.urlencoded({ extended: true })); //, limit: '50mb' })); //bodyparser for getting json data, big limit for images
app.use(bodyParser.json());

const sessionFileStore = new FileStore(); //create the session file store

app.use(session({
	genid: (req) => {
		console.log('Inside UUID-generation');
		return utils.generateUUID(); // use UUIDs for session IDs
	},
	store: sessionFileStore, //filestore for sessions
	secret: "k3yB0ARdC@3t5s!", //set secret to new ID
	resave: false,
	saveUninitialized: true
}));

app.use(passport.initialize()); //passport.js init
app.use(passport.session());

/****
INIT STRATS
*****/

console.log("[AUTH] Init strategies begun");
// configure passport.js to use the local strategy
passport.use(new LocalStrategy(
  { usernameField: 'name' },
  (name, password, done) => {
	console.log('Passport localStrategy found, looking up user w/name: '+name+", passwd: "+password);
	try {
		let allUserData = db.getData("/users/");
		for (var i=0; i<allUserData.length; i++) {
			if (allUserData[i].name == name) { //Is the name the same? Okay we located the user
				if (!bcrypt.compareSync(password, allUserData[i].password)) {
					req.session.regularAttemptNumber++;
					return done(null, false, { message: 'Invalid credentials: password invalid.\n' });
				} else {
					req.session.regularAttemptNumber = 0;
					return done(null, allUserData[i]);
				}
			}
		}
		req.session.regularAttemptNumber++;
		return done(null, false, { message: 'Invalid credentials: user not found (und in db).\n' });
	} catch (e) {
		req.session.regularAttemptNumber++;
		return done(null, false, { message: 'Invalid credentials: user not found (err in db lookup).\n' });
	}
  }
));
passport.use('passcode', new CustomStrategy( function(req, done) {
	if (typeof req.body.passcode !== "undefined") {
		console.log("psc entered="+req.body.passcode);
		let passcodes = db.getData("/passcodes/");
		let pscUser = db.getData("/passcodeUser/");
		for (var i=0; i<passcodes.length; i++) {
			if (bcrypt.compareSync(String(req.body.passcode), passcodes[i])) {
				req.session.passcodeAttemptNumber = 0;
				return done(null, pscUser);
			}
		}
		req.session.passcodeAttemptNumber++;
		return done(null, false, { message: 'Passcode invalid.\n' });
	} else {
		req.session.passcodeAttemptNumber++;
		console.log("no psc entered?");
		return done(null, false, { message: 'No passcode entered\n' });
	}
}));

//User serialization and deserialization
passport.serializeUser((user, done) => {
	console.log("Serializing user with id: "+user.id);
	done(null, user.id);
});

passport.deserializeUser((id, done) => {
	console.log("Deserializing user with id: "+id);
	  try {
	  	let pscUser = db.getData("/passcodeUser/");
	  	if (id == pscUser.id) {
	  		return done(null, pscUser);
	  	} else {
			let allUserData = db.getData("/users/");
			for (var i=0; i<allUserData.length; i++) {
				if (allUserData[i].id == id) {
					return done(null, allUserData[i]);
				}
			}
			console.warn("Couldn't find user w/id "+id+" in db when deserializing");
			return done("Couldn't find user in db when deserializing", false);
		}
	} catch (e) {
		return done(e, false);
	}
});

/****
INIT ROUTES
*****/

app.use(function(req, res, next) { //default listener that sets session values
	//Ensure that session stores passcode attempts
	if (!req.session.passcodeAttemptNumber) {
		req.session.passcodeAttemptNumber = 0;
	}
	if (!req.session.regularAttemptNumber) {
		req.session.regularAttemptNumber = 0;
	}

	if (req.session.regularAttemptNumber > runtimeSettings.maxRegularAttempts || req.session.passcodeAttemptNumber > runtimeSettings.maxPasscodeAttempts) {
		return res.end(401, RequestHandler.FAILURE("Error: too many attempts"));
	} else {
		next();
	}
});

//MAIN ROUTES
app.get("/client", function(req, res, next) { //COS main route
	console.log(JSON.stringify(req.session)+" session");

	console.log('Inside GET /authrequired callback')
	console.log(`User authenticated? ${req.isAuthenticated()}`)
	if(req.isAuthenticated() || runtimeSettings.disableLogin) {
		fs.readFile(path.join(cwd,runtimeSettings.defaultFileDirectory,runtimeSettings.defaultClientFile), function (err, buf) {
			if (err) {
				res.end("Error reading client file (this shouldn't happen?)");
			} else {
				//res.setHeader('Content-Type', 'text/html')
				res.end(buf);
			}
		})
	} else {
		res.redirect('/login');
	}
});

app.get('/login', (req, res) => {
    console.log('Inside GET request on /login, sessID: '+req.sessionID);
    if (req.isAuthenticated() || runtimeSettings.disableLogin) {
        res.redirect("/client");
    } else {
		console.log('Inside GET /login callback')
		fs.readFile(path.join(cwd,runtimeSettings.defaultFileDirectory,runtimeSettings.defaultLoginFile), function (err, buf) {
			if (err) {
				next(err); //pass err to express
			} else {
				//res.setHeader('Content-Type', 'text/html')
				res.end(buf);
			}
		});
    }
})

//AUTH ROUTES
AUTHrouter.get('/regular', (req, res, next) => {
    res.redirect("/login");
});
AUTHrouter.post('/regular', (req, res, next) => {
    console.log('Inside POST request on /loginRegular, sessID: '+req.sessionID)
    passport.authenticate('local', (err, user, info) => {
        if(info) {return res.send(RequestHandler.FAILURE(info.message))}
        if (err) { return next(err); }
        if (!user) { return res.redirect('/login'); }
        req.login(user, (err) => {
          if (err) { return next(err); }
          console.log("You were authenticated :)")
          return res.end(RequestHandler.SUCCESS());
        })
    })(req, res, next);
});

AUTHrouter.get('/passcode', (req, res, next) => {
    res.redirect("/login");
});
AUTHrouter.post('/passcode', bodyParser.json(), (req, res, next) => {
    console.log('Inside POST request on /loginPasscode, sessID: '+req.sessionID)
    passport.authenticate('passcode', (err, user, info) => {
        if(info) {return res.send(RequestHandler.FAILURE(info.message))}
        if (err) { return next(err); }
        if (!user) { return res.redirect('/login'); }
        req.login(user, (err) => {
          if (err) { return next(err); }
          console.log("You were authenticated :)");
          //return res.redirect('/authrequired');
          return res.end(RequestHandler.SUCCESS());
        })
    })(req, res, next);
});

//API ROUTES
APIrouter.use(function(req, res, next) { //Middleware to check whether the user is authenticated
	console.log("API endpoint targeted; checking authentication...");
	if(req.isAuthenticated() || runtimeSettings.disableLogin) {
		next();
	} else {
		return res.end(401, RequestHandler.FAILURE("Error: Not authenticated to make API request to APIRouter"));
	}
});

APIrouter.get("/isup", function(req, res) {
	res.status(200);
	res.end(RequestHandler.SUCCESS());
});
APIrouter.get("/runtime", function(req, res) {
	res.end(RequestHandler.SUCCESS(runtimeInformation));
});
APIrouter.get("/session", function(req, res) {
	let authenticated = req.isAuthenticated();
	let sessionAttemptsData = {"passcode": req.session.passcodeAttemptNumber, "regular": req.session.regularAttemptNumber};
	let id = req.sessionID;
	return res.end(RequestHandler.SUCCESS({authenticated: authenticated || false, id: id || -1, attempts: sessionAttemptsData}));
});
APIrouter.get("/speech/:data", function(req, res) {
	try {
		var speechData = JSON.parse(req.params.data);
	} catch(e) {
		return res.end(RequestHandler.FAILURE("Error: Failed to parse speech data. Is it in the form of an array?"));
	}
    if (speechNetReady) {
        console.log("processing speech: '"+JSON.stringify(speechData)+"'");
        var classifiedSpeech = []; //array to hold speech that is classified
        if (speechData.constructor === Array) { //array of possibilities?
            var classifications = []; //array of potential classifications
            for (var i=0; i<speechData.length; i++) { //part 1: get all possibilities
                console.log("running speech possibility: "+speechData[i]);
                var classification = neuralMatcher.algorithm.classify(speechClassifierNet, speechData[i]);
                if (classification.length > 0) {
                    classifiedSpeech.push(speechData[i]);
                }
                console.log("Speech classification: "+JSON.stringify(classification));
                for (var j=0; j<classification.length; j++) {
                    var category = classification[j][0];
                    var confidence = classification[j][1];

                    var contains = false;
                    var containIndex = -1;
                    for (var b=0; b<classifications.length; b++) {
                        if (classifications[b][0] == category) {
                            contains = true;
                            containIndex = b;
                        }
                    }
                    if (contains) {
                        console.log("contains, push _ cat="+category+", conf="+confidence);
                        classifications[containIndex][1].push(confidence);
                    } else {
                        console.log("no contain, not averaging _ cat="+category+", conf="+confidence);
                        classifications[classifications.length] = classification[j];
                        classifications[classifications.length-1][1] = [classifications[classifications.length-1][1]];
                    }
                }
            }
            var max = 0;
            for (var i=0; i<classifications.length; i++) { //part 2: total possibilities
                if (classifications[i][1].length > 1) {
                    console.log("averaging "+JSON.stringify(classifications[i][1]));
                    var tot = 0;
                    var len = classifications[i][1].length;
                    for (var j=0; j<classifications[i][1].length; j++) {
                        tot += classifications[i][1][j];
                    }
                    var avg = tot/len;
                    if (tot > max) {
                        max = tot;
                    }
                    console.log("avg="+avg+", tot="+tot)
                    classifications[i][1] = avg*tot; //multiply by total to weight more answers (I know this results in just total)
                }
            }
            for (var i=0; i<classifications.length; i++) { //part 3, scale by max
                console.log("Scaling classification "+classifications[i][1]+" by max val "+max);
                if (max == 0) {
                    console.warn("Dividing factor max is 0, did you pass only a single word in an array?");
                } else {
                    classifications[i][1] /= max;
                }
            }
            var finalClassifications = [];
            for (var i=0; i<classifications.length; i++) {
                if (classifications[i][1] > neuralMatcher.algorithm.cutoffOutput) {
                    finalClassifications.push(classifications[i]);
                }
            }
            console.log("classifications: "+JSON.stringify(classifications)+", cutoff filtered classifications: "+JSON.stringify(finalClassifications));
            //pick the more likely response from the ones provided
            var likelyResponse = ["",[0]];
            for (var i=0; i<finalClassifications.length; i++) {

                if (finalClassifications[i][1] > likelyResponse[1]) {
                    likelyResponse = finalClassifications[i];
                }
            }
            var response;
            if (likelyResponse.constructor == Array && likelyResponse[0] !== "" && likelyResponse[1][1] !== 0) {
                speechParser.algorithm.addRNGClass(likelyResponse[0]); //generate rng class from classification
                response = speechParser.algorithm.dumpAndClearQueue();
            } else {
                console.warn("Likelyresponse is blank, what happened?")
                response = "";
            }
            return res.end(RequestHandler.SUCCESS({classification: finalClassifications, likelyResponse: likelyResponse, transcript: speechData, classifiedTranscript: classifiedSpeech, response: response}));;
        } else {
            var classification = neuralMatcher.algorithm.classify(speechClassifierNet, speechData); //classify speech
            console.log("Speech classification: "+JSON.stringify(classification));
            var response;
            if (classification.constructor == Array && classification.length > 0) {
                speechParser.algorithm.addRNGClass(classification[0][0]); //generate rng class from classification
                response = speechParser.algorithm.dumpAndClearQueue(); //dump queue to response (if backed up w/multiple calls)
            } else {
                console.warn("Classification length is 0, response is nothing");
                response = "";
            }
            return res.end(RequestHandler.SUCCESS({classification: classification, transcript: speechData, classifiedTranscript: classifiedSpeech, response: response}));
        }
    } else {
        res.end(RequestHandler.FAILURE("Error: Speechnet not ready"));
    }
})

//Soundcloud Routes

SCrouter.use(function(req, res, next) {
	console.log("SC endpoint targeted; checking authentication...");
	if(req.isAuthenticated() || runtimeSettings.disableLogin) {
		next();
	} else {
		return res.end(401, RequestHandler.FAILURE("Error: Not authenticated for making API request to SCRouter"));
	}
});
SCrouter.get("/clientReady", function(req, res) {
	if (soundcloudSettings.soundcloudStatus.ready) {
        console.log("SCClientReady request recieved; sending data");
        res.end(RequestHandler.SUCCESS({
            hasTracks: true,
            likedTracks: soundcloudSettings.likedTracks,
            trackList: soundcloudSettings.trackList,
            clientID: soundcloudSettings.clientID,
            settingsData: {
                currentUser: soundcloudSettings.currentUser,
                noArtworkUrl: soundcloudSettings.noArtworkUrl,
                defaultVolume: soundcloudSettings.defaultVolume,
                volStep: soundcloudSettings.volStep,
                currentVolume: soundManager.trackAudioController.currentVolume,
                tracksFromCache: soundcloudSettings.tracksFromCache,
                playMusicOnServer: soundcloudSettings.playMusicOnServer,
                nextTrackShuffle: soundcloudSettings.nextTrackShuffle,
                nextTrackLoop: soundcloudSettings.nextTrackLoop,
                soundcloudStatus: soundcloudSettings.soundcloudStatus
            }
        }));
    } else if (!soundcloudSettings.soundcloudStatus.ready && !soundcloudSettings.soundcloudStatus.error) {
        //console.log("SCClientReady request recieved; soundcloud is not ready");
        let tp = +((soundcloudSettings.tracksLoaded/soundcloudSettings.tracksToLoad)*100).toFixed(2); //cool maths to use 2 decimal places
        res.end(RequestHandler.WAIT({message:"serverLoadingTracklist", percent: tp}));
    } else {
    	res.end(RequestHandler.FAILURE(soundcloudSettings.soundcloudStatus.message));
    }
});
SCrouter.get("/clientUpdate", function(req, res) {
	if (soundcloudSettings.soundcloudStatus.ready) {
        //console.log("SCClientUpdate");
        var ps = soundManager.trackTimer.getPlayedSeconds();

        var internalSCSettings = soundManager.getSoundcloudObject().localSoundcloudSettings; //used to access internal SC settings that are not kept by SoundManager but rather by the soundcloud module itself. mostly a polyfill from the old days when there was only soundcloud.js
        res.end(RequestHandler.SUCCESS({
            currentPlayingTrack: soundManager.currentPlayingTrack || {},
            percent: soundManager.trackTimer.getPlayedPercent(),
            playedSeconds: ps,
            timeStamp: utils.formatHHMMSS(ps),
            playingTrack: soundManager.playingTrack,
            playingAirplay: soundManager.playingAirplay,
            settingsData: {
                currentUser: internalSCSettings.currentUser,
                currentVolume: soundManager.trackAudioController.currentVolume,
                nextTrackShuffle: internalSCSettings.nextTrackShuffle,
                nextTrackLoop: internalSCSettings.nextTrackLoop
            }
        }));
    } else if (!soundcloudSettings.soundcloudStatus.ready && !soundcloudSettings.soundcloudStatus.error) {
        //console.log("SC not ready on clientUpdate");
       	let tp = +((soundcloudSettings.tracksLoaded/soundcloudSettings.tracksToLoad)*100).toFixed(2);
        res.end(RequestHandler.WAIT({message:"serverLoadingTracklist", percent: tp}));
    } else {
    	res.end(RequestHandler.FAILURE(soundcloudSettings.soundcloudStatus.message));
    }
});
SCrouter.get("/event/:type", function(req, res) {
	// console.log("SCROUTER: Event type="+req.params.type+", data="+req.query.data)
	if (req.params.type) {
	    soundManager.processClientEvent({
	        type: req.params.type,
	        data: req.query.data,
	        origin: "external"
	    }).then( () => {
	    	res.end(RequestHandler.SUCCESS());
	    }).catch( err => {
	    	res.end(RequestHandler.FAILURE(err));
	    })
	} else {
	    console.error("Type undefined sccliuserevent");
	    res.end(RequestHandler.FAILURE("Error: Type is undefined in request"));
	}
});
SCrouter.get("/trackArt/:id.jpg", function(req, res) {
	let id = req.params.id;
	if (id) {
		fs.readFile(path.join(cwd,soundcloudSettings.soundcloudArtworkCacheDirectory,"art-"+String(id)+".jpg"), function (err, buf) {
			if (err) {
				console.error("couldn't find artwork file from id "+id);
				return res.end(RequestHandler.FAILURE("Error: could not find file with id "+id));
			} else {
				res.end(buf); //send buffer
			}
		})
	} else {
		console.error("ID undefined on getTrackArt");
		return res.end(RequestHandler.FAILURE("Error: ID is undefined"));
	}
})
SCrouter.get("/trackWaveform/:id.png", function(req, res) {
	let id = req.params.id;
	if (id) {
		fs.readFile(path.join(cwd,soundcloudSettings.soundcloudWaveformCacheDirectory,"waveform-"+id+".png"), function (err, buf) {
			if (err) {
				console.error("couldn't find waveform file from id "+id);
				return res.end(RequestHandler.FAILURE("Error: could not find file with id "+id));
			} else {
				res.end(buf); //send buffer
			}
		})
	} else {
		console.error("ID undefined on getTrackWaveform");
		return res.end(RequestHandler.FAILURE("Error: ID is undefined"));
	}
})

var gettingSCUser = false;
SCrouter.get("/changeUser/:user", function(req, res) {
	if (req.params.user) {
	    console.info("Restarting SC MASTER with new user "+req.params.user);
	    if (!gettingSCUser) {
	    	gettingSCUser = true;
	        initSoundcloud(req.params.user).then( () => {
	            console.importantInfo("SC INIT OK");
	            gettingSCUser = false;
	            res.end(RequestHandler.SUCCESS());
	        }).catch( err => {
	            console.error("Error initializing SC: "+err);
	            gettingSCUser = false;
	            res.end(RequestHandler.FAILURE(err));
	        });
	    } else {
	    	res.end(RequestHandler.FAILURE("Error: Soundcloud not ready"));
	    }
	} else {
		console.error("User undefined in SC changeUser");
	    res.end(RequestHandler.FAILURE("Error: User is undefined in request"));
	}
});

//Catch anything that falls through
app.use(function(req, res, next){
	res.status(404); //crappy 404 page
	res.send("<h1>Uhoh, you tried to go to a page that doesn't exist.</h1><br> Navigate to /client to go to the main page.");
});

//Attach endpoints to app
app.use('/login', AUTHrouter); //connect login to auth router
app.use('/api', APIrouter); //connect api to main
APIrouter.use('/SC', SCrouter); //connect soundcloud router to api

console.log("[AUTH] Init server begun");
server.listen(runtimeSettings.serverPort, () => {
	console.log('Node server started on port ' + runtimeSettings.serverPort);
});

//I see you all the way at the bottom... what r u doing here, go back up and code something useful!
//bruh