import { Curtain1 as RfxCurtain1, type RfxCom, type TransmitCallback } from 'rfxcom';

import {
    callDeviceMethod,
    isOn,
    type CommandCallback,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
} from './types';

const COMMANDS = ['open', 'close', 'stop'];

export class Curtain1 implements RfxDevice {
    public readonly commands = COMMANDS;

    private readonly device: RfxCurtain1;

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
        // Device ID must be AB/DE
        // AB is House code in HEX
        // DE is Unit code in HEX

        this.device = new RfxCurtain1(comm, 'HARRISON');
    }

    public program(callback: TransmitCallback): void {
        this.device.program(this.options.deviceId, callback);
    }

    /**
     * BUG (kept): the old signature was `sendCommand(cmd, callback)`, but main.ts calls
     * `sendCommand(cmd, value, callback)`. So the state value was passed to rfxcom as callback (and
     * ignored there) and the real callback was never called.
     */
    public sendCommand(cmd: string, value: ioBroker.StateValue | CommandCallback, _callback?: CommandCallback): void {
        if (cmd === 'state') {
            // The old code checked an undefined variable `value` here. This branch cannot be reached,
            // because `state` is not in `commands`, which main.ts checks first.
            if (isOn(value)) {
                callDeviceMethod(this.device, 'open', this.options.deviceId, value);
            } else {
                callDeviceMethod(this.device, 'close', this.options.deviceId, value);
            }
        } else if (!COMMANDS.includes(cmd)) {
            this.log?.warn(`Unknown command: ${cmd}`);
            if (typeof value === 'function') {
                value(`Unknown command: ${cmd}`);
            }
        } else {
            callDeviceMethod(this.device, cmd, this.options.deviceId, value);
        }
    }

    /** BUG (kept): the IDs are written into `common.id` instead of `_id` */
    public getObjects(prefix: string, name?: string): DeviceObject[] {
        const objs: DeviceObject[] = [];
        const id = prefix + this.options.deviceId.replace('/', '_');

        objs.push({
            common: {
                id,
                name: name || `Curtain ${this.options.deviceId}`,
                role: 'blind',
            },
            type: 'channel',
            native: {
                deviceId: this.options.deviceId,
            },
        });

        for (const command of COMMANDS) {
            objs.push({
                common: {
                    id: `${id}.${command}`,
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
            common: {
                id: `${id}.state`,
                name: `${this.options.deviceId} open and close in one state`,
                desc: 'write true for open and false for close',
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
