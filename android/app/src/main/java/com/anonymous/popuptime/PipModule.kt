package com.anonymous.popuptime

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Rational
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class PipModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var mediaPlayer: MediaPlayer? = null
    init {
        instance = this
    }

    override fun getName(): String = "PipModule"

    companion object {
        private var instance: PipModule? = null

        fun onPipModeChanged(isInPip: Boolean) {
            instance?.handlePipModeChanged(isInPip)
        }
    }

    private val tickerHandler = Handler(Looper.getMainLooper())
    private val tickerRunnable = object : Runnable {
        override fun run() {
            try {
                if (reactContext.hasActiveReactInstance()) {
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("onPipTick", System.currentTimeMillis())
                }
            } catch (e: Exception) {}
            tickerHandler.postDelayed(this, 1000)
        }
    }

    private fun handlePipModeChanged(isInPip: Boolean) {
        if (isInPip) {
            startTicker()
        } else {
            stopTicker()
        }
        try {
            if (reactContext.hasActiveReactInstance()) {
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onPipModeChanged", isInPip)
            }
        } catch (e: Exception) {}
    }

    private fun startTicker() {
        tickerHandler.removeCallbacks(tickerRunnable)
        tickerHandler.post(tickerRunnable)
    }

    private fun stopTicker() {
        tickerHandler.removeCallbacks(tickerRunnable)
    }

    @ReactMethod
    fun enterPipMode(width: Int, height: Int, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            activity.runOnUiThread {
                try {
                    val safeW = if (width <= 0) 16 else width
                    val safeH = if (height <= 0) 9 else height
                    val ratio = safeW.toDouble() / safeH.toDouble()

                    // Android PiP strict ratio bounds: 1:2.39 (0.418) to 2.39:1 (2.390)
                    val rational = when {
                        ratio > 2.38 -> Rational(238, 100)
                        ratio < 0.42 -> Rational(42, 100)
                        else -> Rational(safeW, safeH)
                    }

                    val params = PictureInPictureParams.Builder()
                        .setAspectRatio(rational)
                        .build()

                    val entered = activity.enterPictureInPictureMode(params)
                    if (entered) {
                        startTicker()
                    }
                    promise.resolve(entered)
                } catch (e: Exception) {
                    promise.resolve(false)
                }
            }
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun isPipSupported(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val hasFeature = reactContext.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
            promise.resolve(hasFeature)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun playAlarmSound() {
        try {
            stopAlarmSound()
            var alertUri: Uri? = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            if (alertUri == null) {
                alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            }
            if (alertUri == null) {
                alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            }

            if (alertUri != null) {
                mediaPlayer = MediaPlayer().apply {
                    setDataSource(reactContext, alertUri)
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    isLooping = true
                    prepare()
                    start()
                }
            }
        } catch (e: Exception) {
            try {
                val fallbackUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                if (fallbackUri != null) {
                    mediaPlayer = MediaPlayer.create(reactContext, fallbackUri)?.apply {
                        isLooping = true
                        start()
                    }
                }
            } catch (e2: Exception) {}
        }
    }

    @ReactMethod
    fun stopAlarmSound() {
        try {
            mediaPlayer?.let {
                if (it.isPlaying) {
                    it.stop()
                }
                it.release()
            }
            mediaPlayer = null
        } catch (e: Exception) {}
    }
}
