const { ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { stmts } = require("../db");
const {
  generateCodename,
  submissionEmbed,
  refreshJudgeHub,
} = require("../utils/helpers");

async function handleModals(interaction) {
  // -------------------------------------------------------------------------
  // Submission modal
  // -------------------------------------------------------------------------
  if (interaction.customId.startsWith("modal_submit_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const eventId = interaction.customId.slice("modal_submit_".length);
    const event = stmts.getEvent.get(eventId);

    if (!event || event.status !== "submissions_open") {
      return interaction.editReply("Submissions are currently closed.");
    }

    // Duplicate guard
    const existing = stmts.getSubmissionByUser.get(
      eventId,
      interaction.user.id,
    );
    if (existing) {
      return interaction.editReply(
        `You have already submitted to this event. Your thread: <#${existing.thread_id}>`,
      );
    }

    const title = interaction.fields.getTextInputValue("title");
    const description = interaction.fields.getTextInputValue("description");
    const link = null;
    const category = "General";

    const codename = generateCodename();
    const { count } = stmts.countSubmissions.get(eventId);
    const entryNum = count + 1;

    const guild = interaction.guild;
    const judgeRoleId = process.env.JUDGE_ROLE_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;

    // Create private thread inside the submission channel
    let thread;
    try {
      const subChannel = await guild.channels.fetch(
        event.submission_channel_id,
      );
      thread = await subChannel.threads.create({
        name: `#${entryNum} - ${codename}`,
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 10080, // 1 week
        invitable: false,
        reason: `Submission for event: ${event.name}`,
      });
    } catch (err) {
      console.error("[modalHandler] thread create failed:", err);
      return interaction.editReply(
        "Could not create your submission thread. Please contact an admin.",
      );
    }

    // Add submitter
    await thread.members.add(interaction.user.id);

    // Add admins
    if (adminRoleId) {
      try {
        const members = await guild.members.fetch();
        for (const [, m] of members.filter((m) =>
          m.roles.cache.has(adminRoleId),
        )) {
          await thread.members.add(m.id).catch(() => {});
        }
      } catch (_) {}
    }

    // Save to DB
    stmts.insertSubmission.run({
      event_id: eventId,
      user_id: interaction.user.id,
      thread_id: thread.id,
      codename,
      entry_num: entryNum,
      title,
      description,
      link,
      category,
    });

    // Post confirmation embed inside the thread (no username - just codename)
    const embed = submissionEmbed(
      event,
      codename,
      entryNum,
      title,
      description,
    );
    if (link) embed.addFields({ name: "Link", value: link });
    embed.addFields(
      { name: "Category", value: category, inline: true },
      {
        name: "Uploading files",
        value:
          "Drag and drop files directly into this thread. You can upload multiple times before the deadline.",
      },
    );
    await thread.send({ embeds: [embed] });

    // Edit the judge hub embed to include the new entry
    await refreshJudgeHub(guild, event, stmts);

    return interaction.editReply(
      `Submission received.\n\nEntry #${entryNum} - \`${codename}\`\nYour private thread: <#${thread.id}>\n\nUpload your files there.`,
    );
  }

  // -------------------------------------------------------------------------
  // Score modal
  // -------------------------------------------------------------------------
  if (interaction.customId.startsWith("modal_score_")) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const submissionId = parseInt(
      interaction.customId.slice("modal_score_".length),
      10,
    );
    const submission = stmts.getSubmission.get(submissionId);

    if (!submission) return interaction.editReply("Submission not found.");

    if (submission.user_id === interaction.user.id) {
      return interaction.editReply("You cannot score your own submission.");
    }

    const scoreRaw = interaction.fields.getTextInputValue("score").trim();
    const feedback =
      interaction.fields.getTextInputValue("feedback").trim() || null;
    const score = parseInt(scoreRaw, 10);

    if (isNaN(score) || score < 1 || score > 10) {
      return interaction.editReply(
        "Score must be a whole number between 1 and 10.",
      );
    }

    stmts.upsertScore.run({
      submission_id: submissionId,
      judge_id: interaction.user.id,
      score,
      feedback,
    });

    const { avg, count } = stmts.getAvgScore.get(submissionId);

    // Refresh hub so the average updates live
    const event = stmts.getEvent.get(submission.event_id);
    await refreshJudgeHub(interaction.guild, event, stmts);

    return interaction.editReply(
      `Score saved: **${score}/10** for Entry #${submission.entry_num} (\`${submission.codename}\`).\nCurrent average: **${avg}/10** from ${count} judge${count !== 1 ? "s" : ""}.`,
    );
  }
}

module.exports = { handleModals };
