const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { stmts } = require("../../db");
const { statusBadge } = require("../../utils/helpers");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event-status")
    .setDescription("View status and stats for the current event")
    .addIntegerOption((opt) =>
      opt
        .setName("event-id")
        .setDescription("Specific event ID (optional)")
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const eventId = interaction.options.getInteger("event-id");
    const event = eventId
      ? stmts.getEvent.get(eventId)
      : stmts.getActiveEvent.get(interaction.guild.id);

    if (!event) {
      return interaction.reply({
        content: " No event found.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const { count } = stmts.countSubmissions.get(event.id);
    const submissions = stmts.getSubmissionsByEvent.all(event.id);
    const scoredCount = submissions.filter((s) => {
      const scores = stmts.getScoresForSubmission.all(s.id);
      return scores.length > 0;
    }).length;

    const deadline = event.deadline_timestamp
      ? `<t:${event.deadline_timestamp}:R>`
      : "Not set";

    const embed = new EmbedBuilder()
      .setTitle(` Event Status - ${event.name}`)
      .setColor(0x5865f2)
      .addFields(
        { name: "Status", value: statusBadge(event.status), inline: true },
        { name: "Event ID", value: `${event.id}`, inline: true },
        { name: "Deadline", value: deadline, inline: true },
        { name: "Total Submissions", value: `${count}`, inline: true },
        { name: "Scored Entries", value: `${scoredCount}`, inline: true },
        {
          name: "Pending Score",
          value: `${count - scoredCount}`,
          inline: true,
        },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
