const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { loadTickets, saveTickets } = require('../helpers');
const { isPremium } = require('../premium');
const { t } = require('../translations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forward')
    .setDescription('Forward a ticket to another team member')
    .setDescriptionLocalizations({
      de: 'Leite ein Ticket an ein anderes Team-Mitglied weiter'
    })
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to forward the ticket to')
        .setDescriptionLocalizations({
          de: 'Der Benutzer, an den das Ticket weitergeleitet werden soll'
        })
        .setRequired(true)),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const targetUser = interaction.options.getUser('user');

      // Check if Pro feature
      const premiumInfo = isPremium(guildId, 'pro');
      if (!premiumInfo) {
        return interaction.reply({
          content: '⚠️ **Premium Feature**\n\nDie Ticket-Weiterleitung ist ein Pro-Feature. Upgrade auf Pro, um diese Funktion zu nutzen!\n\nhttps://quantixtickets.theredstonee.de/premium',
          ephemeral: true
        });
      }

      // Load tickets
      const tickets = loadTickets(guildId);
      const ticket = tickets.find(t => t.channelId === interaction.channel.id);

      if (!ticket) {
        return interaction.reply({
          content: '❌ Dieser Channel ist kein aktives Ticket.',
          ephemeral: true
        });
      }

      if (ticket.closed) {
        return interaction.reply({
          content: '❌ Dieses Ticket ist bereits geschlossen.',
          ephemeral: true
        });
      }

      // Check if user is the claimer
      if (ticket.claimedBy !== interaction.user.id) {
        return interaction.reply({
          content: '❌ Nur der aktuelle Claimer kann dieses Ticket weiterleiten.',
          ephemeral: true
        });
      }

      // Check if ticket is claimed
      if (!ticket.claimedBy) {
        return interaction.reply({
          content: '❌ Dieses Ticket muss zuerst geclaimed werden.',
          ephemeral: true
        });
      }

      // Check if target user is not the same as current claimer
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({
          content: '❌ Du kannst das Ticket nicht an dich selbst weiterleiten.',
          ephemeral: true
        });
      }

      // Check if target user is not the ticket creator
      if (targetUser.id === ticket.userId) {
        return interaction.reply({
          content: '❌ Du kannst das Ticket nicht an den Ticket-Ersteller weiterleiten.',
          ephemeral: true
        });
      }

      // Check if target user is a bot
      if (targetUser.bot) {
        return interaction.reply({
          content: '❌ Du kannst das Ticket nicht an einen Bot weiterleiten.',
          ephemeral: true
        });
      }

      // Show modal for reason input
      const modal = new ModalBuilder()
        .setCustomId(`forward_modal_${targetUser.id}`)
        .setTitle('Ticket weiterleiten');

      const reasonInput = new TextInputBuilder()
        .setCustomId('forward_reason')
        .setLabel('Grund für die Weiterleitung')
        .setPlaceholder('Bitte gib den Grund für die Weiterleitung ein...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(500);

      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);

      await interaction.showModal(modal);

      // Wait for modal submission
      const filter = (i) => i.customId === `forward_modal_${targetUser.id}` && i.user.id === interaction.user.id;

      try {
        const modalSubmit = await interaction.awaitModalSubmit({ filter, time: 300000 });
        const reason = modalSubmit.fields.getTextInputValue('forward_reason');

        // Defer reply to modal
        await modalSubmit.deferReply({ ephemeral: true });

        // Create forward embed
      const forwardEmbed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle('📨 Ticket-Weiterleitung')
        .setDescription(`**${interaction.user.tag}** möchte dieses Ticket an dich weiterleiten.`)
        .addFields(
          {
            name: '📋 Ticket-ID',
            value: `\`#${ticket.ticketId}\``,
            inline: true
          },
          {
            name: '📂 Kategorie',
            value: ticket.topic || 'Unbekannt',
            inline: true
          },
          {
            name: '👤 Ersteller',
            value: `<@${ticket.userId}>`,
            inline: true
          },
          {
            name: '📝 Grund der Weiterleitung',
            value: `> ${reason}`,
            inline: false
          },
          {
            name: 'ℹ️ Hinweis',
            value: 'Durch das Annehmen übernimmst du die Verantwortung für dieses Ticket und wirst zum neuen Claimer.',
            inline: false
          }
        )
        .setFooter({
          text: 'Quantix Tickets • Pro Feature',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      // Create buttons
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`forward_accept_${targetUser.id}_${interaction.user.id}`)
          .setLabel('Annehmen')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`forward_decline_${targetUser.id}_${interaction.user.id}`)
          .setLabel('Ablehnen')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger)
      );

        // Send message with ping and embed
        const forwardMessage = await interaction.channel.send({
          content: `<@${targetUser.id}>`,
          embeds: [forwardEmbed],
          components: [buttons]
        });

        await modalSubmit.editReply({
          content: `✅ Ticket-Weiterleitung an ${targetUser} wurde gesendet.`
        });

        // Create collector for button interactions
        const collector = forwardMessage.createMessageComponentCollector({
          filter: i => i.customId.startsWith('forward_'),
          time: 86400000 // 24 hours
        });

        collector.on('collect', async i => {
          try {
            // Extract user ID from customId
            const [action, type, allowedUserId, originalClaimerId] = i.customId.split('_');

            // Check if the user clicking is the target user
            if (i.user.id !== allowedUserId) {
              return i.reply({
                content: '❌ Nur der angegebene Benutzer kann auf diese Buttons klicken.',
                ephemeral: true
              });
            }

            // Load fresh ticket data
            const currentTickets = loadTickets(guildId);
            const currentTicket = currentTickets.find(t => t.channelId === interaction.channel.id);

            if (!currentTicket) {
              return i.reply({
                content: '❌ Ticket wurde nicht gefunden.',
                ephemeral: true
              });
            }

            if (type === 'accept') {
              // Transfer claim to new user
              currentTicket.claimedBy = allowedUserId;
              currentTicket.claimedAt = new Date().toISOString();
              saveTickets(guildId, currentTickets);

              // Update channel permissions
              const channel = interaction.channel;
              const cfg = require('../helpers').readCfg(guildId);

              // Remove old claimer permissions
              try {
                await channel.permissionOverwrites.edit(originalClaimerId, {
                  ViewChannel: false,
                  SendMessages: false
                });
              } catch (err) {
                console.error('Error removing old claimer permissions:', err);
              }

              // Add new claimer permissions
              try {
                await channel.permissionOverwrites.edit(allowedUserId, {
                  ViewChannel: true,
                  SendMessages: true,
                  ReadMessageHistory: true,
                  AttachFiles: true,
                  EmbedLinks: true
                });
              } catch (err) {
                console.error('Error adding new claimer permissions:', err);
              }

              // Update embed to show acceptance
              const acceptedEmbed = EmbedBuilder.from(forwardEmbed)
                .setColor(0x00ff88)
                .setTitle('✅ Ticket-Weiterleitung angenommen')
                .setDescription(`**${i.user.tag}** hat die Weiterleitung angenommen und ist jetzt der neue Claimer.`);

              await forwardMessage.edit({
                embeds: [acceptedEmbed],
                components: []
              });

              await i.reply({
                content: `✅ Du hast das Ticket **#${currentTicket.ticketId}** erfolgreich übernommen!`,
                ephemeral: true
              });

              // Log event
              const { logEvent } = require('../helpers');
              await logEvent(interaction.guild, `📨 Ticket **#${currentTicket.ticketId}** wurde von <@${originalClaimerId}> an <@${allowedUserId}> weitergeleitet.\n**Grund:** ${reason}`);

              collector.stop();
            } else if (type === 'decline') {
              // Update embed to show decline
              const declinedEmbed = EmbedBuilder.from(forwardEmbed)
                .setColor(0xe74c3c)
                .setTitle('❌ Ticket-Weiterleitung abgelehnt')
                .setDescription(`**${i.user.tag}** hat die Weiterleitung abgelehnt.`);

              await forwardMessage.edit({
                embeds: [declinedEmbed],
                components: []
              });

              await i.reply({
                content: '❌ Du hast die Ticket-Weiterleitung abgelehnt.',
                ephemeral: true
              });

              collector.stop();
            }
          } catch (err) {
            console.error('Error handling forward button:', err);
            await i.reply({
              content: '❌ Es ist ein Fehler aufgetreten.',
              ephemeral: true
            }).catch(() => {});
          }
        });

        collector.on('end', async (collected, reason) => {
          if (reason === 'time') {
            try {
              const timeoutEmbed = EmbedBuilder.from(forwardEmbed)
                .setColor(0x95a5a6)
                .setTitle('⏱️ Ticket-Weiterleitung abgelaufen')
                .setDescription('Die Weiterleitung wurde nicht rechtzeitig beantwortet und ist abgelaufen.');

              await forwardMessage.edit({
                embeds: [timeoutEmbed],
                components: []
              });
            } catch (err) {
              console.error('Error updating expired forward message:', err);
            }
          }
        });

      } catch (err) {
        // Modal timeout or error
        console.error('Modal submission error:', err);
        // User did not submit the modal in time
      }

    } catch (err) {
      console.error('Error in forward command:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Es ist ein Fehler aufgetreten.',
          ephemeral: true
        });
      }
    }
  }
};
