// Augments the globally declared ioBroker types with everything this adapter adds.
// The attributes of `AdapterConfig` must be kept in sync with `native` in io-package.json
// and with admin/jsonConfig.json.
import type { ConfigDevice } from './types';

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            /** Serial port of the RFXtrx, e.g. `/dev/ttyUSB0` or `COM3` */
            comName: string;
            /** Not used by the adapter; kept because existing instances have it */
            connTimeout: number;
            /** Not used by the adapter (`rfxcom` always opens the port with 38400 baud); kept because existing instances have it */
            baudRate: number;
            /** Seconds until the inclusion mode switches itself off. 0 = never. Older instances have it as string */
            inclusionTimeout: number;
            /** "Control only" devices (RFY, Lighting3, Curtain1) */
            devices: ConfigDevice[];
        }
    }
}

// this is required so the above is treated as a module
export {};
