package com.quantix.tickets.auth

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.quantix.tickets.MainActivity
import com.quantix.tickets.R

class DiscordLoginActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar

    // Web Panel URL (not direct Discord OAuth)
    private val baseUrl = "https://trstickets.theredstonee.de"
    private val loginUrl = "$baseUrl/login"

    companion object {
        private const val TAG = "DiscordLogin"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_discord_login)

        webView = findViewById(R.id.loginWebView)
        progressBar = findViewById(R.id.loginProgressBar)

        setupWebView()
        loadWebLogin()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        // Enable cookie management
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString QuantixTicketsApp/1.0"

            // Allow cookies
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
        }

        webView.webViewClient = object : WebViewClient() {

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url.toString()

                // Check if user successfully logged in
                if (url.contains("/select-server") || url.contains("/panel")) {
                    // Login successful! Save cookies and navigate to MainActivity
                    saveCookies()
                    navigateToMain()
                    return true
                }

                // Allow WebView to load the URL
                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE

                // Check if we're on a page that indicates successful login
                if (url?.contains("/select-server") == true || url?.contains("/panel") == true) {
                    saveCookies()
                    navigateToMain()
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                Toast.makeText(
                    this@DiscordLoginActivity,
                    "Fehler beim Laden der Login-Seite",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                super.onProgressChanged(view, newProgress)
                if (newProgress == 100) {
                    progressBar.visibility = View.GONE
                }
            }
        }
    }

    private fun loadWebLogin() {
        // Load the web panel login page
        webView.loadUrl(loginUrl)
    }

    private fun saveCookies() {
        val cookieManager = CookieManager.getInstance()
        val cookies = cookieManager.getCookie(baseUrl)

        if (cookies != null) {
            // Save cookies to SharedPreferences
            val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
            val editor = prefs.edit()

            // Parse and save individual cookies
            val cookieList = cookies.split(";").map { it.trim() }
            val cookieSet = cookieList.toSet()

            editor.putStringSet("session_cookies", cookieSet)
            editor.putBoolean("is_logged_in", true)
            editor.putLong("login_timestamp", System.currentTimeMillis())
            editor.apply()

            // Also save cookies for Retrofit
            cookieManager.flush()
        }
    }

    private fun navigateToMain() {
        // Mark as logged in
        val prefs = getSharedPreferences("quantix_prefs", MODE_PRIVATE)
        prefs.edit().apply {
            putBoolean("is_logged_in", true)
            apply()
        }

        // Navigate to MainActivity
        val intent = Intent(this, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
