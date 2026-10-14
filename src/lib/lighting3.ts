import { Lighting3 as RfxLighting3, lighting3, type RfxCom } from 'rfxcom';

import {
    callTransmitter,
    isOn,
    subtypeNumber,
    type CommandCallback,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
} from './types';

const COMMANDS = ['switchOn', 'switchOff', 'increaseLevel', 'decreaseLevel'];

/** rfxcom uses dim levels 0 - 10, the `level` state is 0 - 100 % */
const MAX_LEVEL = 10;

export class Lighting3 implements RfxDevice {
    public readonly commands = COMMANDS;

    private readonly device: RfxLighting3;

    public constructor(
        comm: RfxCom,
        private readonly options: DeviceOptions,
        private readonly log?: ioBroker.Logger,
    ) {
        if (!options?.deviceId) {
            log?.warn('No device id is defined');
            throw new Error('No device id is defined');
        }
        // Device ID must be 9/1
        // 9 is systemCode from 1 to 16
        // 1 is channelNumber from 1 to 10

        this.device = new RfxLighting3(comm, subtypeNumber(lighting3, 'KOPPLA'));
    }

    public program(callback: CommandCallback): void {
        try {
            this.device.program(this.options.deviceId, callback);
        } catch (e) {
            callback(e);
        }
    }

    public sendCommand(cmd: string, value: ioBroker.StateValue, callback: CommandCallback): void {
        try {
            if (cmd === 'state') {
                if (isOn(value)) {
                    this.device.switchOn(this.options.deviceId, callback);
                } else {
                    this.device.switchOff(this.options.deviceId, callback);
                }
            } else if (cmd === 'level' || cmd === 'setLevel') {
                const level = Math.min(Math.max(Math.round((Number(value) * MAX_LEVEL) / 100), 0), MAX_LEVEL);
                this.device.setLevel(this.options.deviceId, level, callback);
            } else if (!COMMANDS.includes(cmd) || !callTransmitter(this.device, cmd, this.options.deviceId, callback)) {
                this.log?.warn(`Unknown command: ${cmd}`);
                callback(`Unknown command: ${cmd}`);
            }
        } catch (e) {
            callback(e);
        }
    }

    public getObjects(prefix: string, name?: string): DeviceObject[] {
        const objs: DeviceObject[] = [];
        const id = prefix + this.options.deviceId.replace('/', '_');

        objs.push({
            _id: id,
            common: {
                name: name || `Lighting 3 ${this.options.deviceId}`,
                role: 'state',
            },
            type: 'channel',
            native: {
                deviceId: this.options.deviceId,
            },
        });

        for (const command of COMMANDS) {
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
