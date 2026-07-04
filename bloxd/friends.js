const { socialRequest } = require('./types/browser_info.js');

module.exports = class Friends {
	friends = []
	requests = []
	listeners = {}
	start() {
		this.listeners.requestAdded = (user) => this.sendChat([
			'\n',
			`\u00a7eFriend request from \u00a77${user.name}\n`,
			'\u00a7eClick one: ',
			{
				text: '[ACCEPT]',
				color: 'green',
				bold: true,
				clickEvent: {
					action: 'run_command',
					value: '/friend accept ' + user.name
				}
			},
			' \u00a78- ',
			{
				text: '[DENY]',
				color: 'red',
				bold: true,
				clickEvent: {
					action: 'run_command',
					value: '/friend deny ' + user.name
				}
			},
			'\n'
		], true);
		this.listeners.friendAdded = (user) => this.sendChat([`\u00a7aYou are now friends with \u00a77${user.name}`]);
		this.listeners.friendRemoved = (user) => this.sendChat([`\u00a7c${user.name} has removed you as a friend.`]);

		this.updateInterval = setInterval(() => this.refreshData(), 15000);
	}
	refreshData() {
		socialRequest('get-social-information')
			.then(data => data.json())
			.then(data => this.processInfo(data))
			.catch(err => console.log('[!] Failed to get social data.', err));
	}
	sendChat(chat, custom, noExtra) {
		if (this.mcClient != undefined) {
			if (!noExtra) chat = ['\u00a79\u00a7m-----------------------------------------------------', ...chat, '\u00a79\u00a7m-----------------------------------------------------'];
			if (custom) {
				this.mcClient.write('chat', {
					message: JSON.stringify({
						extra: chat,
						text: ''
					}),
					position: 0
				});
			} else {
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
		}
	}
	displayFriends() {
		let msg = [' '.repeat(25) + '\u00a76Friends (Page 1 of 1)']
		for (const member of this.friends) {
			let status = '\u00a7e is currently unknown';

			switch (member.location.status) {
				case 'offline':
					status = '\u00a7c is currently offline';
					break;
				case 'leftGame':
				case 'noGamePlayed':
					status = '\u00a7e is currently on the website';
					break;
				case 'inGame':
					status = undefined;
					msg.push({
						text: `\u00a77${member.name}\u00a7e is in ${member.location.inGameNameWithVariation} : ${member.location.inLobbyName}`,
						clickEvent: {
							action: 'run_command',
							value: '/play ' + member.location.inGameNameWithVariation + ' ' + member.location.inLobbyName
						}
					});
					break;
			}

			if (status) msg.push('\u00a77' + member.name + status);
		}
		this.sendChat(msg);
	}
	addFriend(name) {
		socialRequest('send-friend-request', {requestToPlayerName: name})
			.then(() => this.refreshData())
			.catch(() => this.sendChat(['\u00a7cFailed to send friend request.']));
	}
	removeFriend(name) {
		if (this.friends.some((compared) => compared.name == name)) {
			socialRequest('remove-friend', {friendPlayerName: name})
				.then(() => this.refreshData())
				.catch(() => this.sendChat(['\u00a7cFailed to remove friend.']));
		} else {
			this.sendChat([`\u00a77${name}\u00a7c isn't on your friends list!`]);
		}
	}
	respondToFriendRequest(name, accept) {
		if (this.requests.some((compared) => compared.name == name)) {
			socialRequest('respond-to-friend-request', {requestFromPlayerName: name, accept: accept})
				.then(() => this.refreshData())
				.catch(() => this.sendChat(['\u00a7cFailed to respond to request.']));
		}
	}
	processInfo(data) {
		if (data == null) return;

		// 添加数据验证，确保 requests 和 friends 存在且是数组
		if (!data.requests || !Array.isArray(data.requests)) {
			data.requests = [];
		}
		if (!data.friends || !Array.isArray(data.friends)) {
			data.friends = [];
		}

		if (this.connected) {
			for (const member of data.requests) {
				if (!this.requests.some((compared) => compared.name == member.name)) {
					this.listeners.requestAdded(member);
				}
			}

			for (const member of data.friends) {
				const friend = this.friends.find((friend) => friend.name == member.name);
				if (friend) {
					let newStatus = member.location.status != 'offline';
					let oldStatus = friend.location.status != 'offline';
					if (newStatus != oldStatus) {
						this.sendChat([`\u00a7aFriend > \u00a77${member.name}\u00a7e ${newStatus ? 'joined' : 'left'}.`], false, true);
					}
				}
			}

			for (const member of data.friends) {
				if (!this.friends.some((compared) => compared.name == member.name)) {
					this.listeners.friendAdded(member);
				}
			}

			for (const member of this.friends) {
				if (!data.friends.some((compared) => compared.name == member.name)) {
					this.listeners.friendRemoved(member);
				}
			}
		}

		this.connected = true;
		this.friends = Array.isArray(data.friends) ? data.friends : [];
		this.requests = Array.isArray(data.requests) ? data.requests : [];
	}
};