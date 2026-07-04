const Handler = require('./../handler.js');
const PACKETS = require('../../types/packets.js');
const { ClientBuffer } = require('../../types/packets.js');
const { socialRequest, genString } = require('../../types/browser_info.js');
let entity, tablist, client;

const self = class AnticheatHandler extends Handler {
	minecraft(mClient) {
		client = mClient;
	}
	bloxd(bClient) {
		// goofy detections omegalol
		this.loops.push(setInterval(() => {
			bClient.send('CPacketGravityDetection', -10); // gravity constant
		}, 9200));

		this.loops.push(setInterval(() => {
			bClient.send('CPacketHookDetection', 0); // 0 = no function hooks found
		}, 4000));

		this.loops.push(setInterval(() => {
			bClient.send('CPacketTickEventDetection', 3); // 3 events connected
		}, 20000));

		this.loops.push(setInterval(() => {
			bClient.send('CPacketBaseEventDetection', 3); // 3 events connected
		}, 42500));

		this.loops.push(setInterval(() => {
			bClient.send('CPacketKillDetection', {
				id: 5 // some constant, I swear this is supposed to count if over 2 kills happened in the server, it doesn't work though.
			});
		}, 99475));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection', {
				"1osza3dnmpu5": "1jh318zxzjya1j",
				"1o61ss6iso02": "1lote417",
				"14xb0": "3jfq6ujc",
				"1iakiqb40": "1l8r",
				ct9aq: "15chj9ipik5",
				s7g43s3bgxoll: "41vygt51x",
				q8603bim: "207",
				"12vvsmk": "1s8f8iu9e8cd",
				qcv1vac26: "11q7nxbcmp5f"
			});
		}, 9792));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection2', {
				"1kg59q": "17lf2hdgucjo07",
				ervwixkc7: "d3cs6",
				"5r": "dhtzm9ft1",
				"3p": "rbhk",
				"1296f63ic5j7": "8lclacixj",
				"1z7um": "1qaxmqfqpo",
				e7: "1b7",
				"152yj": "9sh",
				"1a38dbd": "1rbdzxb54bgz",
				kzp6f67i: "18hppdqtkh"
			});
		}, 2718));

		/*this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection3', {
				p7k9f0r8ug8: "q6tb1c80u0x6t",
				vtd1g4sa: "1zff29",
				"1p": "15jp5ksyf",
				"1q1jvc93di": "1y155txw"
			});
		}, 2512));*/

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection4', {
				ux: "szjw",
				"12lzgnukuzgja": "djeqmhiot",
				"1h1eqergls52i": "casr2rz1r5v",
				"24wc4m4": "1s",
				"23bn0a1snu2gnv7": "1gdras4a4",
				"45ngl9j3mtb": "gs7g92zug",
				b7swti: "1t7rlkp",
				"9526cgc": "s2r7ll4jbfg",
				"17djvlybej": "ksw1fd95mz"
			});
		}, 6640));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection5', undefined);
		}, 4987));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection6', {
				"1ah": "18fwrv9h6qy54h",
				"1tkw7vqlsduno3": "4vizmt7"
			});
		}, 18249));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection7', {
				"9hgp": "1yz3wrxopl7",
				"112pmz": "1k437fob2"
			});
		}, 16429));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection8', {
				orpu4e7tt: "fl",
				"14xd": "1r3be2kjc1",
				omsmet: "1lq",
				"59zg4q51": "11chi",
				r6w: "1z2yxootsfybj",
				"6tipygrb": "y36z1c9798xk",
				v0xm50: "l6bldh"
			});
		}, 4459));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection9', {
				"1mziqo": "1m41xu92xcu93",
				"19vcogm8zgz": "xeyzr3de7y",
				"1xbopv6d": "13cfb92"
			});
		}, 11211));

		this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection10', {
				"1kl": "1pdnc0rn",
				"1475vxj8w0q8dj": "1erd",
				lvaolm6r4mn: "p4bd",
				btsll8txcw: "1ibpe",
				"18a7ou3budj": "dpmbpgcgi2u6j",
				"5duywc3": "146mxzf8t",
				"17bk4zs20d": "1b69rni",
				"5i5hd3c5": "1dgc3",
				"1laym": "1wtrq"
			});
		}, 16121));

		/*this.timeouts.push(setTimeout(() => {
			bClient.send('CPacketConstantDetection11', {
				ulg5ni987hde: "4grafn2w",
				"1z": "1q5wf8",
				"185b": "j1qc0"
			});
		}, 16436));*/

		this.loops.push(setInterval(() => {
			if (typeof bClient.settings.speedMultiplier == 'number' && typeof bClient.settings.jumpAmount == 'number') {
				bClient.send('CPacketSimulationDetection', {
					dmmg: bClient.settings.speedMultiplier * 24, // transformation A
					multt: bClient.settings.jumpAmount * 20, // transformation B
					crchSpd: bClient.settings.crouchingSpeed * 24, // transformation A
					wlkSpd: bClient.settings.walkingSpeed * 24, // transformation A
					runSpd: bClient.settings.runningSpeed * 24, // transformation A
					time: 1 * 20, // tickRate with transformation B
					amount: 0, // supposed to be jump force, but its 0?
					dimWidth: 0.5, // player width
					dimHeight: 1.8, // player height
					mass: 1 // player mass
				});
			}
		}, 9000));

		this.loops.push(setInterval(() => {
			if (typeof bClient.settings.speedMultiplier == 'number' && typeof bClient.settings.jumpAmount == 'number') {
				let pingTime = Date.now();
				socialRequest(`${bClient.ip}/persisted/keep-alive`, {
					type: 'k',
					data: Object.values(new Uint8Array(ClientBuffer[PACKETS.CPacketKeepAliveDetection].toBuffer({
						a: bClient.gameName,
						b: bClient.lobbyName,
						c: genString(),
						d: bClient.settings.speedMultiplier,
						e: bClient.settings.jumpAmount,
						f: bClient.settings.crouchingSpeed,
						g: bClient.settings.walkingSpeed,
						h: bClient.settings.runningSpeed,
						i: 1, // tickRate
						j: 0, // jump force
						k: 0.5, // player width
						l: 1.8, // player height
						m: -10, // gravity
						n: 1 // player mass
					}).buffer))
				}).then(() => {
					const entry = tablist.tabs[entity.local.id];
					if (entry && bClient.connected && client != undefined) {
						entry.ping = (Date.now() - pingTime) / 2;
						client.write('player_info', {
							action: 2,
							data: [{
								UUID: client.uuid,
								ping: entry.ping
							}]
						});
					}
				}).catch((err) => console.log(`Failed to send keep alive packet ${err}`));
			}
		}, 20000));

		socialRequest(`${bClient.ip}/images/Diorite.png`, {
			block: 'Diorite'
		}).catch((err) => console.log('lol', err));
	}
	cleanup() {
		if (this.loops) this.loops.forEach((val) => clearInterval(val));
		if (this.timeouts) this.timeouts.forEach((val) => clearTimeout(val));
		this.loops = [];
		this.timeouts = [];
	}
	obtainHandlers(handlers) {
		entity = handlers.entity;
		tablist = handlers.tablist;
	}
};

module.exports = new self();