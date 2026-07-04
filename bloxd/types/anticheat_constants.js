const { version } = require('./browser_info.js');

module.exports = {
	PACKET_SEND_VER_KEY: 11 * version + 7,
	PACKET_SEND_EXP_KEY: 6,
	PACKET_GEN_VER_KEY: version * 5 + 13,
	PACKET_GEN_KEY: 'uviz1r5a3xzl5',

	ATTACK_KEY: Math.floor(version / 3) + 4,
	LANGUAGE_KEY: 'en-gb',
	WORLD_KEY: '-1|1|0'
};