/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

// you have to require the utils module and call adapter function
const utils        = require('@iobroker/adapter-core'); // Get common adapter utils
const adapterName  = require('./package.json').name.split('.').pop();
const rfxcom       = require('rfxcom');

let channels       = {};
const Device       = {
    RFY:       require('./lib/rfy'),
    Lighting3: require('./lib/lighting3'),
    Curtain1:  require('./lib/curtain1'),
    Lighting1: require('./lib/lighting1'),
    Weight:    require('./lib/weight')
};

let inclusionOn      = false;
let inclusionTimeout = null;
const lastReceived   = {};
let repairInterval   = null;
let connection       = null;
const devices        = {};
let stateTasks       = [];
let rfyAll           = null;
let comm;
let adapter;
function startAdapter(options) {
    options = options || {};

    Object.assign(options, {
        name: adapterName,
    });

    adapter = new utils.Adapter(options);


// is called when adapter shuts down - callback has to be called under any circumstances!
    adapter.on('unload', callback => {
        setConnState(false);
        try {
            if (repairInterval) {
                clearInterval(repairInterval);
                repairInterval = null;
            }

            if (comm) {
                comm.close();
                comm.removeAllListeners();
            }
            comm = null;
            callback && callback();
        } catch (e) {
            callback && callback();
        }
    });

// is called if a subscribed state changes
    adapter.on('stateChange', (id, state) => {
        if (!state || state.ack || !comm) {
            return;
        }

        const parts = id.split('.');
        const command = parts.pop();
        const channel = parts.join('.');

        if (!channels[channel] || !devices[channel]) {
            adapter.log.warn(`Unknown device "${channel}"`);
        } else if (!devices[channel].commands.includes(command)) {
            adapter.log.warn(`Unknown command "${command}" for "${channel}"`);
        } else {
            devices[channel].sendCommand(command, state.val, err => {
                if (err) {
                    adapter.log.error(`Cannot control "${command}" for "${channel}": ${err}`);
                } else {
                    adapter.setForeignState(id, false, true);
                }
            });
        }
    });

    adapter.on('objectChange', (id, obj) => {
        if (!obj) {
            if (channels[id])     {
                delete channels[id];
            }
            if (lastReceived[id]) {
                delete lastReceived[id];
            }
        } else {
            if (obj.type === 'channel') {
                if (obj.native.autoRepair) {
                    lastReceived[id] = new Date().getTime();
                } else if (lastReceived[id]) {
                    delete lastReceived[id];
                }

                channels[id] = obj;
            }
        }
    });

    adapter.on('message', obj => {
        if (obj) {
            switch (obj.command) {
                case 'listUart':
                    if (obj.callback) {
                        try {
                            const { SerialPort } = require('serialport');
                            if (SerialPort) {
                                // read all found serial ports
                                SerialPort.list()
                                    .then(ports => {
                                        adapter.log.info(`List of port: ${JSON.stringify(ports)}`);
                                        adapter.sendTo(obj.from, obj.command, ports, obj.callback);
                                    })
                                    .catch(e => {
                                        adapter.sendTo(obj.from, obj.command, [], obj.callback);
                                        adapter.log.error(e)
                                    });
                            } else {
                                adapter.log.warn('Module serialport is not available');
                                adapter.sendTo(obj.from, obj.command, [{comName: 'Not available'}], obj.callback);
                            }
                        } catch (e) {
                            adapter.sendTo(obj.from, obj.command, [{comName: 'Not available'}], obj.callback);
                        }
                    }

                    break;

                case 'program':
                    // find or create device with such DeviceID
                    if (obj.message) {
                        const id = `${adapter.namespace}.${obj.message.type || 'rfy'}.${obj.message.deviceId}_${obj.message.unitCode}`;
                        if (devices[id]) {
                            if (connection) {
                                devices[id].program((err, response, seqnbr) => {
                                    if (err) {
                                        adapter.log.error(`Cannot program "${id}": ${err}`);
                                    }
                                    if (obj.callback) {
                                        adapter.sendTo(obj.from, obj.command, [{result: err}], obj.callback);
                                    }
                                    // request list of devices
                                    rfyAll.listRemotes((err, resp, seqNr) =>
                                        err && adapter.log.error('Cannot ask listRemotes: ' + err));
                                });
                            } else {
                                adapter.sendTo(obj.from, obj.command, [{result: 'No connection to RfxCom'}], obj.callback);
                            }
                        } else {
                            if (connection) {
                                if (Device[obj.message.type]) {
                                    // create device
                                    let device = new Device[obj.message.type](comm, {
                                        deviceId: obj.message.deviceId + '/' + obj.message.unitCode,
                                        subtype: obj.message.subtype
                                    }, adapter.log);

                                    device.program(err => {
                                        if (err) {
                                            adapter.log.error(`Cannot program "${obj.message.deviceId}/${obj.message.unitCode}": ${err}`);
                                        }
                                        if (obj.callback) {
                                            adapter.sendTo(obj.from, obj.command, [{result: err}], obj.callback);
                                        }
                                        // request list of devices
                                        rfyAll.listRemotes((err, resp, seqNr) =>
                                            err && adapter.log.error('Cannot ask listRemotes: ' + err));
                                    });
                                    device = null;
                                } else {
                                    adapter.log.error(`Unknown type "${obj.message.type}"`);
                                    adapter.sendTo(obj.from, obj.command, [{result: `Unknown type "${obj.message.type}"`}], obj.callback);
                                }
                            } else {
                                adapter.sendTo(obj.from, obj.command, [{result: 'No connection to RfxCom'}], obj.callback);
                            }
                        }
                    }
                    break;

                case 'erase':
                    // find or create device with such DeviceID
                    if (obj.message) {
                        if (obj.message.type !== 'RFY') {
                            if (obj.callback) {
                                adapter.sendTo(obj.from, obj.command, [{result: 'Only RFY devices can be erased'}], obj.callback);
                            }
                            return;
                        }
                        const idd = `${adapter.namespace}.${obj.message.type || 'rfy'}.${obj.message.deviceId}_${obj.message.unitCode}`;
                        if (devices[idd]) {
                            devices[idd].erase(err => {
                                if (err) {
                                    adapter.log.error(`Cannot erase "${idd}": ${err}`);
                                }
                                if (obj.callback) {
                                    adapter.sendTo(obj.from, obj.command, [{result: err}], obj.callback);
                                }
                                // request list of devices
                                rfyAll.listRemotes((err, resp, seqNr) =>
                                    err && adapter.log.error('Cannot ask listRemotes: ' + err));
                            });
                        } else {
                            if (Device[obj.message.type]) {
                                // create device
                                let ddevice = new Device[obj.message.type](comm, {
                                    deviceId: obj.message.deviceId + '/' + obj.message.unitCode,
                                    subtype:  obj.message.subtype
                                }, adapter.log);

                                ddevice.erase(err => {
                                    if (err) {
                                        adapter.log.error(`Cannot erase "${obj.message.deviceId}/${obj.message.unitCode}": ${err}`);
                                    }
                                    if (obj.callback) {
                                        adapter.sendTo(obj.from, obj.command, [{result: err}], obj.callback);
                                    }
                                    // request list of devices
                                    rfyAll.listRemotes((err, resp, seqNr) =>
                                        err && adapter.log.error('Cannot ask listRemotes: ' + err));
                                });
                                ddevice = null;
                            }
                        }
                    }
                    break;

                case 'eraseAll':
                    // find or create device with such DeviceID
                    if (obj.message) {
                        if (obj.message.type !== 'RFY') {
                            if (obj.callback) {
                                adapter.sendTo(obj.from, obj.command, [{result: 'Only RFY devices can be erased'}], obj.callback);
                            }
                            return;
                        }
                        if (rfyAll) {
                            rfyAll.eraseAll(err => {
                                if (err) {
                                    adapter.log.error(`Cannot eraseAll: ${err}`);
                                }
                                if (obj.callback) {
                                    adapter.sendTo(obj.from, obj.command, [{result: err}], obj.callback);
                                }

                                // request list of devices
                                rfyAll.listRemotes((err, resp, seqNr) =>
                                    err && adapter.log.error('Cannot ask listRemotes: ' + err));
                            });
                        } else if (obj.callback) {
                            adapter.sendTo(obj.from, obj.command, [{result: 'no connection to RfxCom'}], obj.callback);
                        }
                    }
                    break;

                default:
                    adapter.log.error('Unknown command: ' + obj.command);
                    break;
            }
        }
    });

    adapter.on('ready', () => main());

    return adapter;
}

function setConnState(isConnected) {
    if (isConnected !== connection) {
        connection = isConnected;
        if (adapter && adapter.log) {
            adapter.log.info(`State: ${isConnected ? 'connected' : 'disconnected'}`);
        }
        if (adapter && adapter.setState) {
            adapter.setState('info.connection', isConnected, true);
        }
    }
}

function setInclusionState(val) {
    val = val === 'true' || val === true || val === 1 || val === '1';
    inclusionOn = val;

    if (inclusionTimeout) {
        clearTimeout(inclusionTimeout);
    }
    inclusionTimeout = null;

    if (inclusionOn && adapter.config.inclusionTimeout) {
        inclusionTimeout = setTimeout(() => {
            inclusionOn = false;
            adapter.setState('inclusionOn', false, true);
        }, adapter.config.inclusionTimeout * 1000);
    }
}

const supportedEvents = {
    security1:  processEvents,  // Emitted when an X10 or similar security device reports a status change.
    bbq1:       processSensors, // Emitted when a message is received from a Maverick ET-732 BBQ temperature sensor.
    temprain1:  processSensors, // Emitted when a message is received from an Allecto temperature/rainfall weather sensor.
    temp1:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp2:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp3:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp4:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp5:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp6:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp7:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp8:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp9:      processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp10:     processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp11:     processSensors, // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    humidity1:  processSensors, // Emitted when data arrives from humidity sensing devices
    th1:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th2:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th3:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th4:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th5:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th6:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th7:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th8:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th9:        processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th10:       processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th12:       processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th13:       processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th14:       processSensors, // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    thb1:       processSensors, // Emitted when a message is received from an Oregon Scientific temperature/humidity/barometric pressure sensor.
    thb2:       processSensors, // Emitted when a message is received from an Oregon Scientific temperature/humidity/barometric pressure sensor.
    rain1:      processSensors, // Emitted when data arrives from rainfall sensing devices
    rain2:      processSensors, // Emitted when data arrives from rainfall sensing devices
    rain3:      processSensors, // Emitted when data arrives from rainfall sensing devices
    rain4:      processSensors, // Emitted when data arrives from rainfall sensing devices
    rain5:      processSensors, // Emitted when data arrives from rainfall sensing devices
    rain6:      processSensors, // Emitted when data arrives from rainfall sensing devices
    rain7:      processSensors, // Emitted when data arrives from rainfall sensing devices
    wind1:      processSensors, // Emitted when data arrives from wind speed/direction sensors
    wind2:      processSensors, // Emitted when data arrives from wind speed/direction sensors
    wind3:      processSensors, // Emitted when data arrives from wind speed/direction sensors
    wind4:      processSensors, // Emitted when data arrives from wind speed/direction sensors
    wind5:      processSensors, // Emitted when data arrives from wind speed/direction sensors
    wind6:      processSensors, // Emitted when data arrives from wind speed/direction sensors
    wind7:      processSensors, // Emitted when data arrives from wind speed/direction sensors
    uv1:        processSensors, // Emiied when data arrives from ultraviolet radiation sensors
    uv2:        processSensors, // Emiied when data arrives from ultraviolet radiation sensors
    uv3:        processSensors, // Emiied when data arrives from ultraviolet radiation sensors
    weight1:    processWeight, // Emitted when a message is received from a weighing scale device.
    weight2:    processWeight, // Emitted when a message is received from a weighing scale device.
    elec1:      processEnergy, // Emitted when data is received from OWL or REVOLT electricity monitoring devices.
    elec2:      processEnergy, // Emitted when data is received from OWL or REVOLT electricity monitoring devices.
    elec3:      processEnergy, // Emitted when data is received from OWL or REVOLT electricity monitoring devices.
    elec4:      processEnergy, // Emitted when data is received from OWL or REVOLT electricity monitoring devices.
    elec5:      processEnergy, // Emitted when data is received from OWL or REVOLT electricity monitoring devices.
    rfxmeter:   processEvents, // Emitted whan a message is received from an RFXCOM rfxmeter device.
    rfxsensor:  processEvents, // Emitted when a message is received from an RFXCOM rfxsensor device.
    lighting1:  processLighting, // Emitted when a message is received from X10, ARC, Energenie or similar lighting remote control devices.
    lighting2:  processLighting, // Emitted when a message is received from AC/HomeEasy type remote control devices.
    lighting4:  processLighting4, // Emitted when a message is received from devices using the PT2262 family chipset.
    lighting5:  processLighting5, // Emitted when a message is received from LightwaveRF/Siemens type remote control devices.
    lighting6:  processLighting6, // Emitted when a message is received from Blyss lighting remote control devices.
    blinds1:    processBlinds, // Emitted when a message arrives from a compatible type 1 blinds remote controller (only a few subtypes can be received)
    chime1:     processEvents // Emitted when data arrives from Byron or similar doorbell pushbutton
};

function processEvents(event, data) {
    // evt.rssi
    // evt.housecode
    // evt.commandNumber
    // evt.unitcode

    // evt.temperature '°C'
    // evt.barometer 'hPa'
    // evt.direction '°'
    // evt.averageSpeed 'm/s'
    // evt.averageSpeed 'm/s'
    // evt.gustSpeed 'm/s'
    // evt.chillfactor '°C'
    // evt.humidity '%'
    // evt.rainfall 'mm'
    // evt.rainfallRate 'mm/hr'
    // evt.rainfallIncrement 'mm'
    // evt.uv 'UVIndex'
    // evt.forecast

    //if (event === 'lighting1') {
    //
    //}

    adapter.log.debug(`[${event}]: ${JSON.stringify(data)}`);
}

function syncStates(isChanged) {
    if (!stateTasks || !stateTasks.length) {
        return;
    }
    const task = stateTasks.shift();

    if (typeof task.val === 'object' && task.val !== null && task.val !== undefined) {
        task.val = task.val.toString();
    }
    if (isChanged) {
        adapter.setForeignStateChanged(task.id, task.val, true, () =>
            setImmediate(syncStates, isChanged));
    } else {
        adapter.setForeignState(task.id, task.val, true, () =>
            setImmediate(syncStates, isChanged));
    }
}

function getDevice(deviceId, unitCode, type, subType) {
    for (const id in channels) {
        if (channels.hasOwnProperty(id) && channels[id].native.deviceId === deviceId  && channels[id].native.unitCode === unitCode) {
            if (!devices[id] && Device[type]) {
                devices[id] = new Device[type](deviceId + '/' + unitCode, subType);
            }
            return channels[id];
        }
    }

    if (inclusionOn) {
        if (Device[type]) {
            const prefix = adapter.namespace + '.' + type + '.';
            const idd = prefix + deviceId + '_' + unitCode;

            subType = Device[type].subTypes[subType];
            if (subType === undefined) {
                adapter.log.warn(`Unknown device subType for "${type}": ${subType}`);
            } else {
                devices[idd] = new Device[type](comm, {
                    deviceId: deviceId + '/' + unitCode,
                    subtype:  subType
                }, adapter.log);

                syncObjects(devices[idd].getObjects(prefix));
            }
        } else {
            adapter.log.warn('Unknown device type: ' + type);
        }
    } else {
        return null;
    }
}

function processLighting(event, data) {
    event = event[0].toUpperCase() + event.substring(1);
    const dev = getDevice(data.housecode, data.unitcode, event, data.subtype);

    if (dev) {
        const isStart = !stateTasks.length;
        stateTasks = stateTasks.concat(dev.device.getStates(adapter.namespace + '.' + event + '.', data));
        if (isStart) syncStates(true);

    } else {
        adapter.log.debug(event + ' ignored: ' + JSON.stringify(data));
    }
}

function processLighting5(event, data) {
    // data.rssi
    // data.housecode
    // data.commandNumber
    // data.unitcode
    // data.subtype

    let val = false;
    switch (data.subtype) {
        case 0: // Lightwave RF
            switch (data.commandNumber) {
                case 0:
                case 2:
                    val = false;
                    break;

                case 1:
                    val = true;
                    break;

                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                    msg.payload = 'Mood' + (evt.commandNumber - 2);
                    break;

                case 16:
                    val = data.level / 31 * 100;
                    break;

                case 17:
                case 18:
                case 19:
                    adapter.log.warn('Unrecognised Lighting5 LightwaveRF command ' + data.commandNumber.toString(16));
                    break;

                default:
                    return;
            }
            break;

        case 2:
        case 4: // BBSB & CONRAD
            switch (data.commandNumber) {
                case 0:
                case 2:
                    val = false;
                    break;

                case 1:
                case 3:
                    val = true;
                    break;

                default:
                    return;
            }
            break;

        case 6: // TRC02
            switch (data.commandNumber) {
                case 0:
                    val = false;
                    break;

                case 1:
                    val = true;
                    break;

                case 2:
                    val = 'Bright';
                    break;

                case 3:
                    val = 'Dim';
                    break;

                default:
                    adapter.log.warn('Unrecognised Lighting5 TRC02 command ' + data.commandNumber.toString(16));
                    return;
            }
            break;
    }

}

function processLighting6(event, data) {
    // data.rssi
    // data.housecode
    // data.commandNumber
    // data.unitcode
    // data.subtype

    let val = false;
    switch (data.commandNumber) {
        case 1:
        case 3:
            val = false;
            break;

        case 0:
        case 2:
            val = true;
            break;

        default:
            adapter.log.warn(`Unrecognised Lighting6 command ${data.commandNumber.toString(16)}`);
            return;
    }
}

// PT622
function processLighting4(event, data) {
    adapter.log.warn(`Unrecognised Lighting4 command ${JSON.stringify(data)}`);
}

function processSensors(event, data) {
    // evt.rssi
    // evt.housecode
    // evt.commandNumber
    // evt.unitcode

    // evt.temperature '°C'
    // evt.barometer 'hPa'
    // evt.direction '°'
    // evt.averageSpeed 'm/s'
    // evt.averageSpeed 'm/s'
    // evt.gustSpeed 'm/s'
    // evt.chillfactor '°C'
    // evt.humidity '%'
    // evt.rainfall 'mm'
    // evt.rainfallRate 'mm/hr'
    // evt.rainfallIncrement 'mm'
    // evt.uv 'UVIndex'
    // evt.forecast

    adapter.log.debug('[' + event + ']: ' + JSON.stringify(data));
}

function processWeight(event, data) {
    event = event.replace(/\d$/, '');
    const dev = getDevice(data.housecode, data.unitcode, event, data.subtype);

    if (dev) {
        const isStart = !stateTasks.length;
        stateTasks = stateTasks.concat(dev.device.getStates(adapter.namespace + '.' + event + '.', data));
        if (isStart) {
            syncStates(true);
        }
    } else {
        adapter.log.debug(`${event} ignored: ${JSON.stringify(data)}`);
    }
}

function processEnergy(event, data) {
    // rssi
    // batteryLevel
    // voltage 'V'
    // current 'A'
    // power 'W'
    // energy 'Wh'
    // powerFactor
    // frequency 'Hz'
}

function processBlinds(event, data) {
    // rssi

}

function syncObjects(objs, callback) {
    if (!objs || !objs.length) {
        return callback && callback();
    }
    const task = objs.shift();
    adapter.getForeignObject(task._id, (err, obj) => {
        if (!obj) {
            adapter.setForeignObject(task._id, task, () =>
                setImmediate(syncObjects, objs, callback));
        } else {
            obj.native = task.native;
            obj.common.name = task.common.name;
            adapter.setForeignObject(obj._id, obj, () =>
                setImmediate(syncObjects, objs, callback));
        }
    });
}

const responseCodes = [
    'ACK - transmit OK',
    'ACK - transmit delayed',
    'NAK - transmitter did not lock onto frequency',
    'NAK - AC address not allowed',
    'Command unknown or not supported by this device',
    'Unknown RFY remote ID',
    'Timed out waiting for response'
];

function device2string(device) {
    let id = parseInt(device.deviceId, 16);
    id = id.toString(16);
    if (id.length < 2) {
        id = '00000' + id;
    } else if (id.length < 3) {
        id = '0000' + id;
    } else if (id.length < 4) {
        id = '000' + id;
    } else if (id.length < 5) {
        id = '00' + id;
    } else if (id.length < 6) {
        id = '0' + id;
    }
    id = '0x' + id.substring(0, 6);
    id += '/' + parseInt(device.unitCode, 10);
    return id;
}

function start() {
    comm = new rfxcom.RfxCom(adapter.config.comName, {debug: true});

    comm.debugLog = function (text) {
        adapter.log.debug('[rfxcom] ' + text);
    };

    comm.on('ready', () =>
        setConnState(true));

    comm.on('disconnect', msg => {
        adapter.log.debug('Disconnected: ' + msg);
        setConnState(false);
    });

    comm.on('connectfailed', () => {
        setConnState(false);
        adapter.log.error(`unable to open the serial port: "${adapter.config.comName}"`);
    });

    comm.on('response', (desc, sequenceNum, responseCode) =>
        adapter.log.debug(`Response: ${desc}, SeqNr: ${sequenceNum}, ${responseCodes[responseCode] ? responseCodes[responseCode] : '0x' + responseCode.toString(16)}`));

    comm.on('receive', data =>
        adapter.log.debug('Raw data: ' + data.toString()));

    comm.on('status', status =>
        adapter.log.debug('JSON Status: ' + JSON.stringify(status)));

    comm.on('rfyremoteslist', list => {
        adapter.log.debug(`rfyremoteslist delivered ${list.length} devices`);

        if (list) {
            for (let d = 0; d < list.length; d++) {
                let found = false;
                // try to find this device
                for (let dd = 0; dd < adapter.config.devices.length; dd++) {
                    if (list[d].deviceId === device2string(adapter.config.devices[dd])) {
                        found = true;
                        adapter.config.devices[dd].found = true;
                        break;
                    }
                }
                if (!found) {
                    adapter.log.warn(`Device "${list[d].deviceId}" found in RfxCom, but not found in the configuration`);
                }
            }

            for (let ddd = 0; ddd < adapter.config.devices.length; ddd++) {
                if (!adapter.config.devices[ddd].found) {
                    adapter.log.warn(`Device "${adapter.config.devices[ddd].name}(${device2string(adapter.config.devices[ddd])}) " found in configuration, but not found in the RfxCom`);
                }
            }
        }
    });

    for (const event in supportedEvents) {
        (function (evt) {
            comm.on(evt, e => {
                adapter.log.debug(`Event "${evt}": ${JSON.stringify(e)}`);
                supportedEvents[evt](evt, e);
            });
        })(event);
    }

    comm.initialise(() => {
        adapter.log.info('RfxCom initialised on ' + comm.device);
        rfyAll && rfyAll.listRemotes((err, resp, seqNr) =>
            err && adapter.log.error('Cannot ask listRemotes: ' + err));
    });

    rfyAll = new rfxcom.Rfy(comm, 'RFY');

    let objs = [];

    // create rfy devices
    for (let d = 0; d < adapter.config.devices.length; d++) {
        if (Device[adapter.config.devices[d].type]) {
            const prefix = adapter.namespace + '.' + adapter.config.devices[d].type + '.';
            const id = prefix + adapter.config.devices[d].deviceId + '_' + adapter.config.devices[d].unitCode;
            devices[id] = new Device[adapter.config.devices[d].type](comm, {
                deviceId: adapter.config.devices[d].deviceId + '/' + adapter.config.devices[d].unitCode,
                subtype:  adapter.config.devices[d].subType
            }, adapter.log);

            objs = objs.concat(objs, devices[id].getObjects(prefix, adapter.config.devices[d].name));
        } else {
            adapter.log.warn('Unknown device type: ' + adapter.config.devices[d].type);
        }
    }

    syncObjects(objs);
}

function main() {
    adapter.config.inclusionTimeout = parseInt(adapter.config.inclusionTimeout, 10) || 0;

    adapter.getState('inclusionOn', (err, state) =>
        setInclusionState(state ? state.val : false));

    adapter.setState('info.connection', false, true);

    // there are two types of devices: rfy (only write) and all others

    // read current existing objects
    adapter.getForeignObjects(adapter.namespace + '.*', 'channel', (err, _channels) => {
        channels = _channels;

        // subscribe on changes
        adapter.subscribeStates('*');
        adapter.subscribeObjects('*');

        /*for (const id in channels) {
            if (!channels.hasOwnProperty(id)) continue;

            if (channels[id].native.autoRepair) lastReceived[id] = new Date().getTime();
        }*/

        if (adapter.config.comName) {
            start();
        } else {
            adapter.log.warn('No COM port defined');
        }
    });
}

// If started as allInOne/compact mode => return function to create instance
if (module && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
