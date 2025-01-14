"use strict"

var cmd = require("node-cmd");
var Promise = require('bluebird');

const getAsync = Promise.promisify(cmd.get, { multiArgs: true, context: cmd})

const dockerBuildCmd = 'docker build -t mynode '
const dockerRunCmd = 'docker run mynode'
const dockerCpCmd = 'docker cp $(docker ps -l -q):/output '

module.exports = {
    newDockerChecker: newDockerChecker
};

function newDockerChecker() {
    return (function() {

        var dockerBuild = function(path) {
            return new Promise(function(resolve, reject) {
                getAsync(dockerBuildCmd + path).then(data => {
                    resolve(data);
                }).catch(err => {
                    reject(err);
                });
            });
        };

        var dockerRun = function(path) {
            return new Promise(function(resolve, reject) {
                getAsync(dockerRunCmd).then(data => {
                    resolve(data);
                }).catch(err => {
                    dockerCopy(path).then(data => {
                        resolve(data);
                    }).catch(err => {
                        reject(err);
                    });
                });
            });
        };

        var dockerCopy = function(path) {
            return new Promise(function(resolve, reject) {
                getAsync(dockerCpCmd + path).then(data => {
                    resolve(data);
                }).catch(err => {
                    reject(err)
                });
            });
        };

        var compareFiles = function(file1, file2) {
            return new Promise(function(resolve, reject) {
                getAsync('cmp --silent ' + file1 + ' ' + file2 + ' || echo "files are different"').then(data => {
                    if (data[0] != "") {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                }).catch(err => {
                    resolve(err);
                });
            });
        };

        return {
            build:function(path) {
                return dockerBuild(path);
            },
            run:function(path) {
                return dockerRun(path);
            },
            cp:function() {
                return dockerCopy(path);
            },
            cmpfiles:function(file1, file2) {
                return compareFiles(file1, file2);
            },
            tryAnswer:function(dockerPath, userJsFile, outputFile, answerFile) {
                return new Promise(function(resolve, reject) {
                    dockerBuild(dockerPath).then(function(data) {
                        dockerRun(outputFile).then(function(data) {
                            dockerCopy(outputFile).then(function(data) {
                                compareFiles(answerFile, outputFile).then(function(data) {
                                    resolve(data);
                                }, function(err) {
                                    reject(err);
                                });
                            }, function(err) {
                                reject(err);
                            });
                        }, function(err) {
                            reject(err);
                        });
                    }, function(err) {
                        reject(err);
                    });
                });
            }

        }

    }());
}
