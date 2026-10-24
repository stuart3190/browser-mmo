/* eslint-disable */
// Equip only genuinely owned, usable journey rewards through ordinary inventory controls.
async function equipEarned(page, gameData, touch = false, report = () => {}) {
  const click = async (locator) => locator[touch ? 'tap' : 'click']();
  const state = await page.evaluate(() => ({
    items: window.__mmo.items,
    level: window.__mmo.progress.level,
    classId: window.__mmo.abilities.classId,
  }));
  const cls = gameData.characterClass(state.classId);
  const priorities = [
    ['weapon.staff.oak_staff'],
    ['armor.leather.trapper_cap'],
    ['accessory.ring.stillwater_seal'],
    ['accessory.ring.copper_band'],
    ['accessory.necklace.springward_pendant'],
    ['accessory.trinket.keepers_token'],
    [
      'accessory.cloak.oathkeepers_mantle',
      'accessory.cloak.rootward_mantle',
      'accessory.cloak.wayfarer_cloak',
    ],
  ];
  for (const choices of priorities) {
    for (const templateId of choices) {
      const template = gameData.template(templateId);
      if (state.level < template.requiredLevel) continue;
      if (template.allowedClassIds.length && !template.allowedClassIds.includes(cls.id)) continue;
      const kind = gameData.equipmentTypes.get(template.equipment.equipmentTypeId);
      if (
        kind.requiresProficiency &&
        ![...cls.armorProficiencies, ...cls.weaponProficiencies].includes(kind.id)
      )
        continue;
      if (state.items.some((i) => i.templateId === templateId && i.location.kind === 'equipped'))
        break;
      const item = state.items.find(
        (i) =>
          i.templateId === templateId &&
          i.location.kind === 'container' &&
          i.location.containerKind === 'backpack',
      );
      if (!item) continue;
      await click(page.locator('[data-open=inventory]'));
      await click(page.locator(`[data-container=backpack] [data-item-id="${item.id}"]`));
      await click(page.locator('[data-action=equip]'));
      await page.waitForFunction(
        (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
        item.id,
      );
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      report('Earned equipment equipped through inventory', true, templateId);
      break;
    }
  }
}
module.exports = { equipEarned };
