package com.quantix.tickets.fcm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.quantix.tickets.MainActivity
import com.quantix.tickets.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class QuantixFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "QuantixFCM"
        private const val CHANNEL_ID_TICKETS = "quantix_tickets"
        private const val CHANNEL_ID_MESSAGES = "quantix_messages"
        private const val CHANNEL_ID_SYSTEM = "quantix_system"
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    /**
     * Called when a new FCM token is generated
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM Token: $token")

        // Save token locally
        saveTokenToPreferences(token)

        // Send token to backend
        sendTokenToServer(token)
    }

    /**
     * Called when a message is received
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        Log.d(TAG, "Message received from: ${remoteMessage.from}")

        // Check if message contains data payload
        if (remoteMessage.data.isNotEmpty()) {
            Log.d(TAG, "Message data: ${remoteMessage.data}")
            handleDataMessage(remoteMessage.data)
        }

        // Check if message contains notification payload
        remoteMessage.notification?.let {
            Log.d(TAG, "Notification: ${it.title} - ${it.body}")
            showNotification(
                title = it.title ?: "Quantix Tickets",
                body = it.body ?: "",
                type = remoteMessage.data["type"] ?: "system"
            )
        }
    }

    /**
     * Handle data payload messages
     */
    private fun handleDataMessage(data: Map<String, String>) {
        val type = data["type"] ?: return

        when (type) {
            "ticket_created" -> {
                val ticketId = data["ticketId"] ?: ""
                val topic = data["topic"] ?: ""
                showNotification(
                    title = "🎫 Neues Ticket",
                    body = "Ticket #$ticketId wurde erstellt: $topic",
                    type = "tickets",
                    data = data
                )
            }
            "ticket_message" -> {
                val ticketId = data["ticketId"] ?: ""
                val username = data["username"] ?: "Jemand"
                val message = data["message"] ?: ""
                showNotification(
                    title = "💬 Neue Nachricht in #$ticketId",
                    body = "$username: $message",
                    type = "messages",
                    data = data
                )
            }
            "ticket_claimed" -> {
                val ticketId = data["ticketId"] ?: ""
                val claimer = data["claimer"] ?: "Team-Mitglied"
                showNotification(
                    title = "👤 Ticket übernommen",
                    body = "$claimer hat Ticket #$ticketId übernommen",
                    type = "tickets",
                    data = data
                )
            }
            "ticket_closed" -> {
                val ticketId = data["ticketId"] ?: ""
                showNotification(
                    title = "✅ Ticket geschlossen",
                    body = "Ticket #$ticketId wurde geschlossen",
                    type = "tickets",
                    data = data
                )
            }
            "mention" -> {
                val ticketId = data["ticketId"] ?: ""
                val username = data["username"] ?: "Jemand"
                showNotification(
                    title = "📢 Du wurdest erwähnt",
                    body = "$username hat dich in Ticket #$ticketId erwähnt",
                    type = "messages",
                    data = data
                )
            }
            else -> {
                val title = data["title"] ?: "Quantix Tickets"
                val body = data["body"] ?: "Neue Benachrichtigung"
                showNotification(title, body, "system", data)
            }
        }
    }

    /**
     * Create notification channels for Android 8.0+
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Tickets Channel
            val ticketsChannel = NotificationChannel(
                CHANNEL_ID_TICKETS,
                "Tickets",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Benachrichtigungen über neue und aktualisierte Tickets"
                enableLights(true)
                lightColor = android.graphics.Color.parseColor("#6366F1")
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 250, 250, 250)
            }

            // Messages Channel
            val messagesChannel = NotificationChannel(
                CHANNEL_ID_MESSAGES,
                "Nachrichten",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Benachrichtigungen über neue Nachrichten in Tickets"
                enableLights(true)
                lightColor = android.graphics.Color.parseColor("#8B5CF6")
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 200, 100, 200)
            }

            // System Channel
            val systemChannel = NotificationChannel(
                CHANNEL_ID_SYSTEM,
                "System",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "System-Benachrichtigungen"
                enableLights(true)
                lightColor = android.graphics.Color.parseColor("#D946EF")
            }

            notificationManager.createNotificationChannel(ticketsChannel)
            notificationManager.createNotificationChannel(messagesChannel)
            notificationManager.createNotificationChannel(systemChannel)
        }
    }

    /**
     * Show notification with custom data
     */
    private fun showNotification(
        title: String,
        body: String,
        type: String,
        data: Map<String, String> = emptyMap()
    ) {
        val channelId = when (type) {
            "tickets" -> CHANNEL_ID_TICKETS
            "messages" -> CHANNEL_ID_MESSAGES
            else -> CHANNEL_ID_SYSTEM
        }

        // Intent to open app/specific ticket
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK

            // Add ticket data for deep linking
            data["ticketId"]?.let { putExtra("ticketId", it) }
            data["guildId"]?.let { putExtra("guildId", it) }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        // Notification sound
        val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        // Build notification
        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setColor(getColor(R.color.accent_primary))
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))

        // Show notification
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(System.currentTimeMillis().toInt(), notificationBuilder.build())
    }

    /**
     * Save FCM token to SharedPreferences
     */
    private fun saveTokenToPreferences(token: String) {
        val prefs = getSharedPreferences("quantix_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("fcm_token", token).apply()
        Log.d(TAG, "Token saved to preferences")
    }

    /**
     * Send FCM token to backend server
     */
    private fun sendTokenToServer(token: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // TODO: Implement API call to send token to backend
                Log.d(TAG, "Sending token to server: $token")

                // Example:
                // val response = apiService.registerFCMToken(token)
                // if (response.isSuccessful) {
                //     Log.d(TAG, "Token registered successfully")
                // }
            } catch (e: Exception) {
                Log.e(TAG, "Error sending token to server", e)
            }
        }
    }

    /**
     * Delete FCM token from server (on logout)
     */
    fun deleteTokenFromServer() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = getSharedPreferences("quantix_prefs", Context.MODE_PRIVATE)
                val token = prefs.getString("fcm_token", null)

                if (token != null) {
                    // TODO: Implement API call to delete token from backend
                    Log.d(TAG, "Deleting token from server: $token")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error deleting token from server", e)
            }
        }
    }
}
