var rfxcom = require('rfxcom');

var subTypes = ['WEIGHT_UNUSED', 'WEIGHT1', 'WEIGHT2'];

function Weight(comm, options, log) {
    options = options || {};
    if (!options.deviceId) {
        log && log.warn('No device id is defined');
        return;
    }

    if (subTypes.indexOf(options.subtype) === -1) {
        log && log.warn('No subtype or invalid subtype is defined. Please define on of ' + subTypes.join(', '));
        return;
    }

    this.sendCommand = function (cmd, level, callback) {
        if (typeof level === 'function') {
            callback = level;
            level = 0;
        }
        if (typeof callback === 'function') {
            callback('Command not supported');
        }
    };

    this.getObjects = function (prefix, name) {
        var objs = [];

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_'),
            common: {
                name: name || 'Weight ' + options.deviceId,
                role: 'state'
            },
            type: 'channel',
            native: {
                deviceId: options.deviceId,
                subtype:  options.subtype
            }
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.weight',
            common: {
                name: options.deviceId + ' weight',
                unit: 'kg',
                type: 'number',
                read: true,
                write: false,
                role: 'state'
            },
            type: 'state',
            native: {}
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.rssi',
            common: {
                name: options.deviceId + ' signal strength',
                type: 'number',
                read: true,
                write: false,
                unit: 'dBm',
                role: 'value.rssi'
            },
            type: 'state',
            native: {}
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.battery',
            common: {
                name: options.deviceId + ' battery level',
                type: 'number',
                min: 0,
                max: 100,
                unit: '%',
                read: true,
                write: false,
                role: 'state'
            },
            type: 'state',
            native: {}
        });
        return objs;
    };

    this.getStates = function (prefix, event) {
        // data = {
        //    subtype: data[0],
        //    id: id,
        //    seqnbr: data[1],
        //    weight: (data[4] *256 + data[5]) / 10,
        //    rssi: batterySignalLevel & 0x0f,
        //    batteryLevel: (batterySignalLevel >> 4) & 0xf
        // };

        var states = [];
        var id = prefix + options.deviceId.replace('/', '_');
        states.push({id: id + '.rssi', val: {val: event.rssi, ack: true}});
        states.push({id: id + '.battery', val: {val: (event.batteryLevel / 16) * 100, ack: true}});
        states.push({id: id + '.weight', val: {val: event.weight, ack: true}});

        return states;
    };

    return this;
}

Weight.prototype.subTypes = subTypes;

module.exports = Weight;