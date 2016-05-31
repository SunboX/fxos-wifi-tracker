var trackerStarted = true;
var fileStack = [];
var saving = false;
var sdcard;
var isSearching = false;
var keyTimeout;

navigator.mozPower.keyLightEnabled = true;
navigator.mozPower.cpuSleepAllowed = false;

window.addEventListener('online', ev => {
    var config = ev.detail,
        wifiManager = navigator.mozWifiManager;

    var battery = window.navigator.battery;
    battery.addEventListener('levelchange', () => {
        writeLine('[battery] ' + Math.floor(battery.level * 100) + '%');
    });

    window.focus();  

    navigator.mozSettings.createLock().set({
        'wifi.enabled': true
    });

    window.addEventListener('keydown', function(e) {
        clearTimeout(keyTimeout);
        keyTimeout = setTimeout(() => {
            if (e.key === 'Power') {
                writeLine('power off the device');
                navigator.mozPower.powerOff();
            }
            else if (e.key === 'VolumeDown') {
                writeLine('disable the screen');
                navigator.mozPower.screenBrightness = 0;
                navigator.mozPower.screenEnabled = false;
            }
            else if (e.key === 'VolumeUp') {
                if (navigator.mozPower.screenEnabled) {
                    trackerStarted = !trackerStarted;
                    if (trackerStarted) {
                        writeLine('wifi tracker started');
                        searchWifi();
                    } else {
                        writeLine('wifi tracker stopped');
                    }
                    return;
                }
                writeLine('enable the screen');
                navigator.mozPower.screenEnabled = true;
                navigator.mozPower.screenBrightness = 1;
            }
        }, 300);
    });

    var volumes = navigator.getDeviceStorages('sdcard');

    if (volumes.length === 0) {
        writeLine('[storage] No SD card found to store the file!');
    } else if (volumes.length === 1) {
        sdcard = volumes[0];

        function searchWifi () {
            if (!trackerStarted) {
                return;
            }
            if (isSearching) {
                return;
            }
            isSearching = true;
            writeLine('[wifi] Getting Wifi infos');
            try {
                request = wifiManager.getNetworks();
                request.onsuccess = () => {
                    writeLine('[wifi] found ' + request.result.length + ' networks');

                    writeLine('[geoloc] Getting infos');

                    navigator.geolocation.getCurrentPosition(pos => {
                            try {
                                // Filter out erroneous values
                                if (typeof pos.coords.latitude !== 'number' || isNaN(pos.coords.latitude) || typeof pos.coords.longitude !== 'number' || isNaN(pos.coords.longitude)) {
                                    writeLine('[geoloc] Wrong location');
                                } else {
                                    writeLine('[geoloc] At ' + pos.coords.latitude + ', ' + pos.coords.longitude);
                                    request.result.forEach(network => {
                                        var net = {
                                            ssid: network.ssid,
                                            signalStrength: parseInt(network.signalStrength, 10),
                                            latitude: pos.coords.latitude,
                                            longitude: pos.coords.longitude,
                                            geoAccuracy: pos.coords.accuracy,
                                        };

                                        writeLine('[wifi] SSID: ' + net.ssid + ' (' + net.signalStrength + ')');

                                        var d = new Date();
                                        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());

                                        fileStack.push({
                                            name: 'logs/' + d.toISOString().replace(/[^0-9]/g, '').substr(0, 14) + '_' + net.ssid + '.json',
                                            blob: new Blob([JSON.stringify(net)], {
                                                type: 'text/plain'
                                            }),
                                            errorCount: 0
                                        });
                                    });
                                    writeLine('[wifi] Done');

                                    setTimeout(() => {
                                        isSearching = false;
                                        searchWifi();
                                    }, 1000);
                                }
                            } catch (e) {
                                utils.log('[geoloc] Error in onGeolocSuccess: ' + e.toString());

                                setTimeout(() => {
                                    isSearching = false;
                                    searchWifi();
                                }, 1000);
                            }
                        },
                        err => {
                            utils.log('[geoloc] Error: ' + err.code + ' : ' + err.message);
                            utils.log('[geoloc] Aborting.');

                            setTimeout(() => {
                                isSearching = false;
                                searchWifi();
                            }, 1000);
                        }, {
                            enableHighAccuracy: false,
                            timeout: 1000 * 30,
                            maximumAge: 1000 * 30
                        });
                };
                request.onerror = () => {
                    writeLine('[wifi] Something goes wrong: ' + request.error.name);

                    setTimeout(() => {
                        isSearching = false;
                        searchWifi();
                    }, 1000);
                };
            } catch (e) {
                writeLine('[wifi] Something goes wrong: ' + e);

                setTimeout(() => {
                    isSearching = false;
                    searchWifi();
                }, 1000);
            }
        }
    }

    wifiManager.onenabled = () => {
        setTimeout(() => {
            isSearching = false;
            searchWifi();
        }, 1000);
    };
});

setInterval(() => {
    if (saving || !sdcard) {
        return;
    }
    if (fileStack.length > 0) {
        saving = true;
        var file = fileStack.shift();
        if (file.errorCount > 5) {
            saving = false;
            return;
        }
        try {
            var request = sdcard.addNamed(file.blob, file.name);
            request.onsuccess = () => {
                writeLine('[storage] File "' + request.result + '" successfully wrote on the sdcard storage area');
                saving = false;
            };
            request.onerror = () => {
                file.errorCount++;
                fileStack.push(file);
                writeLine('[storage] Unable to write the file, error count ' + file.errorCount + ', file: ' + file.name + ', error: ' + JSON.stringify(request.error));
                saving = false;
            };
        } catch (e) {
            file.errorCount++;
            fileStack.push(file);
            writeLine('[storage] Error storing file: ' + JSON.stringify(e));
            saving = false;
        }
    }                              
}, 1000)