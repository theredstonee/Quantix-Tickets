package com.quantix.tickets.data.model

data class Ticket(
    val id: String,
    val ticketId: Int,
    val topic: String,
    val priority: Int = 0,
    val status: String = "open",
    val createdAt: Long,
    val closedAt: Long? = null,
    val creator: User?,
    val claimer: User? = null,
    val lastMessage: Message? = null,
    val unreadCount: Int = 0,
    val rating: TicketRating? = null
) {
    val priorityColor: Int
        get() = when (priority) {
            0 -> android.graphics.Color.parseColor("#10B981") // Green
            1 -> android.graphics.Color.parseColor("#F59E0B") // Orange
            2 -> android.graphics.Color.parseColor("#EF4444") // Red
            else -> android.graphics.Color.parseColor("#6B7280") // Gray
        }

    val priorityEmoji: String
        get() = when (priority) {
            0 -> "🟢"
            1 -> "🟠"
            2 -> "🔴"
            else -> "⚪"
        }

    val statusEmoji: String
        get() = when (status) {
            "open" -> "📂"
            "closed" -> "✅"
            "claimed" -> "🔒"
            else -> "❓"
        }

    val isOpen: Boolean
        get() = status == "open"

    val isClosed: Boolean
        get() = status == "closed"
}

data class TicketRating(
    val rating: Int,
    val feedback: String? = null,
    val timestamp: Long
)

data class TicketDetail(
    val ticket: Ticket,
    val messages: List<Message>,
    val formResponses: List<FormResponse>,
    val permissions: TicketPermissions
)

data class FormResponse(
    val label: String,
    val value: String
)

data class TicketPermissions(
    val canClose: Boolean,
    val canClaim: Boolean,
    val canUnclaim: Boolean,
    val canSendMessage: Boolean
)
