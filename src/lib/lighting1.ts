import { Lighting1 as RfxLighting1, lighting1, type RfxCom } from 'rfxcom';

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

/** Subtype names by the number received in `lighting1` events (same order as in rfxcom) */
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
    'HQ',
    'OASE_FM',
];

const COMMANDS = ['switchOn', 'switchOff', 'increaseLevel', 'decreaseLevel', 'chime'];

export class Lighting1 implements RfxDevice {
    public static readonly subTypes = SUB_TYPES;

    public readonly commands = COMMANDS;

    private readonly device: RfxLighting1;
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

        if (!options.subtype || !SUB_TYPES.includes(options.subtype)) {
            log?.warn(`No subtype or invalid subtype is defined. Please define on of ${SUB_TYPES.join(', ')}`);
            throw new Error('Invalid subtype');
        }

        this.address = options.deviceId.split('/');
        this.device = new RfxLighting1(comm, subtypeNumber(lighting1, options.subtype));
    }

    public program(callback: CommandCallback): void {
        try {
            // only supported by OASE_FM, rfxcom throws for the other subtypes
            this.device.program(this.address, callback);
        } catch (e) {
            callback(e);
        }
    }

    public sendCommand(cmd: string, value: ioBroker.StateValue, callback: CommandCallback): void {
        try {
            if (cmd === 'state') {
                if (isOn(value)) {
                    this.device.switchOn(this.address, callback);
                } else {
                    this.device.switchOff(this.address, callback);
                }
            } else if (!this.commands.includes(cmd) || !callTransmitter(this.device, cmd, this.address, callback)) {
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

    public getStates(prefix: string, event: RfxEvent): StateTask[] {
        // event = {
        //    id: "0x4101",
        //    subtype: data[0],
        //    seqnbr: data[1],
        //    houseCode: String.fromCharCode(data[2]).toUpperCase(),
        //    unitCode: data[3],
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
                states.push({ id: `${id}.allOff`, val: { val: true, ack: true } });
                break;

            case 6: // All On
                states.push({ id: `${id}.allOn`, val: { val: true, ack: true } });
                break;

            case 7: // Chime
                states.push({ id: `${id}.chime`, val: { val: true, ack: true } });
                break;

            default:
                this.log?.warn(`Unrecognised Lighting1 command ${event.commandNumber?.toString(16)}`);
                break;
        }

        return states;
    }
}
