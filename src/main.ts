import * as utils from '@iobroker/adapter-core';
import { RfxCom, Rfy, type TransmitCallback } from 'rfxcom';
import type { SerialPort as SerialPortClass } from 'serialport';

import { Curtain1 } from './lib/curtain1';
import { Lighting1 } from './lib/lighting1';
import { Lighting3 } from './lib/lighting3';
import { RFY } from './lib/rfy';
import { Weight } from './lib/weight';
import {
    errorText,
    type ConfigDevice,
    type DeviceClass,
    type DeviceObject,
    type DeviceOptions,
    type RfxDevice,
    type RfxEvent,
    type StateTask,
} from './lib/types';

const ADAPTER_NAME = 'rfxcom';

/** Device classes by type. The type is the `type` column in the config or the capitalized event name */
const DEVICES: Record<string, DeviceClass & { subTypes?: string[] }> = {
    RFY,
    Lighting3,
    Curtain1,
    Lighting1,
    Weight,
};

type EventHandler =
    | 'processEvents'
    | 'processSensors'
    | 'processWeight'
    | 'processEnergy'
    | 'processLighting'
    | 'processLighting4'
    | 'processLighting5'
    | 'processLighting6'
    | 'processBlinds';

const SUPPORTED_EVENTS: Record<string, EventHandler> = {
    security1: 'processEvents', // Emitted when an X10 or similar security device reports a status change.
    bbq1: 'processSensors', // Emitted when a message is received from a Maverick ET-732 BBQ temperature sensor.
    temprain1: 'processSensors', // Emitted when a message is received from an Allecto temperature/rainfall weather sensor.
    temp1: 'processSensors', // Emitted when a message is received from a temperature sensor (inside/outside air temperature; pool water temperature).
    temp2: 'processSensors',
    temp3: 'processSensors',
    temp4: 'processSensors',
    temp5: 'processSensors',
    temp6: 'processSensors',
    temp7: 'processSensors',
    temp8: 'processSensors',
    temp9: 'processSensors',
    temp10: 'processSensors',
    temp11: 'processSensors',
    humidity1: 'processSensors', // Emitted when data arrives from humidity sensing devices
    th1: 'processSensors', // Emitted when a message is received from Oregon Scientific and other temperature/humidity sensors.
    th2: 'processSensors',
    th3: 'processSensors',
    th4: 'processSensors',
    th5: 'processSensors',
    th6: 'processSensors',
    th7: 'processSensors',
    th8: 'processSensors',
    th9: 'processSensors',
    th10: 'processSensors',
    th12: 'processSensors',
    th13: 'processSensors',
    th14: 'processSensors',
    thb1: 'processSensors', // Emitted when a message is received from an Oregon Scientific temperature/humidity/barometric pressure sensor.
    thb2: 'processSensors',
    rain1: 'processSensors', // Emitted when data arrives from rainfall sensing devices
    rain2: 'processSensors',
    rain3: 'processSensors',
    rain4: 'processSensors',
    rain5: 'processSensors',
    rain6: 'processSensors',
    rain7: 'processSensors',
    wind1: 'processSensors', // Emitted when data arrives from wind speed/direction sensors
    wind2: 'processSensors',
    wind3: 'processSensors',
    wind4: 'processSensors',
    wind5: 'processSensors',
    wind6: 'processSensors',
    wind7: 'processSensors',
    uv1: 'processSensors', // Emitted when data arrives from ultraviolet radiation sensors
    uv2: 'processSensors',
    uv3: 'processSensors',
    weight1: 'processWeight', // Emitted when a message is received from a weighing scale device.
    weight2: 'processWeight',
    elec1: 'processEnergy', // Emitted when data is received from OWL or REVOLT electricity monitoring devices.
    elec2: 'processEnergy',
    elec3: 'processEnergy',
    elec4: 'processEnergy',
    elec5: 'processEnergy',
    rfxmeter: 'processEvents', // Emitted when a message is received from an RFXCOM rfxmeter device.
    rfxsensor: 'processEvents', // Emitted when a message is received from an RFXCOM rfxsensor device.
    lighting1: 'processLighting', // Emitted when a message is received from X10, ARC, Energenie or similar lighting remote control devices.
    lighting2: 'processLighting', // Emitted when a message is received from AC/HomeEasy type remote control devices.
    lighting4: 'processLighting4', // Emitted when a message is received from devices using the PT2262 family chipset.
    lighting5: 'processLighting5', // Emitted when a message is received from LightwaveRF/Siemens type remote control devices.
    lighting6: 'processLighting6', // Emitted when a message is received from Blyss lighting remote control devices.
    blinds1: 'processBlinds', // Emitted when a message arrives from a compatible type 1 blinds remote controller (only a few subtypes can be received)
    chime1: 'processEvents', // Emitted when data arrives from Byron or similar doorbell pushbutton
};

const RESPONSE_CODES = [
    'ACK - transmit OK',
    'ACK - transmit delayed',
    'NAK - transmitter did not lock onto frequency',
    'NAK - AC address not allowed',
    'Command unknown or not supported by this device',
    'Unknown RFY remote ID',
    'Timed out waiting for response',
];

/** Message of the `program`, `erase` and `eraseAll` commands: one row of the "Control only devices" table */
interface DeviceMessage {
    type?: string;
    deviceId: string;
    unitCode: string;
    subtype?: string;
}

function device2string(device: Pick<ConfigDevice, 'deviceId' | 'unitCode'>): string {
    let id = parseInt(device.deviceId, 16).toString(16);
    if (id.length < 2) {
        id = `00000${id}`;
    } else if (id.length < 3) {
        id = `0000${id}`;
    } else if (id.length < 4) {
        id = `000${id}`;
    } else if (id.length < 5) {
        id = `00${id}`;
    } else if (id.length < 6) {
        id = `0${id}`;
    }
    id = `0x${id.substring(0, 6)}`;
    id += `/${parseInt(device.unitCode, 10)}`;
    return id;
}

class RfxcomAdapter extends utils.Adapter {
    private channels: Record<string, ioBroker.Object> = {};
    private inclusionOn = false;
    private inclusionTimeout: ioBroker.Timeout | null | undefined = null;
    private readonly lastReceived: Record<string, number> = {};
    /** Never started, but cleared on unload */
    private repairInterval: ioBroker.Interval | null | undefined = null;
    private connection: boolean | null = null;
    private readonly devices: Record<string, RfxDevice> = {};
    private stateTasks: StateTask[] = [];
    private rfyAll: Rfy | null = null;
    private comm: RfxCom | null = null;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: ADAPTER_NAME,
        });

        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('objectChange', (id, obj) => this.onObjectChange(id, obj));
        this.on('message', obj => this.onMessage(obj));
        this.on('unload', callback => this.onUnload(callback));
    }

    // is called when adapter shuts down - callback has to be called under any circumstances!
    private onUnload(callback: () => void): void {
        this.setConnState(false);
        try {
            if (this.repairInterval) {
                this.clearInterval(this.repairInterval);
                this.repairInterval = null;
            }

            if (this.comm) {
                this.comm.close();
                this.comm.removeAllListeners();
            }
            this.comm = null;
            callback();
        } catch {
            callback();
        }
    }

    // is called if a subscribed state changes
    private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (!state || state.ack || !this.comm) {
            return;
        }

        const parts = id.split('.');
        const command = parts.pop()!;
        const channel = parts.join('.');

        // BUG (kept): `inclusionOn` lands here too and is reported as unknown device, so the inclusion
        // mode can only be changed by restarting the adapter
        if (!this.channels[channel] || !this.devices[channel]) {
            this.log.warn(`Unknown device "${channel}"`);
        } else if (!this.devices[channel].commands.includes(command)) {
            this.log.warn(`Unknown command "${command}" for "${channel}"`);
        } else {
            this.devices[channel].sendCommand(command, state.val, err => {
                if (err) {
                    this.log.error(`Cannot control "${command}" for "${channel}": ${errorText(err)}`);
                } else {
                    void this.setForeignStateAsync(id, false, true);
                }
            });
        }
    }

    private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        if (!obj) {
            if (this.channels[id]) {
                delete this.channels[id];
            }
            if (this.lastReceived[id]) {
                delete this.lastReceived[id];
            }
        } else if (obj.type === 'channel') {
            if (obj.native.autoRepair) {
                this.lastReceived[id] = Date.now();
            } else if (this.lastReceived[id]) {
                delete this.lastReceived[id];
            }

            this.channels[id] = obj;
        }
    }

    private onMessage(obj: ioBroker.Message): void {
        if (!obj) {
            return;
        }
        switch (obj.command) {
            case 'listUart':
                if (obj.callback) {
                    void this.listUart(obj);
                }
                break;

            case 'listPorts':
                // used by admin/jsonConfig.json
                if (obj.callback) {
                    void this.listPorts(obj);
                }
                break;

            case 'program':
                // find or create device with such DeviceID
                if (obj.message) {
                    this.program(obj, obj.message as DeviceMessage);
                }
                break;

            case 'erase':
                // find or create device with such DeviceID
                if (obj.message) {
                    this.erase(obj, obj.message as DeviceMessage);
                }
                break;

            case 'eraseAll':
                if (obj.message) {
                    if ((obj.message as DeviceMessage).type !== 'RFY') {
                        if (obj.callback) {
                            this.sendTo(
                                obj.from,
                                obj.command,
                                [{ result: 'Only RFY devices can be erased' }],
                                obj.callback,
                            );
                        }
                        return;
                    }
                    if (this.rfyAll) {
                        this.rfyAll.eraseAll(err => {
                            if (err) {
                                this.log.error(`Cannot eraseAll: ${errorText(err)}`);
                            }
                            if (obj.callback) {
                                this.sendTo(obj.from, obj.command, [{ result: err }], obj.callback);
                            }
                            this.listRemotes();
                        });
                    } else if (obj.callback) {
                        this.sendTo(obj.from, obj.command, [{ result: 'no connection to RfxCom' }], obj.callback);
                    }
                }
                break;

            default:
                this.log.error(`Unknown command: ${obj.command}`);
                break;
        }
    }

    /** Old command of the HTML admin: answers with the raw list of `SerialPort.list()` */
    private async listUart(obj: ioBroker.Message): Promise<void> {
        let SerialPort: typeof SerialPortClass | undefined;
        try {
            // the native module may be missing on the system, so the error is caught here
            ({ SerialPort } = await import('serialport'));
        } catch {
            this.sendTo(obj.from, obj.command, [{ comName: 'Not available' }], obj.callback);
            return;
        }
        if (!SerialPort) {
            this.log.warn('Module serialport is not available');
            this.sendTo(obj.from, obj.command, [{ comName: 'Not available' }], obj.callback);
            return;
        }
        // read all found serial ports
        try {
            const ports = await SerialPort.list();
            this.log.info(`List of port: ${JSON.stringify(ports)}`);
            this.sendTo(obj.from, obj.command, ports, obj.callback);
        } catch (e) {
            this.sendTo(obj.from, obj.command, [], obj.callback);
            this.log.error(String(e));
        }
    }

    /** Serial ports as `{ value, label }` for the `autocompleteSendTo` control of the config dialog */
    private async listPorts(obj: ioBroker.Message): Promise<void> {
        let result: { value: string; label: string }[] = [];
        try {
            const { SerialPort } = await import('serialport');
            const ports = await SerialPort.list();
            result = ports.map(port => ({
                value: port.path,
                label: port.manufacturer ? `${port.path} [${port.manufacturer}]` : port.path,
            }));
        } catch (e) {
            this.log.warn(`Cannot list serial ports: ${(e as Error).message}`);
        }
        this.sendTo(obj.from, obj.command, result, obj.callback);
    }

    private listRemotes(): void {
        // request list of devices
        // BUG (kept): `rfyAll` is null if no COM port is configured; this throws then
        this.rfyAll!.listRemotes(err => err && this.log.error(`Cannot ask listRemotes: ${errorText(err)}`));
    }

    private program(obj: ioBroker.Message, message: DeviceMessage): void {
        const id = `${this.namespace}.${message.type || 'rfy'}.${message.deviceId}_${message.unitCode}`;
        const device = this.devices[id];
        if (device) {
            if (this.connection) {
                // BUG (kept): devices without `program()` (Weight) throw a TypeError here
                device.program!(err => {
                    if (err) {
                        this.log.error(`Cannot program "${id}": ${errorText(err)}`);
                    }
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, [{ result: err }], obj.callback);
                    }
                    this.listRemotes();
                });
            } else {
                this.sendTo(obj.from, obj.command, [{ result: 'No connection to RfxCom' }], obj.callback);
            }
        } else if (this.connection) {
            const DeviceType = message.type ? DEVICES[message.type] : undefined;
            if (DeviceType) {
                // create device
                // BUG (kept): the admin sends `subType`, but `subtype` is read here
                const newDevice = new DeviceType(
                    this.comm!,
                    {
                        deviceId: `${message.deviceId}/${message.unitCode}`,
                        subtype: message.subtype,
                    },
                    this.log,
                );

                newDevice.program!((err: unknown) => {
                    if (err) {
                        this.log.error(`Cannot program "${message.deviceId}/${message.unitCode}": ${errorText(err)}`);
                    }
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, [{ result: err }], obj.callback);
                    }
                    this.listRemotes();
                });
            } else {
                this.log.error(`Unknown type "${message.type}"`);
                this.sendTo(obj.from, obj.command, [{ result: `Unknown type "${message.type}"` }], obj.callback);
            }
        } else {
            this.sendTo(obj.from, obj.command, [{ result: 'No connection to RfxCom' }], obj.callback);
        }
    }

    private erase(obj: ioBroker.Message, message: DeviceMessage): void {
        if (message.type !== 'RFY') {
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, [{ result: 'Only RFY devices can be erased' }], obj.callback);
            }
            return;
        }
        const id = `${this.namespace}.${message.type || 'rfy'}.${message.deviceId}_${message.unitCode}`;
        const name = this.devices[id] ? id : `${message.deviceId}/${message.unitCode}`;
        const callback: TransmitCallback = (err: unknown) => {
            if (err) {
                this.log.error(`Cannot erase "${name}": ${errorText(err)}`);
            }
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, [{ result: err }], obj.callback);
            }
            this.listRemotes();
        };
        if (this.devices[id]) {
            this.devices[id].erase!(callback);
        } else {
            // create device
            // BUG (kept): the admin sends `subType`, but `subtype` is read here
            const newDevice = new RFY(
                this.comm!,
                {
                    deviceId: `${message.deviceId}/${message.unitCode}`,
                    subtype: message.subtype,
                },
                this.log,
            );
            newDevice.erase(callback);
        }
    }

    private setConnState(isConnected: boolean): void {
        if (isConnected !== this.connection) {
            this.connection = isConnected;
            this.log.info(`State: ${isConnected ? 'connected' : 'disconnected'}`);
            void this.setStateAsync('info.connection', isConnected, true);
        }
    }

    private setInclusionState(val: ioBroker.StateValue): void {
        this.inclusionOn = val === 'true' || val === true || val === 1 || val === '1';

        if (this.inclusionTimeout) {
            this.clearTimeout(this.inclusionTimeout);
        }
        this.inclusionTimeout = null;

        if (this.inclusionOn && this.config.inclusionTimeout) {
            this.inclusionTimeout = this.setTimeout(() => {
                this.inclusionTimeout = null;
                this.inclusionOn = false;
                void this.setStateAsync('inclusionOn', false, true);
            }, this.config.inclusionTimeout * 1000);
        }
    }

    private processEvents(event: string, data: RfxEvent): void {
        // evt.rssi
        // evt.housecode
        // evt.commandNumber
        // evt.unitcode

        // evt.temperature '°C'
        // evt.barometer 'hPa'
        // evt.direction '°'
        // evt.averageSpeed 'm/s'
        // evt.gustSpeed 'm/s'
        // evt.chillfactor '°C'
        // evt.humidity '%'
        // evt.rainfall 'mm'
        // evt.rainfallRate 'mm/hr'
        // evt.rainfallIncrement 'mm'
        // evt.uv 'UVIndex'
        // evt.forecast

        this.log.debug(`[${event}]: ${JSON.stringify(data)}`);
    }

    private syncStates(isChanged: boolean): void {
        if (!this.stateTasks?.length) {
            return;
        }
        const task = this.stateTasks.shift()!;

        if (typeof task.val === 'object' && task.val !== null) {
            // BUG (kept): the devices deliver `{ val, ack }`, which is written as "[object Object]"
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            task.val = task.val.toString();
        }
        if (isChanged) {
            this.setForeignStateChanged(task.id, task.val, true, () => setImmediate(() => this.syncStates(isChanged)));
        } else {
            this.setForeignState(task.id, task.val, true, () => setImmediate(() => this.syncStates(isChanged)));
        }
    }

    private getDevice(
        deviceId: string | undefined,
        unitCode: number | string | undefined,
        type: string,
        subType: number | string | undefined,
    ): ioBroker.Object | null | undefined {
        for (const id of Object.keys(this.channels)) {
            if (this.channels[id].native.deviceId === deviceId && this.channels[id].native.unitCode === unitCode) {
                if (!this.devices[id] && DEVICES[type]) {
                    // BUG (kept): the arguments are shifted (`comm` is missing), so this always fails
                    this.devices[id] = new DEVICES[type](
                        `${deviceId}/${unitCode}` as unknown as RfxCom,
                        subType as unknown as DeviceOptions,
                    );
                }
                return this.channels[id];
            }
        }

        if (this.inclusionOn) {
            const DeviceType = DEVICES[type];
            if (DeviceType) {
                const prefix = `${this.namespace}.${type}.`;
                const idd = `${prefix}${deviceId}_${unitCode}`;

                // BUG (kept): `subTypes` is no static attribute of the device classes, so this throws a TypeError
                subType = DeviceType.subTypes![subType as number];
                if (subType === undefined) {
                    this.log.warn(`Unknown device subType for "${type}": ${String(subType)}`);
                } else {
                    this.devices[idd] = new DeviceType(
                        this.comm!,
                        {
                            deviceId: `${deviceId}/${unitCode}`,
                            subtype: subType,
                        },
                        this.log,
                    );

                    this.syncObjects(this.devices[idd].getObjects(prefix));
                }
            } else {
                this.log.warn(`Unknown device type: ${type}`);
            }
            return undefined;
        }
        return null;
    }

    private processLighting(event: string, data: RfxEvent): void {
        event = event[0].toUpperCase() + event.substring(1);
        const dev = this.getDevice(data.housecode, data.unitcode, event, data.subtype);

        if (dev) {
            const isStart = !this.stateTasks.length;
            // BUG (kept): `dev` is the channel object and has no `device`, so this throws a TypeError
            const states = (dev as unknown as { device: RfxDevice }).device.getStates!(
                `${this.namespace}.${event}.`,
                data,
            );
            this.stateTasks = this.stateTasks.concat(states ?? []);
            if (isStart) {
                this.syncStates(true);
            }
        } else {
            this.log.debug(`${event} ignored: ${JSON.stringify(data)}`);
        }
    }

    private processLighting5(_event: string, data: RfxEvent): void {
        // data.rssi
        // data.housecode
        // data.commandNumber
        // data.unitcode
        // data.subtype

        // The value is calculated, but never written anywhere
        switch (data.subtype) {
            case 0: // Lightwave RF
                switch (data.commandNumber) {
                    case 0:
                    case 1:
                    case 2:
                    case 16:
                        break;

                    case 3:
                    case 4:
                    case 5:
                    case 6:
                    case 7:
                        // BUG (kept): the old code wrote `msg.payload = 'Mood' + (evt.commandNumber - 2)` here.
                        // Neither `msg` nor `evt` existed, so this threw a ReferenceError.
                        throw new ReferenceError('msg is not defined');

                    case 17:
                    case 18:
                    case 19:
                        this.log.warn(`Unrecognised Lighting5 LightwaveRF command ${data.commandNumber.toString(16)}`);
                        break;

                    default:
                        return;
                }
                break;

            case 2:
            case 4: // BBSB & CONRAD
                break;

            case 6: // TRC02
                switch (data.commandNumber) {
                    case 0:
                    case 1:
                    case 2:
                    case 3:
                        break;

                    default:
                        this.log.warn(`Unrecognised Lighting5 TRC02 command ${data.commandNumber?.toString(16)}`);
                        return;
                }
                break;
        }
    }

    private processLighting6(_event: string, data: RfxEvent): void {
        // data.rssi
        // data.housecode
        // data.commandNumber
        // data.unitcode
        // data.subtype

        // The value (0 and 2: on, 1 and 3: off) was calculated, but never written anywhere
        switch (data.commandNumber) {
            case 0:
            case 1:
            case 2:
            case 3:
                break;

            default:
                this.log.warn(`Unrecognised Lighting6 command ${data.commandNumber?.toString(16)}`);
                return;
        }
    }

    // PT622
    private processLighting4(_event: string, data: RfxEvent): void {
        this.log.warn(`Unrecognised Lighting4 command ${JSON.stringify(data)}`);
    }

    private processSensors(event: string, data: RfxEvent): void {
        // see processEvents() for the attributes
        this.log.debug(`[${event}]: ${JSON.stringify(data)}`);
    }

    private processWeight(event: string, data: RfxEvent): void {
        // BUG (kept): `weight1` becomes `weight`, but the class is registered as `Weight`
        event = event.replace(/\d$/, '');
        const dev = this.getDevice(data.housecode, data.unitcode, event, data.subtype);

        if (dev) {
            const isStart = !this.stateTasks.length;
            // BUG (kept): `dev` is the channel object and has no `device`, so this throws a TypeError
            const states = (dev as unknown as { device: RfxDevice }).device.getStates!(
                `${this.namespace}.${event}.`,
                data,
            );
            this.stateTasks = this.stateTasks.concat(states ?? []);
            if (isStart) {
                this.syncStates(true);
            }
        } else {
            this.log.debug(`${event} ignored: ${JSON.stringify(data)}`);
        }
    }

    private processEnergy(_event: string, _data: RfxEvent): void {
        // rssi
        // batteryLevel
        // voltage 'V'
        // current 'A'
        // power 'W'
        // energy 'Wh'
        // powerFactor
        // frequency 'Hz'
    }

    private processBlinds(_event: string, _data: RfxEvent): void {
        // rssi
    }

    private syncObjects(objs: DeviceObject[], callback?: () => void): void {
        if (!objs?.length) {
            callback?.();
            return;
        }
        const task = objs.shift()!;
        void this.getForeignObject(task._id!, (_err, obj) => {
            if (!obj) {
                this.setForeignObject(task._id!, task as unknown as ioBroker.SettableObject, () =>
                    setImmediate(() => this.syncObjects(objs, callback)),
                );
            } else {
                obj.native = task.native;
                obj.common.name = task.common.name as ioBroker.StringOrTranslated;
                this.setForeignObject(obj._id, obj, () => setImmediate(() => this.syncObjects(objs, callback)));
            }
        });
    }

    private start(): void {
        const comm = new RfxCom(this.config.comName, { debug: true });
        this.comm = comm;

        comm.debugLog = (text: string): void => this.log.debug(`[rfxcom] ${text}`);

        comm.on('ready', () => this.setConnState(true));

        comm.on('disconnect', (msg: unknown) => {
            this.log.debug(`Disconnected: ${String(msg)}`);
            this.setConnState(false);
        });

        comm.on('connectfailed', () => {
            this.setConnState(false);
            this.log.error(`unable to open the serial port: "${this.config.comName}"`);
        });

        comm.on('response', (desc: string, sequenceNum: number, responseCode: number) =>
            this.log.debug(
                `Response: ${desc}, SeqNr: ${sequenceNum}, ${RESPONSE_CODES[responseCode] ? RESPONSE_CODES[responseCode] : `0x${responseCode.toString(16)}`}`,
            ),
        );

        comm.on('receive', (data: Buffer) => this.log.debug(`Raw data: ${data.toString()}`));

        comm.on('status', (status: unknown) => this.log.debug(`JSON Status: ${JSON.stringify(status)}`));

        comm.on('rfyremoteslist', (list: { deviceId: string }[]) => {
            // BUG (kept): `list.length` is read before `list` is checked
            this.log.debug(`rfyremoteslist delivered ${list.length} devices`);

            if (list) {
                for (const remote of list) {
                    // try to find this device
                    const configDevice = this.config.devices.find(device => remote.deviceId === device2string(device));
                    if (configDevice) {
                        configDevice.found = true;
                    } else {
                        this.log.warn(
                            `Device "${remote.deviceId}" found in RfxCom, but not found in the configuration`,
                        );
                    }
                }

                for (const device of this.config.devices) {
                    if (!device.found) {
                        this.log.warn(
                            `Device "${device.name}(${device2string(device)}) " found in configuration, but not found in the RfxCom`,
                        );
                    }
                }
            }
        });

        for (const event of Object.keys(SUPPORTED_EVENTS)) {
            comm.on(event, (e: RfxEvent) => {
                this.log.debug(`Event "${event}": ${JSON.stringify(e)}`);
                this[SUPPORTED_EVENTS[event]](event, e);
            });
        }

        comm.initialise(() => {
            this.log.info(`RfxCom initialised on ${comm.device}`);
            this.rfyAll?.listRemotes(err => err && this.log.error(`Cannot ask listRemotes: ${errorText(err)}`));
        });

        this.rfyAll = new Rfy(comm, 'RFY');

        let objs: DeviceObject[] = [];

        // create rfy devices
        for (const device of this.config.devices) {
            const DeviceType = DEVICES[device.type];
            if (DeviceType) {
                const prefix = `${this.namespace}.${device.type}.`;
                const id = `${prefix}${device.deviceId}_${device.unitCode}`;
                this.devices[id] = new DeviceType(
                    comm,
                    {
                        deviceId: `${device.deviceId}/${device.unitCode}`,
                        subtype: device.subType,
                    },
                    this.log,
                );

                // BUG (kept): `objs` is added twice, so the objects of the previous devices are written again
                objs = objs.concat(objs, this.devices[id].getObjects(prefix, device.name));
            } else {
                this.log.warn(`Unknown device type: ${device.type}`);
            }
        }

        this.syncObjects(objs);
    }

    private async onReady(): Promise<void> {
        // older instances stored the value as string
        this.config.inclusionTimeout = parseInt(String(this.config.inclusionTimeout), 10) || 0;

        const state = await this.getStateAsync('inclusionOn');
        this.setInclusionState(state ? state.val : false);

        await this.setStateAsync('info.connection', false, true);

        // there are two types of devices: rfy (only write) and all others

        // read current existing objects
        this.channels = await this.getForeignObjectsAsync(`${this.namespace}.*`, 'channel');

        // subscribe on changes
        await this.subscribeStatesAsync('*');
        await this.subscribeObjectsAsync('*');

        if (this.config.comName) {
            this.start();
        } else {
            this.log.warn('No COM port defined');
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new RfxcomAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new RfxcomAdapter())();
}
