const mcData = require('minecraft-data')('1.8.9');
module.exports = {
	EFFECTS: {
		Speed: mcData.effectsByName.Speed.id,
		Slowness: mcData.effectsByName.Slowness.id,
		Haste: mcData.effectsByName.Haste.id,
		Damage: mcData.effectsByName.Strength.id,
		'Instant Health': mcData.effectsByName.InstantHealth.id,
		'Instant Damage': mcData.effectsByName.InstantDamage.id,
		'Jump Boost': mcData.effectsByName.JumpBoost.id,
		'Health Regen': mcData.effectsByName.Regeneration.id,
		'Damage Reduction': mcData.effectsByName.Resistance.id,
		'Heat Resistance': mcData.effectsByName.FireResistance.id,
		Invisible: mcData.effectsByName.Invisibility.id,
		Weakness: mcData.effectsByName.Weakness.id,
		Poisoned: mcData.effectsByName.Poison.id,
		Shield: mcData.effectsByName.Absorption.id
	}
}