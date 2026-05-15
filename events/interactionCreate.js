const { Events } = require('discord.js');
const handleCommands = require('../handlers/commandHandler');
const handleButtons  = require('../handlers/buttonHandler');
const { handleModals } = require('../handlers/modalHandler');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) return handleCommands(interaction);
      if (interaction.isButton())           return handleButtons(interaction);
      if (interaction.isModalSubmit())      return handleModals(interaction);
    } catch (err) {
      console.error('[interactionCreate]', err);
    }
  },
};
