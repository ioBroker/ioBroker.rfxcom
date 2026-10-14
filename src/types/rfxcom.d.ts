// Minimal typings for the parts of the `rfxcom` package (https://github.com/rfxcom/node-rfxcom) used
// by this adapter. The package ships no typings of its own.
declare module 'rfxcom' {
    import { EventEmitter } from 'node:events';

    /** Callback of a transmitter command: `(err, response, sequenceNumber)` */
    export type TransmitCallback = (err?: unknown, response?: unknown, seqnbr?: number) => void;

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
        /** `subtype` is the numeric subtype; this adapter has always passed the subtype name instead */
        public constructor(rfxcom: RfxCom, subtype: number | string, options?: Record<string, unknown>);
    }

    export class Rfy extends Transmitter {
        public program(deviceId: string, callback?: TransmitCallback): number;
        public erase(deviceId: string, callback?: TransmitCallback): number;
        public eraseAll(callback?: TransmitCallback): number;
        public listRemotes(callback?: TransmitCallback): number;
        public up(deviceId: string, callback?: TransmitCallback): number;
        public down(deviceId: string, callback?: TransmitCallback): number;
        public stop(deviceId: string, callback?: TransmitCallback): number;
    }

    export class Lighting1 extends Transmitter {
        public switchOn(deviceId: string, callback?: TransmitCallback): number;
        public switchOff(deviceId: string, callback?: TransmitCallback): number;
    }

    export class Lighting2 extends Transmitter {
        public switchOn(deviceId: string, callback?: TransmitCallback): number;
        public switchOff(deviceId: string, callback?: TransmitCallback): number;
        public setLevel(deviceId: string, level: number, callback?: TransmitCallback): number;
    }

    export class Lighting3 extends Transmitter {
        public switchOn(deviceId: string, callback?: TransmitCallback): number;
        public switchOff(deviceId: string, callback?: TransmitCallback): number;
        public setLevel(deviceId: string, level: number, callback?: TransmitCallback): number;
    }

    export class Curtain1 extends Transmitter {
        public program(deviceId: string, callback?: TransmitCallback): number;
        public open(deviceId: string, callback?: TransmitCallback): number;
        public close(deviceId: string, callback?: TransmitCallback): number;
        public stop(deviceId: string, callback?: TransmitCallback): number;
    }
}
