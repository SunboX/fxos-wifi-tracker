var trackerStarted = true;

navigator.mozPower.keyLightEnabled = true;
navigator.mozPower.cpuSleepAllowed = false;

window.addEventListener('ready', ev => {
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
    });

    var volumes = navigator.getDeviceStorages('sdcard');

    if (volumes.length === 0) {
        writeLine('[storage] No SD card found to store the file!');
    } else if (volumes.length === 1) {
        var sdcard = volumes[0];

        function searchWifi () {
            if (!trackerStarted) {
                return;
            }
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

                                        try {
                                            var d = new Date();
                                            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                                            
                                            var file = new Blob([JSON.stringify(net)], {
                                                type: 'text/plain'
                                            });
                                            var request = sdcard.addNamed(file, 'logs/' + d.toISOString().replace(/[^0-9]/g, '').substr(0, 14) + '_' + net.ssid + '.json');
                                            request.onsuccess = function() {
                                                var name = this.result;
                                                writeLine('[storage] File "' + name + '" successfully wrote on the sdcard storage area');
                                            };
                                            request.onerror = function() {
                                                writeLine('[storage] Unable to write the file: ' + this.error);
                                            };
                                        } catch (e) {
                                            writeLine('[storage] Error storing file: ' + e);
                                        }
                                    });
                                    writeLine('[wifi] Done');

                                    setTimeout(() => {

                                        searchWifi();

                                    }, 1000);
                                }
                            } catch (e) {
                                utils.log('[geoloc] Error in onGeolocSuccess: ' + e.toString());

                                searchWifi();
                            }
                        },
                        err => {
                            utils.log('[geoloc] Error: ' + err.code + ' : ' + err.message);
                            utils.log('[geoloc] Aborting.');

                            searchWifi();
                        }, {
                            enableHighAccuracy: false,
                            timeout: 1000 * 30,
                            maximumAge: 1000 * 30
                        });
                };
                request.onerror = () => {
                    writeLine('[wifi] Something goes wrong: ' + request.error.name);

                    searchWifi();
                };
            } catch (e) {
                writeLine('[wifi] Something goes wrong: ' + e);

                searchWifi();
            }
        }
    }

    wifiManager.onenabled = () => {
        setTimeout(() => {

            searchWifi();

        }, 1000);
    };
});