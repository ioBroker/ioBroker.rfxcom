// RFXtrx User-Guide on page 29

// 10. Somfy RTS
// Somfy RTS* devices can only be controlled by the RFXtrx433E. (not with the RFXtrx433)
// The RFXtrx433E version is an RFXtrx433 with additional hardware to enable the RFY protocol
// used to control Somfy RTS.
//
//     To pair the Somfy RTS device:
//      • Select a unique ID and unitcode for the RFXCOM RFY device.
//      • Disconnect power from all Somfy RTS devices except the device to pair.
//      • Press the Program button > 2 seconds on the original Somfy remote until the Somfy device responds.
//      • Transmit a Program command with the RFXtrx433E. The Somfy RTS device should respond indicating the pair command was successful.
//
//     The RFXCOM remote is registered in the RFXtrx433E by sending a Program command.
//     Up to 16 RFXCOM remotes can be registered in the RFXtrx433E.
//     Remotes can be erased from the RFXtrx433E using the RFXmngr program.
//     The Somfy RTS device can be controlled by any application as long as the same ID and Unit Code are used.
//     For example if the RTS device is paired using RFXmngr with ID=1 02 03 and Unit Code 1, the RTS device can be controlled with Homeseer using the same ID and unit code.
//
// Somfy RTS are registered trademarks of Somfy System, Inc.

function RTY(rfxcom, options, log) {
    options = options || {};
    if (!options.deviceId) {
        log && log.warn('No device id is defined');
        return;
    }

    if (options.subtype !== 'RFY' && options.subtype !== 'RFYEXT'  && options.subtype !== 'ASA') {
        log && log.warn('No subtype or invalid subtype is defined. Please define RFY, RFYEXT or ASA');
        return;
    }

    // Device ID must be AABBCC/1
    // AABBCC is hex Device ID

    // 1 is unitCode
    //   RFY - 0 - 4
    //   RFYEXT - 0 - 0x0f
    //   ASA - 1 - 5

    this.program = function (callback) {
        this.device.program(options.deviceId, callback);
    };

    this.commands = [
        'up', 'down', 'stop',
        'venetianOpenUS', 'venetianCloseUS', 'venetianIncreaseAngleUS', 'venetianDecreaseAngleUS',
        'venetianOpenEU', 'venetianCloseEU', 'venetianIncreaseAngleEU', 'venetianDecreaseAngleEU',
        'enableSunSensor', 'disableSunSensor'
    ];

    this.sendCommand = function (cmd, callback) {
        if (this.commands.indexOf(cmd) === -1) {
            log.warn('Unknown command: ' + cmd);
            callback && callback('Unknown command: ' + cmd);
        } else {
            this.device[cmd](options.deviceId, callback)
        }
    };

    this.getObjects = function (prefix, name) {
        var objs = [];

        objs.push({
            common: {
                id: prefix + options.deviceId.replace('/', '_'),
                name: name || 'RTY Device ' + options.deviceId,
                role: 'blind'
            },
            type: 'channel',
            native: {
                deviceId: options.deviceId,
                subtype:  options.subtype
            }
        });

        for (var c = 0; c < this.commands; c++) {
            objs.push({
                common: {
                    id: prefix + options.deviceId.replace('/', '_') + '.' + this.commands[c],
                    name: (name || options.deviceId) + ' ' + this.commands[c],
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button'
                },
                type: 'state',
                native: {
                    command:  this.commands[c]
                }
            });
        }

        objs.push({
            common: {
                id: prefix + 'RTY_' + options.deviceId.replace('/', '_') + '.state',
                name: options.deviceId + ' up and down in one state',
                desc: 'write true for up and false for down',
                type: 'boolean',
                read: false,
                write: true,
                role: 'switch'
            },
            type: 'state',
            native: {
                command:  this.commands[c]
            }
        });

        return objs;
    };

    // constructor
    this.device = new rfxcom.Rfy(rfxcom, options.subtype);

    return this;
}

module.exports = RTY;