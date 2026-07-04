const Handler = require('./../handler.js');
const SKINS = require('./../../types/skins.js');
const { translateText } = require('../../utils.js');
const { settings } = require('../../types/browser_info.js');
let client, entities;

const self = class TabListHandler extends Handler {
	add(entry, entId) {
		if (client == undefined) return;
		const name = entId == entities.local.id ? client.username : entry.name.slice(0, 16);
		const uuid = entId == entities.local.id ? client.uuid : crypto.randomUUID();
		this.entries[entId] = uuid;
		this.tabs[entId] = {
			prefix: '',
			suffix: '',
			ping: 0,
			gamemode: 0,
			name: name
		};

		let chosenSkin;
		if (entId == entities.local.id) {
			chosenSkin = SKINS.granddad;
		} else {
			const skinArray = Object.values(SKINS);
			chosenSkin = skinArray[Math.floor(Math.random() * skinArray.length) % skinArray.length];
		}

		client.write('player_info', {
			action: 0,
			data: [{
				UUID: uuid,
				name: name,
				properties: [{name: 'textures', value: chosenSkin[0], signature: chosenSkin[1]}],
				gamemode: 0,
				ping: 0
			}]
		});

		client.write('scoreboard_team', {
			team: uuid.slice(0, 16),
			mode: 0,
			name: uuid.slice(0, 32),
			prefix: '',
			suffix: '',
			friendlyFire: true,
			nameTagVisibility: 'all',
			color: 0,
			players: [name]
		});
	}
	remove(entId) {
		if (this.entries[entId]) {
			client.write('player_info', {
				action: 4,
				data: [{
					UUID: this.entries[entId]
				}]
			});
			delete this.entries[entId];
			delete this.tabs[entId];
		}
	}
	update(entId, color) {
		const uuid = this.entries[entId];
		if (uuid != undefined) {
			client.write('scoreboard_team', {
				team: uuid.slice(0, 16),
				mode: 1
			});

			client.write('scoreboard_team', {
				team: uuid.slice(0, 16),
				mode: 0,
				name: uuid.slice(0, 32),
				prefix: translateText(color) ?? '',
				suffix: '',
				friendlyFire: true,
				nameTagVisibility: 'all',
				color: 0,
				players: [this.tabs[entId].name]
			});
		}
	}
	bloxd() {
		client.write('playerlist_header', {
			header: JSON.stringify({text: `\u00A7bYou are playing on \u00A7a${settings.server_name.toLocaleLowerCase()}.io`}),
			footer: JSON.stringify({text: '\u00A76Translation layer made by 7GrandDad'})
		});
	}
	minecraft(mcClient) {
		client = mcClient;
	}
	cleanup(requeue) {
		client = requeue ? client : undefined;

		if (requeue) {
			if (client) {
				let data = [];
				Object.values(this.entries).forEach((uuid) => {
					data.push({UUID: uuid});
					client.write('scoreboard_team', {
						team: uuid.slice(0, 16),
						mode: 1
					});
				})
				client.write('player_info', {
					action: 4,
					data: data
				});
			}
		}
		this.entries = {};
		this.tabs = {};
		this.filteredPing = 0;
	}
	obtainHandlers(handlers) {
		entities = handlers.entity;
	}
};

module.exports = new self();