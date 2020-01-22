'use strict';

/*
 * Created with @iobroker/create-adapter v1.20.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require('fs');
const net = require('net');
let matrix = null;

let parentThis;

let arrCMD = [];
let bConnection = false;
let bWaitingForResponse = false;
let cmdInterval;
let pingInterval;
let iMissedPingCounter=0;
let query;
let bWaitQueue = false;
let bFirstPing = true;
let bHasIncomingData = false;
let in_msg = '';

const TIMEOUT = 5000;
const cmdConnect = new Buffer([0x5a, 0xa5, 0x14, 0x00, 0x40, 0x00, 0x00, 0x00, 0x0a, 0x5d]);
const cmdDisconnect = new Buffer([0x5a, 0xa5, 0x14, 0x01, 0x3f, 0x80, 0x00, 0x00, 0x0a, 0x5d]);
const cmdBasicResponse = new Buffer([0x5a, 0xa5, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0xf0, 0x0a, 0xa9]);
const cmdTransmissionDone = new Buffer([0x5a, 0xa5, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0xf1, 0x0a, 0xaf]);
const cmdWaitQueue_1000 = new Buffer([0x03, 0xe8]);

//----https://gist.github.com/Jozo132/2c0fae763f5dc6635a6714bb741d152f
const Float32ToHex = float32 => {
	const getHex = i => ('00' + i.toString(16)).slice(-2);
	var view = new DataView(new ArrayBuffer(4));
	view.setFloat32(0, float32);
	return Array.apply(null, { length: 4 })
		.map((_, i) => getHex(view.getUint8(i)))
		.join('');
};

const Float32ToBin = float32 =>
	parseInt(Float32ToHex(float32), 16)
		.toString(2)
		.padStart(32, '0');
const conv754 = float32 => {
	const getHex = i => parseInt(('00' + i.toString(16)).slice(-2), 16);
	var view = new DataView(new ArrayBuffer(4));
	view.setFloat32(0, float32);
	return Array.apply(null, { length: 4 }).map((_, i) => getHex(view.getUint8(i)));
};

const ToFloat32 = num => {
	if (num > 0 || num < 0) {
		let sign = num >>> 31 ? -1 : 1;
		let exp = ((num >>> 23) & 0xff) - 127;
		let mantissa = ((num & 0x7fffff) + 0x800000).toString(2);
		let float32 = 0;
		for (let i = 0; i < mantissa.length; i += 1) {
			float32 += parseInt(mantissa[i]) ? Math.pow(2, exp) : 0;
			exp--;
		}
		return float32 * sign;
	} else return 0;
};

const HexToFloat32 = str => ToFloat32(parseInt(str, 16));
const BinToFloat32 = str => ToFloat32(parseInt(str, 2));

//https://gist.github.com/xposedbones/75ebaef3c10060a3ee3b246166caab56
//---- Wert, IN von, IN bis, OUT von, OUT bis
const map = (value, x1, y1, x2, y2) => ((value - x1) * (y2 - x2)) / (y1 - x1) + x2;

function toHexString(byteArray) {
	return Array.from(byteArray, function (byte) {
		return ('0' + (byte & 0xff).toString(16)).slice(-2);
	}).join('');
}

//----Rudimentaere Funktion, um syntaktisch prinzipiell korrekte Werte sichezustellen
function simpleMap(pMinimal, pMaximal, pVal) {
	if (pVal < pMinimal) {
		pVal = pMinimal;
	} else if (pVal > pMaximal) {
		pVal = pMaximal;
	}
	return pVal;
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
		bWaitQueue = false;
		bHasIncomingData = false;
		bFirstPing = true;
		iMissedPingCounter =0;		


		//----CMD-Queue einrichten   
		clearInterval(cmdInterval);
		cmdInterval = setInterval(function () {
			parentThis.processCMD();
		}, 100);

		this.connectMatrix();
	}

	disconnectMatrix() {
		this.log.info('disConnectMatrix()');
		matrix.destroy();
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
				arrCMD.push(cmdWaitQueue_1000);
			} else {
				parentThis.log.debug('_connect().bConnection==true. Nichts tun');
			}
			if (pingInterval) {
				clearInterval(pingInterval);
			}

			//clearInterval(query);		
			//query = setInterval(function(){parentThis._connect()}, BIGINTERVALL);

			//----Alle 2 Sekunden ein PING
			pingInterval = setInterval(function () {
				parentThis.pingMatrix();
			}, 750);

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
			//parentThis.log.info('matrix.onData()');
			//parentThis.log.info('matrix.onData(): ' + parentThis.toHexString(chunk) );
			parentThis.processIncoming(chunk);
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
				if (e.code == 'ECONNREFUSED') {
					parentThis.log.error('Keine Verbindung. Ist der Adapter online?');
					arrCMD.push(cmdWaitQueue_1000);

				}
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

	pingMatrix() {
		//bWaitingForRepsonse because there could be some looong transmissions
		if ((bConnection == true)/*&&(bWaitingForResponse==false)*/&&(bWaitQueue==false)) { 
			if (arrCMD.length == 0) {
				//this.log.debug('pingMatrix()');
				arrCMD.push(cmdConnect);
				iMissedPingCounter=0;
				if (bFirstPing) {
					//----Ab jetzt nicht mehr
					bFirstPing = false;
					//this.setDate();
				}
			}
		} else {
			//----No Connection
			this.log.info('pingMatrix(): No Connection.');
			iMissedPingCounter++;
			
			if(iMissedPingCounter>10){	//7,5 Sekunden
				this.log.info('pingMatrix(): 10 mal No Connection. Forciere Reconnect');
				parentThis.disconnectMatrix();
				parentThis.initMatrix();
			}

		}
	}

	processCMD() {
		//this.log.debug('processCMD()');
		if (bWaitQueue == false) {
			if (bWaitingForResponse == false) {
				if (arrCMD.length > 0) {
					//this.log.debug('processCMD: bWaitingForResponse==FALSE, arrCMD.length=' + arrCMD.length.toString());
					bWaitingForResponse = true;

					const tmp = arrCMD.shift();
					if (tmp.length == 10) {
						//----Normaler Befehl
						//this.log.debug('processCMD: next CMD=' + toHexString(tmp) + ' arrCMD.length rest=' + arrCMD.length.toString());
						matrix.write(tmp);
						bHasIncomingData = false;
						//lastCMD = tmp;
						//iMaxTryCounter = MAXTRIES;
						if (query) {
							clearTimeout(query);
						}
						query = setTimeout(function () {
							//----5 Sekunden keine Antwort und das Teil ist offline
							if (bHasIncomingData == false) {
								//----Nach x Milisekunden ist noch gar nichts angekommen....
								parentThis.log.error('processCMD(): KEINE EINKOMMENDEN DATEN NACH ' + TIMEOUT.toString() + ' Milisekunden. OFFLINE?');
								bConnection = false;
								parentThis.disconnectMatrix();
								parentThis.initMatrix();
							} else {
								parentThis.log.info('processCMD(): Irgendetwas kam an... es lebt.');
							}
						}, TIMEOUT);

					} else if (tmp.length == 2) {
						const iWait = tmp[0] * 256 + tmp[1];
						bWaitQueue = true;
						this.log.debug('processCMD.waitQueue: ' + iWait.toString());
						setTimeout(function () { bWaitQueue = false; parentThis.log.info('processCMD.waitQueue DONE'); }, iWait);
					} else {
						//----Nix          
					}
				} else {
					//this.log.debug('processCMD: bWaitingForResponse==FALSE, arrCMD ist leer. Kein Problem');
				}
			} else {
				this.log.debug('AudioMatrix: processCMD: bWaitingForResponse==TRUE. Nichts machen');
			}
		} else {
			//this.log.debug('processCMD: bWaitQueue==TRUE, warten');
		}

		//----Anzeige der Quelength auf der Oberflaeche
		//        this.setStateAsync('queuelength', { val: arrCMD.length, ack: true });
		//
	}


	processIncoming(chunk) {
		//parentThis.log.info('processIncoming(): ' + toHexString(chunk));
		in_msg += toHexString(chunk);
		bHasIncomingData = true; // IrgendETWAS ist angekommen

		if (bWaitingForResponse == true) {
			if (in_msg.length >= 20 && in_msg.includes('5aa5')) {
				const iStartPos = in_msg.indexOf('5aa5');
				if (in_msg.toLowerCase().substring(iStartPos + 16, iStartPos + 18) == '0a') {
					const tmpMSG = in_msg.toLowerCase().substring(iStartPos, iStartPos + 20); //Checksum
					in_msg = in_msg.slice(20); //Die ersten 20 Zeichen abschneiden
					//parentThis.log.info('_processIncoming(); filtered:' + tmpMSG);
					parentThis.parseMSG(tmpMSG);
					//bWaitingForResponse = false;
				} else if (in_msg.toLowerCase().substring(iStartPos + 4, iStartPos + 6) == '11') {
					//----5aa511c2c00000c2c00000c2c00000c2c0...
					//----In der Regel als Antwort auf einen PING
					//parentThis.log.debug('LevelMeter incoming');
					bWaitingForResponse = false;
				} else if (in_msg.toLowerCase().substring(iStartPos + 4, iStartPos + 6) == '12') {
					//----5aa512c2c00000c2c00000c...
					//----In der Regel als Antwort auf einen PING
					//parentThis.log.debug('Sprectrum incoming');
					bWaitingForResponse = false;
				} else {
					//----Irgendwie vergniesgnaddelt. Das ist offenbar egal, weil die Daten erneut gesendet werden
					//parentThis.log.info('AudioMatrix: matrix.on data: Fehlerhafte oder inkomplette Daten empfangen:' + in_msg);
				}
			}
		} else {
			//----Durch die PING-Mechanik kommt hier recht viel an, da muessen wir spaeter drauf schauen.
			parentThis.log.info('AudioMatrix: matrix.on data(): incomming aber bWaitingForResponse==FALSE; in_msg:' + in_msg);
		}

		if (in_msg.length > 120) {
			//----Just in case
			in_msg = '';
		}
	}


	//----Daten komen von der Hardware an
	parseMSG(sMSG) {
		//this.log.info('parseMSG():' + sMSG);
		if (sMSG === toHexString(cmdBasicResponse)) {
			this.log.info('parseMSG(): Basic Response.');
			bConnection = true;

		} else if (sMSG === toHexString(cmdTransmissionDone)) {
			this.log.info('parseMSG(): Transmission Done.');
			this.setState('info.connection', true, true); //Green led in 'Instances'			
			bWaitingForResponse = false;
		} else if (sMSG.startsWith('5aa50700')) {
			//this.log.info('_parseMSG(): received main volume from Matrix.');
			let sHex = sMSG.substring(8, 16);
			let iVal = HexToFloat32(sHex);
			iVal = simpleMap(0, 100, iVal);
			this.log.info('_parseMSG(): received main volume from Matrix. Processed Value:' + iVal.toString());
			//this.setStateAsync('mainVolume', { val: iVal, ack: true });
		} else {
			let sHex = sMSG.substring(4, 6);
			let iVal = parseInt(sHex, 16);
			if (iVal >= 1 && iVal <= 6) {
				//----Input....
				//this.log.info('_parseMSG(): received INPUT Value');
				let sCmd = sMSG.substring(6, 8);
				let iCmd = parseInt(sCmd, 16);
				if (iCmd == 2) {
					//----Gain
					//this.log.info('_parseMSG(): received INPUT Value for GAIN:' + sMSG.substring(8, 16));
					let sValue = sMSG.substring(8, 16);
					let iValue = HexToFloat32(sValue);
					this.log.info('_parseMSG(): received inputGain from Matrix. Original Value:' + sValue.toString());
					iValue = map(iValue, -80, 0, 0, 100); //this.simpleMap(0, 100, iVal);
					this.log.info('_parseMSG(): received gain for input ' + (iVal).toString() + ' from Hardware. Processed Value:' + iValue.toString());
					//this.setStateAsync('inputGain_' + (iVal).toString(), { val: iValue, ack: true });
				} else if ((iCmd >= 51) && (iCmd <= 58)) {
					//this.log.info('_parseMSG(): received routing info. IN:' + (iVal).toString()  + ' OUT:' + (iCmd-50).toString());
					let sValue = sMSG.substring(8, 16);
					let iValue = HexToFloat32(sValue);
					let bValue = iValue == 0 ? false : true;
					this.log.info('_parseMSG(): received routing info. IN:' + (iVal).toString() + ' OUT:' + (iCmd - 50).toString() + '. State:' + bValue.toString());
					let sID = (0 + (iVal - 1) * 8 + (iCmd - 50 - 1)).toString();
					while (sID.length < 2) sID = '0' + sID;
					//this.setStateAsync('routingNode_ID_' + sID + '_IN_' + (iVal).toString() + '_OUT_' + (iCmd - 50).toString(), { val: bValue, ack: true });
				}
			} else if (iVal >= 7 && iVal <= 14) {
				//----Output....
				//this.log.info('_parseMSG(): received OUTPUT Value');
				let sCmd = sMSG.substring(6, 8);
				let iCmd = parseInt(sCmd, 16);
				if (iCmd == 2) {
					//----Gain
					//this.log.info('_parseMSG(): received OUTPUT Value for GAIN:' + sMSG.substring(8, 16));
					let sValue = sMSG.substring(8, 16);
					let iValue = HexToFloat32(sValue);
					this.log.info('_parseMSG(): received outputGain from Matrix. Original Value:' + sValue.toString());
					iValue = map(iValue, -80, 0, 0, 100); //this.simpleMap(0, 100, iVal);
					this.log.info('_parseMSG(): received gain for output ' + (iVal - 7).toString() + ' from Hardware. Processed Value:' + iValue.toString());
					//this.setStateAsync('outputGain_' + (iVal - 7).toString(), { val: iValue, ack: true });
				}
			}
		}
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