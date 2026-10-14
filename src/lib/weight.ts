import type { RfxCom } from 'rfxcom';

import type { CommandCallback, DeviceObject, DeviceOptions, RfxDevice, RfxEvent, StateTask } from './types';

const SUB_TYPES = ['WEIGHT_UNUSED', 'WEIGHT1', 'WEIGHT2'];

export class Weight implements RfxDevice {
    public static readonly subTypes = SUB_TYPES;

    public readonly commands: string[] = [];

    public constructor(
        _comm: RfxCom,
        private readonly options: DeviceOptions,
        log?: ioBroker.Logger,
    ) {
        if (!options?.deviceId) {
            log?.warn('No device id is defined');
            throw new Error('No device id is defined');
        }

        if (!options.subtype || !SUB_TYPES.includes(options.subtype)) {
            log?.warn(`No subtype or invalid subtype is defined. Please define on of ${SUB_TYPES.join(', ')}`);
            throw new Error('Invalid subtype');
        }
    }

    public sendCommand(_cmd: string, _value: ioBroker.StateValue, callback: CommandCallback): void {
        callback('Command not supported');
    }

    public getObjects(prefix: string, name?: string): DeviceObject[] {
        const objs: DeviceObject[] = [];
        const id = prefix + this.options.deviceId.replace('/', '_');

        objs.push({
            _id: id,
            common: {
                name: name || `Weight ${this.options.deviceId}`,
                role: 'state',
            },
            type: 'channel',
            native: {
                deviceId: this.options.deviceId,
                subtype: this.options.subtype,
            },
        });

        objs.push({
            _id: `${id}.weight`,
            common: {
                name: `${this.options.deviceId} weight`,
                unit: 'kg',
                type: 'number',
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
            _id: `${id}.battery`,
            common: {
                name: `${this.options.deviceId} battery level`,
                type: 'number',
                min: 0,
                max: 100,
                unit: '%',
                read: true,
                write: false,
                role: 'state',
            },
            type: 'state',
            native: {},
        });
        return objs;
    }

    public getStates(prefix: string, event: RfxEvent): StateTask[] {
        // event = {
        //    subtype: data[0],
        //    id: "0x1234",
        //    seqnbr: data[1],
        //    weight: (data[4] *256 + data[5]) / 10,
        //    rssi: batterySignalLevel & 0x0f,
        //    batteryLevel: (batterySignalLevel >> 4) & 0xf
        // };

        const states: StateTask[] = [];
        const id = prefix + this.options.deviceId.replace('/', '_');
        states.push({ id: `${id}.rssi`, val: { val: event.rssi ?? null, ack: true } });
        states.push({ id: `${id}.battery`, val: { val: ((event.batteryLevel ?? 0) / 16) * 100, ack: true } });
        states.push({ id: `${id}.weight`, val: { val: event.weight ?? null, ack: true } });

        return states;
    }
}
