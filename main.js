'use strict';

/*
 * Created with @iobroker/create-adapter v1.20.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require('fs');
let net = require('net');
let matrix = null;

let parentThis;

let arrCMD = [];
let bConnection = false;
let bWaitingForResponse = false;
let cmdInterval;

const cmdConnect = new Buffer([0x5a, 0xa5, 0x14, 0x00, 0x40, 0x00, 0x00, 0x00, 0x0a, 0x5d]);
const cmdDisconnect = new Buffer([0x5a, 0xa5, 0x14, 0x01, 0x3f, 0x80, 0x00, 0x00, 0x0a, 0x5d]);
const cmdBasicResponse = new Buffer([0x5a, 0xa5, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0x0a, 0xa9]);
const cmdTransmissionDone = new Buffer([0x5a, 0xa5, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0x0a, 0xaf]);
const cmdWaitQueue_1000 = new Buffer([0x03, 0xe8]);

function toHexString(byteArray) {
	return Array.from(byteArray, function (byte) {
		return ('0' + (byte & 0xff).toString(16)).slice(-2);
	}).join('');
}


class Test extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'test',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('objectChange', this.onObjectChange.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));

		parentThis = this;
	}

	//==================================================================================
	initMatrix() {
		this.log.info('initMatrix().');

		arrCMD = [];
		bWaitingForResponse = false;
		bConnection = false;

		//----CMD-Queue einrichten   
		clearInterval(cmdInterval);
		cmdInterval = setInterval(function () {
			parentThis.processCMD();
		}, 1000);

		this.connectMatrix();
	}


	connectMatrix(cb) {
		//this.log.info('connectMatrix():' + this.config.host + ':' + this.config.port);
		this.log.info('connectMatrix()');

		arrCMD = [];
		matrix = new net.Socket();
		matrix.connect(1024, '192.168.1.100', function () {
			if (bConnection == false) {
				parentThis.log.debug('connectMatrix(). bConnection==false, sending CMDCONNECT:' + toHexString(cmdConnect));
				arrCMD.push(cmdConnect);
			} else {
				parentThis.log.debug('_connect().bConnection==true. Nichts tun');
			}
			//clearInterval(pingInterval);
			//clearInterval(query);

			//parentThis._connect();
			//query = setInterval(function(){parentThis._connect()}, BIGINTERVALL);

			//pingInterval = setInterval(function() {
			//	parentThis.pingMatrix();
			//  }, PINGINTERVALL);

			//----Queue
			//  clearInterval(cmdInterval);
			//  cmdInterval = setInterval(function() {
			//	parentThis.processCMD();
			//  }, 50);

			//  if (cb) {
			//	cb();
			//  }
		});

		matrix.on('data', function (chunk) {
			parentThis.log.info('matrix.onData()');
			//parentThis.log.info('matrix.onData(): ' + parentThis.toHexString(chunk) );
			//parentThis._processIncoming(chunk);
		});

		matrix.on('timeout', function (e) {
			//if (e.code == 'ENOTFOUND' || e.code == 'ECONNREFUSED' || e.code == 'ETIMEDOUT') {
			//            matrix.destroy();
			//}
			parentThis.log.error('AudioMatrix TIMEOUT. TBD');
			//parentThis.connection=false;
			//parentThis.setConnState(false, true);
			//            parentThis.reconnect();
		});

		matrix.on('error', function (e) {
			if (e.code == 'ENOTFOUND' || e.code == 'ECONNREFUSED' || e.code == 'ETIMEDOUT') {
				//matrix.destroy();
				//parentThis.initMatrix();
			}
			parentThis.log.error(e);
			//            parentThis.reconnect();
		});

		matrix.on('close', function (e) {
			//if (bConnection) {
			parentThis.log.error('AudioMatrix closed. TBD');
			//}
			//parentThis.reconnect();
		});

		matrix.on('disconnect', function (e) {
			parentThis.log.error('AudioMatrix disconnected. TBD');
			//            parentThis.reconnect();
		});

		matrix.on('end', function (e) {
			parentThis.log.error('AudioMatrix ended');
			//parentThis.setState('info.connection', false, true);
		});
	}


	processCMD() {
		this.log.info('processCMD()');

		//var bWait = false;

		if (bWaitingForResponse == false) {
			if (arrCMD.length > 0) {
				this.log.debug('processCMD: bWaitingForResponse==FALSE, arrCMD.length=' + arrCMD.length.toString());
				bWaitingForResponse = true;

				let tmp = arrCMD.shift();
				if (tmp.length == 10) {
					//----Normaler Befehl
					this.log.debug('processCMD: next CMD=' + toHexString(tmp) + ' arrCMD.length rest=' + arrCMD.length.toString());
					//lastCMD = tmp;
					//iMaxTryCounter = MAXTRIES;
					//matrix.write(tmp);
					//bHasIncomingData = false;
					//clearTimeout(query);
					//query = setTimeout(function () {
					//	//----Es ist ander als bei der 880er: 2 Sekunden keine Antwort und das Teil ist offline
					//	if (bHasIncomingData == false) {
					//		//----Nach x Milisekunden ist noch gar nichts angekommen....
					//		parentThis.log.error('processCMD(): KEINE EINKOMMENDEN DATEN NACH ' + OFFLINETIMER.toString() + ' Milisekunden. OFFLINE?');
					//		parentThis._setOffline();
					//		parentThis.reconnect();
					//	} else {
					//		//parentThis.log.info('processCMD(): Irgendetwas kam an... es lebt.');
					//	}
					//}, OFFLINETIMER);
					//matrix.write(tmp);
				} else if (tmp.length == 2) {
					this.log.debug('processCMD.waitQueue: ' + iWait.toString());
					//----WaitQueue, Der Wert entspricht den zu wartenden Milisekunden
					//var iWait = tmp[0] * 256 + tmp[1];
					//setTimeout(function(){ bWait=false; parentThis.log.info('processCMD.waitQueue DONE'); }, iWait);
				} else {
					//----Nix          
				}
			} else {
				this.log.debug('processCMD: bWaitingForResponse==FALSE, arrCMD ist leer. Kein Problem');
			}
		} else {
			this.log.debug('AudioMatrix: processCMD: bWaitingForResponse==TRUE. Nichts machen');
		}

		//----Anzeige der Quelength auf der Oberflaeche
		//        this.setStateAsync('queuelength', { val: arrCMD.length, ack: true });
		//
	}


	//==================================================================================



	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute 'native') is accessible via
		// this.config:
		this.log.info('config option1: ' + this.config.option1);
		this.log.info('config option2: ' + this.config.option2);

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named 'testVariable'
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		/*
		await this.setObjectAsync('testVariable', {
			type: 'state',
			common: {
				name: 'testVariable',
				type: 'boolean',
				role: 'indicator',
				read: true,
				write: true,
			},
			native: {},
		});
		*/
		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates('*');

		/*
		setState examples
		you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		//await this.setStateAsync('testVariable', true);

		// same thing, but the value is flagged 'ack'
		// ack should be always set to true if the value is received from or acknowledged from the target system
		//await this.setStateAsync('testVariable', { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		//await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		let result = await this.checkPasswordAsync('admin', 'iobroker');
		this.log.info('check user admin pw iobroker: ' + result);

		result = await this.checkGroupAsync('admin', 'admin');
		this.log.info('check group user admin group admin: ' + result);

		this.initMatrix();
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info('cleaned everything up...');
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires 'common.message' property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Test(options);
} else {
	// otherwise start the instance directly
	new Test();
}