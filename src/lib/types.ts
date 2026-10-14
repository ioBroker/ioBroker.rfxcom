import type { RfxCom, TransmitCallback } from 'rfxcom';

/** One row of the "Control only devices" table (`native.devices`) */
export interface ConfigDevice {
    name: string;
    /** Key of `DEVICES` in main.ts: `RFY`, `Lighting3` or `Curtain1` */
    type: string;
    /** Device ID for RFY, house code for Curtain1 or system code for Lighting3 */
    deviceId: string;
    /** Unit code for RFY and Curtain1 or channel code for Lighting3 */
    unitCode: string;
    /** `RFY`, `RFYEXT` or `ASA` */
    subType: string;
    /** Set at runtime if the RFXtrx reported this device in `rfyremoteslist` */
    found?: boolean;
}

/** Options for the constructor of a device class */
export interface DeviceOptions {
    /** `<deviceId>/<unitCode>`, e.g. `0x0A0B0C/1` (RFY), `A/1` (Lighting1) or `0x1234` (Weight) */
    deviceId: string;
    /** Name of the subtype, e.g. `RFY` or `ARC` */
    subtype?: string;
}

/** Data of an `rfxcom` receive event, e.g. `lighting1` or `weight1` */
export interface RfxEvent {
    subtype?: number;
    id?: string;
    seqnbr?: number;
    houseCode?: string;
    unitCode?: number;
    commandNumber?: number;
    command?: string;
    level?: number;
    rssi?: number;
    batteryLevel?: number;
    weight?: number;
    [attr: string]: unknown;
}

/** Entry of the queue written by `syncStates()` */
export interface StateTask {
    id: string;
    val: ioBroker.SettableState;
}

/** Object created by `getObjects()` of a device */
export interface DeviceObject {
    _id: string;
    type: 'channel' | 'state';
    common: Record<string, unknown>;
    native: Record<string, unknown>;
}

export type CommandCallback = (err?: unknown) => void;

/** Common interface of all device classes in src/lib */
export interface RfxDevice {
    /** Button commands. Besides them, `state` (and `level` for dimmers) can be written */
    commands: string[];
    sendCommand(cmd: string, value: ioBroker.StateValue, callback: CommandCallback): void;
    getObjects(prefix: string, name?: string): DeviceObject[];
    getStates?(prefix: string, event: RfxEvent): StateTask[];
    program?(callback: TransmitCallback): void;
    erase?(callback: TransmitCallback): void;
    eraseAll?(callback: TransmitCallback): void;
}

export interface DeviceClass {
    new (comm: RfxCom, options: DeviceOptions, log?: ioBroker.Logger): RfxDevice;
    /** Subtype names by number, as received in events. Only for devices that can be received */
    readonly subTypes?: readonly string[];
}

/**
 * Calls the method `cmd` of an rfxcom transmitter.
 *
 * @returns false if the transmitter has no such method
 */
export function callTransmitter(transmitter: object, cmd: string, ...args: unknown[]): boolean {
    const method = (transmitter as Record<string, unknown>)[cmd];
    if (typeof method !== 'function') {
        return false;
    }
    (method as (...args: unknown[]) => unknown).apply(transmitter, args);
    return true;
}

/** Converts the subtype name to the number expected by the rfxcom transmitters */
export function subtypeNumber(subtypes: Readonly<Record<string, number>>, name: string): number {
    const subtype = subtypes[name];
    if (typeof subtype !== 'number') {
        throw new Error(`Unknown subtype "${name}"`);
    }
    return subtype;
}

/** Check for "on" values, used by the `state` command of the devices */
export function isOn(value: unknown): boolean {
    return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

/** Text of an error as the old code wrote it with `${err}` */
export function errorText(err: unknown): string {
    if (typeof err === 'string') {
        return err;
    }
    return err instanceof Error ? err.toString() : JSON.stringify(err);
}
