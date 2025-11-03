package com.quantix.tickets.data.model

data class Server(
    val id: String,
    val name: String,
    val icon: String?,
    val memberCount: Int,
    val isAdmin: Boolean,
    val hasBot: Boolean
) {
    val iconUrl: String
        get() = if (icon != null) {
            "https://cdn.discordapp.com/icons/$id/$icon.png?size=128"
        } else {
            "https://cdn.discordapp.com/embed/avatars/0.png"
        }

    val displayName: String
        get() = name

    val memberCountText: String
        get() = "$memberCount Mitglieder"
}

data class ServerDetail(
    val server: Server,
    val ticketCount: Int,
    val openTicketCount: Int,
    val closedTicketCount: Int,
    val topics: List<Topic>,
    val config: ServerConfig
)

data class ServerConfig(
    val language: String,
    val premiumTier: String,
    val ticketRatingEnabled: Boolean,
    val slaEnabled: Boolean,
    val autoAssignmentEnabled: Boolean
)
