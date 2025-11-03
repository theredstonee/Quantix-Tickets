package com.quantix.tickets

import android.app.Application
import com.bumptech.glide.Glide
import com.bumptech.glide.GlideBuilder
import com.bumptech.glide.load.DecodeFormat
import com.bumptech.glide.request.RequestOptions
import com.quantix.tickets.data.api.RetrofitClient

class QuantixApplication : Application() {

    override fun onCreate() {
        super.onCreate()

        RetrofitClient.initialize(this)

        setupGlide()
    }

    private fun setupGlide() {
        Glide.init(this, GlideBuilder().apply {
            setDefaultRequestOptions(
                RequestOptions()
                    .format(DecodeFormat.PREFER_ARGB_8888)
                    .disallowHardwareConfig()
            )
        })
    }
}
