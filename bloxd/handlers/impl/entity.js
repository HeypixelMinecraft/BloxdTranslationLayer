const { settings, saveSettings, genString } = require('../../types/browser_info.js');
const { ENTITIES } = require('../../types/entities.js');
const { EFFECTS } = require('../../types/effects.js');
const { ATTACK_KEY } = require('../../types/anticheat_constants.js');
const { translateItem } = require('../../utils.js');
const Handler = require('./../handler.js');
const DEG2RAD = Math.PI / 180, RAD2DEG = 180 / Math.PI, RAD360 = Math.PI * 2;
const MOVE = ['x', 'y', 'z'];
const PLAYER_MOVE = [...MOVE, 'heading', 'cameraPitch'];
const PLAYER_ACTION = ['speed', 'crouching'];
const PART_ID = ['', 'Boots', 'Leggings', 'Chestplate', 'Helmet'];
let client, bloxDClient, tablist, world, gui, misc, scoreboard;

/**
 * Converts radians into degrees packed into a short.
 * @param {number} ang - Radian angle
 * @returns {number}
*/
function convertAngle(ang) {
	ang = ((ang * RAD2DEG) * 256 / 360) & 0xFF;
	return ang > 127 ? ang - 256 : ang;
};

/**
 * Returns a 3d vector from yaw and pitch in radians.
 * @param {number} yaw - Yaw
 * @param {number} pitch - Pitch
 * @returns {Float64Array}
*/
function getLookDirection(yaw, pitch) {
	pitch = Math.PI / 2 - pitch;
	return [-Math.sin(pitch) * Math.sin(-yaw), -Math.cos(pitch), Math.sin(pitch) * Math.cos(-yaw)]
};

const self = class EntityHandler extends Handler {
	canSpawn(entity) {
		if (entity.type == -1 && ((!tablist.entries[entity.id] && !entity.special))) return false;
		if (!world.isEntityLoaded(entity)) return false;
		if (!entity.alive || !entity.visible) return false;
		return true;
	}
	spawn(entity) {
		if (!entity || entity.spawned) return;
		if (entity.special) {
			tablist.entries[entity.id] = crypto.randomUUID();
			client.write('player_info', {
				action: 0,
				data: [{
					UUID: tablist.entries[entity.id],
					name: ('BOT ' + entity.name).substring(0, 16),
					properties: [],
					gamemode: 1,
					ping: 0
				}]
			});
		}

		entity.spawned = true;
		if (entity.type == -1) {
			client.write('named_entity_spawn', {
				entityId: entity.id,
				playerUUID: tablist.entries[entity.id] ?? crypto.randomUUID(),
				x: entity.pos.x,
				y: entity.pos.y + (this.chunkOffset * 32),
				z: entity.pos.z,
				yaw: entity.yaw,
				pitch: entity.pitch,
				currentItem: 0,
				metadata: entity.metadata
			});
			client.write('entity_head_rotation', {
				entityId: entity.id,
				headYaw: entity.yaw
			});

			for (const [slot, item] of Object.entries(entity.equipment)) {
				client.write('entity_equipment', {
					entityId: entity.id,
					slot: slot,
					item: item
				});
			}
		} else {
			client.write(ENTITIES[entity.type][1] ? 'spawn_entity_living' : 'spawn_entity', {
				entityId: entity.id,
				type: ENTITIES[entity.type][0],
				x: entity.pos.x,
				y: entity.pos.y + (this.chunkOffset * 32),
				z: entity.pos.z,
				yaw: entity.yaw,
				pitch: entity.pitch,
				objectData: entity.objectData,
				metadata: entity.metadata
			});

			if (!ENTITIES[entity.type][1]) {
				client.write('entity_metadata', {
					entityId: entity.id,
					metadata: entity.metadata
				});
			}
		}

		if (entity.special) {
			client.write('player_info', {
				action: 4,
				data: [{'UUID': tablist.entries[entity.id]}]
			});
		}

		return true;
	}
	remove(entity) {
		if (!entity || !entity.spawned) return;

		entity.spawned = false;
		client.write('entity_destroy', {
			entityIds: [entity.id]
		});
	}
	check(entity) {
		if (!entity) return;
		if (this.canSpawn(entity) != entity.spawned) {
			if (entity.spawned) this.remove(entity);
			else this.spawn(entity);
		}
	}
	actions(move) {
		if (this.teleport != undefined) {
			if (Math.sqrt(Math.pow(this.local.pos.x - this.teleport.x, 2) + Math.pow(this.local.pos.y - this.teleport.y, 2) + Math.pow(this.local.pos.z - this.teleport.z, 2)) < 2) {
				this.teleport = undefined;
			} else {
				return;
			}
		}

		if (bloxDClient.settings.canPickUpItems) {
			for (const ent of Object.values(this.entities)) {
				if (ent.type == 2 && ((ent.pickupTime ?? 0) < Date.now()) && Math.sqrt(Math.pow(this.local.pos.x - (ent.pos.x / 32), 2) + Math.pow(this.local.pos.y - ((ent.pos.y / 32) + this.local.yOffset), 2) + Math.pow(this.local.pos.z - (ent.pos.z / 32), 2)) < 2) {
					if (gui.addItem({id: ent.itemId, amount: ent.amount})) {
						ent.pickup = true;
						ent.pickupTime = Date.now() + 500;
						bloxDClient.send('CPacketPickupItem', {
							itemEId: ent.id,
							itemAmt: ent.amount,
							sendInfo: true
						});
					}
				}
			}
		}

		this.local.facing = getLookDirection(this.local.yaw, this.local.pitch);
		this.rightClick = undefined;

		if (!this.local.spawned) return;
		world.update(this.local.pos);
		bloxDClient.send('CPacketMovePlayer', {
			x: this.local.pos.x,
			y: this.local.pos.y,
			z: this.local.pos.z,
			heading: this.local.yaw,
			speed: move ? (this.local.state[1] ? (bloxDClient.settings.runningSpeed ?? 7) : (bloxDClient.settings.walkingSpeed ?? 4)) : 0,
			jumping: this.local.jump ?? false,
			crouching: this.local.state[2] ?? false,
			pitch: this.local.pitch,
			armSwinging: this.local.state[0] > Date.now(),
			useDir: this.local.facing,
			physicsVersion: 'v2' // This is used to detect hooking window.Error, its v2 on normal clients lol
		});
	}
	abilities(movement) {
		if (this.local.flying == false) return;
		ClientSocket.sendPacket(new SPacketPlayerAbilities({isFlying: false}));
		this.local.flying = false;
	}
	checkAll() {
		Object.values(this.entities).forEach((entity) => this.check(entity));
	}
	convertId(id) {
		return id == this.local.id ? this.local.mcId : id;
	}
	bloxd(bClient, loginData) {
		this.local.id = loginData.eId;
		this.chunkOffset = bClient.gameName.includes('classic') && Number.isSafeInteger(Number.parseInt(bClient.lobbyName)) ? 128 : 0;
		this.chunkOffset = (bClient.gameName == 'parkour' || bClient.gameName == 'rocketParkour') ? 32 : this.chunkOffset;
		this.resyncVelocity([0, 0, 0]);
		bloxDClient = bClient;

		this.swingInterval = setInterval(() => {
			for (const entity of Object.values(this.entities)) {
				this.check(entity);
				if (entity.spawned && entity.swing) {
					client.write('animation', {
						entityId: entity.id,
						animation: 0
					});
				}
			}
		}, 125);

		bClient.room.state.entities.onAdd((ent, eId) => {
			if (client == undefined) return;
			if (ent.type == 'Player' || ent.type.includes('Mesh|Person')) {
				if (ent.type == 'Player') tablist.add(ent, eId);
				if (eId == this.local.id) {
					this.local.ent = ent;
				} else {
					this.entities[eId] = {
						id: eId,
						type: -1,
						special: ent.type != 'Player',
						alive: true,
						visible: true,
						pos: {x: ent.x * 32, y: (ent.y % 255) * 32, z: ent.z * 32},
						yaw: convertAngle(ent.heading * -1),
						pitch: convertAngle(ent.cameraPitch),
						metadata: {
							0: {key: 0, value: 0, type: 0},
							1: {key: 2, value: '', type: 4},
							2: {key: 6, value: 20, type: 3},
							3: {key: 4, value: 0, type: 0},
							4: {key: 8, value: 0, type: 0},
							5: {key: 9, value: 0, type: 0},
							6: {key: 10, value: 127, type: 0},
							7: {key: 1, value: 300, type: 1},
							8: {key: 3, value: 0, type: 0},
							9: {key: 7, value: 0, type: 2},
							10: {key: 16, value: 0, type: 0},
							11: {key: 17, value: 0, type: 3},
							12: {key: 18, value: 0, type: 2}
						},
						equipment: {
							0: translateItem({name: ent.heldItemName ?? 'Air', amount: 1})
						},
						spawned: false,
						name: ent.name
					};

					if (settings.autoNameChange && settings.nameChangeTime < Date.now() && ent.type == 'Player') {
						settings.nameChangeTime = Date.now() + 72e5;
						misc.changeName(ent.name.substring(0, 16) + genString().substring(0, 3), (suc) => {
							if (suc) {
								saveSettings();
							} else {
								settings.nameChangeTime = 0;
							}
						});
					}

					for (const entry of PLAYER_ACTION) {
						ent.listen(entry, () => {
							const entity = this.entities[eId];
							if (!entity) return;
							entity.metadata[0].value = ent.crouching ? (entity.metadata[0].value | 1 << 1) : (entity.metadata[0].value & ~(1 << 1));
							entity.metadata[0].value = ent.speed > 4 ? (entity.metadata[0].value | 1 << 3) : (entity.metadata[0].value & ~(1 << 3));
							if (!entity.spawned) return;
							client.write('entity_metadata', {
								entityId: entity.id,
								metadata: [{key: 0, value: entity.metadata[0].value, type: 0}]
							});
						});
					}

					ent.listen('heldItemName', () => {
						const entity = this.entities[eId];
						if (!entity) return;
						const chargeState = (ent.heldItemName ?? 'Air').includes('charging');
						const item = translateItem({name: ent.heldItemName ?? 'Air', amount: 1, attributes: ent.heldItemEnchantmentTier ? {customAttributes: {enchantments: []}} : undefined});

						if (entity.charging != chargeState) {
							entity.metadata[0].value = entity.charging ? (entity.metadata[0].value | 1 << 4) : (entity.metadata[0].value & ~(1 << 4));
							if (entity.spawned) {
								client.write('entity_metadata', {
									entityId: entity.id,
									metadata: [{key: 0, value: entity.metadata[0].value, type: 0}]
								});
							}
						}

						entity.equipment[0] = item;
						entity.charging = chargeState;
						if (!entity.spawned) return;
						client.write('entity_equipment', {
							entityId: entity.id,
							slot: 0,
							item: item
						});
					});

					ent.listen('armSwinging', () => {
						const entity = this.entities[eId];
						if (!entity) return;
						entity.swing = ent.armSwinging;
						if (entity.spawned && entity.swing) {
							client.write('animation', {
								entityId: entity.id,
								animation: 0
							});
						}
					});
				}
			} else if (ENTITIES[ent.type]) {
				this.entities[eId] = {
					id: eId,
					type: ent.type,
					special: false,
					alive: true,
					visible: true,
					pos: {x: ent.x * 32, y: (ent.y % 255) * 32, z: ent.z * 32},
					yaw: 0,
					pitch: 0,
					metadata: {
						0: {key: 0, value: 0, type: 0}
					},
					objectData: {
						intField: 1,
						velocityX: 0,
						velocityY: 0,
						velocityZ: 0
					},
					spawned: false
				};
			} else {
				//console.log('entity type?', ent.type);
			}

			const entity = this.entities[eId];
			if (entity) {
				for (const entry of PLAYER_MOVE) {
					ent.listen(entry, () => {
						const entity = this.entities[eId];
						if (!entity) return;
						const oldPos = entity.pos;
						entity.pos = {x: ent.x * 32, y: (ent.y % 255) * 32, z: ent.z * 32};
						entity.yaw = convertAngle(ent.heading * -1);
						entity.pitch = convertAngle(ent.cameraPitch);
						if (!entity.spawned) return;
						client.write('entity_teleport', {
							entityId: entity.id,
							x: entity.pos.x,
							y: entity.pos.y + (this.chunkOffset * 32),
							z: entity.pos.z,
							yaw: entity.yaw,
							pitch: entity.pitch,
							onGround: oldPos.y <= entity.pos.y && Math.floor(entity.pos.y) == entity.pos.y
						});

						if (entity.type != -1) {
							client.write('entity_velocity', {
								entityId: entity.id,
								velocityX: Math.max(Math.min(((entity.pos.x - oldPos.x) / 32) * 8000, 32767), -32768),
								velocityY: Math.max(Math.min(((entity.pos.y - oldPos.y) / 32) * 8000, 32767), -32768),
								velocityZ: Math.max(Math.min(((entity.pos.z - oldPos.z) / 32) * 8000 * 8000, 32767), -32768)
							});
						}

						if (entry == 'heading') {
							client.write('entity_head_rotation', {
								entityId: entity.id,
								headYaw: entity.yaw
							});
						}
					});
				}

				this.check(entity);
			}
		});

		bClient.room.state.entities.onRemove((ent, eId) => {
			if (this.entities[eId]) {
				tablist.remove(eId);
				client.write('entity_destroy', {
					entityIds: [eId]
				});
				delete this.entities[eId];
			}
		});

		bClient.room.state.items.onAdd((ent, eId) => {
			this.entities[eId] = {
				id: eId,
				type: 2,
				alive: true,
				visible: true,
				pos: {x: ent.x * 32, y: (ent.y % 255) * 32, z: ent.z * 32},
				yaw: 0,
				pitch: 0,
				itemId: ent.id,
				amount: ent.amount,
				pickupTime: this.dropTime > Date.now() ? Date.now() + 500 : 0,
				metadata: {
					0: {key: 10, value: translateItem(ent), type: 5}
				},
				objectData: {
					intField: 1,
					velocityX: 0,
					velocityY: 0,
					velocityZ: 0
				},
				spawned: false
			};

			for (const entry of MOVE) {
				ent.listen(entry, () => {
					const entity = this.entities[eId];
					if (!entity) return;
					const oldPos = entity.pos;
					entity.pos = {x: ent.x * 32, y: (ent.y % 255) * 32, z: ent.z * 32};
					if (!entity.spawned) return;
					client.write('entity_teleport', {
						entityId: entity.id,
						x: entity.pos.x,
						y: entity.pos.y + (this.chunkOffset * 32),
						z: entity.pos.z,
						yaw: entity.yaw,
						pitch: entity.pitch,
						onGround: false
					});

					client.write('entity_velocity', {
						entityId: entity.id,
						velocityX: Math.max(Math.min(((entity.pos.x - oldPos.x) / 32) * 8000, 32767), -32768),
						velocityY: Math.max(Math.min(((entity.pos.y - oldPos.y) / 32) * 8000, 32767), -32768),
						velocityZ: Math.max(Math.min(((entity.pos.z - oldPos.z) / 32) * 8000, 32767), -32768)
					});
				});
			}

			this.check(this.entities[eId]);
		});

		bClient.room.state.items.onRemove((ent, eId) => {
			if (this.entities[eId]) {
				if (this.entities[eId].pickup) {
					client.write('collect', {
						collectedEntityId: eId,
						collectorEntityId: this.local.id
					});

					misc.playSound('random.pop', 0.2, ((Math.random() - Math.random()) * 0.7 + 1) * 2);
				}

				client.write('entity_destroy', {
					entityIds: [eId]
				});
				delete this.entities[eId];
			}
		});

		bClient.on('SPacketEntitySetting', (data) => {
			if (data.settings != undefined) {
				const entity = this.entities[data.eId];
				if (entity) {
					if (data.settings._isAlive != undefined) {
						entity.alive = data.settings._isAlive;
						entity.metadata[2] = {key: 6, value: 20, type: 3};
						this.check(entity);
					}

					if (data.settings.canSee != undefined) {
						entity.visible = data.settings.canSee;
						this.check(entity);
					}
				}

				if (data.settings.colorInLobbyLeaderboard != undefined) {
					const ent = bClient.room.state.entities[data.eId];
					const color = data.settings.colorInLobbyLeaderboard;

					if (ent != undefined) {
						tablist.update(data.eId, color == '#000000' ? (data.eId == this.local.id ? '#55FF55' : '#FF5555') : color);
					}
				}

				const lobbyValues = data.eId == this.local.id && data.settings.lobbyLeaderboardValues;
				if (lobbyValues != undefined) {
					for (const [name, val] of Object.entries(lobbyValues)) {
						if (name != 'team' && name != 'teamDisplay' && name != 'status' && name != 'team' && name != 'teamDisplay') {
							scoreboard.lobbyValues[name.charAt(0).toUpperCase() + name.slice(1)] = val;
						}
					}

					scoreboard.customUpdate();
				}

				this.local.spawned = data.eId == this.local.id && data.settings._isAlive != undefined ? data.settings._isAlive : this.local.spawned;
				if (data.eId == this.local.id && data.settings._isAlive == false) {
					this.local.health = {
						health: 0,
						food: this.local.health.food ?? 19,
						foodSaturation: this.local.health.foodSaturation ?? 20
					};

					client.write('update_health', this.local.health);
					this.respawnLoop();
				}
			}
		});

		bClient.on('SPacketServerSetting', (data) => {
			for (const [name, obj] of Object.entries(data)) {
				bClient.settings[name] = obj;
				bClient.settingsEvent.emit(name, obj);
			}
		});

		bClient.on('SPacketEntityDamage', (data) => {
			client.write('entity_status', {
				entityId: this.convertId(data.eId),
				entityStatus: 2
			});

			if (data.yourAttack && data.kbParticles) {
				client.write('entity_metadata', {
					entityId: this.local.mcId,
					metadata: [{key: 0, value: 0, type: 0}]
				});
			}

			if (data.healthFrac != undefined) {
				const entity = this.entities[data.eId];
				const newHp = Math.max(20 * data.healthFrac, 0.2);
				if (entity) entity.metadata[2] = {key: 6, value: newHp, type: 3};

				if (data.eId != this.local.id && entity && entity.spawned) {
					if (data.critParticles) {
						client.write('animation', {
							entityId: entity.id,
							animation: 4
						});
					}

					if (data.kbParticles) {
						client.write('animation', {
							entityId: entity.id,
							animation: 5
						});
					}

					client.write('entity_metadata', {
						entityId: entity.id,
						metadata: [{key: 6, value: newHp, type: 3}]
					});

					misc.playSound('game.player.hurt', 1, ((Math.random() - Math.random()) * 0.2 + 1), [(entity.pos.x / 32), (entity.pos.y / 32), (entity.pos.z / 32)]);
				}
			}
		});

		bClient.on('SPacketEntityVelocity', (data) => client.write('entity_velocity', {
			entityId: this.local.mcId,
			velocityX: Math.max(Math.min(data[0] * 8000, 32767), -32768),
			velocityY: Math.max(Math.min(data[1] * 8000, 32767), -32768),
			velocityZ: Math.max(Math.min(data[2] * 8000, 32767), -32768)
		}));

		bClient.on('SPacketEntityVelocityPlayer', (data) => client.write('entity_velocity', {
			entityId: this.local.mcId,
			velocityX: Math.max(Math.min(data.dir[0] * 8000, 32767), -32768),
			velocityY: Math.max(Math.min(data.dir[1] * 8000, 32767), -32768),
			velocityZ: Math.max(Math.min(data.dir[2] * 8000, 32767), -32768)
		}));

		bClient.on('SPacketEquipArmor', (data) => {
			for (const entry of data) {
				const slotId = PART_ID.indexOf(entry.part);
				const entity = this.entities[entry.eId];

				if (entity && slotId > 0) {
					const item = translateItem({name: entry.selected.itemName ?? 'Air', amount: 1, attributes: entry.selected.enchantmentTier ? {customAttributes: {enchantments: []}} : undefined});
					entity.equipment[slotId] = item;

					if (!entity.spawned) continue;
					client.write('entity_equipment', {
						entityId: entity.id,
						slot: slotId,
						item: item
					});
				}
			}
		});

		bClient.on('SPacketUpdateEffect', (data) => {
			if (EFFECTS[data.name]) {
				if (this.effectCooldowns[data.name + data.lifeformId]) {
					clearTimeout(this.effectCooldowns[data.name + data.lifeformId]);
					delete this.effectCooldowns[data.name + data.lifeformId];
				}

				this.effectCooldowns[data.name + data.lifeformId] = setTimeout(() => {
					delete this.effectCooldowns[data.name + data.lifeformId];
					client.write('remove_entity_effect', {
						entityId: this.convertId(data.lifeformId),
						effectId: EFFECTS[data.name]
					});
				}, data.duration);

				client.write('entity_effect', {
					entityId: this.convertId(data.lifeformId),
					effectId: EFFECTS[data.name],
					amplifier: (data.level ?? 1) - 1,
					duration: data.duration / 50,
					hideParticles: true
				});
			}
		});

		bClient.on('SPacketRemoveEffect', (data) => {
			if (EFFECTS[data.name]) {
				if (this.effectCooldowns[data.name + data.playerId]) {
					clearTimeout(this.effectCooldowns[data.name + data.playerId]);
					delete this.effectCooldowns[data.name + data.playerId];
				}

				client.write('remove_entity_effect', {
					entityId: this.convertId(data.playerId),
					effectId: EFFECTS[data.name]
				});
			}
		});

		bClient.on('SPacketResyncVelocity', (data) => this.resyncVelocity(data));
		bClient.on('SPacketPlayerTeleport', (data) => {
			const newOffset = data.y > 255 ? data.y - (data.y % 255) : 0;

			if (Math.abs(newOffset - this.local.yOffset) > 255) {
				for (const chunk of Object.values(world.chunks)) {
					chunk.delete();
				}
				world.chunks = {};
			}

			this.local.yOffset = newOffset;
			this.teleport = data;
			this.ignoreTeleport++;
			bClient.send('CPacketAcceptTeleport', {
				id: data.id,
				type: 10
			});

			if (data.id == 1) {
				client.write('entity_metadata', {
					entityId: this.local.mcId,
					metadata: [{key: 10, value: 127, type: 0}]
				});
			}

			client.write('position', {
				x: data.x,
				y: (data.y > 255 ? data.y % 255 : data.y) + this.chunkOffset,
				z: data.z,
				yaw: 0,
				pitch: 0,
				flags: 24
			});
		});

		bClient.on('SPacketViewAngles', (data) => {
			this.ignoreTeleport++;
			client.write('position', {
				x: this.local.pos.x,
				y: (this.local.pos.y > 0 ? this.local.pos.y % 255 : this.local.pos.y) + this.chunkOffset,
				z: this.local.pos.z,
				yaw: -Math.atan2(data[0], -data[2]) * RAD2DEG,
				pitch: Math.atan2(data[1], (data[0] ** 2 + data[2] ** 2) ** .5) * RAD2DEG,
				flags: 0
			});
		});

		// server setting events
		bClient.settingsEvent.on('_health', (health) => {
			if (health != undefined) {
				this.local.health = {
					health: health / 5,
					food: this.local.health.food ?? 19,
					foodSaturation: this.local.health.foodSaturation ?? 20
				};
				client.write('update_health', this.local.health);
			}
		});

		bClient.settingsEvent.on('_shield', (shield) => {
			client.write('entity_metadata', {
				entityId: this.local.mcId,
				metadata: [{key: 17, value: shield / 5, type: 3}]
			});
		});

		bClient.settingsEvent.on('_aura', (aura) => {
			client.write('experience', {
				experienceBar: (aura / bClient.settings.auraPerLevel) % 1,
				level: Math.floor(aura / bClient.settings.auraPerLevel),
				totalExperience: 0
			});
		});

		bClient.settingsEvent.on('secsToRespawn', () => this.respawnLoop());
	}
	minecraft(mcClient) {
		client = mcClient;
		client.on('flying', () => this.actions());
		client.on('position', ({ x, y, z, onGround } = {}) => {
			y -= this.chunkOffset;
			const diff = (this.local.yOffset + y) - this.local.pos.y;
			const didMove = (Math.pow(this.local.pos.x - x, 2) + Math.pow(this.local.pos.z - z, 2)) > 0.02;
			this.local.jump = diff > 0.2 && diff < 0.24;
			this.local.pos = {x: x, y: this.local.yOffset + y, z: z};
			this.actions(didMove);
		});
		client.on('look', ({ yaw, pitch, onGround } = {}) => {
			this.local.yaw = (((yaw * -1) * DEG2RAD) % RAD360 + RAD360) % RAD360;
			this.local.pitch = pitch * DEG2RAD;
			this.actions();
		});
		client.on('position_look', ({ x, y, z, onGround, yaw, pitch } = {}) => {
			y -= this.chunkOffset;
			if (this.teleport != undefined) {
				if (Math.sqrt(Math.pow(x - this.teleport.x, 2) + Math.pow((y + this.local.yOffset) - this.teleport.y, 2) + Math.pow(z - this.teleport.z, 2)) < 2) {
					this.local.pos = {x: x, y: this.local.yOffset + y, z: z};
					this.teleport = undefined;
				} else {
					return;
				}
			}

			if (this.ignoreTeleport > 0) {
				this.ignoreTeleport--;
				return;
			}

			const diff = (this.local.yOffset + y) - this.local.pos.y;
			const didMove = (Math.pow(this.local.pos.x - x, 2) + Math.pow(this.local.pos.z - z, 2)) > 0.02;
			this.local.jump = diff > 0.2 && diff < 0.24;
			this.local.pos = {x: x, y: this.local.yOffset + y, z: z};
			this.local.yaw = (((yaw * -1) * DEG2RAD) % RAD360 + RAD360) % RAD360;
			this.local.pitch = pitch * DEG2RAD;
			this.actions(didMove);
		});
		client.on('held_item_slot', packet => {
			gui.slot = packet.slotId ?? 0;
			bloxDClient.send('CPacketSelectSlot', gui.slot);
		});
		client.on('arm_animation', () => {
			if (!world.breaking) {
				bloxDClient.send('CPacketSwingItem', {
					type: this.rightClick != undefined && this.rightClick[1] ? 3 : 2,
					doubleClick: false,
					targetPos: this.rightClick != undefined && this.rightClick[1] ? this.rightClick[0] : null,
					targetBlock: this.rightClick != undefined && this.rightClick[1] ? 955 : null
				});
			}

			this.local.state[0] = Date.now() + 100;
		});
		client.on('entity_action', packet => {
			switch (packet.actionId) {
				case 0:
					this.local.state[2] = true;
					break;
				case 1:
					this.local.state[2] = false;
					break;
				case 2:
					break;
				case 3:
					this.local.state[1] = true;
					break;
				case 4:
					this.local.state[1] = false;
					break;
			}
		});
		client.on('use_entity', packet => {
			const eId = packet.target != undefined && packet.target.toString();
			const ent = this.entities[eId];
			if (ent) {
				if (ent.special) {
					switch (ent.name) {
						case 'Items':
							gui.replicateCustom('Shop');
							break;
						case 'Upgrades':
							gui.replicateCustom('Upgrades');
							break;
						case 'Select Kit':
							gui.replicateCustom('Loot');
							break;
					}
					return;
				}

				if (packet.mouse == 0) {
					const heldItem = gui.getHeldName();
					switch (ent.type) {
						case 'Mesh|BloxdBlock|{"blockName":"INTERNAL_MESH_Boat","size":1.2,"meshOffset":[0,0,0]}':
							world.rightClick(null, eId);
							break;
						case 'Sheep':
							if (heldItem == 'Shears') {
								bloxDClient.send('CPacketMilkEntity', {
									targetEId: eId,
									toSlot: null
								})
							}
							break;
					}
				}

				if (packet.mouse == 1) {
					this.attackCount += 2;
					const offset = (ent.pos.y / 32) - (this.local.pos.y - this.local.yOffset);

					bloxDClient.send('CPacketAttackEntity', {
						eId: eId,
						bodyPart: offset < 0.1 ? 'Head' : (offset < 0.5 ? 'Body' : 'LegLeft'),
						dirFacing: this.local.facing,
						heldName: gui.getHeldName(),
						v: ATTACK_KEY,
						tickCounter: bloxDClient.room.state.tickCounter,
						clientClickCounter: this.attackCount
					});

					if (ent.type == 'Mesh|BloxdBlock|{"blockName":"INTERNAL_MESH_Boat","size":1.2,"meshOffset":[0,0,0]}') {
						bloxDClient.send('CPacketBreakEntity', {
							eId: eId,
							dirFacing: this.local.facing,
							heldName: gui.getHeldName()
						});
					}
				}
			}
		});
		client.on('spectate', packet => {
			bloxDClient.send('CPacketSwingItem', {
				type: 1,
				doubleClick: false,
				targetPos: null,
				targetBlock: null
			});
		});
	}
	respawnLoop() {
		if (this.respawnTimeout) clearTimeout(this.respawnTimeout);
		if (this.local.health.health <= 0) {
			this.respawnTimeout = setTimeout(() => {
				if (bloxDClient.connected && this.local.health.health <= 0) {
					bloxDClient.send('CPacketRespawn');
					this.resyncVelocity([0, 0, 0]);
					client.write('respawn', {
						dimension: 0,
						difficulty: 2,
						gamemode: 0,
						levelType: 'FLAT'
					});
					gui.replicateInv();
				}
			}, (bloxDClient.settings.secsToRespawn ?? 0) * 1000);
		}
	}
	resyncVelocity(data) {
		let newData = new Uint8Array(Float32Array.from(data).buffer);

		for (let i = 0; i < 12; i += 4) {
			const oldData = [newData[i], newData[i + 1], newData[i + 2], newData[i + 3]];
			newData[i] = oldData[3];
			newData[i + 1] = oldData[2];
			newData[i + 2] = oldData[1];
			newData[i + 3] = oldData[0];
		}

		client.write('custom_payload', {
			channel: 'bloxd:resyncphysics',
			data: Buffer.from(newData)
		});
	}
	cleanup(requeue) {
		client = requeue ? client : undefined;
		if (this.swingInterval) clearInterval(this.swingInterval);
		if (this.effectCooldowns) {
			for (const [_, obj] of Object.entries(this.effectCooldowns)) {
				clearTimeout(obj);
			}
		}
		this.entities = {};
		this.skins = {};
		this.gamemodes = {};
		this.ignoreTeleport = 0;
		this.attackCount = 0;
		this.dropTime = Date.now();
		this.effectCooldowns = {};
		this.chunkOffset = 0;
		this.local = {
			id: -1,
			mcId: 99999,
			yOffset: 0,
			yaw: 0,
			pitch: 0,
			pos: {x: 0, y: 0, z: 0},
			serverPos: {x: 0, y: 0, z: 0},
			state: [],
			lastState: [],
			health: {hp: 20, food: 19, foodSaturation: 20},
			facing: [1, 0, 0]
		};
	}
	obtainHandlers(handlers) {
		tablist = handlers.tablist;
		world = handlers.world;
		gui = handlers.gui;
		misc = handlers.misc;
		scoreboard = handlers.scoreboard;
	}
};

module.exports = new self();