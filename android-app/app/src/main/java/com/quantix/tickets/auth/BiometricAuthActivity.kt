package com.quantix.tickets.auth

import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import com.quantix.tickets.MainActivity
import com.quantix.tickets.R
import java.util.concurrent.Executor

class BiometricAuthActivity : AppCompatActivity() {

    private lateinit var executor: Executor
    private lateinit var biometricPrompt: BiometricPrompt
    private lateinit var promptInfo: BiometricPrompt.PromptInfo

    private lateinit var logoImageView: ImageView
    private lateinit var titleTextView: TextView
    private lateinit var subtitleTextView: TextView
    private lateinit var biometricButton: Button
    private lateinit var skipButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_biometric_auth)

        // Initialize views
        logoImageView = findViewById(R.id.logoImageView)
        titleTextView = findViewById(R.id.titleTextView)
        subtitleTextView = findViewById(R.id.subtitleTextView)
        biometricButton = findViewById(R.id.biometricButton)
        skipButton = findViewById(R.id.skipButton)

        // Check if user is logged in with Discord
        if (!isLoggedIn()) {
            navigateToLogin()
            return
        }

        // Check if already authenticated via biometric
        if (isAuthenticated()) {
            navigateToMain()
            return
        }

        // Check biometric availability
        val biometricManager = BiometricManager.from(this)
        when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL)) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                setupBiometricAuth()
            }
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> {
                subtitleTextView.text = "Biometrische Authentifizierung nicht verfügbar"
                biometricButton.isEnabled = false
                skipButton.text = "Fortfahren"
            }
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> {
                subtitleTextView.text = "Biometrie momentan nicht verfügbar"
                biometricButton.isEnabled = false
            }
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> {
                subtitleTextView.text = "Keine biometrischen Daten hinterlegt"
                biometricButton.isEnabled = false
                skipButton.text = "Fortfahren"
            }
        }

        // Button listeners
        biometricButton.setOnClickListener {
            biometricPrompt.authenticate(promptInfo)
        }

        skipButton.setOnClickListener {
            // Skip for now, but show again next time
            setSkippedOnce(true)
            navigateToMain()
        }

        // Auto-show biometric prompt if available
        if (biometricButton.isEnabled && !getSkippedOnce()) {
            biometricPrompt.authenticate(promptInfo)
        }
    }

    private fun setupBiometricAuth() {
        executor = ContextCompat.getMainExecutor(this)

        biometricPrompt = BiometricPrompt(this, executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    super.onAuthenticationError(errorCode, errString)

                    when (errorCode) {
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_CANCELED -> {
                            // User cancelled, allow them to skip
                            Toast.makeText(
                                applicationContext,
                                "Authentifizierung abgebrochen",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                        BiometricPrompt.ERROR_LOCKOUT,
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> {
                            Toast.makeText(
                                applicationContext,
                                "Zu viele Versuche. Bitte später erneut versuchen.",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                        else -> {
                            Toast.makeText(
                                applicationContext,
                                "Authentifizierung fehlgeschlagen: $errString",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }

                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    super.onAuthenticationSucceeded(result)

                    Toast.makeText(
                        applicationContext,
                        "✅ Authentifizierung erfolgreich!",
                        Toast.LENGTH_SHORT
                    ).show()

                    // Save authentication state
                    setAuthenticated(true)
                    setSkippedOnce(false)

                    // Navigate to main activity
                    navigateToMain()
                }

                override fun onAuthenticationFailed() {
                    super.onAuthenticationFailed()
                    Toast.makeText(
                        applicationContext,
                        "Authentifizierung fehlgeschlagen",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            })

        promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Quantix Tickets")
            .setSubtitle("Authentifizierung erforderlich")
            .setDescription("Verwenden Sie Ihren Fingerabdruck, Face ID oder Geräte-PIN")
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()
    }

    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
        finish()
    }

    private fun navigateToLogin() {
        val intent = Intent(this, DiscordLoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    private fun isLoggedIn(): Boolean {
        val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
        return prefs.getBoolean("is_logged_in", false)
    }

    private fun isAuthenticated(): Boolean {
        val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
        return prefs.getBoolean("is_authenticated", false)
    }

    private fun setAuthenticated(authenticated: Boolean) {
        val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
        prefs.edit().putBoolean("is_authenticated", authenticated).apply()
    }

    private fun getSkippedOnce(): Boolean {
        val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
        return prefs.getBoolean("skipped_once", false)
    }

    private fun setSkippedOnce(skipped: Boolean) {
        val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
        prefs.edit().putBoolean("skipped_once", skipped).apply()
    }

    override fun onBackPressed() {
        // Prevent going back without authentication
        // User must either authenticate or skip
    }
}
