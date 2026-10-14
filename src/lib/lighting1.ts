import { Lighting1 as RfxLighting1, type RfxCom } from 'rfxcom';

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

const SUB_TYPES = [
    'X10',
    'ARC',
    'ELRO',
    'WAVEMAN',
    'CHACON',
    'IMPULS',
    'RISING_SUN',
    'PHILIPS_SBC',
    'ENERGENIE_ENER010',
    'ENERGENIE_5_GANG',
    'COCO',
];

const COMMANDS = ['switchOn', 'switchOff', 'increaseLevel', 'decreaseLevel', 'chime'];

export class Lighting1 implements RfxDevice {
    public readonly commands = COMMANDS;
    /** Was `Lighting1.prototype.subTypes` - an instance attribute, not a static one */
    public readonly subTypes = SUB_TYPES;

    private readonly device: RfxLighting1;

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

        if (!options.subtype || !SUB_TYPES.includes(options.subtype)) {
            log?.warn(`No subtype or invalid subtype is defined. Please define on of ${SUB_TYPES.join(', ')}`);
            throw new Error('Invalid subtype');
        }

        this.device = new RfxLighting1(comm, options.subtype);
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
        } else if (!this.commands.includes(cmd)) {
            this.log?.warn(`Unknown command: ${cmd}`);
            callback?.(`Unknown command: ${cmd}`);
        } else {
            // BUG (kept): `increaseLevel`/`decreaseLevel` expect `(deviceId, roomNumber, callback)`
            callDeviceMethod(this.device, cmd, this.options.deviceId, callback);
        }
    }

    public getObjects(prefix: string, name?: string): DeviceObject[] {
        const objs: DeviceObject[] = [];
        const id = prefix + this.options.deviceId.replace('/', '_');

        objs.push({
            _id: id,
            common: {
                name: name || `Lighting 1 ${this.options.deviceId}`,
                role: 'state',
            },
            type: 'channel',
            native: {
                deviceId: this.options.deviceId,
                subtype: this.options.subtype,
            },
        });

        for (const command of this.commands) {
            if (command === 'chime') {
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
            _id: `${id}.allOff`,
            common: {
                name: `${this.options.deviceId} received allOff`,
                type: 'boolean',
                read: true,
                write: false,
                role: 'state',
            },
            type: 'state',
            native: {},
        });
        objs.push({
            _id: `${id}.allOn`,
            common: {
                name: `${this.options.deviceId} received allOn`,
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

        objs.push({
            _id: `${id}.chime`,
            common: {
                name: `${this.options.deviceId} chime`,
                type: 'boolean',
                read: true,
                write: true,
                role: 'state',
            },
            type: 'state',
            native: {},
        });
        return objs;
    }

    public getStates(prefix: string, event: RfxEvent): StateTask[] | undefined {
        // data = {
        //    id: "0x" + self.dumpHex(data.slice(2, 4), false).join(""), // Redundant?
        //    subtype: data[0],
        //    seqnbr: data[1],
        //    housecode: String.fromCharCode(data[2]).toUpperCase(),
        //    unitcode: data[3],
        //    commandNumber: data[4],
        //    command: commands[data[4]] || "Unknown",
        //    rssi: (data[5] >> 4) & 0xf
        // };
        // commands = {
        //    0: "Off",
        //    1: "On",
        //    2: "Dim",
        //    3: "Bright",
        //    5: "All Off",
        //    6: "All On",
        //    7: "Chime"
        // },

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

            case 2: // Dim
                states.push({ id: `${id}.decreaseLevel`, val: { val: true, ack: true } });
                break;

            case 3: // Bright
                states.push({ id: `${id}.increaseLevel`, val: { val: true, ack: true } });
                break;

            case 5: // All Off
                // BUG (kept): "All Off" sets `allOn` and "All On" sets `allOff`
                states.push({ id: `${id}.allOn`, val: { val: true, ack: true } });
                break;

            case 6: // All On
                states.push({ id: `${id}.allOff`, val: { val: true, ack: true } });
                break;

            case 7: // Chime
                states.push({ id: `${id}.chime`, val: { val: true, ack: true } });
                break;

            default:
                // the old code referenced an undefined variable `data` here
                this.log?.warn(`Unrecognised Lighting1 command ${event.commandNumber?.toString(16)}`);
                return;
        }

        return states;
    }
}
