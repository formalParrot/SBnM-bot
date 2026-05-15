const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// --- Codename Generator --------------------------------------------------
const ADJECTIVES = [
  "Silver",
  "Golden",
  "Crimson",
  "Azure",
  "Jade",
  "Obsidian",
  "Amber",
  "Ivory",
  "Scarlet",
  "Cobalt",
  "Emerald",
  "Onyx",
  "Violet",
  "Sapphire",
  "Bronze",
  "Copper",
  "Maroon",
  "Teal",
  "Indigo",
  "Opal",
];
const NOUNS = [
  "Falcon",
  "Phoenix",
  "Dragon",
  "Raven",
  "Titan",
  "Specter",
  "Comet",
  "Vortex",
  "Cipher",
  "Phantom",
  "Nexus",
  "Prism",
  "Tempest",
  "Horizon",
  "Zenith",
  "Apex",
  "Eclipse",
  "Quasar",
  "Nebula",
  "Pulse",
];

function generateCodename() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj}-${noun}-${num}`;
}

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

// --- Phase transition buttons (admin only row) ---------------------------
// Shows only the valid next steps from the current phase
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

function phaseButtonRow(eventId, currentStatus) {
  const options = NEXT_PHASES[currentStatus] ?? [];
  if (!options.length) return null;
  const row = new ActionRowBuilder();
  for (const opt of options) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`phase_${opt.value}_${eventId}`)
        .setLabel(opt.label)
        .setStyle(opt.style),
    );
  }
  return row;
}

// --- Judge hub embed + per-entry View buttons + phase controls -----------
// rows: [{ sub, avg, scoreCount }]
function buildJudgeHub(eventName, eventId, rows, currentStatus) {
  const embed = new EmbedBuilder()
    .setTitle(`Judging — ${eventName}`)
    .setColor(0xe67e22)
    .addFields({
      name: "Phase",
      value: statusBadge(currentStatus),
      inline: true,
    })
    .setFooter({
      text: `Event ID: ${eventId} | Click an entry to view and score it`,
    })
    .setTimestamp();

  if (!rows.length) {
    embed.setDescription(
      "No submissions yet. Entries will appear here as they come in.",
    );
  } else {
    const lines = rows.map(({ sub, avg, scoreCount }) => {
      const scoreStr =
        scoreCount > 0
          ? `${avg}/10 (${scoreCount} score${scoreCount !== 1 ? "s" : ""})`
          : "unscored";
      return `**#${sub.entry_num}** \`${sub.codename}\` - ${sub.title} | ${scoreStr}`;
    });
    embed.setDescription(lines.join("\n"));
    embed.addFields({
      name: "Total Entries",
      value: `${rows.length}`,
      inline: true,
    });
  }

  const components = [];

  // Entry view buttons (max 25 across 5 rows)
  const visible = rows.slice(0, 25);
  for (let r = 0; r < Math.ceil(visible.length / 5); r++) {
    const actionRow = new ActionRowBuilder();
    for (const { sub } of visible.slice(r * 5, r * 5 + 5)) {
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`jview_${sub.id}`)
          .setLabel(`#${sub.entry_num} - ${sub.codename}`)
          .setStyle(ButtonStyle.Primary),
      );
    }
    components.push(actionRow);
  }

  // Controls row: phase transition + delete button (always shown if room available)
  if (components.length < 5) {
    const controlRow = new ActionRowBuilder();
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
  }

  return { embed, components };
}

// --- Rebuild and edit the pinned judge hub message -----------------------
async function refreshJudgeHub(guild, event, stmts) {
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
    );
    await message.edit({ embeds: [embed], components });
  } catch (err) {
    console.error("[refreshJudgeHub]", err.message);
  }
}

// --- Toggle judge thread visibility --------------------------------------
// called when entering/leaving judging phase
async function setThreadVisibility(
  guild,
  submissions,
  judgeRoleId,
  adminRoleId,
  visible,
) {
  for (const sub of submissions) {
    try {
      const thread = await guild.channels.fetch(sub.thread_id);
      if (!thread) continue;

      if (visible) {
        // Judging: add judges as members so they can view the private thread.
        // setLocked(true) already prevents non-moderators from sending — no
        // need for extra permission overwrites that can break visibility.
        if (judgeRoleId) {
          try {
            const allMembers = await guild.members.fetch();
            for (const [, m] of allMembers.filter((m) =>
              m.roles.cache.has(judgeRoleId),
            )) {
              await thread.members.add(m.id).catch(() => {});
            }
          } catch (_) {}
        }
        await thread.setLocked(true);
        await thread.setArchived(false);
      } else {
        // Back to submissions open: submitter can send, judges hidden
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
function submissionEmbed(event, codename, entryNum, title, desc) {
  return new EmbedBuilder()
    .setTitle("Submission Confirmed")
    .setColor(0x2ecc71)
    .addFields(
      { name: "Event", value: event.name, inline: true },
      { name: "Entry", value: `#${entryNum}`, inline: true },
      { name: "Codename", value: `\`${codename}\``, inline: true },
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
    .setTitle(`Entry #${sub.entry_num} - ${sub.codename}`)
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
      { name: "Codename", value: `\`${sub.codename}\``, inline: true },
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
  generateCodename,
  statusBadge,
  buildJudgeHub,
  refreshJudgeHub,
  setThreadVisibility,
  submissionEmbed,
  entryDetailEmbed,
  archiveEntryEmbed,
};
