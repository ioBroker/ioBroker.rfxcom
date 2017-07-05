![Logo](admin/rfxcom.png)
# ioBroker.rfxcom
=================

[![NPM version](http://img.shields.io/npm/v/iobroker.rfxcom.svg)](https://www.npmjs.com/package/iobroker.rfxcom)
[![Downloads](https://img.shields.io/npm/dm/iobroker.rfxcom.svg)](https://www.npmjs.com/package/iobroker.rfxcom)
[![Tests](https://travis-ci.org/ioBroker/ioBroker.rfxcom.svg?branch=master)](https://travis-ci.org/ioBroker/ioBroker.rfxcom)

[![NPM](https://nodei.co/npm/iobroker.rfxcom.png?downloads=true)](https://nodei.co/npm/iobroker.rfxcom/)

This adapter communicates with [rfxcom](http://www.rfxcom.com).
Used for receiving the data from weather sensors and wireless power switches.

Read detailed documentation for RfxCom [here](http://www.rfxcom.com/WebRoot/StoreNL2/Shops/78165469/MediaGallery/Downloads/RFXtrx_User_Guide.pdf)

## Prerequisites
To use serial port on Windows it is VS required to build the binary.
To use serial port on linux it is build-essential required. To install it just write:

```
sudo apt-get update
sudo apt-get install build-essential -y
```

## Usage
To enable the learning of sensors you must activate "Inclusion mode". The inclusion mode by default will be enabled for 5 minutes (300000 ms) and after 5 minutes will be disabled automatically.

To enable inclusion mode forever, just set "Inclusion timeout" to 0.

## Pair
The devices get the new address every time the battery changed.

So after the battery changed it must be learned anew.

To do that press the pair button just before inserting the battery and the device will be learned with new address.

## ToDo
Just now only Somfy, Curtain and Lighting3 devices are supported.

## Changelog
### 0.1.0 (2016-07-05)
* (bluefox) initial commit
