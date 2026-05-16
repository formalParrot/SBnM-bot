const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// --- Status label --------------------------------------------------------
function statusBadge(status) {
  const map = {
    draft: "Draft",
    submissions_open: "Submissions Open",
    judging: "Judging",
    public_voting: "Public Voting",
    revealed: "Revealed",
    archived: "Archived",
  };
  return map[status] ?? status;
}

// --- Phase transition map ------------------------------------------------
const NEXT_PHASES = {
  submissions_open: [
    { label: "Start Judging", value: "judging", style: ButtonStyle.Primary },
  ],
  judging: [
    { label: "Reveal Results", value: "revealed", style: ButtonStyle.Danger },
  ],
  revealed: [
    { label: "Archive Event", value: "archived", style: ButtonStyle.Secondary },
  ],
  archived: [],
};

// --- Judge hub embed + per-entry View buttons + phase controls -----------
const ENTRIES_PER_PAGE = 20;

const PHASE_COLOR = {
  submissions_open: 0xf0a500,
  judging: 0x5865f2,
  revealed: 0x57f287,
  archived: 0x4f545c,
};

// rows: [{ sub, avg, scoreCount }]
function buildJudgeHub(eventName, eventId, rows, currentStatus, page = 0) {
  const totalPages = Math.max(1, Math.ceil(rows.length / ENTRIES_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageRows = rows.slice(
    safePage * ENTRIES_PER_PAGE,
    (safePage + 1) * ENTRIES_PER_PAGE,
  );

  const scoredCount = rows.filter((r) => r.scoreCount > 0).length;

  const embed = new EmbedBuilder()
    .setTitle(eventName)
    .setColor(PHASE_COLOR[currentStatus] ?? 0x5865f2)
    .setFooter({
      text: `Event ID: ${eventId}${totalPages > 1 ? ` · Page ${safePage + 1}/${totalPages}` : ""} · Click an entry to view and score`,
    })
    .setTimestamp();

  if (!rows.length) {
    embed.setDescription(
      "No submissions yet. Entries will appear here as they come in.",
    );
  } else {
    const lines = pageRows.map(({ sub, avg, scoreCount }) => {
      const dot =
        scoreCount === 0 ? "⬜" : scoreCount === 1 ? "🟡" : "🟢";
      const scoreStr =
        scoreCount > 0
          ? `${avg}/10 · ${scoreCount} judge${scoreCount !== 1 ? "s" : ""}`
          : "unscored";
      return `${dot} **#${sub.entry_num}** ${sub.title}  ·  ${scoreStr}`;
    });
    embed
      .setDescription(lines.join("\n"))
      .addFields(
        { name: "​", value: currentStatus.replace("_", " "), inline: true },
        { name: "Entries", value: `${rows.length}`, inline: true },
        { name: "Scored", value: `${scoredCount} / ${rows.length}`, inline: true },
      );
  }

  const components = [];

  // Entry buttons: 4 rows × 5 = 20 per page
  for (let r = 0; r < Math.ceil(pageRows.length / 5); r++) {
    const actionRow = new ActionRowBuilder();
    for (const { sub } of pageRows.slice(r * 5, r * 5 + 5)) {
      const raw = `#${sub.entry_num} - ${sub.title}`;
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`jview_${sub.id}`)
          .setLabel(raw.length > 80 ? raw.slice(0, 77) + "..." : raw)
          .setStyle(ButtonStyle.Primary),
      );
    }
    components.push(actionRow);
  }

  // Control row: ← Prev | Next → | [My Progress] | [phase button] | Delete Event
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`jpage_prev_${safePage}_${eventId}`)
      .setLabel("← Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`jpage_next_${safePage}_${eventId}`)
      .setLabel("Next →")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );

  if (currentStatus === "judging") {
    controlRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`jmyprogress_${eventId}`)
        .setLabel("My Progress")
        .setStyle(ButtonStyle.Secondary),
    );
  }

  for (const opt of NEXT_PHASES[currentStatus] ?? []) {
    controlRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`phase_${opt.value}_${eventId}`)
        .setLabel(opt.label)
        .setStyle(opt.style),
    );
  }

  controlRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`event_delete_confirm_${eventId}`)
      .setLabel("Delete Event")
      .setStyle(ButtonStyle.Danger),
  );

  components.push(controlRow);

  return { embed, components };
}

// --- Rebuild and edit the pinned judge hub message -----------------------
async function refreshJudgeHub(guild, event, stmts, page = 0) {
  if (!event.judge_channel_id || !event.judge_hub_message_id) return;
  try {
    const channel = await guild.channels.fetch(event.judge_channel_id);
    const message = await channel.messages.fetch(event.judge_hub_message_id);
    const submissions = stmts.getSubmissionsByEvent.all(event.id);
    const rows = submissions.map((sub) => {
      const { avg, count } = stmts.getAvgScore.get(sub.id);
      return { sub, avg: avg ?? 0, scoreCount: count };
    });
    const { embed, components } = buildJudgeHub(
      event.name,
      event.id,
      rows,
      event.status,
      page,
    );
    await message.edit({ embeds: [embed], components });
  } catch (err) {
    console.error("[refreshJudgeHub]", err.message);
  }
}

// --- Toggle judge thread visibility --------------------------------------
async function setThreadVisibility(
  guild,
  submissions,
  judgeRoleId,
  adminRoleId,
  visible,
) {
  // Fetch all members once so role.members is fully populated
  if (visible) {
    try {
      await guild.members.fetch();
    } catch (err) {
      console.error('[setThreadVisibility] members fetch failed:', err.message);
    }
  }

  const judgeRole = judgeRoleId ? guild.roles.cache.get(judgeRoleId) : null;
  const adminRole = adminRoleId ? guild.roles.cache.get(adminRoleId) : null;

  for (const sub of submissions) {
    try {
      const thread = await guild.channels.fetch(sub.thread_id);
      if (!thread) continue;

      if (visible) {
        await thread.setArchived(false);
        for (const role of [judgeRole, adminRole]) {
          if (!role) continue;
          for (const member of role.members.values()) {
            try {
              await thread.members.add(member.id);
            } catch (err) {
              console.error(`[setThreadVisibility] add ${member.id}:`, err.message);
            }
          }
        }
        await thread.setLocked(true);
      } else {
        await thread.permissionOverwrites.edit(guild.id, {
          ViewChannel: false,
        });
        if (judgeRoleId)
          await thread.permissionOverwrites.edit(judgeRoleId, {
            ViewChannel: false,
          });
        await thread.permissionOverwrites.edit(sub.user_id, {
          ViewChannel: true,
          SendMessages: true,
          AttachFiles: true,
        });
        await thread.setLocked(false);
      }
    } catch (_) {}
  }
}

// --- Submission confirm embed (inside submitter thread) ------------------
function submissionEmbed(event, entryNum, title, desc) {
  return new EmbedBuilder()
    .setTitle("Submission Confirmed")
    .setColor(0x2ecc71)
    .addFields(
      { name: "Event", value: event.name, inline: true },
      { name: "Entry", value: `#${entryNum}`, inline: true },
      { name: "Title", value: title },
      { name: "Description", value: desc },
    )
    .setFooter({
      text: "Upload your files in this thread. Judges will review after the deadline.",
    })
    .setTimestamp();
}

// --- Entry detail embed (shown to judge on View button) -----------------
function entryDetailEmbed(sub, avg, scoreCount, myScore) {
  const embed = new EmbedBuilder()
    .setTitle(`Entry #${sub.entry_num} - ${sub.title}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "Title", value: sub.title || "Untitled", inline: true },
      { name: "Category", value: sub.category || "General", inline: true },
      { name: "Submitted", value: `<t:${sub.submitted_at}:R>`, inline: true },
      { name: "Description", value: sub.description || "No description." },
    );

  if (sub.link) embed.addFields({ name: "Link", value: sub.link });

  embed.addFields(
    { name: "Files / Thread", value: `<#${sub.thread_id}>`, inline: true },
    {
      name: "Avg Score",
      value:
        scoreCount > 0
          ? `${avg}/10 from ${scoreCount} judge${scoreCount !== 1 ? "s" : ""}`
          : "Not yet scored",
      inline: true,
    },
    {
      name: "Your Score",
      value: myScore ? `${myScore.score}/10` : "Not scored yet",
      inline: true,
    },
  );

  if (myScore?.feedback)
    embed.addFields({ name: "Your Feedback", value: myScore.feedback });

  return embed;
}

// --- Per-entry result embed (used in archived reveal) --------------------
function archiveEntryEmbed(rank, sub, avg, feedbackLines) {
  const labels = ["1st Place", "2nd Place", "3rd Place"];
  const colors = [0xffd700, 0xc0c0c0, 0xcd7f32];
  const embed = new EmbedBuilder()
    .setTitle(`${labels[rank - 1] ?? `#${rank}`} - ${sub.title}`)
    .setColor(colors[rank - 1] ?? 0x5865f2)
    .addFields(
      { name: "Creator", value: `<@${sub.user_id}>`, inline: true },
      { name: "Category", value: sub.category || "General", inline: true },
      { name: "Final Score", value: `${avg}/10`, inline: true },
      { name: "Description", value: sub.description || "No description." },
    )
    .setFooter({ text: `Entry #${sub.entry_num}` })
    .setTimestamp();

  if (sub.link) embed.addFields({ name: "Link", value: sub.link });
  if (feedbackLines.length)
    embed.addFields({
      name: "Judge Feedback",
      value: feedbackLines.join("\n"),
    });

  return embed;
}

module.exports = {
  statusBadge,
  buildJudgeHub,
  refreshJudgeHub,
  setThreadVisibility,
  submissionEmbed,
  entryDetailEmbed,
  archiveEntryEmbed,
};
