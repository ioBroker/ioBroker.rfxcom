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
| `src/lib/lighting1.ts`, `lighting2.ts`, `lighting3.ts`, `curtain1.ts`, `weight.ts` | the other device classes |
| `src/lib/types.ts` | `ConfigDevice`, `RfxDevice` (common device interface), helpers |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `src/types/rfxcom.d.ts` | hand-written typings for the `rfxcom` package (it ships none) |
| `admin/jsonConfig.json` | the configuration dialog |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json` **and** with `admin/jsonConfig.json`. `connTimeout` and `baudRate` exist in `native` but are not used and not shown in the dialog (`rfxcom` always opens with 38400 baud).

### Devices

`DEVICES` in `main.ts` maps a type name to a class implementing `RfxDevice` (`commands`, `sendCommand`, `getObjects`, optional `getStates`/`program`/`erase`/`eraseAll`). `DeviceOptions.deviceId` is `<deviceId>/<unitCode>` (`0x0A0B0C/1` for RFY, `A/1` for Lighting1/Curtain1, `1/2` for Lighting3) or only the ID (`0x1234` for Weight). Objects live in `rfxcom.<i>.<Type>.<deviceId with "/" replaced by "_">.<state>`; the channel stores `native.deviceId` and `native.subtype`.

- **rfxcom wants numeric subtypes.** The classes keep the name (`RFY`, `ARC`, ...) and convert it with `subtypeNumber(rfxcom.<packetType>, name)`. Received events carry the number; `DeviceClass.subTypes` (static) maps it back to the name.
- Lighting1 and Curtain1 pass the device ID as array `[houseCode, unitCode]` to rfxcom, because rfxcom splits a string character by character.
- RFY has two transmitters, one per `venetianBlindsMode` (`EU`/`US`), for the `venetian*EU`/`venetian*US` commands.
- `start()` creates one instance per row of `native.devices` and writes the objects with `syncObjects()` (existing objects only get `native` and `common.name` updated).
- `onStateChange()` maps `<channel>.<command>` to `sendCommand()`. Button commands (`device.commands`) are reset to `false` (ack), `state` and `level` are acknowledged with the written value. `inclusionOn` is handled there as well. Devices of existing channels are created on demand by `getDeviceOfChannel()` (e.g. received devices after a restart).
- Received `lighting1`/`lighting2`/`weight1`/`weight2` events go through `processDeviceEvent()` → `getReceivedDevice()`: known channel → device, unknown device → only created while the inclusion mode is on. `getStates()` returns `{ val, ack }` objects which `syncStates()` writes one after another with `setForeignStateChanged`.
- Every event handler runs in `try/catch`, so a broken telegram cannot crash the adapter.
- The constructors throw on missing `deviceId`/invalid `subtype`.

### Messages (`onMessage`)

| Command | Used by | Answer |
| --- | --- | --- |
| `listUart` | old HTML admin | raw `SerialPort.list()` or `[{ comName: 'Not available' }]` |
| `listPorts` | `comName` (`autocompleteSendTo`) | `[{ value, label }]` |
| `program` / `erase` | Pair/Unpair buttons in the devices table | `[{ result: err }]`, message is the table row (`subType`, the old `subtype` is accepted too) |
| `eraseAll` | "Erase all RFY devices" button, message `{ type: 'RFY' }` | `[{ result: err }]` |

### Used resources (js-controller 8)

`common.declareUsedResources` is `true`: the adapter reports the serial port itself. `start()` first calls `checkUsedResource('serialPort', { port })` and warns if another instance holds it; on the first `ready` of rfxcom the port is registered with `registerUsedResource('serialPort', { port, baudRate: 38400 })`. The host drops the entry when the instance stops, so it is not freed explicitly. The installed `@iobroker/types` do not know this API and js-controller < 8 does not have it, so `resourceRegistry()` probes it at runtime.

### Not implemented

`processLighting4/5/6`, `processEnergy`, `processBlinds`, `processSensors` and `processEvents` only log. `lighting5`/`lighting6` values were calculated in the JS version but never written.

### Misc conventions

- Timers use `this.setTimeout`/`this.clearTimeout` (adapter-core, auto-cleared on unload).
- `serialport` is loaded with `await import()` inside `try`, because the native module may be missing.
- `main.ts` exports a factory when required (compact mode) and self-starts when run directly.

## Release flow

Changelog lives in `README.md` under the `### **WORK IN PROGRESS**` heading; `release-script` (config in `.releaseconfig.json`) moves it into `io-package.json` `common.news`. CI (`.github/workflows/test-and-release.yml`) uses the `ioBroker/testing-action-*` actions: check (type check, lint, `test:package`), adapter tests with `build: true` on Node 22/24/26 × Linux/Windows/macOS, deploy on `v*` tags.
