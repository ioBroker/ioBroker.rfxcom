const rfxcom = require('rfxcom');

const commands = [
    'open', 'close', 'stop'
];

function Curtain1(comm, options, log) {
    options = options || {};
    if (!options.deviceId) {
        return log && log.warn('No device id is defined');
    }

    this.commands = commands;
    // Device ID must be AB/DE
    // AB is House code in HEX
    // DE is Unit code in HEX

    this.program = function (callback) {
        this.device.program(options.deviceId, callback);
    };

    this.sendCommand = function (cmd, callback) {
        if (cmd === 'state') {
            if (value === 'true' || value === '1' || value === 1 || value === 'true' || value === 'on') {
                this.device.open(options.deviceId, callback);
            } else {
                this.device.close(options.deviceId, callback);
            }
        } else if (!commands.includes(cmd)) {
            log.warn('Unknown command: ' + cmd);
            callback && callback('Unknown command: ' + cmd);
        } else {
            this.device[cmd](options.deviceId, callback)
        }
    };

    this.getObjects = function (prefix, name) {
        const objs = [];

        objs.push({
            common: {
                id: prefix + options.deviceId.replace('/', '_'),
                name: name || ('Curtain ' + options.deviceId),
                role: 'blind'
            },
            type: 'channel',
            native: {
                deviceId: options.deviceId
            }
        });

        for (let c = 0; c < commands.length; c++) {
            objs.push({
                common: {
                    id: prefix + options.deviceId.replace('/', '_') + '.' + commands[c],
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
            common: {
                id: prefix + options.deviceId.replace('/', '_') + '.state',
                name: options.deviceId + ' open and close in one state',
                desc: 'write true for open and false for close',
                type: 'boolean',
                read: false,
                write: true,
                role: 'switch'
            },
            type: 'state',
            native: {}
        });

        return objs;
    };

    // constructor
    this.device = new rfxcom.Curtain1(comm, 'HARRISON');

    return this;
}

module.exports = Curtain1;