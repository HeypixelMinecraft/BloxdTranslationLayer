const { IDITEM, ITEMLIMIT, ARMOR } = require('../../types/items.js');
const { GUIS } = require('../../types/guis.js');
const { translateItem } = require('../../utils.js');
const Handler = require('./../handler.js');
const crafting_recipe = require('../../types/crafting_recipe.js');
let client, bloxDClient, entity, misc;

const SLOTS = {
	0: 36,
	1: 37,
	2: 38,
	3: 39,
	4: 40,
	5: 41,
	6: 42,
	7: 43,
	8: 44,
	46: 5,
	47: 6,
	48: 0,
	49: 7,
	50: 8
};

function convertSlot(i) {
	return SLOTS[i] ?? Math.min(i, 35);
}

function convertSlotBack(i) {
	for (const [realId, mcId] of Object.entries(SLOTS)) {
		if (i == mcId) {
			return Number.parseInt(realId);
		}
	}
	return Math.min(i, 35);
}

const self = class GuiHandler extends Handler {
	bloxd(bClient) {
		bloxDClient = bClient;
		GUIS.Crafting.guiHandler = this;

		bClient.on('SPacketSetSlot', (data) => {
			this.inventory[data.index] = data;
			if (SLOTS[data.index] != undefined || data.index < 36) {
				client.write('set_slot', {
					windowId: 0,
					slot: convertSlot(data.index),
					item: translateItem(data)
				});
			}
		});

		bClient.on('SPacketPickupItem', (data) => {
			for (const dItem of data) {
				this.addItem(dItem);
			}
		});

		bClient.on('SPacketRemoveItem', (data) => {
			for (let i = 0; i < 46; i++) {
				const item = this.inventory[i] ?? {name: 'Air'};
				if (item.name == data.name) {
					item.amount = item.amount ?? 1;
					item.amount -= data.amt;

					if (item.amount <= 0) {
						this.inventory[i] = {name: 'Air'};
					}

					this.replicateItem(i);
					break;
				}
			}
		});

		bClient.on('SPacketSyncInventory', (data) => {
			this.inventory = JSON.parse(data.iOpsData.playerInven);
			for (const ind of Object.keys(this.inventory)) {
				this.inventory[ind] = this.inventory[ind] ?? {name: 'Air', amount: null};
			}
			this.replicateInv();

			if (data.iOpsData.openChest) {
				this.chest = JSON.parse(data.iOpsData.openChest);
				for (const ind of Object.keys(this.chest)) {
					this.chest[ind] = this.chest[ind] ?? {name: 'Air', amount: null};
				}
				this.replicateChest();
			}
		});

		bClient.on('SPacketClearInventory', () => {
			this.inventory = Array(52).fill({name: 'Air', amount: null});
			this.replicateInv();
		});

		bClient.on('SPacketUpdateChest', (data) => {
			if (data.open) {
				this.chest = JSON.parse(data.contents);
				for (const ind of Object.keys(this.chest)) {
					this.chest[ind] = this.chest[ind] ?? {name: 'Air', amount: null};
				}

				client.write('open_window', {
					windowId: 1,
					inventoryType: 'minecraft:chest',
					windowTitle: '{"translate":"container.chest"}',
					slotCount: this.chest.length ?? 0,
					entityId: entity.local.mcId
				});
				misc.playSound('random.chestopen', 0.3, Math.random() * 0.1 + 0.9);
				this.replicateChest();
			} else if (this.chest != undefined) {
				client.write('close_window', {windowId: 1});
				bloxDClient.send('CPacketCloseChest');
				this.chest = undefined;
			}
		});

		bClient.settingsEvent.on('shopInfo', (data) => {
			if (data != undefined) {
				for (const gui of Object.values(GUIS)) {
					gui.updateItems(data);
				}
				this.updateCustom();
			}
		});
	}
	minecraft(mcClient) {
		client = mcClient;
		client.on('window_click', packet => {
			if (packet.slot == -999 && this.pickedUp == undefined) return;
			let srcSlot = convertSlotBack(packet.slot);
			let srcItem = this.inventory[srcSlot];

			if (packet.windowId == 255) {
				const gui = GUIS[this.currentlyOpen];
				if (gui != undefined) {
					gui.command(gui.items[packet.slot], client, bloxDClient, gui);
				}
				return;
			}

			if (packet.windowId == 1) {
				if (this.chest != undefined) {
					srcSlot = packet.slot < this.chest.length ? 51 + packet.slot : convertSlotBack(packet.slot - (this.chest.length - 9));
					srcItem = packet.slot < this.chest.length ? this.chest[packet.slot] : this.inventory[srcSlot];
					srcItem.amount = srcItem.amount ?? 1;

					if (packet.mode == 1) {
						let destSlot, amount, doBreak;
						if (packet.slot < this.chest.length) {
							for (let type = 0; type < 2; type++) {
								for (let i = 8; i > 0; i--) {
									const item = this.inventory[i];
									if (type == 1 ? item.name == 'Air' : item.name == srcItem.name) {
										this.chest[packet.slot] = {name: 'Air', amount: null};
										if (item.name != 'Air') {
											const maxSize = (ITEMLIMIT[item.name] ?? 999);
											item.amount = item.amount ?? 1;
											if (item.amount + srcItem.amount <= maxSize) {
												item.amount += srcItem.amount;
												amount = srcItem.amount;
												destSlot = i;
												doBreak = true;
												break;
											}
										} else {
											this.inventory[i] = srcItem;
											destSlot = i;
											doBreak = true;
											break;
										}
									}
								}

								if (doBreak) break;
							}

							if (destSlot == undefined) {
								for (let type = 0; type < 2; type++) {
									for (let i = 35; i > 8; i--) {
										const item = this.inventory[i];
										if (type == 1 ? item.name == 'Air' : item.name == srcItem.name) {
											this.chest[packet.slot] = {name: 'Air', amount: null};
											if (item.name != 'Air') {
												const maxSize = (ITEMLIMIT[item.name] ?? 999);
												item.amount = item.amount ?? 1;
												if (item.amount + srcItem.amount <= maxSize) {
													item.amount += srcItem.amount;
													amount = srcItem.amount;
													destSlot = i;
													doBreak = true;
													break;
												}
											} else {
												this.inventory[i] = srcItem;
												destSlot = i;
												doBreak = true;
												break;
											}
										}
									}

									if (doBreak) break;
								}
							}
						} else {
							for (let i = 0; i < this.chest.length; i++) {
								const item = this.chest[i];
								if (item.name == 'Air') {
									this.chest[i] = srcItem;
									this.inventory[srcSlot] = {name: 'Air', amount: null};
									destSlot = 51 + i;
									break;
								}
							}
						}

						if (destSlot != undefined) {
							if (amount != undefined) {
								bloxDClient.send('CPacketMoveItemAmount', {
									i: srcSlot,
									j: destSlot,
									amt: amount
								});
							} else {
								bloxDClient.send('CPacketMoveItem', {
									i: destSlot,
									j: srcSlot
								});
							}
						}
					}

					this.replicateInv();
					this.replicateChest();
				}
			} else {
				if (packet.mode == 0) {
					if (this.pickedUp != undefined && this.pickedUp != srcSlot) {
						if (packet.slot == -999) {
							this.dropItem(this.pickedUp, true);
						} else {
							this.inventory[srcSlot] = this.inventory[this.pickedUp];
							this.inventory[this.pickedUp] = srcItem;
							this.replicateInv();
							bloxDClient.send('CPacketMoveItem', {
								i: this.pickedUp,
								j: srcSlot
							});
						}
					}

					this.pickedUp = this.pickedUp == undefined && this.inventory[srcSlot].name != 'Air' ? srcSlot : undefined;
					return;
				} else if (packet.mode == 1) {
					const armorSlot = ARMOR[srcItem.name];
					let destSlot, skipNormal;

					if (armorSlot && (this.inventory[armorSlot]).name == 'Air') {
						this.inventory[armorSlot] = srcItem;
						this.inventory[srcSlot] = {name: 'Air', amount: null};
						destSlot = armorSlot;
						skipNormal = true;
					}

					if (!skipNormal) {
						if (srcSlot < 9 || srcSlot > 45) {
							for (let i = 9; i < 36; i++) {
								const item = this.inventory[i];
								if (item.name == 'Air') {
									this.inventory[i] = srcItem;
									this.inventory[srcSlot] = {name: 'Air', amount: null};
									destSlot = i;
									break;
								}
							}
						} else {
							for (let i = 0; i < 9; i++) {
								const item = this.inventory[i];
								if (item.name == 'Air') {
									this.inventory[i] = srcItem;
									this.inventory[srcSlot] = {name: 'Air', amount: null};
									destSlot = i;
									break;
								}
							}
						}
					}

					if (destSlot != undefined) {
						bloxDClient.send('CPacketMoveItem', {
							i: destSlot,
							j: srcSlot
						});
					}
					return;
				} else if (packet.mode == 2) {
					let destSlot = packet.mouseButton;
					this.inventory[srcSlot] = this.inventory[destSlot];
					this.inventory[destSlot] = srcItem;

					bloxDClient.send('CPacketMoveItem', {
						i: destSlot,
						j: srcSlot
					});
					return;
				} else if (packet.mode == 4 && packet.slot != -999) {
					this.dropItem(srcSlot, packet.mouseButton == 1);
					return;
				}

				this.replicateInv();
			}
		});

		client.on('close_window', packet => {
			if (packet.windowId == 1) {
				this.chest = undefined;
				misc.playSound('random.chestclosed', 0.3, Math.random() * 0.1 + 0.9);
				bloxDClient.send('CPacketCloseChest');
			}
		});
	}
	getHeldName() {
		const item = this.inventory[this.slot];
		return item && item.name != 'Air' ? item.name : null;
	}
	replicateInv() {
		let items = Array(45).fill({blockId: -1});
		for (let i = 0; i < this.inventory.length; i++) {
			if (SLOTS[i] != undefined || i < 36) {
				items[convertSlot(i)] = translateItem(this.inventory[i] ?? {name: 'Air'});
			}
		}

		client.write('set_slot', {
			windowId: -1,
			slot: -1,
			item: {blockId: -1}
		});

		client.write('window_items', {
			windowId: 0,
			items: items
		});
	}
	replicateItem(slot) {
		if (SLOTS[slot] != undefined || slot < 36) {
			client.write('set_slot', {
				windowId: 0,
				slot: convertSlot(slot),
				item: translateItem(this.inventory[slot])
			});
		}
	}
	replicateChest() {
		if (this.chest != undefined) {
			let items = Array(this.chest.length).fill({blockId: -1});
			for (let i = 0; i < this.chest.length; i++) {
				items[i] = translateItem(this.chest[i] ?? {name: 'Air'});
			}

			client.write('set_slot', {
				windowId: -1,
				slot: -1,
				item: {blockId: -1}
			});

			client.write('window_items', {
				windowId: 1,
				items: items
			});
		}
	}
	replicateCustom(guiType) {
		const gui = GUIS[guiType];
		if (gui) {
			if (guiType == 'Crafting') gui.updateItems(null, true);
			const itemCount = Math.ceil(gui.items.length / 9) * 9;
			client.write('open_window', {
				windowId: 255,
				inventoryType: 'minecraft:container',
				windowTitle: JSON.stringify({text: gui.name}),
				slotCount: itemCount,
				entityId: entity.local.mcId
			});
			this.currentlyOpen = guiType;

			const contents = Array(itemCount).fill({blockId: -1});
			for (let i = 0; i < gui.items.length; i++) {
				contents[i] = gui.items[i];
			}

			client.write('window_items', {
				windowId: 255,
				items: contents
			});
		}
	}
	updateCustom() {
		const gui = GUIS[this.currentlyOpen];
		if (gui) {
			const contents = Array(Math.ceil(gui.items.length / 9) * 9).fill({blockId: -1});
			for (let i = 0; i < gui.items.length; i++) {
				contents[i] = gui.items[i];
			}

			client.write('window_items', {
				windowId: 255,
				items: contents
			});
		}
	}
	addItem(dItem) {
		dItem.amount = dItem.amount ?? 1;
		if (dItem.name == undefined) {
			dItem.name = IDITEM[dItem.id];
		}

		let doBreak, canPickup;
		for (let type = 0; type < 2; type++) {
			for (let i = 0; i < 36; i++) {
				const item = this.inventory[i] ?? {name: 'Air'};
				if (type == 1 ? item.name == 'Air' : item.name == dItem.name) {
					if (item.name == 'Air') {
						this.inventory[i] = dItem;
						this.replicateItem(i);
						doBreak = true;
						canPickup = true;
						break;
					} else {
						const maxSize = (ITEMLIMIT[item.name] ?? 999);
						item.amount = item.amount ?? 1;
						if (item.amount + dItem.amount <= maxSize) {
							item.amount += dItem.amount;
							this.replicateItem(i);
							doBreak = true;
							canPickup = true;
							break;
						} else if (item.amount < maxSize) {
							const diff = maxSize - item.amount;
							item.amount += diff;
							dItem.amount -= diff;
							canPickup = true;
							this.replicateItem(i);
						}
					}
				}
			}

			if (doBreak) break;
		}

		return canPickup;
	}
	dropItem(id, full, special) {
		let item = this.inventory[id];
		const itemId = IDITEM.indexOf(item.name);
		let removed = 1;

		if (full) {
			removed = item.amount ?? 1;
			item.amount = 0;
		} else {
			item.amount -= 1;
		}

		if (item.amount <= 0) {
			item = {name: 'Air', amount: null};
		}

		entity.dropTime = Date.now() + 500;
		this.inventory[id] = item;
		if (special) this.replicateItem(id);
		bloxDClient.send('CPacketRemoveItem', {
			amount: removed,
			id: itemId,
			idx: id
		});
	}
	cleanup(requeue) {
		client = requeue ? client : undefined;
		this.currentlyOpen = '';
		this.inventory = Array(52).fill({name: 'Air', amount: null});
		this.slot = 0;
		this.pickedUp = undefined;
	}
	obtainHandlers(handlers) {
		entity = handlers.entity;
		misc = handlers.misc;
	}
};

module.exports = new self();