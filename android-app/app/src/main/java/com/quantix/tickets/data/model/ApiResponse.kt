package com.quantix.tickets.data.model

data class ApiResponse<T>(
    val success: Boolean,
    val data: T? = null,
    val message: String? = null,
    val error: String? = null
) {
    val isSuccess: Boolean
        get() = success && data != null

    val isError: Boolean
        get() = !success || error != null
}

data class UserResponse(
    val success: Boolean,
    val user: User
)

data class ServersResponse(
    val success: Boolean,
    val servers: List<Server>
)

data class TicketsResponse(
    val success: Boolean,
    val tickets: List<Ticket>
)

data class TicketDetailResponse(
    val success: Boolean,
    val ticket: Ticket,
    val messages: List<Message>,
    val formResponses: List<FormResponse>,
    val permissions: TicketPermissions
)

data class TopicsResponse(
    val success: Boolean,
    val topics: List<Topic>
)

data class CreateTicketRequest(
    val topicId: String,
    val formResponses: Map<String, String>
)

data class CreateTicketResponse(
    val success: Boolean,
    val ticket: Ticket?,
    val channelId: String?,
    val message: String?
)

data class SendMessageRequest(
    val content: String
)

data class SendMessageResponse(
    val success: Boolean,
    val message: Message?,
    val error: String?
)

data class CloseTicketResponse(
    val success: Boolean,
    val message: String?
)

data class RegisterFCMRequest(
    val token: String,
    val userId: String
)

data class RegisterFCMResponse(
    val success: Boolean,
    val message: String?
)

data class ErrorResponse(
    val success: Boolean = false,
    val error: String,
    val message: String? = null
)
