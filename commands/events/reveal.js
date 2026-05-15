const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { stmts } = require("../../db");

// This command is a fallback for admins who want to manually trigger reveal.
// The primary flow is: judge hub -> "Reveal Results" button -> "Archive Event" button.
module.exports = {
  data: new SlashCommandBuilder()
    .setName("event-reveal")
    .setDescription("Manually set event to revealed and make threads public")
    .addIntegerOption((o) =>
      o.setName("event-id").setDescription("Event ID").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventId = interaction.options.getInteger("event-id");
    const event = stmts.getEvent.get(eventId);

    if (!event) return interaction.editReply("Event not found.");

    const guild = interaction.guild;
    const submissions = stmts.getSubmissionsByEvent.all(eventId);
    const judgeRoleId = process.env.JUDGE_ROLE_ID;

    let unlocked = 0;
    for (const sub of submissions) {
      try {
        const thread = await guild.channels.fetch(sub.thread_id);
        if (!thread) continue;
        await thread.setLocked(false);
        await thread.permissionOverwrites.edit(guild.id, {
          ViewChannel: true,
          SendMessages: false,
        });
        if (judgeRoleId)
          await thread.permissionOverwrites.edit(judgeRoleId, {
            ViewChannel: true,
            SendMessages: false,
          });
        await thread.permissionOverwrites.edit(sub.user_id, {
          ViewChannel: true,
          SendMessages: false,
        });
        unlocked++;
      } catch (_) {}
    }

    stmts.setEventStatus.run("revealed", eventId);

    // Refresh the hub embed so the Archive button appears
    const { refreshJudgeHub } = require("../../utils/helpers");
    await refreshJudgeHub(guild, stmts.getEvent.get(eventId), stmts);

    return interaction.editReply(
      `Event set to **Revealed**. ${unlocked} thread${unlocked !== 1 ? "s" : ""} are now public.\n\nUse the **Archive Event** button in judging to post all results to <#${event.results_channel_id}>.`,
    );
  },
};
