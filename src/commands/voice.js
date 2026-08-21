const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { languages } = require('../utils/languages');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('voice')
    .setDescription('Voice translation between two languages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(sub => sub
      .setName('join')
      .setDescription('Join voice channel and translate between two languages')
      .addStringOption(opt => opt
        .setName('lang1')
        .setDescription('First language (e.g. ko)')
        .setRequired(true)
        .setAutocomplete(true))
      .addStringOption(opt => opt
        .setName('lang2')
        .setDescription('Second language (e.g. en)')
        .setRequired(true)
        .setAutocomplete(true)))
    .addSubcommand(sub => sub
      .setName('leave')
      .setDescription('Leave voice channel'))
    .addSubcommand(sub => sub
      .setName('langs')
      .setDescription('Change language pair without leaving')
      .addStringOption(opt => opt
        .setName('lang1')
        .setDescription('First language')
        .setRequired(true)
        .setAutocomplete(true))
      .addStringOption(opt => opt
        .setName('lang2')
        .setDescription('Second language')
        .setRequired(true)
        .setAutocomplete(true))),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = Object.entries(languages)
      .filter(([code, name]) => code.includes(focused) || name.toLowerCase().includes(focused))
      .slice(0, 25)
      .map(([code, name]) => ({ name: `${name} (${code})`, value: code }));
    await interaction.respond(matches);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const voiceManager = interaction.client.voiceManager;

    if (sub === 'leave') {
      voiceManager.disconnect(interaction.guildId);
      return interaction.reply({ content: 'Left voice channel.', flags: MessageFlags.Ephemeral });
    }

    const lang1 = interaction.options.getString('lang1');
    const lang2 = interaction.options.getString('lang2');

    if (!languages[lang1]) {
      return interaction.reply({ content: `Unsupported language: \`${lang1}\``, flags: MessageFlags.Ephemeral });
    }
    if (!languages[lang2]) {
      return interaction.reply({ content: `Unsupported language: \`${lang2}\``, flags: MessageFlags.Ephemeral });
    }
    if (lang1 === lang2) {
      return interaction.reply({ content: 'Both languages are the same.', flags: MessageFlags.Ephemeral });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      return interaction.reply({ content: 'You must be in a voice channel.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();

    try {
      await voiceManager.join({
        guildId: interaction.guildId,
        channelId: voiceChannel.id,
        lang1,
        lang2,
      });

      const n1 = languages[lang1] || lang1;
      const n2 = languages[lang2] || lang2;
      await interaction.editReply(
        `Joined **${voiceChannel.name}**. Translating **${n1}** (${lang1}) <-> **${n2}** (${lang2}). Use \`/voice leave\` to disconnect.`
      );
    } catch (e) {
      console.error('[VOICE] Join error:', e.message);
      await interaction.editReply('Failed to join voice channel.');
    }
  },
};
