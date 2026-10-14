import { Lighting2 as RfxLighting2, lighting2, type RfxCom } from 'rfxcom';

import {
    callTransmitter,
    isOn,
    subtypeNumber,
    type CommandCallback,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
    type RfxEvent,
    type StateTask,
} from './types';

/** Subtype names by the number received in `lighting2` events (same order as in rfxcom) */
const SUB_TYPES = ['AC', 'HOMEEASY_EU', 'ANSLUT', 'KAMBROOK'];

const COMMANDS = ['switchOn', 'switchOff'];

/** rfxcom uses dim levels 0 - 15, the `level` state is 0 - 100 % */
const MAX_LEVEL = 15;

export class Lighting2 implements RfxDevice {
    public static readonly subTypes = SUB_TYPES;

    public readonly commands = COMMANDS;

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

        this.device = new RfxLighting2(comm, subtypeNumber(lighting2, options.subtype));
    }

    public sendCommand(cmd: string, value: ioBroker.StateValue, callback: CommandCallback): void {
        try {
            if (cmd === 'state') {
                if (isOn(value)) {
                    this.device.switchOn(this.options.deviceId, callback);
                } else {
                    this.device.switchOff(this.options.deviceId, callback);
                }
            } else if (cmd === 'level') {
                const level = Math.min(Math.max(Math.round((Number(value) * MAX_LEVEL) / 100), 0), MAX_LEVEL);
                this.device.setLevel(this.options.deviceId, level, callback);
            } else if (
                !this.commands.includes(cmd) ||
                !callTransmitter(this.device, cmd, this.options.deviceId, callback)
            ) {
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

    public getStates(prefix: string, event: RfxEvent): StateTask[] {
        //  event = {
        //     subtype: data[0],
        //     seqnbr: data[1],
        //     id: "0x" + self.dumpHex(idBytes, false).join(""),
        //     unitCode: data[6],
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
        const level = Math.round(((event.level ?? 0) / MAX_LEVEL) * 100);
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
                states.push({ id: `${id}.level`, val: { val: level, ack: true } });
                break;

            case 3: // Group Off
                states.push({ id: `${id}.groupOff`, val: { val: true, ack: true } });
                break;

            case 4: // Group On
                states.push({ id: `${id}.groupOn`, val: { val: true, ack: true } });
                break;

            case 5: // Set Group Level
                states.push({ id: `${id}.groupLevel`, val: { val: level, ack: true } });
                break;

            default:
                this.log?.warn(`Unrecognised Lighting2 command ${event.commandNumber?.toString(16)}`);
                break;
        }

        return states;
    }
}
