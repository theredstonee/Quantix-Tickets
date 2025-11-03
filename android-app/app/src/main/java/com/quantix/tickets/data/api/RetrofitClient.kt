package com.quantix.tickets.data.api

import android.content.Context
import android.content.SharedPreferences
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private const val BASE_URL = "https://trstickets.theredstonee.de/api/mobile/"
    private var apiService: ApiService? = null
    private lateinit var sharedPreferences: SharedPreferences

    fun initialize(context: Context) {
        sharedPreferences = context.getSharedPreferences("quantix_prefs", Context.MODE_PRIVATE)
    }

    fun getApiService(): ApiService {
        if (apiService == null) {
            apiService = createApiService()
        }
        return apiService!!
    }

    private fun createApiService(): ApiService {
        val okHttpClient = OkHttpClient.Builder()
            .addInterceptor(createAuthInterceptor())
            .addInterceptor(createLoggingInterceptor())
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        return retrofit.create(ApiService::class.java)
    }

    private fun createAuthInterceptor(): Interceptor {
        return Interceptor { chain ->
            val originalRequest = chain.request()
            val requestBuilder = originalRequest.newBuilder()

            // Add session cookies from SharedPreferences
            val cookies = getCookies()
            if (cookies.isNotEmpty()) {
                requestBuilder.addHeader("Cookie", cookies.joinToString("; "))
            }

            // Add User-Agent
            requestBuilder.addHeader("User-Agent", "QuantixTicketsApp/1.0")

            val request = requestBuilder.build()
            chain.proceed(request)
        }
    }

    private fun createLoggingInterceptor(): HttpLoggingInterceptor {
        val logging = HttpLoggingInterceptor()
        logging.level = HttpLoggingInterceptor.Level.BODY
        return logging
    }

    private fun getCookies(): List<String> {
        if (!::sharedPreferences.isInitialized) {
            return emptyList()
        }
        val cookieSet = sharedPreferences.getStringSet("session_cookies", emptySet()) ?: emptySet()
        return cookieSet.toList()
    }

    fun clearCache() {
        apiService = null
    }

    fun isLoggedIn(): Boolean {
        if (!::sharedPreferences.isInitialized) {
            return false
        }
        return sharedPreferences.getBoolean("is_logged_in", false)
    }

    fun getUserId(): String? {
        if (!::sharedPreferences.isInitialized) {
            return null
        }
        return sharedPreferences.getString("user_id", null)
    }

    fun getUsername(): String? {
        if (!::sharedPreferences.isInitialized) {
            return null
        }
        return sharedPreferences.getString("user_username", null)
    }
}
