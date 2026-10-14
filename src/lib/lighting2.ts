// NOTE: This class is not registered in `DEVICES` in main.ts and was never used by the old code either.
// `lighting2` events end up in `getDevice()` with the type `Lighting2`, which is unknown there.
import { Lighting2 as RfxLighting2, type RfxCom } from 'rfxcom';

import {
    callDeviceMethod,
    isOn,
    type CommandCallback,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
    type RfxEvent,
    type StateTask,
} from './types';

const SUB_TYPES = ['AC', 'HOMEEASY_EU', 'ANSLUT', 'KAMBROOK'];

const COMMANDS = ['switchOn', 'switchOff', 'level'];

export class Lighting2 implements RfxDevice {
    public readonly commands = COMMANDS;
    /** Was `Lighting2.prototype.subTypes` - an instance attribute, not a static one */
    public readonly subTypes = SUB_TYPES;

    private readonly device: RfxLighting2;

    public constructor(
        comm: RfxCom,
        private readonly options: DeviceOptions,
        private readonly log?: ioBroker.Logger,
    ) {
        if (!options?.deviceId) {
            log?.warn('No device id is defined');
            throw new Error('No device id is defined');
        }

        if (!options.subtype || !SUB_TYPES.includes(options.subtype)) {
            log?.warn(`No subtype or invalid subtype is defined. Please define on of ${SUB_TYPES.join(', ')}`);
            throw new Error('Invalid subtype');
        }

        this.device = new RfxLighting2(comm, options.subtype);
    }

    public sendCommand(cmd: string, level: ioBroker.StateValue | CommandCallback, callback?: CommandCallback): void {
        if (typeof level === 'function') {
            callback = level;
            level = 0;
        }
        if (cmd === 'state') {
            // the old code checked an undefined variable `value` here
            if (isOn(level)) {
                this.device.switchOn(this.options.deviceId, callback);
            } else {
                this.device.switchOff(this.options.deviceId, callback);
            }
        } else if (cmd === 'level') {
            this.device.setLevel(this.options.deviceId, Math.round(Number(level) / 16), callback);
        } else if (!this.commands.includes(cmd)) {
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
                name: name || `Lighting 2 ${this.options.deviceId}`,
                role: 'state',
            },
            type: 'channel',
            native: {
                deviceId: this.options.deviceId,
                subtype: this.options.subtype,
            },
        });

        for (const command of this.commands) {
            if (command === 'level') {
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
                read: true,
                write: true,
                role: 'switch',
            },
            type: 'state',
            native: {},
        });

        objs.push({
            _id: `${id}.level`,
            common: {
                name: `${this.options.deviceId} level`,
                type: 'number',
                min: 0,
                max: 100,
                unit: '%',
                read: true,
                write: true,
                role: 'level.dimmer',
            },
            type: 'state',
            native: {},
        });

        objs.push({
            _id: `${id}.groupLevel`,
            common: {
                name: `${this.options.deviceId} group level`,
                type: 'number',
                min: 0,
                max: 100,
                unit: '%',
                read: true,
                write: false,
                role: 'value.dimmer',
            },
            type: 'state',
            native: {},
        });

        objs.push({
            _id: `${id}.groupOff`,
            common: {
                name: `${this.options.deviceId} group off`,
                type: 'boolean',
                read: true,
                write: false,
                role: 'state',
            },
            type: 'state',
            native: {},
        });

        objs.push({
            _id: `${id}.groupOn`,
            common: {
                name: `${this.options.deviceId} group on`,
                type: 'boolean',
                read: true,
                write: false,
                role: 'state',
            },
            type: 'state',
            native: {},
        });

        objs.push({
            _id: `${id}.rssi`,
            common: {
                name: `${this.options.deviceId} signal strength`,
                type: 'number',
                read: true,
                write: false,
                unit: 'dBm',
                role: 'value.rssi',
            },
            type: 'state',
            native: {},
        });

        return objs;
    }

    public getStates(prefix: string, event: RfxEvent): StateTask[] | undefined {
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

        const states: StateTask[] = [];
        const id = prefix + this.options.deviceId.replace('/', '_');
        states.push({ id: `${id}.rssi`, val: { val: event.rssi ?? null, ack: true } });

        switch (event.commandNumber) {
            case 0: // Off
                states.push({ id: `${id}.switchOff`, val: { val: true, ack: true } });
                states.push({ id: `${id}.state`, val: { val: false, ack: true } });
                break;

            case 1: // On
                states.push({ id: `${id}.switchOn`, val: { val: true, ack: true } });
                states.push({ id: `${id}.state`, val: { val: true, ack: true } });
                break;

            case 2: // Set Level
                states.push({ id: `${id}.level`, val: { val: ((event.level ?? 0) / 16) * 100, ack: true } });
                break;

            case 3: // Group Off
                states.push({ id: `${id}.groupOff`, val: { val: true, ack: true } });
                break;

            case 4: // Group On
                states.push({ id: `${id}.groupOn`, val: { val: true, ack: true } });
                break;

            case 5: // Set Group Level
                states.push({ id: `${id}.groupLevel`, val: { val: ((event.level ?? 0) / 16) * 100, ack: true } });
                break;

            default:
                // the old code referenced an undefined variable `data` here
                this.log?.warn(`Unrecognised Lighting2 command ${event.commandNumber?.toString(16)}`);
                return;
        }

        return states;
    }
}
