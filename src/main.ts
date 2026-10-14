import * as utils from '@iobroker/adapter-core';
import { RfxCom, Rfy, rfy } from 'rfxcom';
import type { SerialPort as SerialPortClass } from 'serialport';

import { Curtain1 } from './lib/curtain1';
import { Lighting1 } from './lib/lighting1';
import { Lighting2 } from './lib/lighting2';
import { Lighting3 } from './lib/lighting3';
import { RFY } from './lib/rfy';
import { Weight } from './lib/weight';
import {
    errorText,
    type ConfigDevice,
    type DeviceClass,
    type DeviceObject,
    type RfxDevice,
    type RfxEvent,
    type StateTask,
} from './lib/types';

const ADAPTER_NAME = 'rfxcom';

/** Device classes by type. The type is the `type` column in the config or the capitalized event name */
const DEVICES: Record<string, DeviceClass> = {
    RFY,
    Lighting3,
    Curtain1,
    Lighting1,
    Lighting2,
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
    /** The admin sends the table row with `subType` */
    subType?: string;
    /** Name of the attribute in the old HTML admin */
    subtype?: string;
}

/** Device ID as rfxcom reports it in `rfyremoteslist`, e.g. `0x0A0B0C/1` (lower case) */
function device2string(device: Pick<ConfigDevice, 'deviceId' | 'unitCode'>): string {
    const id = parseInt(device.deviceId, 16).toString(16).padStart(6, '0').substring(0, 6);
    return `0x${id}/${parseInt(device.unitCode, 10)}`;
}

/** Commands that write a value and not a button press */
const VALUE_COMMANDS = ['state', 'level'];

class RfxcomAdapter extends utils.Adapter {
    private channels: Record<string, ioBroker.Object> = {};
    private inclusionOn = false;
    private inclusionTimeout: ioBroker.Timeout | null | undefined = null;
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
        if (!state || state.ack) {
            return;
        }

        if (id === `${this.namespace}.inclusionOn`) {
            this.setInclusionState(state.val);
            void this.setStateAsync('inclusionOn', this.inclusionOn, true);
            this.log.info(`Inclusion mode is ${this.inclusionOn ? 'active' : 'inactive'}`);
            return;
        }

        if (!this.comm) {
            return;
        }

        const parts = id.split('.');
        const command = parts.pop()!;
        const channel = parts.join('.');
        const device = this.getDeviceOfChannel(channel);

        if (!device) {
            this.log.warn(`Unknown device "${channel}"`);
        } else if (!device.commands.includes(command) && !VALUE_COMMANDS.includes(command)) {
            this.log.warn(`Unknown command "${command}" for "${channel}"`);
        } else {
            device.sendCommand(command, state.val, err => {
                if (err) {
                    this.log.error(`Cannot control "${command}" for "${channel}": ${errorText(err)}`);
                } else {
                    // buttons are reset, values are acknowledged
                    void this.setForeignStateAsync(id, VALUE_COMMANDS.includes(command) ? state.val : false, true);
                }
            });
        }
    }

    private onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        if (!obj) {
            delete this.channels[id];
            delete this.devices[id];
        } else if (obj.type === 'channel') {
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
                if (obj.message) {
                    this.program(obj, obj.message as DeviceMessage);
                }
                break;

            case 'erase':
                if (obj.message) {
                    this.erase(obj, obj.message as DeviceMessage);
                }
                break;

            case 'eraseAll':
                if (obj.message) {
                    if ((obj.message as DeviceMessage).type !== 'RFY') {
                        this.reply(obj, 'Only RFY devices can be erased');
                        return;
                    }
                    if (this.rfyAll) {
                        this.rfyAll.eraseAll(err => {
                            if (err) {
                                this.log.error(`Cannot eraseAll: ${errorText(err)}`);
                            }
                            this.reply(obj, err);
                            this.listRemotes();
                        });
                    } else {
                        this.reply(obj, 'no connection to RfxCom');
                    }
                }
                break;

            default:
                this.log.error(`Unknown command: ${obj.command}`);
                break;
        }
    }

    /** Answer of `program`, `erase` and `eraseAll` */
    private reply(obj: ioBroker.Message, result: unknown): void {
        if (obj.callback) {
            this.sendTo(obj.from, obj.command, [{ result: result ? errorText(result) : result }], obj.callback);
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
            this.log.error(errorText(e));
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

    /** Requests the list of RFY remotes; the answer arrives as `rfyremoteslist` event */
    private listRemotes(): void {
        this.rfyAll?.listRemotes(err => err && this.log.error(`Cannot ask listRemotes: ${errorText(err)}`));
    }

    /** Device of a `program`/`erase` message: the configured one or a temporary one */
    private getDeviceOfMessage(obj: ioBroker.Message, message: DeviceMessage): RfxDevice | null {
        const id = `${this.namespace}.${message.type || 'rfy'}.${message.deviceId}_${message.unitCode}`;
        if (this.devices[id]) {
            return this.devices[id];
        }
        const DeviceType = message.type ? DEVICES[message.type] : undefined;
        if (!DeviceType) {
            this.log.error(`Unknown type "${message.type}"`);
            this.reply(obj, `Unknown type "${message.type}"`);
            return null;
        }
        try {
            return new DeviceType(
                this.comm!,
                {
                    deviceId: `${message.deviceId}/${message.unitCode}`,
                    subtype: message.subType ?? message.subtype,
                },
                this.log,
            );
        } catch (e) {
            this.reply(obj, e);
            return null;
        }
    }

    private program(obj: ioBroker.Message, message: DeviceMessage): void {
        if (!this.connection) {
            this.reply(obj, 'No connection to RfxCom');
            return;
        }
        const device = this.getDeviceOfMessage(obj, message);
        if (!device) {
            return;
        }
        if (!device.program) {
            this.reply(obj, `Devices of type "${message.type}" cannot be programmed`);
            return;
        }
        device.program(err => {
            if (err) {
                this.log.error(`Cannot program "${message.deviceId}/${message.unitCode}": ${errorText(err)}`);
            }
            this.reply(obj, err);
            this.listRemotes();
        });
    }

    private erase(obj: ioBroker.Message, message: DeviceMessage): void {
        if (message.type !== 'RFY') {
            this.reply(obj, 'Only RFY devices can be erased');
            return;
        }
        if (!this.connection) {
            this.reply(obj, 'No connection to RfxCom');
            return;
        }
        const device = this.getDeviceOfMessage(obj, message);
        if (!device?.erase) {
            return;
        }
        device.erase(err => {
            if (err) {
                this.log.error(`Cannot erase "${message.deviceId}/${message.unitCode}": ${errorText(err)}`);
            }
            this.reply(obj, err);
            this.listRemotes();
        });
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

    /** Writes the queued states one after another */
    private syncStates(): void {
        const task = this.stateTasks.shift();
        if (!task) {
            return;
        }
        this.setForeignStateChanged(task.id, task.val, () => setImmediate(() => this.syncStates()));
    }

    /** Creates the device object for an existing channel, e.g. after a restart */
    private getDeviceOfChannel(channelId: string): RfxDevice | null {
        if (this.devices[channelId]) {
            return this.devices[channelId];
        }
        const channel = this.channels[channelId];
        // <adapter>.<instance>.<Type>.<deviceId>
        const DeviceType = DEVICES[channelId.split('.')[2]];
        if (!channel || !DeviceType || !this.comm) {
            return null;
        }
        try {
            this.devices[channelId] = new DeviceType(
                this.comm,
                {
                    deviceId: channel.native.deviceId,
                    subtype: channel.native.subtype,
                },
                this.log,
            );
        } catch (e) {
            this.log.warn(`Cannot create device "${channelId}": ${(e as Error).message}`);
            return null;
        }
        return this.devices[channelId];
    }

    /**
     * Returns the device of a received event. Unknown devices are created in inclusion mode.
     *
     * @param type key of `DEVICES`
     * @param deviceId device ID in the format of `DeviceOptions.deviceId`
     * @param subtype numeric subtype of the event
     */
    private getReceivedDevice(type: string, deviceId: string, subtype: number | undefined): RfxDevice | null {
        const prefix = `${this.namespace}.${type}.`;
        const id = prefix + deviceId.replace('/', '_');
        const device = this.getDeviceOfChannel(id);
        if (device || !this.inclusionOn) {
            return device;
        }

        const DeviceType = DEVICES[type];
        if (!DeviceType) {
            this.log.warn(`Unknown device type: ${type}`);
            return null;
        }
        const subtypeName = subtype === undefined ? undefined : DeviceType.subTypes?.[subtype];
        if (subtypeName === undefined) {
            this.log.warn(`Unknown device subType for "${type}": ${subtype}`);
            return null;
        }
        try {
            this.devices[id] = new DeviceType(this.comm!, { deviceId, subtype: subtypeName }, this.log);
        } catch (e) {
            this.log.warn(`Cannot create device "${id}": ${(e as Error).message}`);
            return null;
        }
        this.log.info(`New device included: ${id}`);
        this.syncObjects(this.devices[id].getObjects(prefix));
        return this.devices[id];
    }

    /** Writes the states of a received event */
    private processDeviceEvent(type: string, deviceId: string, data: RfxEvent): void {
        const device = this.getReceivedDevice(type, deviceId, data.subtype);

        if (device?.getStates) {
            const isStart = !this.stateTasks.length;
            this.stateTasks = this.stateTasks.concat(device.getStates(`${this.namespace}.${type}.`, data));
            if (isStart) {
                this.syncStates();
            }
        } else {
            this.log.debug(`${type} ignored: ${JSON.stringify(data)}`);
        }
    }

    private processLighting(event: string, data: RfxEvent): void {
        const type = event[0].toUpperCase() + event.substring(1);
        // lighting1: house code A-P + unit code, lighting2: hex ID + unit code
        const deviceId = event === 'lighting1' ? `${data.houseCode}/${data.unitCode}` : `${data.id}/${data.unitCode}`;
        this.processDeviceEvent(type, deviceId, data);
    }

    private processLighting5(_event: string, data: RfxEvent): void {
        // data.rssi
        // data.housecode
        // data.commandNumber
        // data.unitcode
        // data.subtype

        // Lighting5 devices are not supported yet; only unknown commands are reported
        switch (data.subtype) {
            case 0: // Lightwave RF
                switch (data.commandNumber) {
                    case 17:
                    case 18:
                    case 19:
                        this.log.warn(`Unrecognised Lighting5 LightwaveRF command ${data.commandNumber.toString(16)}`);
                        break;
                }
                break;

            case 6: // TRC02
                if (data.commandNumber === undefined || data.commandNumber > 3) {
                    this.log.warn(`Unrecognised Lighting5 TRC02 command ${data.commandNumber?.toString(16)}`);
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

        // Lighting6 devices are not supported yet (0 and 2: on, 1 and 3: off); only unknown commands are reported
        if (data.commandNumber === undefined || data.commandNumber > 3) {
            this.log.warn(`Unrecognised Lighting6 command ${data.commandNumber?.toString(16)}`);
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

    private processWeight(_event: string, data: RfxEvent): void {
        // weight1 and weight2 are both handled by the class `Weight`; the scales have no unit code
        this.processDeviceEvent('Weight', String(data.id), data);
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
        const task = objs.shift();
        if (!task) {
            callback?.();
            return;
        }
        void this.getForeignObject(task._id, (_err, obj) => {
            if (!obj) {
                this.setForeignObject(task._id, task as unknown as ioBroker.SettableObject, () =>
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
            this.log.debug(`Disconnected: ${errorText(msg)}`);
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

        comm.on('rfyremoteslist', (list: { deviceId: string }[] | undefined) => {
            if (!list) {
                return;
            }
            this.log.debug(`rfyremoteslist delivered ${list.length} devices`);

            for (const remote of list) {
                // try to find this device. rfxcom reports the ID in upper case
                const configDevice = this.config.devices.find(
                    device => remote.deviceId.toLowerCase() === device2string(device),
                );
                if (configDevice) {
                    configDevice.found = true;
                } else {
                    this.log.warn(`Device "${remote.deviceId}" found in RfxCom, but not found in the configuration`);
                }
            }

            for (const device of this.config.devices) {
                if (device.type === 'RFY' && !device.found) {
                    this.log.warn(
                        `Device "${device.name}(${device2string(device)}) " found in configuration, but not found in the RfxCom`,
                    );
                }
            }
        });

        for (const event of Object.keys(SUPPORTED_EVENTS)) {
            comm.on(event, (e: RfxEvent) => {
                this.log.debug(`Event "${event}": ${JSON.stringify(e)}`);
                try {
                    this[SUPPORTED_EVENTS[event]](event, e);
                } catch (err) {
                    this.log.error(`Cannot process event "${event}": ${errorText(err)}`);
                }
            });
        }

        comm.initialise(() => {
            this.log.info(`RfxCom initialised on ${comm.device}`);
            this.listRemotes();
        });

        this.rfyAll = new Rfy(comm, rfy.RFY);

        let objs: DeviceObject[] = [];

        // create the configured "control only" devices
        for (const device of this.config.devices) {
            const DeviceType = DEVICES[device.type];
            if (!DeviceType) {
                this.log.warn(`Unknown device type: ${device.type}`);
                continue;
            }
            const prefix = `${this.namespace}.${device.type}.`;
            const id = `${prefix}${device.deviceId}_${device.unitCode}`;
            try {
                this.devices[id] = new DeviceType(
                    comm,
                    {
                        deviceId: `${device.deviceId}/${device.unitCode}`,
                        subtype: device.subType,
                    },
                    this.log,
                );
            } catch (e) {
                this.log.warn(`Cannot create device "${device.name}": ${(e as Error).message}`);
                continue;
            }

            objs = objs.concat(this.devices[id].getObjects(prefix, device.name));
        }

        this.syncObjects(objs);
    }

    private async onReady(): Promise<void> {
        // older instances stored the value as string
        this.config.inclusionTimeout = parseInt(String(this.config.inclusionTimeout), 10) || 0;
        this.config.devices ||= [];

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
