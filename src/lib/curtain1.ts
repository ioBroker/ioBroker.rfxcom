import { Curtain1 as RfxCurtain1, curtain1, type RfxCom } from 'rfxcom';

import {
    callTransmitter,
    isOn,
    subtypeNumber,
    type CommandCallback,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
} from './types';

const COMMANDS = ['open', 'close', 'stop'];

export class Curtain1 implements RfxDevice {
    public readonly commands = COMMANDS;

    private readonly device: RfxCurtain1;
    /** Device ID as array `[houseCode, unitCode]`; rfxcom splits a string "A/1" wrongly */
    private readonly address: string[];

    public constructor(
        comm: RfxCom,
        private readonly options: DeviceOptions,
        private readonly log?: ioBroker.Logger,
    ) {
        if (!options?.deviceId) {
            log?.warn('No device id is defined');
            throw new Error('No device id is defined');
        }
        // Device ID must be A/1
        // A is the house code (A - P)
        // 1 is the unit code (1 - 16)

        this.address = options.deviceId.split('/');
        this.device = new RfxCurtain1(comm, subtypeNumber(curtain1, 'HARRISON'));
    }

    public program(callback: CommandCallback): void {
        try {
            this.device.program(this.address, callback);
        } catch (e) {
            callback(e);
        }
    }

    public sendCommand(cmd: string, value: ioBroker.StateValue, callback: CommandCallback): void {
        try {
            if (cmd === 'state') {
                if (isOn(value)) {
                    this.device.open(this.address, callback);
                } else {
                    this.device.close(this.address, callback);
                }
            } else if (!COMMANDS.includes(cmd) || !callTransmitter(this.device, cmd, this.address, callback)) {
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
