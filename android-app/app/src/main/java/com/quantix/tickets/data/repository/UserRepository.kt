package com.quantix.tickets.data.repository

import com.quantix.tickets.data.api.RetrofitClient
import com.quantix.tickets.data.model.RegisterFCMRequest
import com.quantix.tickets.data.model.User
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class UserRepository {

    private val apiService = RetrofitClient.getApiService()

    suspend fun getCurrentUser(): Resource<User> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.getCurrentUser()
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        Resource.success(body.user)
                    } else {
                        Resource.error("Fehler beim Laden der Benutzerdaten")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    suspend fun registerFCMToken(token: String, userId: String): Resource<String> {
        return withContext(Dispatchers.IO) {
            try {
                val request = RegisterFCMRequest(token, userId)
                val response = apiService.registerFCMToken(request)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        Resource.success(body.message ?: "Token registriert")
                    } else {
                        Resource.error(body.message ?: "Fehler beim Registrieren des Tokens")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    suspend fun unregisterFCMToken(userId: String): Resource<String> {
        return withContext(Dispatchers.IO) {
            try {
                val response = apiService.unregisterFCMToken(userId)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        Resource.success(body.message ?: "Token entfernt")
                    } else {
                        Resource.error(body.message ?: "Fehler beim Entfernen des Tokens")
                    }
                } else {
                    Resource.error("Server-Fehler: ${response.code()}")
                }
            } catch (e: Exception) {
                Resource.error("Netzwerkfehler: ${e.message}")
            }
        }
    }

    fun isLoggedIn(): Boolean {
        return RetrofitClient.isLoggedIn()
    }

    fun getUserId(): String? {
        return RetrofitClient.getUserId()
    }

    fun getUsername(): String? {
        return RetrofitClient.getUsername()
    }
}
