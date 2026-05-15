const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { stmts } = require("../../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event-delete")
    .setDescription("Delete an event and all its channels, threads, and data")
    .addIntegerOption((o) =>
      o.setName("event-id").setDescription("Event ID").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const eventId = interaction.options.getInteger("event-id");
    const event = stmts.getEvent.get(eventId);

    if (!event) {
      return interaction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const { count } = stmts.countSubmissions.get(eventId);

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event_delete_execute_${eventId}`)
        .setLabel("Yes, delete everything")
        .setStyle(ButtonStyle.Danger),
    );

    return interaction.reply({
      content: `Are you sure you want to delete **${event.name}**? This will permanently remove all channels, threads, and ${count} submission${count !== 1 ? "s" : ""}. There is no undo.`,
      components: [confirmRow],
      flags: MessageFlags.Ephemeral,
    });
  },
};
