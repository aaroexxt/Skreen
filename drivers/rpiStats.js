/*
* piStats.js by Aaron Becker
* Fetches real-time statistics from various raspberry pi monitoring systems to facilitate real-time graphs of system usage
*
* Dedicated to Marc Perkel
*
* Copyright (C) 2020, Aaron Becker <aaron.becker.developer@gmail.com>
*
* Derived from https://gist.github.com/sidwarkd/9578213
*/

const fs = require('fs');
const spawn = require("child_process").spawn;

var memInfo = {};
var tempInfo = {};
var currentCPUInfo = {total:0, active:0};
var lastCPUInfo = {total:0, active:0};

function getValFromLine(line){
  var match = line.match(/[0-9]+/gi);
  if(match !== null)
    return parseInt(match[0]);
  else
    return null;
}

const getMemoryInfo = () => {
  return new Promise((resolve, reject) => {
    fs.readFile('/proc/meminfo', 'utf8', function(err, data){
      if (err) {
        return reject(err);
      }

      let lines = data.split('\n');
      memInfo.total = Math.floor(getValFromLine(lines[0]) / 1024);
      memInfo.free = Math.floor(getValFromLine(lines[1]) / 1024);
      memInfo.cached = Math.floor(getValFromLine(lines[3]) / 1024);
      memInfo.used = memInfo.total - memInfo.free;
      memInfo.percentUsed = Math.ceil(((memInfo.used - memInfo.cached) / memInfo.total) * 100);

      return resolve(memInfo);
    });
  })
}

var calculateCPUPercentage = function(oldVals, newVals){
  var totalDiff = newVals.total - oldVals.total;
  var activeDiff = newVals.active - oldVals.active;
  return Math.ceil((activeDiff / totalDiff) * 100);
};

const getCPUInfo = () => {
  return new Promise((resolve, reject) => {
    lastCPUInfo.active = currentCPUInfo.active;
    lastCPUInfo.idle = currentCPUInfo.idle;
    lastCPUInfo.total = currentCPUInfo.total;

    fs.readFile('/proc/stat', 'utf8', function(err, data) {
      if (err) {
        return reject(err);
      }

      let lines = data.split('\n');
      let cpuTimes = lines[0].match(/[0-9]+/gi);
      currentCPUInfo.total = 0;
      // We'll count both idle and iowait as idle time
      currentCPUInfo.idle = parseInt(cpuTimes[3]) + parseInt(cpuTimes[4]);
      for (var i = 0; i < cpuTimes.length; i++){
        currentCPUInfo.total += parseInt(cpuTimes[i]);
      }
      currentCPUInfo.active = currentCPUInfo.total - currentCPUInfo.idle
      currentCPUInfo.percentUsed = calculateCPUPercentage(lastCPUInfo, currentCPUInfo);

      return resolve(currentCPUInfo);
    });
  })
}

const getTempInfo = () => {
  return new Promise((resolve, reject) => {
    //Code yoinked from odensc/pi-temperature @ https://github.com/odensc/pi-temperature/blob/master/index.js
    let regex = /temp=([^'C]+)/;
    let cmd = spawn("/opt/vc/bin/vcgencmd", ["measure_temp"]);

    cmd.stdout.on("data", function(buf) {
      tempInfo.currentTemp = parseFloat(regex.exec(buf.toString("utf8"))[1]); //lol what a oneliner
      return resolve(tempInfo);
    });

    cmd.stderr.on("data", function(buf) {
      return reject(buf.toString("utf8"));
    });

    cmd.on('error', function(err) {
      return reject(err);
    });
  })
}


module.exports = {
  RPIgetCPUInfo: getCPUInfo,
  RPIgetMemoryInfo: getMemoryInfo,
  RPIgetTempInfo: getTempInfo
}