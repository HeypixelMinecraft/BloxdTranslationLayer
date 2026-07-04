const Handler = require('./../handler.js');
const { translateText, convertTranslation, processLine } = require('./../../utils.js');
const { settings } = require('../../types/browser_info.js');
const GAMEMODE_TITLES = {
	skywars: convertTranslation('game:skyWars', {}),
	skywars_solo: convertTranslation('game:skyWars', {}),
	bedwars_solo: convertTranslation('game:bedwars', {}),
	bedwars_duo: convertTranslation('game:bedwars', {}),
	bedwars_trio: convertTranslation('game:bedwars', {}),
	bedwars_4v4v4v4: convertTranslation('game:bedwars', {}),
	bridge_duo: convertTranslation('game:bridge', {}),
	pirates: convertTranslation('game:pirates', {})
};
let client, bloxDClient, entity;

const self = class TabListHandler extends Handler {
	clear() {
		if (this.score.length > 0) {
			client.write('scoreboard_objective', {
				name: 'scoreboard',
				action: 1
			});
			this.score = [];
		}
	}
	update(data) {
		this.clear();
		client.write('scoreboard_objective', {
			name: 'scoreboard',
			action: 0,
			displayText: `\u00A7e\u00A7l${(GAMEMODE_TITLES[bloxDClient.gameName] ?? settings.server_name).toLocaleUpperCase()}`,
			type: 'INTEGER'
		});
		client.write('scoreboard_display_objective', {
			position: 1,
			name: 'scoreboard'
		});

		let final = [];
		let text = '';
		for (const line of data) {
			text = processLine(line, text);

			if (text.includes('\n')) {
				final.push(text.replaceAll('\n', ''));
				text = '';
			}
		}

		if (text != '') {
			final.push(text);
		}

		if (final.length < 15) {
			final.push('');
			final.push(`\u00A7e${settings.server_name.toLocaleLowerCase()}.io`);
		}

		let index = 0;
		for (const line of final) {
			const name = line.slice(0, 40);
			this.score.push(name);
			client.write('scoreboard_score', {
				scoreName: 'scoreboard',
				itemName: name,
				action: 0,
				value: final.length - index
			});
			index++;
		}
	}
	customUpdate() {
		if (this.doCustom) {
			const newData = ['\u00A77' + new Intl.DateTimeFormat('en-US', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(Date.now()), '\n'];

			for (const [name, val] of Object.entries(this.lobbyValues)) {
				newData.push(name + ': \u00A7a' + val);
				newData.push('\n');
			}

			this.update(newData);
		}
	}
	minecraft(mcClient) {
		client = mcClient;
	}
	bloxd(bClient) {
		bloxDClient = bClient;
		bClient.settingsEvent.on('RightInfoText', (lines) => {
			this.doCustom = lines.length <= 0
			if (this.doCustom) {
				this.customUpdate();
				return;
			}

			this.update(lines);
		});
	}
	cleanup(requeue) {
		client = requeue ? client : undefined;
		if (client) this.clear();
		this.score = [];
		this.lobbyValues = {};
		this.doCustom = undefined;
	}
};

module.exports = new self();