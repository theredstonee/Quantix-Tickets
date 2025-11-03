package com.quantix.tickets.data.model

data class Topic(
    val id: String,
    val name: String,
    val emoji: String?,
    val description: String?,
    val priority: Int = 0,
    val formFields: List<FormField> = emptyList()
) {
    val displayName: String
        get() = if (emoji != null) "$emoji $name" else name

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

    val hasFormFields: Boolean
        get() = formFields.isNotEmpty()
}

data class FormField(
    val label: String,
    val placeholder: String,
    val required: Boolean,
    val style: String, // "short", "paragraph", "number"
    val minLength: Int? = null,
    val maxLength: Int? = null
) {
    val isShortAnswer: Boolean
        get() = style == "short"

    val isParagraph: Boolean
        get() = style == "paragraph"

    val isNumberOnly: Boolean
        get() = style == "number"

    val displayPlaceholder: String
        get() = if (isNumberOnly) {
            "$placeholder (Nur Zahlen)"
        } else {
            placeholder
        }
}
