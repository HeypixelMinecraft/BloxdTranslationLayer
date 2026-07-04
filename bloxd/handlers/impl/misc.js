const { socialRequest, user, settings, saveSettings } = require('../../types/browser_info.js');
const { processText } = require('../../utils.js');
const Party = require('./../../party.js');
const Friends = require('../../friends.js');
const Handler = require('./../handler.js');
const HOTBAR_CURRENCY = {
	'gold': '\u00A76Gold',
	'gems': '\u00a7aGems',
	'Iron Bar': '\u00a7fIron Bar',
	'Moonstone': '\u00a7aMoonstone',
	'Coal': '\u00a70Coal',
	'Diamond': '\u00a7bDiamond'
};
let client, bloxDClient, entity, connect, gui, tablist;
let buyTick = Date.now();

const self = class ChatHandler extends Handler {
	bloxd(bClient) {
		bloxDClient = bClient;

		bClient.on('SPacketPlayerKilled', (data) => {
			if (data.killerEId == entity.local.id) {
				this.playSound('random.successful_hit');
			}
		});

		bClient.on('SPacketKillfeed', (data) => {
			if (data.withItem && data.withItem.includes('Bed')) {
				this.playSound('mob.enderdragon.growl');
			}
		});

		bClient.on('SPacketLogError', (data) => {
			if (data.includes('Position corrected')) {
				return;
			}

			client.write('chat', {
				message: JSON.stringify({
					extra: ['\u00a7cSErr: ' + data],
					text: ''
				}),
				position: 0
			});
		});

		bClient.on('SPacketChat', (packet) => {
			let text = processText(packet.content);
			if (text != '') {
				text = text.replaceAll(' ', ' ');
				client.write('chat', {
					message: JSON.stringify({
						extra: [text],
						text: ''
					}),
					position: packet.chatterEId != undefined ? 1 : 0
				});

				if (packet.chatterEId == undefined && text.includes('Starting new game')) {
					this.sendAutoPlay();
				}
			}
		});

		bClient.settingsEvent.on('middleTextUpper', (msg) => {
			client.write('title', {
				action: 4,
				fadeIn: -1,
				stay: -1,
				fadeOut: -1
			});

			if (msg != '' && msg != null) {
				client.write('title', {
					action: 2,
					fadeIn: 0,
					stay: 2147483647,
					fadeOut: 0
				});

				client.write('title', {
					action: 1,
					text: JSON.stringify({text: processText(msg)})
				});
			}
		});

		bClient.settingsEvent.on('autoRespawn', () => {
			if (!bClient.settings._isAlive && !bClient.settings.autoRespawn && bClient.settings.creative) {
				this.sendAutoPlay();
			}
		});
	}
	minecraft(mcClient) {
		client = mcClient;

		this.currencyLoop = setInterval(() => {
			if (bloxDClient != undefined && bloxDClient.settings.currencyAmounts != undefined) {
				let currencies = [];

				for (const [name, data] of Object.entries(bloxDClient.settings.currencyAmounts)) {
					if (settings.autoBuy && name == 'gold' && bloxDClient.gameName.includes('skywars')) {
						if ((data.amount ?? 0) >= 100 && buyTick < Date.now()) {
							buyTick = Date.now() + 250;
							bloxDClient.send('CPacketShopPurchase', {
								category: 'Loot',
								name: 'Mystery Kit',
								shopVersion: bloxDClient.settings._shopVersion ?? 0,
								userInput: undefined
							});
						}
					}

					currencies.push((HOTBAR_CURRENCY[name] ?? name) + '\u00a7f: ' + data.amount);
				}

				if (currencies.length > 0) {
					client.write('chat', {
						message: JSON.stringify({
							extra: [currencies.join(' | ')],
							text: ''
						}),
						position: 2
					});
				}
			}
		}, 200);

		client.on('chat', packet => {
			const msg = packet.message.toLocaleLowerCase().split(' ');
			const split = packet.message.split(' ');

			switch (msg[0]) {
				case '/queue':
				case '/play':
					connect(client, true, split[1], split[2]);
					return;
				case '/resync':
					for (const ent of Object.values(entity.entities)) {
						entity.remove(ent);
					}
					entity.checkAll();
					return;
				case '/positions':
					for (const ent of Object.values(entity.entities)) {
						if (ent.type == -1 && !ent.special) {
							client.write('chat', {
								message: JSON.stringify({
									extra: [
										'\u00a7a' + ent.name + '\u00a7f : '
										+ Math.floor(ent.pos.x / 32) + ' : '
										+ Math.floor(ent.pos.y / 32) + ' : '
										+ Math.floor(ent.pos.z / 32) + ' : distance '
										+ Math.floor(Math.sqrt(Math.pow(entity.local.pos.x - (ent.pos.x / 32), 2) + Math.pow(entity.local.pos.y - (ent.pos.y / 32), 2) + Math.pow(entity.local.pos.z - (ent.pos.z / 32), 2)))
									],
									text: ''
								}),
								position: 0
							});
						}
					}
					return;
				case '/craft':
					gui.replicateCustom('Crafting');
					return;
				case '/kits':
					gui.replicateCustom('Loot');
					return;
				case '/perks':
					gui.replicateCustom('Perks');
					return;
				case '/maps':
					gui.replicateCustom('Map Voting');
					return;
				case '/nick':
					this.changeName(split[1]);
					return;
				case '/autonick':
					settings.autoNameChange = !settings.autoNameChange;
					client.write('chat', {
						message: JSON.stringify({
							extra: [settings.autoNameChange ? '\u00a7aEnabled autonick!' : '\u00a7cDisabled autonick.'],
							text: ''
						}),
						position: 0
					});
					saveSettings();
					return;
				case '/autobuy':
					settings.autoBuy = !settings.autoBuy;
					client.write('chat', {
						message: JSON.stringify({
							extra: [settings.autoBuy ? '\u00a7aEnabled autobuy!' : '\u00a7cDisabled autobuy.'],
							text: ''
						}),
						position: 0
					});
					saveSettings();
					return;
				case '/servername':
					settings.server_name = split.splice(1).join(' ');
					client.write('chat', {
						message: JSON.stringify({
							extra: ['\u00a7aChanged server name to ' + settings.server_name],
							text: ''
						}),
						position: 0
					});
					saveSettings();
					return;
				case '/p':
				case '/party':
					switch (msg[1]) {
						case 'create':
						case 'join':
							if (this.party) {
								this.party.leave();
							}

							this.party = new Party(client, split[2]);
							this.party.listeners.locationChanged = function(data, leaderName) {
								if (leaderName != bloxDClient.name && (data.inVmUrl != bloxDClient.ip || data.inLobbyName != bloxDClient.lobbyName)) {
									connect(client, true, data.inGameNameWithVariation, data.inLobbyName);
								}
							}

							return;
						case 'leave':
							if (this.party) {
								this.party.leave();
								this.party = undefined;
							}
							return;
						case 'info':
						case 'list':
							if (this.party) {
								this.party.displayParty();
							}
							return;
					}
					return;
				case '/f':
				case '/friend':
					switch (msg[1]) {
						case 'add':
							this.friends.addFriend(split[2]);
							return;
						case 'remove':
							this.friends.removeFriend(split[2]);
							return;
						case 'accept':
							this.friends.respondToFriendRequest(split[2], true);
							return;
						case 'deny':
							this.friends.respondToFriendRequest(split[2], false);
							return;
						case 'list':
							this.friends.displayFriends();
							return;
					}
					return;
			}

			bloxDClient.send('CPacketChat', {
				msg: packet.message,
				channelName: null
			});
		});

		client.on('tab_complete', packet => {
			const split = packet.text.split(' ');
			const match = split[split.length - 1].toLocaleLowerCase();

			if ((packet.text.startsWith('/queue') || packet.text.startsWith('/play')) && packet.text.indexOf(' ') != -1) {
				client.write('tab_complete', {
					matches: [
						'classic_survival', 'classic', 'classic_creative', 'classic_factions',
						'bedwars_4v4v4v4', 'bedwars_trio', 'bedwars_duo', 'bedwars_solo',
						'oneBlock', 'greenville', 'luckyTowers', 'pirates', 'shooting_tdm', 'shooting_ffa',
						'infection', 'skywars', 'bridge_duo', 'plots', 'eviltower', 'parkour',
						'doodle', 'hideseek', 'murderMystery', 'paintball', 'rocketSpleef',
						'rocketParkour', 'bingo', 'naturalDisaster'
					].filter((str) => str.substring(0, match.length) == match)
				});
				return;
			}

			let playerNames = [];
			for (const obj of bloxDClient.room.state.entities['$items']) {
				if (obj[1].type == 'Player') {
					playerNames.push(obj[1].name);
				}
			}

			client.write('tab_complete', {
				matches: playerNames.filter((str) => str.toLocaleLowerCase().substring(0, match.length) == match)
			});
		});
	}
	playSound(sound, volume, pitch, location) {
		location = location ?? Object.values(entity.local.pos);
		client.write('named_sound_effect', {
			soundName: sound,
			x: location[0] * 8,
			y: (location[1] + entity.chunkOffset) * 8,
			z: location[2] * 8,
			volume: volume ?? 1,
			pitch: (pitch ?? 1) * 63
		});
	}
	sendAutoPlay() {
		if (this.party != undefined && this.party.leader.name != user.name) return;
		this.requeueTimeout = setTimeout(() => {
			client.write('chat', {
				message: JSON.stringify({
					text: '',
					extra: [
						{
							text: 'Click here',
							color: 'aqua',
							clickEvent: {
								action: 'run_command',
								value: '/play ' + bloxDClient.gameName
							}
						},
						' to play again!'
					]
				}),
				position: 1
			});
		}, 3000);
	}
	changeName(name, callback) {
		socialRequest('https://bloxd.io/index/name/update', {
			name: name
		}).then(data => data.json()).then(data => {
			if (client != undefined) {
				client.write('chat', {
					message: JSON.stringify({
						extra: [data.nameExists ? '\u00a7cFailed to change name' : (data.err ? '\u00a7c' + data.err : '\u00a7aSuccessfully changed name!')],
						text: ''
					}),
					position: 0
				});
			}

			if (callback) {
				callback(!(data.nameExists ?? data.err))
			}
		});
	}
	cleanup(requeue) {
		client = requeue ? client : undefined;
		this.currency = undefined;
		if (this.friends) this.friends.mcClient = client;
		if (this.requeueTimeout) clearTimeout(this.requeueTimeout);
		if (!requeue) {
			if (this.currencyLoop) clearInterval(this.currencyLoop);
			if (this.party != undefined) {
				this.party.leave();
				this.party = undefined;
			}
		}
	}
	obtainHandlers(handlers, connectFunction) {
		this.friends = new Friends();
		this.friends.start();
		connect = connectFunction;
		entity = handlers.entity;
		gui = handlers.gui;
		tablist = handlers.tablist;
	}
};

module.exports = new self();