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
import { Rfy, type RfxCom, type TransmitCallback } from 'rfxcom';

import {
    callDeviceMethod,
    isOn,
    type CommandCallback,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
} from './types';

export class RFY implements RfxDevice {
    public readonly commands = [
        'up',
        'down',
        'stop',
        'venetianOpenUS',
        'venetianCloseUS',
        'venetianIncreaseAngleUS',
        'venetianDecreaseAngleUS',
        'venetianOpenEU',
        'venetianCloseEU',
        'venetianIncreaseAngleEU',
        'venetianDecreaseAngleEU',
        'enableSunSensor',
        'disableSunSensor',
    ];

    private readonly device: Rfy;

    public constructor(
        comm: RfxCom,
        private readonly options: DeviceOptions,
        private readonly log?: ioBroker.Logger,
    ) {
        // The old constructor returned a half-initialized object in these cases, so the next call of a
        // method failed with a TypeError. Throwing makes that failure explicit.
        if (!options?.deviceId) {
            log?.warn('No device id is defined');
            throw new Error('No device id is defined');
        }

        if (options.subtype !== 'RFY' && options.subtype !== 'RFYEXT' && options.subtype !== 'ASA') {
            log?.warn('No subtype or invalid subtype is defined. Please define RFY, RFYEXT or ASA');
            throw new Error('Invalid subtype');
        }
        // Device ID must be AABBCC/1
        // AABBCC is hex Device ID

        // 1 is unitCode
        //   RFY - 0 - 4
        //   RFYEXT - 0 - 0x0f
        //   ASA - 1 - 5

        this.device = new Rfy(comm, options.subtype);
    }

    public program(callback: TransmitCallback): void {
        try {
            this.device.program(this.options.deviceId, callback);
        } catch (e) {
            callback(e);
        }
    }

    public erase(callback: TransmitCallback): void {
        try {
            this.device.erase(this.options.deviceId, callback);
        } catch (e) {
            callback(e);
        }
    }

    public eraseAll(callback: TransmitCallback): void {
        try {
            this.device.eraseAll(callback);
        } catch (e) {
            callback(e);
        }
    }

    public sendCommand(cmd: string, value: ioBroker.StateValue | CommandCallback, callback?: CommandCallback): void {
        if (cmd === 'state') {
            if (isOn(value)) {
                this.device.up(this.options.deviceId, callback);
            } else {
                this.device.down(this.options.deviceId, callback);
            }
        } else if (
            !this.commands.includes(cmd) ||
            typeof (this.device as unknown as Record<string, unknown>)[cmd] !== 'function'
        ) {
            this.log?.warn(`Unknown command: ${cmd}`);
            callback?.(`Unknown command: ${cmd}`);
        } else {
            callDeviceMethod(this.device, cmd, this.options.deviceId, callback);
        }
    }

    public getObjects(prefix: string, name?: string): DeviceObject[] {
        const objs: DeviceObject[] = [];
        const id = prefix + this.options.deviceId.replace('/', '_');

        objs.push({
            _id: id,
            common: {
                name: name || `RFY Device ${this.options.deviceId}`,
                role: 'blind',
            },
            type: 'channel',
            native: {
                deviceId: this.options.deviceId,
                subtype: this.options.subtype,
            },
        });

        for (const command of this.commands) {
            objs.push({
                _id: `${id}.${command}`,
                common: {
                    name: `${name || this.options.deviceId} ${command}`,
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button',
                },
                type: 'state',
                native: {},
            });
        }

        objs.push({
            _id: `${id}.state`,
            common: {
                name: `${this.options.deviceId} up and down in one state`,
                desc: 'write true for up and false for down',
                type: 'boolean',
                read: false,
                write: true,
                role: 'switch',
            },
            type: 'state',
            native: {},
        });

        return objs;
    }
}
