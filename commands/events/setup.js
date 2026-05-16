const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { stmts } = require("../../db");
const { buildJudgeHub, statusBadge } = require("../../utils/helpers");

function isAdmin(member) {
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  return (
    member.permissions.has("Administrator") ||
    (adminRoleId && member.roles.cache.has(adminRoleId))
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("event-setup")
    .setDescription("Create a new event with all channels and structure")
    .addStringOption((o) =>
      o.setName("name").setDescription("Event name").setRequired(true),
    ),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const name = interaction.options.getString("name");
    const description = interaction.options.getString("description") ?? "";
    const guild = interaction.guild;
    const judgeRoleId = process.env.JUDGE_ROLE_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;

    // Category
    const category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
    });

    // Submission channel - everyone can read, no one can send (except the bot)
    const subChannel = await guild.channels.create({
      name: "submit",
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages],
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ],
    });

    // Judging channel - only judges/admins can view, nobody can type (bot uses edit not send)
    const judgeOverwrites = [
      {
        id: guild.id,
        deny: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      },
    ];
    if (judgeRoleId)
      judgeOverwrites.push({
        id: judgeRoleId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      });
    if (adminRoleId)
      judgeOverwrites.push({
        id: adminRoleId,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      });
    const judgeChannel = await guild.channels.create({
      name: "judging",
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: judgeOverwrites,
    });

    // Results - read only for everyone (except the bot, which posts results on archive)
    const resultsChannel = await guild.channels.create({
      name: "results",
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          allow: [PermissionFlagsBits.ViewChannel],
          deny: [PermissionFlagsBits.SendMessages],
        },
        {
          id: interaction.client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
      ],
    });

    // Store event
    const { lastInsertRowid: eventId } = stmts.insertEvent.run({
      guild_id: guild.id,
      name,
      description,
      category_id: category.id,
      submission_channel_id: subChannel.id,
      results_channel_id: resultsChannel.id,
      judge_channel_id: judgeChannel.id,
    });

    // Submission channel embed + buttons
    const subEmbed = new EmbedBuilder()
      .setTitle(name)
      .setColor(0x5865f2)
      .addFields(
        { name: "Results", value: `<#${resultsChannel.id}>`, inline: true },
        {
          name: "How to Submit",
          value:
            "1. Click Submit below\n2. Fill submission details in\n3. Upload files + Additional info in **private thread**",
        },
      )
      .setFooter({ text: `Event ID: ${eventId}` })
      .setTimestamp();

    const subRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`event_submit_${eventId}`)
        .setLabel("Submit")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`event_status_${eventId}`)
        .setLabel("Event Status")
        .setStyle(ButtonStyle.Secondary),
    );
    await subChannel.send({ embeds: [subEmbed], components: [subRow] });

    // Judge hub - initial embed (no entries yet) + phase control buttons for admins
    const { embed: hubEmbed, components: hubComponents } = buildJudgeHub(
      name,
      eventId,
      [],
      "submissions_open",
    );
    const hubMsg = await judgeChannel.send({
      embeds: [hubEmbed],
      components: hubComponents,
    });
    stmts.setJudgeHubMessage.run(hubMsg.id, eventId);

    await interaction.editReply(
      `Event **${name}** created. Submission channel: <#${subChannel.id}>.\nTemplate for the task description:\`\`\`
## <Task Name>

<Task Description>

:date: **Competition Ends**: < I suggest pinging @time, and it will make a timestamp that changes in timezones. >

:envelope: **Submit your builds** via the button above ^^

:green_book: **Rules**:
  :x: No stolen builds
  :x: No inappropriate builds

:thinking: **Any questions?**
<Question channel has to be set up, and link pasted here>

<Cheerful message> :tada:
      \`\`\`
      `,
    );
  },
};
