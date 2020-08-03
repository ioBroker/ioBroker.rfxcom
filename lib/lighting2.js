const rfxcom = require('rfxcom');

const subTypes = ['AC', 'HOMEEASY_EU', 'ANSLUT', 'KAMBROOK'];

const commands = [
    'switchOn',
    'switchOff',
    'level'
];

function Lighting2(comm, options, log) {
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
        if (cmd === 'state') {
            if (value === 'true' || value === '1' || value === 1 || value === 'true' || value === 'on') {
                this.device.switchOn(options.deviceId, callback);
            } else {
                this.device.switchOff(options.deviceId, callback);
            }
        }  else if (cmd === 'level') {
            this.device.setLevel(options.deviceId, Math.round(level / 16), callback);
        } else {
            if (this.commands.indexOf(cmd) === -1) {
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
                name: name || 'Lighting 2 ' + options.deviceId,
                role: 'state'
            },
            type: 'channel',
            native: {
                deviceId: options.deviceId,
                subtype:  options.subtype
            }
        });

        for (let c = 0; c < this.commands.length; c++) {
            if (this.commands[c] === 'level') {
                continue;
            }

            objs.push({
                _id: prefix + options.deviceId.replace('/', '_') + '.' + this.commands[c],
                common: {
                    name: (name || options.deviceId) + ' ' + this.commands[c],
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
            _id: prefix + options.deviceId.replace('/', '_') + '.level',
            common: {
                name: options.deviceId + ' level',
                type: 'number',
                min: 0,
                max: 100,
                unit: '%',
                read: true,
                write: true,
                role: 'level.dimmer'
            },
            type: 'state',
            native: {}
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.groupLevel',
            common: {
                name: options.deviceId + ' group level',
                type: 'number',
                min: 0,
                max: 100,
                unit: '%',
                read: true,
                write: false,
                role: 'value.dimmer'
            },
            type: 'state',
            native: {}
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.groupOff',
            common: {
                name: options.deviceId + ' group off',
                type: 'boolean',
                read: true,
                write: false,
                role: 'state'
            },
            type: 'state',
            native: {}
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.groupOn',
            common: {
                name: options.deviceId + ' group on',
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

        return objs;
    };

    this.getStates = function (prefix, event) {
        //  event = {
        //     subtype: data[0],
        //     seqnbr: data[1],
        //     id: "0x" + self.dumpHex(idBytes, false).join(""),
        //     unitcode: data[6],
        //     commandNumber: data[7],
        //     command: commands[data[7]] || "Unknown",
        //     level: data[8],
        //     rssi: (data[9] >> 4) & 0xf
        //   };
        //   commands = {
        //     0: "Off",
        //     1: "On",
        //     2: "Set Level",
        //     3: "Group Off",
        //     4: "Group On",
        //     5: "Set Group Level"
        //  };

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

            case 2: // Set Level
                states.push({id: id + '.level', val: {val: (event.level / 16) * 100, ack: true}});
                break;

            case 3: // Group Off
                states.push({id: id + '.groupOff', val: {val: true, ack: true}});
                break;

            case 4: // Group On
                states.push({id: id + '.groupOn', val: {val: true, ack: true}});
                break;

            case 5: // Set Group Level
                states.push({id: id + '.groupLevel', val: {val: (event.level / 16) * 100, ack: true}});
                break;

            default:
                log.warn('Unrecognised Lighting2 command ' + data.commandNumber.toString(16));
                return;
        }

        return states;
    };

    // constructor
    this.device = new rfxcom.Lighting2(comm, options.subtype);

    return this;
}

Lighting2.prototype.subTypes = subTypes;

module.exports = Lighting2;