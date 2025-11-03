package com.quantix.tickets.data.repository

import com.quantix.tickets.data.api.RetrofitClient
import com.quantix.tickets.data.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class TicketRepository {

    private val apiService = RetrofitClient.getApiService()

    suspend fun getTickets(guildId: String): Resource<List<Ticket>> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.getTickets(guildId)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        Resource.success(body.tickets)
                    } else {
                        Resource.error("Fehler beim Laden der Tickets")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    suspend fun getTicketDetail(guildId: String, ticketId: String): Resource<TicketDetail> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.getTicketDetail(guildId, ticketId)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        val detail = TicketDetail(
                            ticket = body.ticket,
                            messages = body.messages,
                            formResponses = body.formResponses,
                            permissions = body.permissions
                        )
                        Resource.success(detail)
                    } else {
                        Resource.error("Ticket nicht gefunden")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    suspend fun createTicket(
        guildId: String,
        topicId: String,
        formResponses: Map<String, String>
    ): Resource<Ticket> {
        return withContext(Dispatchers.IO) {
            try {
                val request = CreateTicketRequest(topicId, formResponses)
                val response = apiService.createTicket(guildId, request)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success && body.ticket != null) {
                        Resource.success(body.ticket)
                    } else {
                        Resource.error(body.message ?: "Fehler beim Erstellen des Tickets")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    suspend fun sendMessage(
        guildId: String,
        ticketId: String,
        content: String
    ): Resource<Message> {
        return withContext(Dispatchers.IO) {
            try {
                val request = SendMessageRequest(content)
                val response = apiService.sendMessage(guildId, ticketId, request)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success && body.message != null) {
                        Resource.success(body.message)
                    } else {
                        Resource.error(body.error ?: "Fehler beim Senden der Nachricht")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    suspend fun closeTicket(guildId: String, ticketId: String): Resource<String> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.closeTicket(guildId, ticketId)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        Resource.success(body.message ?: "Ticket erfolgreich geschlossen")
                    } else {
                        Resource.error(body.message ?: "Fehler beim Schließen des Tickets")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    suspend fun getTopics(guildId: String): Resource<List<Topic>> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.getTopics(guildId)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        Resource.success(body.topics)
                    } else {
                        Resource.error("Fehler beim Laden der Themen")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }
}
