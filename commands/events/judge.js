const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { stmts } = require("../../db");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event-judge")
    .setDescription("Check judging progress for an event")
    .addIntegerOption((o) =>
      o.setName("event-id").setDescription("Event ID").setRequired(true),
    ),

  async execute(interaction) {
    const judgeRoleId = process.env.JUDGE_ROLE_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;
    const member = interaction.member;
    const allowed =
      member.permissions.has("Administrator") ||
      (judgeRoleId && member.roles.cache.has(judgeRoleId)) ||
      (adminRoleId && member.roles.cache.has(adminRoleId));

    if (!allowed) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
    }

    const eventId = interaction.options.getInteger("event-id");
    const submissions = stmts.getSubmissionsByEvent.all(eventId);

    if (!submissions.length) {
      return interaction.reply({
        content: "No submissions found for this event.",
        flags: MessageFlags.Ephemeral,
      });
    }

    let myScored = 0;
    const lines = submissions.map((sub) => {
      const myScore = stmts.getScore.get(sub.id, interaction.user.id);
      const { avg, count } = stmts.getAvgScore.get(sub.id);
      if (myScore) myScored++;
      const scored = myScore
        ? `yours: ${myScore.score}/10`
        : "not scored by you";
      const avgStr = count > 0 ? `avg: ${avg}/10` : "no scores yet";
      return `[${myScore ? "x" : " "}] #${sub.entry_num} \`${sub.codename}\` - ${sub.title} | ${scored} | ${avgStr}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`Judging Progress - Event #${eventId}`)
      .setDescription(`\`\`\`\n${lines.join("\n")}\n\`\`\``)
      .setColor(0xe67e22)
      .setFooter({
        text: `You have scored ${myScored} of ${submissions.length} entries. Use the judging buttons to score.`,
      });

    return interaction.reply({
      embeds: [embed],
      flags: MessageFlags.Ephemeral,
    });
  },
};
