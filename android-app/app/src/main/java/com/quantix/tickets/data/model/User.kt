package com.quantix.tickets.data.model

data class User(
    val id: String,
    val username: String,
    val discriminator: String,
    val avatar: String?,
    val email: String? = null
) {
    val displayName: String
        get() = "$username#$discriminator"

    val avatarUrl: String
        get() = avatar ?: "https://cdn.discordapp.com/embed/avatars/0.png"
}
