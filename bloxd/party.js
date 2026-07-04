const { socialRequest, user } = require('./types/browser_info.js');

module.exports = class Party {
	members = []
	listeners = {}
	connected = false
	constructor(client, code) {
		this.mcClient = client;

		this.listeners.join = () => this.displayParty(true);
		this.listeners.leave = (isKicked) => this.sendChat(['\u00a7c' + (isKicked ? 'You have been kicked from the party' : 'Left party')]);
		this.listeners.playerJoin = (user) => this.sendChat([`\u00a77${user.name}\u00a7e joined the party.`]);
		this.listeners.playerLeave = (user) => this.sendChat([`\u00a77${user.name}\u00a7e has left the party.`]);
		this.listeners.locationChanged = () => {};

		socialRequest(code ? 'join-party' : 'create-party', code ? {partyCode: code} : {chosenPartyCode: null})
			.then(data => data.json())
			.then(data => this.processInfo(data));
	}
	sendChat(chat) {
		chat = ['\u00a79\u00a7m-----------------------------------------------------', ...chat, '\u00a79\u00a7m-----------------------------------------------------'];
		for (const msg of chat) {
			this.mcClient.write('chat', {
				message: JSON.stringify({
					extra: [msg],
					text: ''
				}),
				position: 0
			});
		}
	}
	displayParty(join) {
		let msg = [];
		if (join && this.leader.name != user.name) {
			msg.push(`\u00a7eYou have joined \u00a77${this.leader.name}\'s\u00a7e party!`);

			if (this.members.length > 1) {
				msg.push('');
				msg.push('\u00a7eYou\'ll be partying with: ' + this.members.map((member) => {
					return member.name != user.name ? '\u00a77' + member.name : undefined;
				}).join(this.members.length > 2 ? '\u00a7e, ' : ''));
			}
		} else {
			msg.push(`\u00a7eParty Members (${this.members.length + 1})`);
			msg.push('');
			msg.push(`\u00a7eParty Code: \u00a7a${this.partyCode}`);
			msg.push(`\u00a7eParty Leader: \u00a77${this.leader.name}`);
			msg.push('\u00a7eParty Members: ' + this.members.map((member) => {
				return '\u00a77' + member.name;
			}).join('\u00a7e, '));
		}
		this.sendChat(msg);
	}
	processInfo(data, leaveRequest) {
		if (!this.kicked) {
			const lastConnected = this.connected;
			this.connected = data.partyCode != undefined;
			if (this.connected) {
				this.partyCode = data.partyCode;
				this.leader = data.leaderSocialPreview;

				const newLocation = this.leader.location;
				if ((this.location == undefined || this.location.inVmUrl != newLocation.inVmUrl || this.location.inLobbyName != newLocation.inLobbyName) && newLocation.status == 'inGame') {
					this.listeners.locationChanged(newLocation, this.leader.name);
				}
				this.location = newLocation;

				if (lastConnected) {
					for (const member of data.memberSocialPreviews) {
						if (!this.members.some((compared) => compared.name == member.name) && member.name != this.leader.name) {
							this.listeners.playerJoin(member);
						}
					}

					for (const member of this.members) {
						if (!data.memberSocialPreviews.some((compared) => compared.name == member.name) && member.name != this.leader.name) {
							this.listeners.playerLeave(member);
						}
					}
				}

				this.members = data.memberSocialPreviews;
			} else {
				this.kicked = true;
			}

			if (this.connected != lastConnected) {
				if (this.connected) {
					this.listeners.join();
					this.updateInterval = setInterval(() => {
						if (this.partyCode != undefined) {
							socialRequest('get-party-information', {partyCode: this.partyCode})
								.then(data => data.json())
								.then(data => this.processInfo(data))
								.catch(err => console.log('[!] Failed to get party data.'));
						}
					}, 1500);
				} else {
					this.listeners.leave(!leaveRequest);
					if (this.updateInterval != undefined) {
						clearInterval(this.updateInterval);
						this.updateInterval = undefined;
					}
				}
			}
		}
	}
	leave() {
		this.processInfo({}, true);
		socialRequest('leave-party', {partyCode: this.partyCode});
	}
};