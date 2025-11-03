package com.quantix.tickets.data.api

import com.quantix.tickets.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

    @GET("user/me")
    suspend fun getCurrentUser(): Response<UserResponse>

    @GET("servers")
    suspend fun getServers(): Response<ServersResponse>

    @GET("tickets/{guildId}")
    suspend fun getTickets(
        @Path("guildId") guildId: String
    ): Response<TicketsResponse>

    @GET("ticket/{guildId}/{ticketId}")
    suspend fun getTicketDetail(
        @Path("guildId") guildId: String,
        @Path("ticketId") ticketId: String
    ): Response<TicketDetailResponse>

    @POST("ticket/{guildId}/create")
    suspend fun createTicket(
        @Path("guildId") guildId: String,
        @Body request: CreateTicketRequest
    ): Response<CreateTicketResponse>

    @POST("ticket/{guildId}/{ticketId}/message")
    suspend fun sendMessage(
        @Path("guildId") guildId: String,
        @Path("ticketId") ticketId: String,
        @Body request: SendMessageRequest
    ): Response<SendMessageResponse>

    @POST("ticket/{guildId}/{ticketId}/close")
    suspend fun closeTicket(
        @Path("guildId") guildId: String,
        @Path("ticketId") ticketId: String
    ): Response<CloseTicketResponse>

    @GET("topics/{guildId}")
    suspend fun getTopics(
        @Path("guildId") guildId: String
    ): Response<TopicsResponse>

    @POST("fcm/register")
    suspend fun registerFCMToken(
        @Body request: RegisterFCMRequest
    ): Response<RegisterFCMResponse>

    @DELETE("fcm/unregister")
    suspend fun unregisterFCMToken(
        @Query("userId") userId: String
    ): Response<RegisterFCMResponse>
}
