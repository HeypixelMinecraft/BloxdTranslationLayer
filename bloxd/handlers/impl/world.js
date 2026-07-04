const { ITEMID, IDITEM, USABLE, CONSUMABLE, BREAKTIMES, PLACESOUNDS } = require('./../../types/items.js');
const { findBlockIdFromName } = require('../../utils.js');
const { WORLD_KEY } = require('../../types/anticheat_constants.js');
const Handler = require('./../handler.js');
const Chunk = require('prismarine-chunk')('1.8.9');
const Vec3 = require('vec3');
const ndarray = require('ndarray');
const pako = require('pako');
const viewDistance = 3, CELL_VOLUME = 32 * 32 * 32, DIRECTIONS = {
	0: [0, -1, 0],
	1: [0, 1, 0],
	2: [0, 0, -1],
	3: [0, 0, 1],
	4: [-1, 0, 0],
	5: [1, 0, 0]
};
let client, bloxDClient, entity, gui, misc;

let lightData = new Chunk();
for (let x = 0; x < 16; x++) {
	for (let z = 0; z < 16; z++) {
		for (let skyY = 0; skyY < 256; skyY++) {
			lightData.setSkyLight(new Vec3(x, skyY, z), 15);
		}
	}
}
lightData = lightData.dump();

/**
 * Returns unpacked chunk data from a Uint8Array.
 * @param {Uint8Array} data - Received chunk data
 * @param {Uint16Array} dest - Unpacked chunk data
*/
function decodeChunk(data, dest) {
	for (var a, Q, Y, z, B = dest.length, d = data.length, S = 0, G = 0; G < d; ) {
		for (a = 0, Q = 0; G < d && data[G] >= 128; )
			a += (127 & data[G++]) << Q,
			Q += 7;
		if (a += data[G++] << Q,
		G >= d)
			throw new Error('RLE buffer underrun');
		if (S + a > B)
			throw new Error('Chunk buffer overflow');
		for (Y = 0,
		Q = 0; G < d && data[G] >= 128; )
			Y += (127 & data[G++]) << Q,
			Q += 7;
		if (G >= d)
			throw new Error('RLE buffer underrun');
		for (Y += data[G++] << Q,
		z = 0; z < a; ++z)
			dest[S++] = Y
	}
}

class BloxdChunk {
	constructor(x, z) {
		this.x = x * 2;
		this.z = z * 2;
		this.loaded = [];
		this.requested = [];
		this.isLoaded = false;
		this.loadTime = 0;
		this.chunks = [new Chunk(), new Chunk(), new Chunk(), new Chunk()];
		this.extra = [];
		this.chunks.forEach(chunk => chunk.load(lightData));
	}
	update(cY, data) {
		if (!this.loaded.includes(cY)) {
			this.loaded.push(cY);
			const newData = new ndarray(new Uint16Array(CELL_VOLUME), [32, 32, 32]);
			decodeChunk(new Uint8Array(data.RLEArr), newData.data);

			for (let x = 0; x < 32; x++) {
				for (let y = 0; y < 32; y++) {
					for (let z = 0; z < 32; z++) {
						const chunk = this.chunks[(x > 15 ? 2 : 0) + (z > 15 ? 1 : 0)];
						const blockdata = ITEMID[newData.get(x, y, z)] ?? 1, vec = new Vec3(x % 16, (cY % 255) + y, z % 16);

						if (typeof blockdata == 'number') {
							chunk.setBlockType(vec, blockdata);
						} else {
							chunk.setBlockType(vec, blockdata[0]);
							chunk.setBlockData(vec, blockdata[1]);
						}
					}
				}
			}

			if (data.sharedBlockData) {
				this.extra.push([cY % 255, JSON.parse(pako.inflate(data.sharedBlockData, {to: 'string'}))]);
			}

			if (this.loaded.length >= 3) {
				if (this.isLoaded) {
					this.delete();
				}
				this.write();
			}
		}
	}
	write() {
		if (!this.isLoaded && this.chunks.length > 0 && client != undefined) {
			this.chunks.forEach((chunk, ind) => {
				client.write('map_chunk', {
					x: this.x + (ind > 1 ? 1 : 0),
					z: this.z + ind % 2,
					groundUp: true,
					bitMap: chunk.getMask(),
					chunkData: chunk.dump()
				});
			});
			this.loadTime = Date.now() + 150;
			this.isLoaded = true;

			for (const entry of this.extra) {
				for (const line of entry[1]) {
					this.world.setBlockData({
						x: this.x * 16 + line.pos[0],
						y: entry[0] + line.pos[1],
						z: this.z * 16 + line.pos[2]
					}, line.data);
				}
			}
		}
	}
	delete(clear) {
		this.isLoaded = false;
		entity.checkAll();
		this.chunks.forEach((_, ind) => {
			client.write('map_chunk', {
				x: this.x + (ind > 1 ? 1 : 0),
				z: this.z + ind % 2,
				groundUp: true,
				bitMap: 0,
				chunkData: []
			});
		});
		if (clear) this.chunks = [];
	}
}

const self = class WorldHandler extends Handler {
	getAction() {
		return this.actionId++ == 4 ? (this.actionId = 0, 'es') : '';
	}
	getUseAction() {
		return this.useActionId++ == 3 ? (this.useActionId = 0, 'd') : '0'
	}
	getUseId(id) {
		id <<= 3;
		return this.useId++ == 4 ? (this.useId = 0, id |= 4) : (id |= 5), id;
	}
	isLoaded(x, z, ignore) {
		const chunk = this.chunks[[Math.floor(x / 32), Math.floor(z / 32)].join()];
		return chunk ? (ignore || chunk.isLoaded && chunk.loadTime < Date.now() ? chunk : false) : false;
	}
	isEntityLoaded(entity) {
		return this.isLoaded((entity.pos.x / 32), (entity.pos.z / 32));
	}
	getBlock(pos) {
		let chunk = this.isLoaded(pos[0], pos[2], true);
		if (!chunk) return;
		const relative = [pos[0] - (Math.floor(pos[0] / 32) * 32), pos[2] - (Math.floor(pos[2] / 32) * 32)];
		chunk = chunk.chunks[(relative[0] > 15 ? 2 : 0) + (relative[1] > 15 ? 1 : 0)];

		return chunk.getBlockType(new Vec3(relative[0] % 16, (pos[1] + entity.chunkOffset) % 255, relative[1] % 16));
	}
	setBlock(pos, id, noWrite) {
		let chunk = this.isLoaded(pos[0], pos[2], true);
		if (!chunk) return;
		const relative = [pos[0] - (Math.floor(pos[0] / 32) * 32), pos[2] - (Math.floor(pos[2] / 32) * 32)];
		const blockdata = ITEMID[id] ?? 1, vec = new Vec3(relative[0] % 16, (pos[1] + entity.chunkOffset) % 255, relative[1] % 16);
		chunk = chunk.chunks[(relative[0] > 15 ? 2 : 0) + (relative[1] > 15 ? 1 : 0)];

		if (typeof blockdata == 'number') {
			chunk.setBlockType(vec, blockdata);
		} else {
			chunk.setBlockType(vec, blockdata[0]);
			chunk.setBlockData(vec, blockdata[1]);
		}

		if (noWrite) return;
		client.write('block_change', {
			location: {
				x: pos[0],
				y: (pos[1] + entity.chunkOffset) % 255,
				z: pos[2]
			},
			type: (typeof blockdata == 'number' ? blockdata : blockdata[0]) << 4 | (typeof blockdata == 'number' ? 0 : blockdata[1])
		});
	}
	setBlockData(pos, data) {
		if (!this.isLoaded(pos.x, pos.z, true)) return;
		if (data.persisted.shared.text != undefined) {
			const split = data.persisted.shared.text.split('\n');
			client.write('update_sign', {
				location: pos,
				text1: JSON.stringify({text: split[0] ? split[0].substring(0, 15) : ''}),
				text2: JSON.stringify({text: split[1] ? split[1].substring(0, 15) : ''}),
				text3: JSON.stringify({text: split[2] ? split[2].substring(0, 15) : ''}),
				text4: JSON.stringify({text: split[3] ? split[3].substring(0, 15) : ''})
			});
		}
	}
	breakBlock(blockPos, sendBreak) {
		this.breaking = false;
		if (this.customBreak != undefined) {
			this.customBreak = undefined;
			client.write('remove_entity_effect', {
				entityId: entity.local.mcId,
				effectId: 4
			});
		}

		if (sendBreak) {
			this.setBlock(blockPos, 0);
			bloxDClient.send('CPacketModifyBlock', {
				changePos: blockPos,
				toBlock: 0,
				checker: this.getAction()
			});
		}
	}
	update(pos) {
		const x = Math.floor(pos.x / 32), y = Math.floor(pos.y / 32), z = Math.floor(pos.z / 32);
		const positions = [];
		const currentlyLoaded = [];

		if (this.consumeTime != undefined && (Date.now() - this.useTime) > this.consumeTime) {
			bloxDClient.send('CPacketFinishUse', {
				used: true,
				duration: Date.now() - this.useTime
			});

			client.write('entity_status', {
				entityId: entity.local.mcId,
				entityStatus: 9
			});
			client.write('update_health', entity.local.health);
			misc.playSound('random.burp', 0.5, Math.random() * 0.1 + 0.9);

			this.consumeTime = undefined;
		}

		if (this.customBreak != undefined) {
			client.write('block_break_animation', {
				entityId: 0,
				location: {x: this.breakPos[0], y: this.breakPos[1] + entity.chunkOffset, z: this.breakPos[2]},
				destroyStage: Math.floor(10 * ((Date.now() - this.breakTime) / this.customBreak))
			});

			if ((Date.now() - this.breakTime) > this.customBreak) {
				this.breakBlock(this.breakPos, true);
			}
		}

		for (let checkX = -viewDistance; checkX < viewDistance; checkX++) {
			for (let checkZ = -viewDistance; checkZ < viewDistance; checkZ++) {
				const pos = [x + checkX, z + checkZ];
				currentlyLoaded.push(pos.join());
				positions.push(pos);
			}
		}

		positions.sort((a, b) => {
			const aDist = Math.sqrt((a[0] - x) * (a[0] - x) + (a[1] - z) * (a[1] - z));
			const bDist = Math.sqrt((b[0] - x) * (b[0] - x) + (b[1] - z) * (b[1] - z));
			return bDist - aDist
		});

		for (; positions.length > 0; ) {
			const coords = positions.pop();
			let chunk = this.chunks[coords.join()];

			if (!chunk) {
				this.chunks[coords.join()] = new BloxdChunk(coords[0], coords[1]);
				chunk = this.chunks[coords.join()];
				chunk.world = this;
			}

			for (const id of Object.values(chunk.requested)) {
				const checkId = id - (y * 32);
				if (Math.min(Math.max(checkId, -128), 128) != checkId) {
					chunk.requested.splice(chunk.requested.indexOf(id), 1);
				}
			}

			for (let i = -2; i <= 2; i++) {
				const checkId = (y + i) * 32;
				if (!chunk.requested.includes(checkId)) {
					const id = `${coords[0]}|${y + i}|${coords[1]}|overworld`;
					chunk.requested.push(checkId);
					bloxDClient.send('CPacketRequestChunk', {
						id: id,
						lastSeen: null,
						hash: null,
						forceRefresh: WORLD_KEY,
						renderStatus: 0
					});
				}
			}
		}

		for (const [ind, chunk] of Object.entries(this.chunks)) {
			if (!currentlyLoaded.includes(ind)) {
				chunk.delete(true);
				delete this.chunks[ind];
			}
		}
	}
	rightClick(pos, ent, chest) {
		if (entity.rightClick == undefined) {
			entity.rightClick = [pos, chest];
			bloxDClient.send('CPacketUseItem', {
				targetPos: pos,
				targetEId: ent,
				dirFacing: entity.local.facing,
				heldId: this.getUseId(IDITEM.indexOf(gui.inventory[gui.slot].name)),
				complete: this.getUseAction()
			});
		};
	}
	bloxd(bClient) {
		bloxDClient = bClient;

		bClient.on('SPacketChunkData', (data) => {
			const split = data.id.split('|');
			const chunk = this.chunks[[Number.parseInt(split[0]), Number.parseFloat(split[2])].join()];
			const cY = Number.parseInt(split[1]) * 32;

			if (chunk) {
				if (!data.cancelled) {
					this.seen[data.id] = Date.now();
					chunk.update(cY + entity.chunkOffset, data);
				} else if (chunk.requested.includes(cY)) {
					chunk.requested.splice(chunk.requested.indexOf(cY), 1);
				}
			}
		});

		bClient.on('SPacketSetBlock', (data) => this.setBlock(data.pos, data.newId));
		bClient.on('SPacketSetBlockData', (data) => this.setBlockData({
			x: data.pos[0],
			y: (data.pos[1] + entity.chunkOffset) % 255,
			z: data.pos[2]
		}, data.data));
		bClient.on('SPacketSetMultiBlock', (data) => {
			for (const block of data) {
				if (4 === block.length) {
					this.setBlock(block, block[3]);
				} else {
					const [L, a, Q, Y, z, d, S] = block;
					for (let x = L; x < a + 1; x++) {
						for (let L = Q; L < Y + 1; L++) {
							for (let a = z; a < d + 1; a++) {
								this.setBlock([x, L, a], S);
							}
						}
					}
				}
			}
		});

		bClient.on('SPacketSetBlock2', (data) => console.log('setblock2', data));
		bClient.on('SPacketSetBlock3', (data) => data.forEach((block) => this.setBlock(block.pos, block.actualId)));
		bClient.on('SPacketPlaySound', (data) => {
			let pos;
			if (data.posSettings) {
				if (typeof data.posSettings.playerIdOrPos == 'string') {
					if (data.posSettings.playerIdOrPos != entity.local.id) {
						const entity = this.entities[eId];
						if (entity) {
							pos = [entity.pos.x / 32, entity.pos.y / 32, entity.pos.z / 32];
						}
					}
				} else {
					pos = data.posSettings.playerIdOrPos;
				}
			}

			switch (data.namePrefix) {
				case 'bow':
					misc.playSound('random.bow', 1, 1.2, pos);
					break;
				case 'pickUp':
					misc.playSound('random.pop', 0.2, ((Math.random() - Math.random()) * 0.7 + 1) * 2, pos);
					break;
				case 'cannonFire':
					misc.playSound('random.explode', 2, 0.5 + Math.random() * 0.2, pos);
				case 'cloth':
				case 'stone':
				case 'wood':
					misc.playSound('dig.' + data.namePrefix, 1, 0.7936508, pos);
					break;
			}
		});
	}
	minecraft(mcClient) {
		client = mcClient;
		client.on('block_place', packet => {
			packet.location.y += (entity.local.yOffset - entity.chunkOffset);
			const blockId = findBlockIdFromName(gui.getHeldName());
			const dir = DIRECTIONS[packet.direction];
			const pos = dir ? [
				packet.location.x + dir[0],
				packet.location.y + dir[1],
				packet.location.z + dir[2]
			] : Object.values(packet.location);

			if (blockId != undefined) {
				if (dir) {
					const item = gui.inventory[gui.slot];

					if (item) {
						item.amount -= 1;
						if (item.amount <= 0) {
							gui.inventory[gui.slot] = {name: 'Air'};
						}

						gui.replicateItem(gui.slot);
					}

					this.setBlock(pos, blockId, true);
					misc.playSound(PLACESOUNDS[item.name] ?? 'dig.stone', 1, 0.7936508, [pos[0] + 0.5, pos[1] + 0.5, pos[2] + 0.5]);
					bloxDClient.send('CPacketModifyBlock', {
						changePos: pos,
						toBlock: blockId,
						checker: this.getAction()
					});
				}
			} else {
				const blockPos = Object.values(packet.location);
				const targetBlock = packet.direction != -1 ? this.getBlock(blockPos) : 0;
				const item = gui.inventory[gui.slot];
				this.rightClick(packet.direction != -1 ? blockPos : null, null, targetBlock == 68);

				if (packet.direction != -1) {
					if (item.name == 'Boat') {
						bloxDClient.send('CPacketUseBoat', {
							pos: pos
						});
					} else if (item.name == 'Bucket') {
						bloxDClient.send('CPacketFillBucket', {
							pos: pos,
							toBlock: 0,
							toSlot: gui.slot
						});
					} else if (item.name.includes('Bucket')) {
						item.name = 'Bucket';
						bloxDClient.send('CPacketUseBucket', {
							pos: pos
						});
					} else if (targetBlock == 116) {
						bloxDClient.send('CPacketEnchantItem', {
							enchantItemHeldIdx: gui.slot,
							enchantItemLevel: 78,
							enchantItemTablePos: blockPos
						});
					}
				}

				if (USABLE[item.name] && packet.direction == -1) {
					this.useTime = Date.now();
					this.consumeTime = CONSUMABLE[item.name];
					bloxDClient.send('CPacketStartUse');
				}
			}
		});
		client.on('block_dig', packet => {
			packet.location.y += (entity.local.yOffset - entity.chunkOffset);
			const blockPos = Object.values(packet.location);
			switch (packet.status) {
				case 0:
					this.breaking = true;
					const breakTime = BREAKTIMES[this.getBlock(blockPos)];
					if (breakTime != undefined) {
						this.customBreak = breakTime;
						this.breakTime = Date.now();
						this.breakPos = blockPos;
						client.write('entity_effect', {
							entityId: entity.local.mcId,
							effectId: 4,
							amplifier: -1,
							duration: 32767,
							hideParticles: false
						});
					}

					bloxDClient.send('CPacketSwingItem', {
						type: 2,
						doubleClick: false,
						targetPos: blockPos,
						targetBlock: 5
					});
					bloxDClient.send('CPacketBreakBlock', blockPos);
					break;
				case 1:
				case 2:
					this.breakBlock(blockPos, packet.status == 2);
					break;
				case 3:
				case 4:
					gui.dropItem(gui.slot, packet.status == 3, true);
					break;
				case 5:
					const item = gui.inventory[gui.slot];
					this.consumeTime = undefined;
					if (USABLE[item.name]) {
						bloxDClient.send('CPacketFinishUse', {
							used: true,
							duration: Date.now() - this.useTime
						});
					}
					break;
			}
		});
	}
	cleanup(requeue) {
		client = requeue ? client : undefined;
		if (this.chunks && client) {
			for (const chunk of Object.values(this.chunks)) {
				chunk.delete(true);
			}
		}
		this.chunks = {};
		this.queued = [];
		this.seen = {};
		this.breaking = false;
		this.actionId = 0;
		this.useId = 0;
		this.useActionId = 0;
		this.useTime = Date.now();
		this.consumeTime = undefined;
		this.customBreak = undefined;
	}
	obtainHandlers(handlers) {
		entity = handlers.entity;
		gui = handlers.gui;
		misc = handlers.misc;
	}
};

module.exports = new self();