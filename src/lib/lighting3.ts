import { Lighting3 as RfxLighting3, type RfxCom, type TransmitCallback } from 'rfxcom';

import {
    callDeviceMethod,
    isOn,
    type CommandCallback,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
} from './types';

const COMMANDS = ['switchOn', 'switchOff', 'setLevel', 'increaseLevel', 'decreaseLevel'];

export class Lighting3 implements RfxDevice {
    public readonly commands = COMMANDS;

    private readonly device: RfxLighting3;

    public constructor(
        comm: RfxCom,
        private readonly options: DeviceOptions,
        private readonly log?: ioBroker.Logger,
    ) {
        // The old constructor returned a half-initialized object here, so the next call of a
        // method failed with a TypeError. Throwing makes that failure explicit.
        if (!options?.deviceId) {
            log?.warn('No device id is defined');
            throw new Error('No device id is defined');
        }
        // Device ID must be 9/1
        // 9 is systemCode from 1 to 16
        // 1 is channelNumber from 1 to 10

        this.device = new RfxLighting3(comm, 'KOPPLA');
    }

    public program(callback: TransmitCallback): void {
        try {
            // BUG (kept): rfxcom's Lighting3 has no `program()`, this always ends in the catch block
            callDeviceMethod(this.device, 'program', this.options.deviceId, callback);
        } catch (e) {
            callback(e);
        }
    }

    public sendCommand(cmd: string, level: ioBroker.StateValue | CommandCallback, callback?: CommandCallback): void {
        if (typeof level === 'function') {
            callback = level;
            level = 0;
        }
        if (cmd === 'state') {
            // The old code checked an undefined variable `value` here. This branch cannot be reached,
            // because `state` is not in `commands`, which main.ts checks first.
            if (isOn(level)) {
                this.device.switchOn(this.options.deviceId, callback);
            } else {
                this.device.switchOff(this.options.deviceId, callback);
            }
        } else if (cmd === 'setLevel') {
            this.device.setLevel(this.options.deviceId, Math.round(Number(level) / 10), callback);
        } else if (!COMMANDS.includes(cmd)) {
            this.log?.warn(`Unknown command: ${cmd}`);
            callback?.(`Unknown command: ${cmd}`);
        } else {
            // BUG (kept): rfxcom's Lighting3 has no `increaseLevel`/`decreaseLevel`, this throws a TypeError
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
                role: 'state',
            },
            type: 'channel',
            native: {
                deviceId: this.options.deviceId,
            },
        });

        for (const command of COMMANDS) {
            if (command === 'setLevel') {
                continue;
            }

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
                name: `${this.options.deviceId} on and off in one state`,
                desc: 'write true for on and false for off',
                type: 'boolean',
                read: false,
                write: true,
                role: 'switch',
            },
            type: 'state',
            native: {},
        });

        objs.push({
            _id: `${id}.level`,
            common: {
                name: `${this.options.deviceId} dim level`,
                min: 0,
                max: 100,
                unit: '%',
                type: 'number',
                read: false,
                write: true,
                role: 'level.dimmer',
            },
            type: 'state',
            native: {},
        });

        return objs;
    }
}
