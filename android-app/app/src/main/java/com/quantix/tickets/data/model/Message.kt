package com.quantix.tickets.data.model

data class Message(
    val id: String,
    val content: String,
    val author: User,
    val timestamp: Long,
    val attachments: List<Attachment> = emptyList(),
    val embeds: List<Embed> = emptyList(),
    val isSystemMessage: Boolean = false
) {
    val formattedTime: String
        get() {
            val date = java.util.Date(timestamp)
            val format = java.text.SimpleDateFormat("dd.MM.yyyy HH:mm", java.util.Locale.GERMAN)
            return format.format(date)
        }

    val hasAttachments: Boolean
        get() = attachments.isNotEmpty()

    val hasEmbeds: Boolean
        get() = embeds.isNotEmpty()
}

data class Attachment(
    val id: String,
    val filename: String,
    val url: String,
    val proxyUrl: String,
    val size: Int,
    val contentType: String?
) {
    val isImage: Boolean
        get() = contentType?.startsWith("image/") == true

    val isPdf: Boolean
        get() = contentType == "application/pdf"

    val sizeInMB: String
        get() {
            val mb = size / (1024.0 * 1024.0)
            return String.format(java.util.Locale.GERMAN, "%.2f MB", mb)
        }
}

data class Embed(
    val title: String?,
    val description: String?,
    val color: Int?,
    val timestamp: String?,
    val footer: EmbedFooter?,
    val author: EmbedAuthor?,
    val fields: List<EmbedField> = emptyList()
)

data class EmbedFooter(
    val text: String,
    val iconUrl: String?
)

data class EmbedAuthor(
    val name: String,
    val iconUrl: String?,
    val url: String?
)

data class EmbedField(
    val name: String,
    val value: String,
    val inline: Boolean = false
)
