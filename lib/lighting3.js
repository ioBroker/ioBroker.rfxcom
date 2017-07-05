var rfxcom = require('rfxcom');

this.commands = [
    'switchOn',
    'switchOff',
    'setLevel',
    'increaseLevel',
    'decreaseLevel'
];

function Lighting3(comm, options, log) {
    options = options || {};
    if (!options.deviceId) {
        log && log.warn('No device id is defined');
        return;
    }

    // Device ID must be 9/1
    // 9 is systemCode from 1 to 16
    // 1 is channelNumber from 1 to 10

    this.program = function (callback) {
        try {
            this.device.program(options.deviceId, callback);
        } catch (e) {
            callback(e);
        }
    };

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
        } else if (cmd === 'setLevel') {
            this.device.setLevel(options.deviceId, Math.round(level / 10), callback);
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
        var objs = [];

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_'),
            common: {
                name: name || 'RFY Device ' + options.deviceId,
                role: 'state'
            },
            type: 'channel',
            native: {
                deviceId: options.deviceId
            }
        });

        for (var c = 0; c < commands.length; c++) {
            if (commands[c] === 'setLevel') continue;

            objs.push({
                _id: prefix + options.deviceId.replace('/', '_') + '.' + commands[c],
                common: {
                    name: (name || options.deviceId) + ' ' + commands[c],
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
                read: false,
                write: true,
                role: 'switch'
            },
            type: 'state',
            native: {}
        });

        objs.push({
            _id: prefix + options.deviceId.replace('/', '_') + '.level',
            common: {
                name: options.deviceId + ' dim level',
                min: 0,
                max: 100,
                unit: '%',
                type: 'number',
                read: false,
                write: true,
                role: 'level.dimmer'
            },
            type: 'state',
            native: {}
        });

        return objs;
    };

    // constructor
    this.device = new rfxcom.Lighting3(comm, 'KOPPLA');

    return this;
}

module.exports = Lighting3;