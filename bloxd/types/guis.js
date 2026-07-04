const { translateItem, processText } = require('../utils');
const crafting_recipe = require('./crafting_recipe');
const mcData = require('minecraft-data')("1.8.9");

function getItemAmount(name, inv) {
	let count = 0;
	for (const item of inv) {
		if (item.name == name) {
			count += item.amount ?? 1;
		}
	}
	return count;
}

// thanks again roblox thot :money:
function make_item(item, data) {
	const base = translateItem(item);
	base.extra = data;
	base.nbtData = {
		type: "compound",
		name: "",
		value: {
			display: {
				type: "compound",
				value: {
					Name: item.displayName != undefined ? {
						type: "string",
						value: item.displayName
					} : undefined,
					Lore: {
						type: "list",
						value: {
							type: "string",
							value: item.lore ?? []
						}
					}
				}
			}
		}
	};
	return base;
}

function updateGui(gui, client) {
	const contents = Array((Math.ceil(gui.items.length / 9) * 9)).fill({blockId: -1});
	for (let i = 0; i < gui.items.length; i++) {
		contents[i] = gui.items[i];
	}

	client.write('set_slot', {
		windowId: -1,
		slot: -1,
		item: {blockId: -1}
	});
	client.write('window_items', {
		windowId: 255,
		items: contents
	});
}

/**
 * Update a custom menu with the included item data.
 * @param {string} category Menu name
*/
function updateCategory(category, data, items) {
	if (data[category] != undefined) {
		for (const [shopItem, entryData] of Object.entries(data[category].items)) {
			const itemData = entryData.image.split('|');
			const lore = [];

			if (entryData.cost != undefined) {
				lore.push(`Cost: ${entryData.cost} ${entryData.currency}`);
			}

			lore.push(processText(entryData.description ?? [entryData.buyButtonText]));
			items.push(make_item({
				name: itemData[0],
				amount: itemData[1] != undefined ? Number.parseInt(itemData[1]) : 1,
				displayName: entryData.customTitle != undefined ? processText(entryData.customTitle) : shopItem,
				lore: lore
			}, [shopItem, category]));
		}
	}
}

function updateCrafting(inv, items) {
	for (const [name, recipe] of Object.entries(crafting_recipe)) {
		let canCraft = true;
		for (const obj of recipe[0].requires) {
			let count = 0;
			for (const item of obj.items) {
				count += getItemAmount(item, inv);
			}

			if (count < obj.amt) {
				canCraft = false;
				break;
			}
		}

		if (canCraft) {
			items.push(make_item({
				name: name,
				amount: recipe[0].produces ?? 1,
				displayName: name
			}, [name]));
		}
	}

	items.sort((a) => a.name);
}

module.exports = {
	GUIS: {
		'Shop': {
			name: 'Shop',
			command: function(item, client, bloxDClient, gui) {
				if (item != undefined && item.extra) {
					bloxDClient.send('CPacketShopPurchase', {
						category: item.extra[1],
						name: item.extra[0],
						shopVersion: bloxDClient.settings._shopVersion ?? 0,
						userInput: undefined
					});
				}
				updateGui(gui, client);
			},
			items: [],
			updateItems: function(data) {
				this.items = [];
				updateCategory('Blocks', data, this.items);
				updateCategory('Combat', data, this.items);
				updateCategory('Utility', data, this.items);
			}
		},
		'Crafting': {
			name: 'Crafting',
			command: function(item, client, bloxDClient, gui) {
				if (item != undefined && item.extra) {
					bloxDClient.send('CPacketCraftItem', {
						itemName: item.extra[0],
						craftingIdx: 0,
						craftTimes: 1
					});
					bloxDClient.send('CPacketRemoveItem', {
						amount: 1,
						id: 0,
						idx: 1
					});
				}
				gui.updateItems(null, true);
				updateGui(gui, client);
			},
			items: [],
			updateItems: function(data, custom) {
				this.items = [];
				if (custom) updateCrafting(this.guiHandler.inventory, this.items);
			}
		}
	}
};

for (const category of ['Upgrades', 'Loot', 'Perks', 'Map Voting']) {
	module.exports.GUIS[category] = {
		name: category,
		command: function(item, client, bloxDClient, gui) {
			if (item != undefined && item.extra) {
				bloxDClient.send('CPacketShopPurchase', {
					category: item.extra[1],
					name: item.extra[0],
					shopVersion: bloxDClient.settings._shopVersion ?? 0,
					userInput: undefined
				});
			}
			updateGui(gui, client);
		},
		items: [],
		updateItems: function(data) {
			this.items = [];
			updateCategory(category, data, this.items);
		}
	};
}