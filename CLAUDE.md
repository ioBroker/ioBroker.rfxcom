# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.rfxcom` is an ioBroker adapter for the RFXCOM RFXtrx433(E/XL) USB transceiver. It opens the serial port with the [`rfxcom`](https://github.com/rfxcom/node-rfxcom) package, logs received 433 MHz telegrams and creates control states for "control only" devices (Somfy RTS/RFY, Lighting3, Curtain1) that are configured in the admin.

TypeScript (CommonJS output). Sources live in `src/`, the published/runnable code is the compiled `build/` (`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or the integration tests.

## Commands

```bash
npm run build                             # tsc -p tsconfig.build.json  -> build/
npm run watch                             # same in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:integration                  # starts a real js-controller + adapter instance
npm run translate                         # translate-adapter: fills admin/i18n/<lang>.json from en.json
npm run release-patch                     # @alcalzone/release-script, moves README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci`/`npm install` does not build. Because `build/` is neither committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from npm, not from GitHub. The integration test requires that **no** js-controller is running on the machine. `test:package` downloads JSON schemas from raw.githubusercontent.com.

There is no `tasks.ts`/`gulpfile.js`: with JsonConfig no build step besides `tsc` is left.

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | the adapter: one `RfxcomAdapter extends utils.Adapter` class |
| `src/lib/rfy.ts` | Somfy RTS (`rfxcom.Rfy`) - program/erase/eraseAll + blind commands |
| `src/lib/lighting1.ts`, `lighting3.ts`, `curtain1.ts`, `weight.ts` | the other device classes |
| `src/lib/lighting2.ts` | **not registered** in `DEVICES` - was never used |
| `src/lib/types.ts` | `ConfigDevice`, `RfxDevice` (common device interface), helpers |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `src/types/rfxcom.d.ts` | hand-written typings for the `rfxcom` package (it ships none) |
| `admin/jsonConfig.json` | the configuration dialog |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json`. `connTimeout` and `baudRate` exist in `native` but are not used and not shown in the dialog (`rfxcom` always opens with 38400 baud).

### Devices

`DEVICES` in `main.ts` maps a type name to a class implementing `RfxDevice` (`commands`, `sendCommand`, `getObjects`, optional `getStates`/`program`/`erase`/`eraseAll`). A device ID is `<deviceId>/<unitCode>`; objects live in `rfxcom.<i>.<Type>.<deviceId>_<unitCode>.<command>`.

- `start()` creates one instance per row of `native.devices` and writes the objects with `syncObjects()` (existing objects only get `native` and `common.name` updated).
- `onStateChange()` maps `<channel>.<command>` to `devices[channel].sendCommand()` and resets the button to `false` (ack) on success. Only commands in `device.commands` are accepted.
- Received events are dispatched by `SUPPORTED_EVENTS` to the `process*` methods. Most of them only log.
- The constructors throw on missing `deviceId`/invalid `subtype`. The JS version returned a half-initialized object there, which failed with a TypeError at the next call.

### Messages (`onMessage`)

| Command | Used by | Answer |
| --- | --- | --- |
| `listUart` | old HTML admin | raw `SerialPort.list()` or `[{ comName: 'Not available' }]` |
| `listPorts` | `comName` (`autocompleteSendTo`) | `[{ value, label }]` |
| `program` / `erase` | Pair/Unpair buttons in the devices table | `[{ result: err }]`, message is the table row |
| `eraseAll` | "Erase all RFY devices" button, message `{ type: 'RFY' }` | `[{ result: err }]` |

### Known bugs kept from the JS version

The refactoring was a translation, not a redesign. These are marked with `BUG (kept)` in the code and should be fixed in separate commits:

- `inclusionOn` written by the user is reported as "Unknown device" in `onStateChange()`; the inclusion mode is only read at startup.
- `getDevice()` returns the channel object, but `processLighting()`/`processWeight()` call `dev.device.getStates()` on it → TypeError as soon as an event of a known device arrives. In inclusion mode `DEVICES[type].subTypes` (not static) throws as well; the device creation for existing channels passes shifted arguments.
- `processWeight()` looks up `weight` instead of `Weight`; `processLighting5()` throws a ReferenceError for LightwaveRF mood commands (3-7).
- `syncStates()` writes the `{ val, ack }` objects of `getStates()` as `"[object Object]"`.
- `start()` concatenates `objs` twice, so earlier objects are written again.
- `isOn()` does not treat boolean `true` as on (`state` command is unreachable anyway, it is not in `commands`).
- Curtain1: `sendCommand` passed the value as rfxcom callback (the adapter callback never fires) and `getObjects()` writes `common.id` instead of `_id`.
- Lighting3: rfxcom has no `program`, `increaseLevel`, `decreaseLevel`. Lighting1: `increaseLevel`/`decreaseLevel` get the callback as `roomNumber`. RFY: the `venetian*US/EU` commands do not exist in rfxcom.
- `program`/`erase` read `message.subtype`, the admin sends `subType`, so unknown devices cannot be programmed.
- Lighting1 `getStates()`: "All Off" sets `allOn` and vice versa.

### Misc conventions

- Timers use `this.setTimeout`/`this.clearTimeout` (adapter-core, auto-cleared on unload).
- `serialport` is loaded with `await import()` inside `try`, because the native module may be missing.
- `main.ts` exports a factory when required (compact mode) and self-starts when run directly.

## Release flow

Changelog lives in `README.md` under the `### **WORK IN PROGRESS**` heading; `release-script` (config in `.releaseconfig.json`) moves it into `io-package.json` `common.news`. CI (`.github/workflows/test-and-release.yml`) uses the `ioBroker/testing-action-*` actions: check (type check, lint, `test:package`), adapter tests with `build: true` on Node 22/24/26 × Linux/Windows/macOS, deploy on `v*` tags.
