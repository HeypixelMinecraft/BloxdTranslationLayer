const { PACKET_GEN_KEY, PACKET_GEN_VER_KEY } = require('./anticheat_constants.js');
const { Type } = require('avsc');

class PacketGenerator {
	constructor(L) {
		this.a = void 0;
		let x = 2166136261;
		for (let a = 0; a < L.length; a++)
			x = Math.imul(x ^ L.charCodeAt(a), 16777619);
		this.a = x
	}
	next() {
		let L = this.a += 1831565813;
		return L = Math.imul(L ^ L >>> 15, 1 | L),
		L ^= L + Math.imul(L ^ L >>> 7, 61 | L),
		((L ^ L >>> 14) >>> 0) / 4294967296
	}
};

/**
 * Generate packets using unique algorithm.
 * @param {string} L
 * @returns {Uint8Array}
*/
function generatePackets(packetType) {
	const arr = new Array(128).fill(0).map((_, v) => v), gen = new PacketGenerator(packetType + 'grenoergi' + PACKET_GEN_KEY + 'oioegrn' + PACKET_GEN_VER_KEY);

	for (let i = 0; i < arr.length; i++) {
		const entry = i + Math.floor(gen.next() * (arr.length - i));
		[arr[i], arr[entry]] = [arr[entry], arr[i]]
	}

	return arr;
};

const clientPackets = generatePackets('1'), serverPackets = generatePackets('2');
let clientIndex = 0, serverIndex = 0;
let PACKETS = {
	CPacketRemoveItem: clientPackets[clientIndex++],
	CPacketConstantDetection8: clientPackets[clientIndex++],
	CPacketConstantDetection6: clientPackets[clientIndex++],
	CPacketUpdatePos: clientPackets[clientIndex++],
	CPacketCraftItem: clientPackets[clientIndex++],
	CPacketConstantDetection7: clientPackets[clientIndex++],

	CPacketCloseChest: clientPackets[clientIndex++],
	CPacketApplyForce: clientPackets[clientIndex++],
	CPacketUseFirework: clientPackets[clientIndex++],
	CPacketReloadGun: clientPackets[clientIndex++],
	CPacketReportPlayer: clientPackets[clientIndex++],
	CPacketDiscordReport: clientPackets[clientIndex++],

	CPacketSpecialAction: clientPackets[clientIndex++],
	CPacketUseBoat: clientPackets[clientIndex++],
	CPacketMilkEntity: clientPackets[clientIndex++],
	CPacketMovePlayer: clientPackets[clientIndex++],
	CPacketUpdateLeaderboard: clientPackets[clientIndex++],
	CPacketUpdateSkin: clientPackets[clientIndex++],

	CPacketUseItem: clientPackets[clientIndex++],
	CPacketStartUse: clientPackets[clientIndex++],
	CPacketConstantDetection3: clientPackets[clientIndex++],
	CPacketTickEventDetection: clientPackets[clientIndex++],
	CPacketShopPurchase: clientPackets[clientIndex++],
	CPacketAcceptTeleport: clientPackets[clientIndex++],

	CPacketConstantDetection2: clientPackets[clientIndex++],
	CPacketOpenCodeBlock: clientPackets[clientIndex++],
	CPacketClickDetectionDown: clientPackets[clientIndex++],
	CPacketConstantDetection10: clientPackets[clientIndex++],
	CPacketUpdateSignLines: clientPackets[clientIndex++],
	CPacketRequestChunk: clientPackets[clientIndex++],

	CPacketEnterIronKey: clientPackets[clientIndex++],
	CPacketUpdateSign: clientPackets[clientIndex++],
	CPacketSteerVehicle: clientPackets[clientIndex++],
	CPacketHookDetection: clientPackets[clientIndex++],
	CPacketConstantDetection4: clientPackets[clientIndex++],
	CPacketResponseDetection: clientPackets[clientIndex++],

	CPacketRedeemAward: clientPackets[clientIndex++],
	CPacketSpecialActionUp: clientPackets[clientIndex++],
	CPacketBaseEventDetection: clientPackets[clientIndex++],
	CPacketFillBucket: clientPackets[clientIndex++],
	CPacketWriteNametag: clientPackets[clientIndex++],
	CPacketSalvageItem: clientPackets[clientIndex++],

	CPacketGravityDetection: clientPackets[clientIndex++],
	CPacketSwingItem: clientPackets[clientIndex++],
	CPacketMoveItemQuick: clientPackets[clientIndex++],
	CPacketUseBlockItem: clientPackets[clientIndex++],
	CPacketMoveItemAmount: clientPackets[clientIndex++],
	CPacketWriteBook: clientPackets[clientIndex++],

	CPacketPickupItem: clientPackets[clientIndex++],
	CPacketIgnorePlayer: clientPackets[clientIndex++],
	CPacketRemoveItem2: clientPackets[clientIndex++],
	CPacketRespawn: clientPackets[clientIndex++],
	CPacketClickDetectionUp: clientPackets[clientIndex++],
	CPacketConstantDetection9: clientPackets[clientIndex++],

	CPacketAttackEntity: clientPackets[clientIndex++],
	CPacketConstantDetection5: clientPackets[clientIndex++],
	CPacketModifyBlock: clientPackets[clientIndex++],
	CPacketChat: clientPackets[clientIndex++],
	CPacketBreakEntity: clientPackets[clientIndex++],
	CPacketRPGHit: clientPackets[clientIndex++],

	CPacketFinishUse: clientPackets[clientIndex++],
	CPacketSimulationDetection: clientPackets[clientIndex++],
	CPacketCollideEntity: clientPackets[clientIndex++],
	CPacketKeepAliveDetection: clientPackets[clientIndex++],
	CPacketAnalytics: clientPackets[clientIndex++],
	CPacketEnchantItem: clientPackets[clientIndex++],

	CPacketBreakBlock: clientPackets[clientIndex++],
	CPacketConstantDetection: clientPackets[clientIndex++],
	CPacketRest: clientPackets[clientIndex++],
	CPacketSelectSlot: clientPackets[clientIndex++],
	CPacketJoinDiscord: clientPackets[clientIndex++],
	CPacketUseBucket: clientPackets[clientIndex++],

	CPacketKillDetection: clientPackets[clientIndex++],
	CPacketFireBullet: clientPackets[clientIndex++],
	CPacketIDKBullet: clientPackets[clientIndex++],
	nh: clientPackets[clientIndex++],
	CPacketUpdateIronKey: clientPackets[clientIndex++],
	CPacketFillBowl: clientPackets[clientIndex++],

	CPacketMoveItem: clientPackets[clientIndex++],
	SPacketRemoveRecipes: serverPackets[serverIndex++],
	SPacketEffectMultiplier: serverPackets[serverIndex++],
	SPacketUpdateJump: serverPackets[serverIndex++],
	SPacketChat: serverPackets[serverIndex++],
	SPacketEntityVelocityPlayer: serverPackets[serverIndex++],

	SPacketRemoveChunk: serverPackets[serverIndex++],
	SPacketSetPickupFalse: serverPackets[serverIndex++],
	SPacketHitVehicle: serverPackets[serverIndex++],
	SPacketPlayerTeleport2: serverPackets[serverIndex++],
	SPacketClearInventory: serverPackets[serverIndex++],
	SPacketLocalStorage: serverPackets[serverIndex++],

	SPacketPickupItem: serverPackets[serverIndex++],
	SPacketBlockUpdate4: serverPackets[serverIndex++],
	SPacketLogError: serverPackets[serverIndex++],
	SPacketLeaveEvent: serverPackets[serverIndex++],
	SPacketUpdateChest: serverPackets[serverIndex++],
	SPacketPlayerKilled: serverPackets[serverIndex++],

	SPacketSyncInventory: serverPackets[serverIndex++],
	SPacketTopRight: serverPackets[serverIndex++],
	SPacketBlockUpdate11: serverPackets[serverIndex++],
	SPacketViewAngles: serverPackets[serverIndex++],
	SPacketBlockUpdate7: serverPackets[serverIndex++],
	SPacketBlockUpdate6: serverPackets[serverIndex++],

	SPacketCustomEvent: serverPackets[serverIndex++],
	SPacketOpenShop: serverPackets[serverIndex++],
	SPacketPlugin: serverPackets[serverIndex++],
	SPacketWorldSeed: serverPackets[serverIndex++],
	SPacketProgressBar: serverPackets[serverIndex++],
	SPacketUpdateDoor: serverPackets[serverIndex++],

	SPacketBlockUpdate: serverPackets[serverIndex++],
	SPacketJoinGame: serverPackets[serverIndex++],
	SPacketProgressEvent: serverPackets[serverIndex++],
	SPacketDiscordKey: serverPackets[serverIndex++],
	SPacketServerSetting: serverPackets[serverIndex++],
	SPacketUpdateLeaderboard: serverPackets[serverIndex++],

	SPacketUpdateEffect: serverPackets[serverIndex++],
	SPacketEntityPose: serverPackets[serverIndex++],
	SPacketShopInfo: serverPackets[serverIndex++],
	SPacketBlockUpdate10: serverPackets[serverIndex++],
	SPacketBlockUpdate9: serverPackets[serverIndex++],
	SPacketRemoveItem: serverPackets[serverIndex++],

	SPacketShopTutorial: serverPackets[serverIndex++],
	SPacketUpdateBookshelf: serverPackets[serverIndex++],
	SPacketBlockUpdate2: serverPackets[serverIndex++],
	SPacketChunkData: serverPackets[serverIndex++],
	SPacketRemoveEffect: serverPackets[serverIndex++],
	SPacketUpdateMesh: serverPackets[serverIndex++],

	SPacketUpdateSlowness: serverPackets[serverIndex++],
	SPacketFlyingMessage: serverPackets[serverIndex++],
	SPacketReloadGun: serverPackets[serverIndex++],
	SPacketSetBlock3: serverPackets[serverIndex++],
	SPacketCloseRequest: serverPackets[serverIndex++],
	SPacketSetSlot: serverPackets[serverIndex++],

	SPacketPlayerTeleport: serverPackets[serverIndex++],
	SPacketEquipArmor: serverPackets[serverIndex++],
	SPacketUpdateCrafting: serverPackets[serverIndex++],
	SPacketEntityVelocity: serverPackets[serverIndex++],
	SPacketRegisterCustomItem: serverPackets[serverIndex++],
	SPacketBulletHit: serverPackets[serverIndex++],

	SPacketUpdateMailbox: serverPackets[serverIndex++],
	SPacketFOV: serverPackets[serverIndex++],
	SPacketResyncVelocity: serverPackets[serverIndex++],
	SPacketPlaySound: serverPackets[serverIndex++],
	SPacketQueueNext: serverPackets[serverIndex++],
	SPacketSetBlock: serverPackets[serverIndex++],

	SPacketSetWorldBool: serverPackets[serverIndex++],
	SPacketFinishUse: serverPackets[serverIndex++],
	SPacketBlockUpdate3: serverPackets[serverIndex++],
	SPacketUpdateSkin: serverPackets[serverIndex++],
	SPacketUpdateCode: serverPackets[serverIndex++],
	SPacketSelectSlot: serverPackets[serverIndex++],

	SPacketBulletFire: serverPackets[serverIndex++],
	SPacketEntityDamage: serverPackets[serverIndex++],
	SPacketBlockUpdate8: serverPackets[serverIndex++],
	SPacketUpdateSpeed: serverPackets[serverIndex++],
	SPacketEntitySetting: serverPackets[serverIndex++],
	SPacketResourceEvent: serverPackets[serverIndex++],

	SPacketKillfeed: serverPackets[serverIndex++],
	SPacketOpenRequest: serverPackets[serverIndex++],
	SPacketTaskEvent: serverPackets[serverIndex++],
	SPacketKick: serverPackets[serverIndex++],
	SPacketBlockUpdate5: serverPackets[serverIndex++],
	SPacketParticles: serverPackets[serverIndex++],

	SPacketSetMultiBlock: serverPackets[serverIndex++],
	SPacketSetPickupTrue: serverPackets[serverIndex++],
	SPacketCustomItem: serverPackets[serverIndex++],
	SPacketPoll: serverPackets[serverIndex++],
	SPacketSetBlockData: serverPackets[serverIndex++],
	SPacketUnknown1: serverPackets[serverIndex++],
	SPacketUnknown2: serverPackets[serverIndex++],
	SPacketUnknown3: serverPackets[serverIndex++],
	SPacketUnknown4: serverPackets[serverIndex++],
	SPacketUnknown5: serverPackets[serverIndex++],
	SPacketUnknown6: serverPackets[serverIndex++],
	SPacketUnknown7: serverPackets[serverIndex++],
	SPacketUnknown8: serverPackets[serverIndex++],
	SPacketUnknown9: serverPackets[serverIndex++],
	SPacketUnknown10: serverPackets[serverIndex++],
	SPacketUnknown11: serverPackets[serverIndex++],
	SPacketUnknown12: serverPackets[serverIndex++],
	SPacketUnknown13: serverPackets[serverIndex++],
	SPacketUnknown14: serverPackets[serverIndex++],
	SPacketUnknown15: serverPackets[serverIndex++],
	SPacketUnknown16: serverPackets[serverIndex++],
	SPacketUnknown17: serverPackets[serverIndex++],
	SPacketUnknown18: serverPackets[serverIndex++],
	SPacketUnknown19: serverPackets[serverIndex++],
	SPacketUnknown20: serverPackets[serverIndex++],
	SPacketUnknown21: serverPackets[serverIndex++],
	SPacketUnknown22: serverPackets[serverIndex++],
	SPacketUnknown23: serverPackets[serverIndex++],
	SPacketUnknown24: serverPackets[serverIndex++],
	SPacketUnknown25: serverPackets[serverIndex++],
	SPacketUnknown26: serverPackets[serverIndex++],
	SPacketUnknown27: serverPackets[serverIndex++],
	SPacketUnknown28: serverPackets[serverIndex++],
	SPacketUnknown29: serverPackets[serverIndex++],
	SPacketUnknown30: serverPackets[serverIndex++],
	SPacketUnknown31: serverPackets[serverIndex++],
	SPacketUnknown32: serverPackets[serverIndex++],
	SPacketUnknown33: serverPackets[serverIndex++],
	SPacketUnknown34: serverPackets[serverIndex++],
	SPacketUnknown35: serverPackets[serverIndex++],
	SPacketUnknown36: serverPackets[serverIndex++],
	SPacketUnknown37: serverPackets[serverIndex++],
	SPacketUnknown38: serverPackets[serverIndex++],
	SPacketUnknown39: serverPackets[serverIndex++],
	SPacketUnknown40: serverPackets[serverIndex++],
};

const FloatArray = {
	type: 'array',
	items: 'float'
},
DoubleArray = {
	type: 'array',
	items: 'double'
},
IntArray = {
	type: 'array',
	items: 'int'
},
StringArray = {
	type: 'array',
	items: 'string'
},
EntityEntry = {
	type: 'record',
	fields: [{
		name: 'entityName',
		type: 'string'
	}]
},
TranslationEntry = {
	type: 'record',
	fields: [{
		name: 'translationKey',
		type: 'string'
	}, {
		name: 'params',
		default: null,
		type: ['null', {
			type: 'map',
			values: ['string', 'int', 'boolean', EntityEntry]
		}]
	}]
},
FormattedEntry = {
	name: 'styledText',
	type: 'record',
	fields: [{
		name: 'str',
		type: [{
			name: 'string',
			type: 'string'
		}, {
			name: 'styledEntityName',
			...EntityEntry
		}, {
			name: 'styledTranslatedText',
			...TranslationEntry
		}]
	}, {
		name: 'style',
		default: null,
		type: ['null', {
			type: 'record',
			fields: [{
				name: 'color',
				default: null,
				type: ['null', 'string']
			}, {
				name: 'colour',
				default: null,
				type: ['null', 'string']
			}, {
				name: 'fontWeight',
				default: null,
				type: ['null', 'string', 'int']
			}, {
				name: 'fontSize',
				default: null,
				type: ['null', 'string']
			}]
		}]
	}, {
		name: 'clickableUrl',
		default: null,
		type: ['null', 'string']
	}]
},
ChatEntry = {
	type: 'array',
	items: [{
		name: 'string',
		type: 'string'
	}, {
		name: 'entityName',
		...EntityEntry
	}, {
		name: 'translatedText',
		...TranslationEntry
	}, {
		name: 'styledIcon',
		type: 'record',
		fields: [{
			name: 'icon',
			type: 'string'
		}, {
			name: 'style',
			default: null,
			type: ['null', {
				type: 'record',
				fields: [{
					name: 'color',
					default: null,
					type: ['null', 'string']
				}, {
					name: 'colour',
					default: null,
					type: ['null', 'string']
				}, {
					name: 'fontSize',
					default: null,
					type: ['null', 'string']
				}]
			}]
		}]
	}, FormattedEntry]
};

PACKETS.packets = PACKETS;
PACKETS.ClientBuffer = {
	[PACKETS.CPacketMovePlayer]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'x',
			type: 'double'
		}, {
			name: 'y',
			type: 'double'
		}, {
			name: 'z',
			type: 'double'
		}, {
			name: 'heading',
			type: 'float'
		}, {
			name: 'speed',
			type: 'float'
		}, {
			name: 'jumping',
			type: 'boolean'
		}, {
			name: 'crouching',
			type: 'boolean'
		}, {
			name: 'pitch',
			type: 'float'
		}, {
			name: 'armSwinging',
			type: 'boolean'
		}, {
			name: 'useDir',
			type: FloatArray
		}, {
			name: 'physicsVersion',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketChat]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'msg',
			type: 'string'
		}, {
			name: 'channelName',
			type: ['null', 'string']
		}]
	}),
	[PACKETS.CPacketSpecialAction]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.CPacketTickEventDetection]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.CPacketSimulationDetection]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'dmmg',
			type: 'double'
		}, {
			name: 'multt',
			type: 'double'
		}, {
			name: 'crchSpd',
			type: 'double'
		}, {
			name: 'wlkSpd',
			type: 'double'
		}, {
			name: 'runSpd',
			type: 'double'
		}, {
			name: 'time',
			type: 'double'
		}, {
			name: 'amount',
			type: 'double'
		}, {
			name: 'dimWidth',
			type: 'double'
		}, {
			name: 'dimHeight',
			type: 'double'
		}, {
			name: 'mass',
			type: 'double'
		}]
	}),
	[PACKETS.CPacketSpecialActionUp]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'keyup',
			type: 'string'
		}, {
			name: 'held',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketModifyBlock]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'changePos',
			type: IntArray
		}, {
			name: 'toBlock',
			type: 'int'
		}, {
			name: 'checker',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketRemoveItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'idx',
			type: 'int'
		}, {
			name: 'id',
			type: 'int'
		}, {
			name: 'amount',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketMoveItemQuick]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'start',
			type: 'int'
		}, {
			name: 'end',
			type: 'int'
		}, {
			name: 'moveIdx',
			type: 'int'
		}, {
			name: 'itemAmount',
			type: ['null', 'int']
		}]
	}),
	[PACKETS.CPacketUpdateSkin]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'partType',
			type: 'string'
		}, {
			name: 'selected',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketMoveItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'i',
			type: 'int'
		}, {
			name: 'j',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketKillDetection]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'id',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketMoveItemAmount]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'i',
			type: 'int'
		}, {
			name: 'j',
			type: 'int'
		}, {
			name: 'amt',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketRequestChunk]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'id',
			type: 'string'
		}, {
			name: 'lastSeen',
			type: ['null', 'long']
		}, {
			name: 'hash',
			type: ['null', 'string']
		}, {
			name: 'forceRefresh',
			type: 'string'
		}, {
			name: 'renderStatus',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketPickupItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'itemEId',
			type: 'string'
		}, {
			name: 'itemAmt',
			type: 'int'
		}, {
			name: 'sendInfo',
			type: 'boolean'
		}]
	}),
	[PACKETS.CPacketRedeemAward]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.CPacketJoinDiscord]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'cookie',
			type: 'string'
		}, {
			name: 'value',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketSelectSlot]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.CPacketFireBullet]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'origin',
			type: DoubleArray
		}, {
			name: 'shots',
			type: {
				type: 'array',
				items: {
					name: 'singleShotInfo',
					type: 'record',
					fields: [{
						name: 'entityId',
						type: ['null', 'string']
					}, {
						name: 'dir',
						type: FloatArray
					}, {
						name: 'dist',
						type: 'double'
					}, {
						name: 'bodyPartHit',
						type: ['null', 'string']
					}]
				}
			}
		}]
	}),
	[PACKETS.CPacketCraftItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'itemName',
			type: 'string'
		}, {
			name: 'craftingIdx',
			type: 'int'
		}, {
			name: 'craftTimes',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketBreakBlock]: Type.forSchema({
		...IntArray
	}),
	[PACKETS.CPacketUseItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'targetPos',
			type: ['null', IntArray]
		}, {
			name: 'targetEId',
			type: ['null', 'string']
		}, {
			name: 'dirFacing',
			type: FloatArray
		}, {
			name: 'heldId',
			type: 'int'
		}, {
			name: 'complete',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketUseBoat]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}]
	}),
	[PACKETS.CPacketFillBucket]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'toBlock',
			type: ['int']
		}, {
			name: 'toSlot',
			type: ['null', 'int']
		}]
	}),
	[PACKETS.CPacketUseBucket]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}]
	}),
	[PACKETS.CPacketAttackEntity]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'eId',
			type: 'string'
		}, {
			name: 'bodyPart',
			type: ['null', 'string']
		}, {
			name: 'dirFacing',
			type: FloatArray
		}, {
			name: 'heldName',
			type: ['null', 'string']
		}, {
			name: 'v',
			type: 'int'
		}, {
			name: 'tickCounter',
			type: 'int'
		}, {
			name: 'clientClickCounter',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketClickDetectionDown]: Type.forSchema({
		type: 'double'
	}),
	[PACKETS.CPacketSwingItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'type',
			type: 'int'
		}, {
			name: 'doubleClick',
			type: 'boolean'
		}, {
			name: 'targetPos',
			type: ['null', IntArray]
		}, {
			name: 'targetBlock',
			type: ['null', 'int']
		}]
	}),
	[PACKETS.CPacketClickDetectionUp]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.CPacketResponseDetection]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'id',
			type: 'int'
		}, {
			name: 'response',
			type: 'boolean'
		}, {
			name: 'duration',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketUpdateSignLines]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'newText',
			type: 'string'
		}, {
			name: 'textSize',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketWriteBook]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pages',
			type: StringArray
		}, {
			name: 'title',
			type: 'string'
		}, {
			name: 'hasPublished',
			type: 'boolean'
		}]
	}),
	[PACKETS.CPacketUpdateSign]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'newText',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketGravityDetection]: Type.forSchema({
		type: 'double'
	}),
	[PACKETS.CPacketBaseEventDetection]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.CPacketAcceptTeleport]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'id',
			type: 'int'
		}, {
			name: 'type',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketReloadGun]: Type.forSchema({
		type: 'boolean'
	}),
	[PACKETS.CPacketFinishUse]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'used',
			type: 'boolean'
		}, {
			name: 'duration',
			type: 'long'
		}]
	}),
	[PACKETS.CPacketKeepAliveDetection]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'a',
			type: 'string'
		}, {
			name: 'b',
			type: 'string'
		}, {
			name: 'c',
			type: 'string'
		}, {
			name: 'd',
			type: ['null', 'double']
		}, {
			name: 'e',
			type: ['null', 'double']
		}, {
			name: 'f',
			type: ['null', 'double']
		}, {
			name: 'g',
			type: ['null', 'double']
		}, {
			name: 'h',
			type: ['null', 'double']
		}, {
			name: 'i',
			type: ['null', 'double']
		}, {
			name: 'j',
			type: ['null', 'double']
		}, {
			name: 'k',
			type: ['null', 'double']
		}, {
			name: 'l',
			type: ['null', 'double']
		}, {
			name: 'm',
			type: ['null', 'double']
		}, {
			name: 'n',
			type: ['null', 'double']
		}]
	}),
	[PACKETS.CPacketRemoveItem2]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'idx',
			type: 'int'
		}, {
			name: 'id',
			type: 'int'
		}, {
			name: 'amount',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketReportPlayer]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'player',
			type: 'string'
		}, {
			name: 'msg',
			type: ['null', 'string']
		}, {
			name: 'policy',
			type: 'string'
		}, {
			name: 'details',
			type: ['null', 'string']
		}]
	}),
	[PACKETS.CPacketIgnorePlayer]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'player',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketFillBowl]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'toBlock',
			type: 'int'
		}, {
			name: 'toSlot',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketMilkEntity]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'targetEId',
			type: 'string'
		}, {
			name: 'toSlot',
			type: ['null', 'int']
		}]
	}),
	[PACKETS.CPacketDiscordReport]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.CPacketBreakEntity]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'eId',
			type: 'string'
		}, {
			name: 'dirFacing',
			type: FloatArray
		}, {
			name: 'heldName',
			type: ['null', 'string']
		}]
	}),
	[PACKETS.CPacketHookDetection]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.CPacketSteerVehicle]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'drifting',
			type: 'boolean'
		}, {
			name: 'driftDir',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketCollideEntity]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'eId',
			type: 'string'
		}, {
			name: 'otherEId',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketUseBlockItem]: Type.forSchema({
		name: 'floorCreator',
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'block',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketApplyForce]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'predictionEId',
			type: 'string'
		}, {
			name: 'entityType',
			type: 'string'
		}, {
			name: 'itemSlot',
			type: 'int'
		}, {
			name: 'dirFacing',
			type: FloatArray
		}]
	}),
	[PACKETS.CPacketRPGHit]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'predictionEId',
			type: 'string'
		}, {
			name: 'pos',
			type: FloatArray
		}, {
			name: 'force',
			type: FloatArray
		}]
	}),
	[PACKETS.CPacketUpdatePos]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'predictionEId',
			type: 'string'
		}]
	}),
	[PACKETS.CPacketAnalytics]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'fps',
			type: 'double'
		}, {
			name: 'initialFps',
			type: 'double'
		}]
	}),
	[PACKETS.CPacketOpenCodeBlock]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'blockId',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketEnchantItem]: Type.forSchema({
		type: "record",
		fields: [{
			name: 'enchantItemHeldIdx',
			type: 'int'
		}, {
			name: 'enchantItemTablePos',
			type: IntArray
		}, {
			name: 'enchantItemLevel',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketSalvageItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'salvageItemHeldIdx',
			type: 'int'
		}, {
			name: 'salvageItemAmount',
			type: 'int'
		}]
	}),
	[PACKETS.CPacketRest]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'chosenRestedEffect',
			type: ['null', 'string']
		}]
	})
};

PACKETS.ServerBuffer = {
	[PACKETS.SPacketPlayerTeleport]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'id',
			type: 'int'
		}, {
			name: 'x',
			type: 'double'
		}, {
			name: 'y',
			type: 'double'
		}, {
			name: 'z',
			type: 'double'
		}]
	}),
	[PACKETS.SPacketJoinGame]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'eId',
			type: 'string'
		}, {
			name: 'pass',
			type: {
				type: 'array',
				items: 'int'
			}
		}]
	}),
	[PACKETS.SPacketBlockUpdate]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.SPacketBlockUpdate2]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.SPacketBlockUpdate3]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.SPacketBlockUpdate4]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.SPacketBlockUpdate5]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.SPacketBlockUpdate7]: Type.forSchema({
		...IntArray
	}),
	[PACKETS.SPacketBlockUpdate8]: Type.forSchema({
		...IntArray
	}),
	[PACKETS.SPacketBlockUpdate10]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'id',
			type: 'int'
		}, {
			name: 'disable',
			type: 'boolean'
		}]
	}),
	[PACKETS.SPacketBlockUpdate11]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'rect',
			type: IntArray
		}, {
			name: 'updateType',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketOpenShop]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'toggle',
			type: 'boolean'
		}, {
			name: 'forceCategory',
			type: ['null', 'string']
		}]
	}),
	[PACKETS.SPacketSetBlock3]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketSyncInventory]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'iOpsData',
			type: {
				type: 'record',
				fields: [{
					name: 'playerInven',
					type: 'string'
				}, {
					name: 'openChest',
					type: ['null', 'string']
				}]
			}
		}, {
			name: 'isErr',
			type: 'boolean'
		}]
	}),
	[PACKETS.SPacketSetMultiBlock]: Type.forSchema({
		type: 'array',
		items: IntArray
	}),
	[PACKETS.SPacketSelectSlot]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketBulletFire]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'whoShot',
			type: 'string'
		}, {
			name: 'la',
			type: {
				type: 'array',
				items: FloatArray
			}
		}]
	}),
	[PACKETS.SPacketBulletHit]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'gunId',
			type: 'int'
		}, {
			name: 'whoShotEId',
			type: 'string'
		}, {
			name: 'direction',
			type: 'float'
		}]
	}),
	[PACKETS.SPacketReloadGun]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'eId',
			type: 'string'
		}, {
			name: 'numBullets',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketWorldSeed]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'useWorldGen',
			type: 'boolean'
		}, {
			name: 'worldGenSeed',
			type: ['null', 'string']
		}]
	}),
	[PACKETS.SPacketChunkData]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'id',
			type: 'string'
		}, {
			name: 'cancelled',
			type: ['null', 'boolean']
		}, {
			name: 'RLEArr',
			type: ['null', 'bytes']
		}, {
			name: 'sharedBlockData',
			type: ['null', 'bytes']
		}]
	}),
	[PACKETS.SPacketSetBlock]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'newId',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketRegisterCustomItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'eId',
			type: 'string'
		}, {
			name: 'id',
			type: 'int'
		}, {
			name: 'amount',
			type: 'int'
		}, {
			name: 'attributes',
			type: 'string'
		}, {
			name: 'x',
			type: 'double'
		}, {
			name: 'y',
			type: 'double'
		}, {
			name: 'z',
			type: 'double'
		}, {
			name: 'cantPickUp',
			type: 'boolean'
		}]
	}),
	[PACKETS.SPacketRemoveChunk]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.SPacketUpdateDoor]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'initiatorEId',
			type: 'string'
		}, {
			name: 'rootPos',
			type: IntArray
		}]
	}),
	[PACKETS.SPacketUpdateChest]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'open',
			type: 'boolean'
		}, {
			name: 'contents',
			type: ['null', 'string']
		}, {
			name: 'chestType',
			type: 'string'
		}, {
			name: 'key1',
			type: ['null', IntArray]
		},
		{
			name: 'key2',
			type: ['null', IntArray]
		}]
	}),
	[PACKETS.SPacketEntityDamage]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'eId',
			type: 'string'
		}, {
			name: 'yourAttack',
			type: 'boolean'
		}, {
			name: 'kbParticles',
			type: 'boolean'
		}, {
			name: 'critParticles',
			type: 'boolean'
		}, {
			name: 'damageAmount',
			type: 'int'
		}, {
			name: 'damageAngle',
			type: ['null', 'float']
		}, {
			name: 'healthFrac',
			type: ['null', 'double']
		}]
	}),
	[PACKETS.SPacketEquipArmor]: Type.forSchema({
		type: 'array',
		items: {
			type: 'record',
			fields: [{
				name: 'eId',
				type: 'string'
			}, {
				name: 'part',
				type: 'string'
			}, {
				name: 'selected',
				type: {
					type: 'record',
					fields: [{
						name: 'itemName',
						type: ['null', 'string']
					}, {
						name: 'enchantmentTier',
						type: ['null', 'string']
					}]
				}
			}]
		}
	}),
	[PACKETS.SPacketKick]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.SPacketEntityVelocityPlayer]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'attackerId',
			type: 'string'
		}, {
			name: 'damageAmount',
			type: 'double'
		}, {
			name: 'sprinted',
			type: 'boolean'
		}, {
			name: 'dir',
			type: FloatArray
		}, {
			name: 'horizKbScalar',
			type: 'float'
		}, {
			name: 'vertKbScalar',
			type: 'float'
		}, {
			name: 'redVert',
			type: 'boolean'
		}]
	}),
	[PACKETS.SPacketRemoveItem]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'name',
			type: 'string'
		}, {
			name: 'amt',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketSetPickupTrue]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.SPacketSetPickupFalse]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.SPacketViewAngles]: Type.forSchema({
		...FloatArray
	}),
	[PACKETS.SPacketBlockUpdate6]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.SPacketBlockUpdate9]: Type.forSchema({
		...IntArray
	}),
	[PACKETS.SPacketQueueNext]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'toGame',
			type: ['null', 'string']
		}, {
			name: 'lobbyName',
			type: ['null', 'string']
		}]
	}),
	[PACKETS.SPacketCloseRequest]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUpdateEffect]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'lifeformId',
			type: 'string'
		}, {
			name: 'name',
			type: 'string'
		}, {
			name: 'displayName',
			default: null,
			type: ['null', 'string', TranslationEntry]
		}, {
			name: 'icon',
			type: 'string'
		}, {
			name: 'duration',
			type: ['null', 'double']
		}, {
			name: 'level',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketRemoveEffect]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'lifeformId',
			type: 'string'
		}, {
			name: 'name',
			type: 'string'
		}, {
			name: 'displayName',
			default: null,
			type: ['null', 'string', TranslationEntry]
		}]
	}),
	[PACKETS.SPacketUpdateSpeed]: Type.forSchema({
		type: 'float'
	}),
	[PACKETS.SPacketUpdateJump]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketPlaySound]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'namePrefix',
			type: 'string'
		}, {
			name: 'volume',
			type: 'float'
		}, {
			name: 'rate',
			type: 'float'
		}, {
			name: 'posSettings',
			type: ['null', {
				type: 'record',
				fields: [{
					name: 'playerIdOrPos',
					type: ['string', DoubleArray]
				}, {
					name: 'maxHearDist',
					type: 'float'
				}, {
					name: 'refDistance',
					type: 'float'
				}]
			}]
		}]
	}),
	[PACKETS.SPacketEntityVelocity]: Type.forSchema({
		...FloatArray
	}),
	[PACKETS.SPacketResyncVelocity]: Type.forSchema({
		...FloatArray
	}),
	[PACKETS.SPacketLogError]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.SPacketUpdateBookshelf]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'bookCount',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketUpdateMailbox]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'pos',
			type: IntArray
		}, {
			name: 'mailCount',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketParticles]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'texture',
			type: 'string'
		}, {
			name: 'minLifeTime',
			type: 'float'
		}, {
			name: 'maxLifeTime',
			type: 'float'
		}, {
			name: 'minEmitPower',
			type: 'float'
		}, {
			name: 'maxEmitPower',
			type: 'float'
		}, {
			name: 'minSize',
			type: 'float'
		}, {
			name: 'maxSize',
			type: 'float'
		}, {
			name: 'gravity',
			type: FloatArray
		}, {
			name: 'velocityGradients',
			type: {
				type: 'array',
				items: {
					type: 'record',
					fields: [{
						name: 'timeFraction',
						type: 'float'
					}, {
						name: 'factor',
						type: 'float'
					}, {
						name: 'factor2',
						type: 'float'
					}]
				}
			}
		}, {
			name: 'colorGradients',
			type: [{
				type: 'array',
				items: {
					type: 'record',
					fields: [{
						name: 'timeFraction',
						default: null,
						type: ['null', 'float']
					}, {
						name: 'minColor',
						default: null,
						type: ['null', FloatArray]
					}, {
						name: 'maxColor',
						default: null,
						type: ['null', FloatArray]
					}, {
						name: 'color',
						default: null,
						type: ['null', FloatArray]
					}]
				}
			}]
		}, {
			name: 'blendMode',
			type: 'int'
		}, {
			name: 'dir1',
			type: FloatArray
		}, {
			name: 'dir2',
			type: FloatArray
		}, {
			name: 'pos1',
			type: FloatArray
		}, {
			name: 'pos2',
			type: FloatArray
		}, {
			name: 'manualEmitCount',
			type: 'int'
		}, {
			name: 'hideDist',
			default: null,
			type: ['null', 'float']
		}]
	}),
	[PACKETS.SPacketDiscordKey]: Type.forSchema({
		type: 'string'
	}),
	[PACKETS.SPacketEffectMultiplier]: Type.forSchema({
		type: 'float'
	}),
	[PACKETS.SPacketPlayerTeleport2]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'type',
			type: 'int'
		}, {
			name: 'tier',
			type: ['int', 'null']
		}]
	}),
	[PACKETS.SPacketUpdateMesh]: Type.forSchema({
		type: 'array',
		items: {
			type: 'record',
			fields: [{
				name: 'eId',
				type: 'string'
			}, {
				name: 'node',
				type: 'string'
			}, {
				name: 'meshType',
				type: ['string', 'null']
			}, {
				name: 'offset',
				type: [FloatArray, 'null']
			}, {
				name: 'rotation',
				type: [FloatArray, 'null']
			}]
		}
	}),
	[PACKETS.SPacketEntityPose]: Type.forSchema({
		type: 'string'
	}),
	/*[PACKETS.SPacketFlyingMessage]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'content',
			type: ChatEntry
		}, {
			name: 'distanceFromAction',
			type: 'float'
		}]
	}),*/
	[PACKETS.SPacketHitVehicle]: Type.forSchema({
		type: 'record',
		fields: [{
			name: 'dir',
			type: 'int'
		}, {
			name: 'durationInTicks',
			type: 'int'
		}]
	}),
	[PACKETS.SPacketFOV]: Type.forSchema({
		type: 'int'
	}),
	[PACKETS.SPacketUnknown15]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUnknown4]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUnknown6]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUnknown26]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUnknown37]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUnknown16]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUnknown40]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketKillfeed]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketPoll]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketSetBlockData]: {
		fromBuffer(buf) { return buf; }
	},
	[PACKETS.SPacketUpdateCrafting]: {
		fromBuffer(buf) { return buf; }
	},
};

module.exports = PACKETS;