const mcData = require('minecraft-data')('1.8.9');
module.exports = {
    ENCHANTS: {
        Damage: mcData.enchantmentsByName.sharpness.id,
        Protection: mcData.enchantmentsByName.protection.id,
        Health: mcData.enchantmentsByName.respiration.id,
        'Health Regen': mcData.enchantmentsByName.aqua_affinity.id,
        'Arrow Speed': mcData.enchantmentsByName.efficiency.id,
        'Arrow Damage': mcData.enchantmentsByName.power.id,
        'Quick Charge': mcData.enchantmentsByName.bane_of_arthropods.id,
        'Break Speed': mcData.enchantmentsByName.efficiency.id,
        'Horizontal Knockback': mcData.enchantmentsByName.knockback.id,
        'Vertical Knockback': mcData.enchantmentsByName.knockback.id,
        'Critical Damage': mcData.enchantmentsByName.smite.id,
        'Attack Speed': mcData.enchantmentsByName.efficiency.id
    }
};