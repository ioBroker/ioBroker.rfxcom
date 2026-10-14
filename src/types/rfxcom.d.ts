// Minimal typings for the parts of the `rfxcom` package (https://github.com/rfxcom/node-rfxcom) used
// by this adapter. The package ships no typings of its own.
declare module 'rfxcom' {
    import { EventEmitter } from 'node:events';

    /** Callback of a transmitter command: `(err, response, sequenceNumber)` */
    export type TransmitCallback = (err?: unknown, response?: unknown, seqnbr?: number) => void;

    /** A device ID: `"AABBCC/1"` or the parts as array, e.g. `["A", "1"]` */
    export type DeviceId = string | string[];

    export interface RfxComOptions {
        debug?: boolean;
        [option: string]: unknown;
    }

    export class RfxCom extends EventEmitter {
        public constructor(device: string, options?: RfxComOptions);
        /** Path of the serial port */
        public device: string;
        public debugLog(message: string): void;
        /** Opens the serial port and runs the handshake. `callback` is called once the device is ready */
        public initialise(callback?: () => void): void;
        public close(): void;
    }

    export class Transmitter {
        /** `subtype` is the numeric subtype, e.g. `rfxcom.lighting1.ARC` */
        public constructor(rfxcom: RfxCom, subtype: number, options?: Record<string, unknown>);
    }

    export class Rfy extends Transmitter {
        public program(deviceId: DeviceId, callback?: TransmitCallback): number;
        public erase(deviceId: DeviceId, callback?: TransmitCallback): number;
        public eraseAll(callback?: TransmitCallback): number;
        public listRemotes(callback?: TransmitCallback): number;
        public up(deviceId: DeviceId, callback?: TransmitCallback): number;
        public down(deviceId: DeviceId, callback?: TransmitCallback): number;
        public stop(deviceId: DeviceId, callback?: TransmitCallback): number;
        public venetianOpen(deviceId: DeviceId, callback?: TransmitCallback): number;
        public venetianClose(deviceId: DeviceId, callback?: TransmitCallback): number;
        public venetianIncreaseAngle(deviceId: DeviceId, callback?: TransmitCallback): number;
        public venetianDecreaseAngle(deviceId: DeviceId, callback?: TransmitCallback): number;
        public enableSunSensor(deviceId: DeviceId, callback?: TransmitCallback): number;
        public disableSunSensor(deviceId: DeviceId, callback?: TransmitCallback): number;
    }

    export class Lighting1 extends Transmitter {
        public switchOn(deviceId: DeviceId, callback?: TransmitCallback): number;
        public switchOff(deviceId: DeviceId, callback?: TransmitCallback): number;
        public increaseLevel(deviceId: DeviceId, callback?: TransmitCallback): number;
        public decreaseLevel(deviceId: DeviceId, callback?: TransmitCallback): number;
        public chime(deviceId: DeviceId, callback?: TransmitCallback): number;
        public program(deviceId: DeviceId, callback?: TransmitCallback): number;
    }

    export class Lighting2 extends Transmitter {
        public switchOn(deviceId: DeviceId, callback?: TransmitCallback): number;
        public switchOff(deviceId: DeviceId, callback?: TransmitCallback): number;
        /** `level` is 0 - 15 */
        public setLevel(deviceId: DeviceId, level: number, callback?: TransmitCallback): number;
    }

    export class Lighting3 extends Transmitter {
        public switchOn(deviceId: DeviceId, callback?: TransmitCallback): number;
        public switchOff(deviceId: DeviceId, callback?: TransmitCallback): number;
        /** `level` is 0 - 10 */
        public setLevel(deviceId: DeviceId, level: number, callback?: TransmitCallback): number;
        public increaseLevel(deviceId: DeviceId, callback?: TransmitCallback): number;
        public decreaseLevel(deviceId: DeviceId, callback?: TransmitCallback): number;
        public program(deviceId: DeviceId, callback?: TransmitCallback): number;
    }

    export class Curtain1 extends Transmitter {
        public program(deviceId: DeviceId, callback?: TransmitCallback): number;
        public open(deviceId: DeviceId, callback?: TransmitCallback): number;
        public close(deviceId: DeviceId, callback?: TransmitCallback): number;
        public stop(deviceId: DeviceId, callback?: TransmitCallback): number;
    }

    /** Subtype name -> number, e.g. `lighting1.ARC === 1` (the arrays are "reflected" by rfxcom) */
    export const rfy: Readonly<Record<string, number>>;
    export const lighting1: Readonly<Record<string, number>>;
    export const lighting2: Readonly<Record<string, number>>;
    export const lighting3: Readonly<Record<string, number>>;
    export const curtain1: Readonly<Record<string, number>>;
}
