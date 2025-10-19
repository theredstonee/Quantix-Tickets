const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { loadTickets, saveTickets, readCfg, logEvent } = require('../helpers');
const { isPremium } = require('../premium');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forward')
    .setDescription('Forward a ticket to another team member or role')
    .setDescriptionLocalizations({
      de: 'Leite ein Ticket an ein Team-Mitglied oder eine Rolle weiter'
    })
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to forward the ticket to')
        .setDescriptionLocalizations({
          de: 'Der Benutzer, an den das Ticket weitergeleitet werden soll'
        })
        .setRequired(false))
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role to forward the ticket to')
        .setDescriptionLocalizations({
          de: 'Die Rolle, an die das Ticket weitergeleitet werden soll'
        })
        .setRequired(false)),

  async execute(interaction) {
    try {
      const guildId = interaction.guild.id;
      const targetUser = interaction.options.getUser('user');
      const targetRole = interaction.options.getRole('role');

      // Check if at least one option is provided
      if (!targetUser && !targetRole) {
        return interaction.reply({
          content: '❌ Du musst entweder einen Benutzer oder eine Rolle angeben.',
          ephemeral: true
        });
      }

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

      // Check if ticket is claimed
      if (!ticket.claimer || ticket.claimer === '') {
        return interaction.reply({
          content: '❌ Dieses Ticket muss zuerst geclaimed werden.',
          ephemeral: true
        });
      }

      // Check if user is the claimer (convert both to string for comparison)
      if (String(ticket.claimer) !== String(interaction.user.id)) {
        return interaction.reply({
          content: `❌ Nur der aktuelle Claimer kann dieses Ticket weiterleiten.\n\nAktueller Claimer: <@${ticket.claimer}>\nDeine ID: ${interaction.user.id}`,
          ephemeral: true
        });
      }

      // Additional validations for user target
      if (targetUser) {
        if (targetUser.id === interaction.user.id) {
          return interaction.reply({
            content: '❌ Du kannst das Ticket nicht an dich selbst weiterleiten.',
            ephemeral: true
          });
        }

        if (targetUser.id === ticket.userId) {
          return interaction.reply({
            content: '❌ Du kannst das Ticket nicht an den Ticket-Ersteller weiterleiten.',
            ephemeral: true
          });
        }

        if (targetUser.bot) {
          return interaction.reply({
            content: '❌ Du kannst das Ticket nicht an einen Bot weiterleiten.',
            ephemeral: true
          });
        }
      }

      // Create unique ID for modal
      const targetId = targetUser ? targetUser.id : targetRole.id;
      const targetType = targetUser ? 'user' : 'role';
      const targetName = targetUser ? targetUser.tag : targetRole.name;

      // Show modal for reason input
      const modal = new ModalBuilder()
        .setCustomId(`forward_modal_${targetType}_${targetId}`)
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
      const filter = (i) => i.customId === `forward_modal_${targetType}_${targetId}` && i.user.id === interaction.user.id;

      try {
        const modalSubmit = await interaction.awaitModalSubmit({ filter, time: 300000 });
        const reason = modalSubmit.fields.getTextInputValue('forward_reason');

        // Defer reply to modal
        await modalSubmit.deferReply({ ephemeral: true });

        // Get claimer name
        let claimerName = 'Unbekannt';
        try {
          const claimerMember = await interaction.guild.members.fetch(interaction.user.id);
          claimerName = claimerMember.user.tag;
        } catch (err) {
          console.error('Error fetching claimer:', err);
        }

        // Create forward embed
        const forwardEmbed = new EmbedBuilder()
          .setColor(0xf39c12)
          .setTitle('📨 Ticket-Weiterleitung')
          .setDescription(targetUser
            ? `**${claimerName}** möchte dieses Ticket an dich weiterleiten.`
            : `**${claimerName}** möchte dieses Ticket an die Rolle ${targetRole} weiterleiten.`)
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
              name: '👨‍💼 Aktueller Claimer',
              value: `<@${ticket.claimer}>`,
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

        // Create buttons with type and ID
        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`forward_accept_${targetType}_${targetId}_${interaction.user.id}`)
            .setLabel('Annehmen')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`forward_decline_${targetType}_${targetId}_${interaction.user.id}`)
            .setLabel('Ablehnen')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
        );

        // Send message with ping and embed
        const pingContent = targetUser ? `<@${targetUser.id}>` : `<@&${targetRole.id}>`;
        const forwardMessage = await interaction.channel.send({
          content: pingContent,
          embeds: [forwardEmbed],
          components: [buttons]
        });

        await modalSubmit.editReply({
          content: `✅ Ticket-Weiterleitung an ${targetUser ? `<@${targetUser.id}>` : `<@&${targetRole.id}>`} wurde gesendet.`
        });

        // Create collector for button interactions
        const collector = forwardMessage.createMessageComponentCollector({
          filter: i => i.customId.startsWith('forward_'),
          time: 86400000 // 24 hours
        });

        collector.on('collect', async i => {
          try {
            // Extract data from customId: forward_accept/decline_user/role_targetId_originalClaimerId
            const parts = i.customId.split('_');
            const action = parts[0]; // 'forward'
            const buttonType = parts[1]; // 'accept' or 'decline'
            const forwardType = parts[2]; // 'user' or 'role'
            const forwardTargetId = parts[3]; // user/role ID
            const originalClaimerId = parts[4]; // claimer ID

            // Validate user can click button
            if (forwardType === 'user') {
              // Only the specific user can click
              if (i.user.id !== forwardTargetId) {
                return i.reply({
                  content: '❌ Nur der angegebene Benutzer kann auf diese Buttons klicken.',
                  ephemeral: true
                });
              }
            } else if (forwardType === 'role') {
              // User must have the role
              const member = await interaction.guild.members.fetch(i.user.id);
              if (!member.roles.cache.has(forwardTargetId)) {
                return i.reply({
                  content: '❌ Nur Mitglieder mit der angegebenen Rolle können auf diese Buttons klicken.',
                  ephemeral: true
                });
              }
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

            if (buttonType === 'accept') {
              // Transfer claim to new user
              currentTicket.claimer = i.user.id;
              saveTickets(guildId, currentTickets);

              // Update channel permissions
              const channel = interaction.channel;
              const cfg = readCfg(guildId);

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
                await channel.permissionOverwrites.edit(i.user.id, {
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
              const logText = forwardType === 'user'
                ? `📨 Ticket **#${currentTicket.ticketId}** wurde von <@${originalClaimerId}> an <@${i.user.id}> weitergeleitet.\n**Grund:** ${reason}`
                : `📨 Ticket **#${currentTicket.ticketId}** wurde von <@${originalClaimerId}> an <@${i.user.id}> (via Rolle <@&${forwardTargetId}>) weitergeleitet.\n**Grund:** ${reason}`;

              await logEvent(interaction.guild, logText);

              collector.stop();
            } else if (buttonType === 'decline') {
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

        collector.on('end', async (collected, endReason) => {
          if (endReason === 'time') {
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
