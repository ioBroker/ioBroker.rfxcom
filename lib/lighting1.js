const rfxcom = require('rfxcom');

const subTypes = [
    'X10', 'ARC', 'ELRO', 'WAVEMAN', 'CHACON', 'IMPULS', 'RISING_SUN',
    'PHILIPS_SBC', 'ENERGENIE_ENER010', 'ENERGENIE_5_GANG', 'COCO'
];

const commands = [
    'switchOn',
    'switchOff',
    'increaseLevel',
    'decreaseLevel',
    'chime'
];

function Lighting1(comm, options, log) {
    options = options || {};
    this.commands = commands;

    if (!options.deviceId) {
        log && log.warn('No device id is defined');
        return;
    }

    if (!subTypes.includes(options.subtype)) {
        log && log.warn('No subtype or invalid subtype is defined. Please define on of ' + subTypes.join(', '));
        return;
    }

    this.sendCommand = function (cmd, level, callback) {
        if (typeof level === 'function') {
            callback = level;
            level = 0;
        }
        if (cmd === 'state') {
            if (value === 'true' || value === '1' || value === 1 || value === 'true' || value === 'on') {
                this.device.switchOn(options.deviceId, callback);
            } else {
                this.device.switchOff(options.deviceId, callback);
            }
        } else {
            if (!this.commands.includes(cmd)) {
                log.warn('Unknown command: ' + cmd);
                callback && callback('Unknown command: ' + cmd);
            } else {
                this.device[cmd](options.deviceId, callback);
            }
        }
    };

    this.getObjects = function (prefix, name) {
        const objs = [];

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_'),
            common: {
                name: name || ('Lighting 1 ' + options.deviceId),
                role: 'state'
            },
            type: 'channel',
            native: {
                deviceId: options.deviceId,
                subtype:  options.subtype
            }
        });

        for (let c = 0; c < commands.length; c++) {
            if (commands[c] === 'chime') {
                continue;
            }

            objs.push({
                _id: prefix + options.deviceId.replace('/', '_') + '.' + this.commands[c],
                common: {
                    name: `${name || options.deviceId} ${this.commands[c]}`,
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button'
                },
                type: 'state',
                native: {}
            });
        }

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.state',
            common: {
                name: options.deviceId + ' on and off in one state',
                desc: 'write true for on and false for off',
                type: 'boolean',
                read: true,
                write: true,
                role: 'switch'
            },
            type: 'state',
            native: {}
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.allOff',
            common: {
                name: options.deviceId + ' received allOff',
                type: 'boolean',
                read: true,
                write: false,
                role: 'state'
            },
            type: 'state',
            native: {}
        });
        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.allOn',
            common: {
                name: options.deviceId + ' received allOn',
                type: 'boolean',
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
            _id: prefix + options.deviceId.replace('/', '_') + '.chime',
            common: {
                name: options.deviceId + ' chime',
                type: 'boolean',
                read: true,
                write: true,
                role: 'state'
            },
            type: 'state',
            native: {}
        });
        return objs;
    };

    this.getStates = function (prefix, event) {
        //data = {
        //    id: "0x" + self.dumpHex(data.slice(2, 4), false).join(""), // Redundant?
        //    subtype: data[0],
        //    seqnbr: data[1],
        //    housecode: String.fromCharCode(data[2]).toUpperCase(),
        //    unitcode: data[3],
        //    commandNumber: data[4],
        //    command: commands[data[4]] || "Unknown",
        //    rssi: (data[5] >> 4) & 0xf
        //};
        //commands = {
        //    0: "Off",
        //    1: "On",
        //    2: "Dim",
        //    3: "Bright",
        //    5: "All Off",
        //    6: "All On",
        //    7: "Chime"
        //},

        const states = [];
        const id = prefix + options.deviceId.replace('/', '_');
        states.push({id: id + '.rssi', val: {val: event.rssi, ack: true}});

        switch (event.commandNumber) {
            case 0: // Off
                states.push({id: id + '.switchOff', val: {val: true, ack: true}});
                states.push({id: id + '.state', val: {val: false, ack: true}});
                break;

            case 1: // On
                states.push({id: id + '.switchOn', val: {val: true, ack: true}});
                states.push({id: id + '.state', val: {val: true, ack: true}});
                break;

            case 2: // Dim
                states.push({id: id + '.decreaseLevel', val: {val: true, ack: true}});
                break;

            case 3: // Bright
                states.push({id: id + '.increaseLevel', val: {val: true, ack: true}});
                break;

            case 5: // All Off
                states.push({id: id + '.allOn', val: {val: true, ack: true}});
                break;

            case 6: // All Off
                states.push({id: id + '.allOff', val: {val: true, ack: true}});
                break;

            case 7: // Chime
                states.push({id: id + '.chime', val: {val: true, ack: true}});
                break;

            default:
                log.warn('Unrecognised Lighting1 command ' + data.commandNumber.toString(16));
                return;
        }

        return states;
    };

    // constructor
    this.device = new rfxcom.Lighting1(comm, options.subtype);

    return this;
}

Lighting1.prototype.subTypes = subTypes;

module.exports = Lighting1;