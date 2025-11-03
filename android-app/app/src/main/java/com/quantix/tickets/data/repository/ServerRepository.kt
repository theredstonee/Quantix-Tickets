package com.quantix.tickets.data.repository

import com.quantix.tickets.data.api.RetrofitClient
import com.quantix.tickets.data.model.Server
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ServerRepository {

    private val apiService = RetrofitClient.getApiService()

    suspend fun getServers(): Resource<List<Server>> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.getServers()
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        Resource.success(body.servers)
                    } else {
                        Resource.error("Fehler beim Laden der Server")
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
