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
    /** `<deviceId>/<unitCode>` */
    deviceId: string;
    subtype?: string;
}

/** Data of an `rfxcom` receive event, e.g. `lighting1` or `weight1` */
export interface RfxEvent {
    subtype?: number | string;
    id?: string;
    seqnbr?: number;
    housecode?: string;
    unitcode?: number | string;
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
    val: ioBroker.StateValue | ioBroker.SettableState;
}

/**
 * Object created by `getObjects()` of a device. Curtain1 has always written the ID into `common.id`
 * instead of `_id`, therefore everything is optional here.
 */
export interface DeviceObject {
    _id?: string;
    type: 'channel' | 'state';
    common: Record<string, unknown>;
    native: Record<string, unknown>;
}

export type CommandCallback = (err?: unknown) => void;

/** Common interface of all device classes in src/lib */
export interface RfxDevice {
    commands: string[];
    sendCommand(cmd: string, value: ioBroker.StateValue | CommandCallback, callback?: CommandCallback): void;
    getObjects(prefix: string, name?: string): DeviceObject[];
    getStates?(prefix: string, event: RfxEvent): StateTask[] | undefined;
    program?(callback: TransmitCallback): void;
    erase?(callback: TransmitCallback): void;
    eraseAll?(callback: TransmitCallback): void;
}

export type DeviceClass = new (comm: RfxCom, options: DeviceOptions, log?: ioBroker.Logger) => RfxDevice;

/**
 * Calls `device[cmd](...args)` exactly as the old JavaScript code did: if `cmd` is no method of
 * `device`, this throws a TypeError.
 */
export function callDeviceMethod(device: object, cmd: string, ...args: unknown[]): void {
    (device as Record<string, (...args: unknown[]) => unknown>)[cmd](...args);
}

/**
 * Old check for "on" values, used by the `state` command of the devices.
 * BUG (kept): the boolean `true` is not treated as "on".
 */
export function isOn(value: unknown): boolean {
    return value === 'true' || value === '1' || value === 1 || value === 'on';
}

/** Text of an error as the old code wrote it with `${err}` */
export function errorText(err: unknown): string {
    if (typeof err === 'string') {
        return err;
    }
    return err instanceof Error ? err.toString() : JSON.stringify(err);
}
