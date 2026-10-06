package com.ultratv.tv.nativeapp.data.license

import android.content.Context
import android.os.Build
import android.util.Base64
import com.ultratv.tv.nativeapp.BuildConfig
import com.ultratv.tv.nativeapp.data.config.KeystoreTokenCipher
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Annonce du revendeur, ou rappel automatique (`kind = "renewal"`, texte traduit par l'app à partir de `until`). */
data class Announcement(val id: String, val title: String, val body: String, val at: Long, val read: Boolean, val kind: String = "message", val until: Long? = null, val category: String = "info")

/** Nombre d'annonces non lues (pastille du menu « Abonnement »), partagé entre la porte de licence et l'écran. */
object InboxBus {
    val unread = kotlinx.coroutines.flow.MutableStateFlow(0)
}

/**
 * Licence de l'édition Pro : enregistrement de l'appareil (code + essai), statut signé, boîte de réception.
 * Le secret d'installation est chiffré par l'AndroidKeyStore ; le dernier statut signé est gardé pour le hors ligne.
 */
@Singleton
class LicenseClient @Inject constructor(@ApplicationContext private val ctx: Context) {
    private val prefs = ctx.getSharedPreferences("pro_license", Context.MODE_PRIVATE)
    private val cipher = KeystoreTokenCipher("ultratv_pro_install_v1")
    private val http = OkHttpClient.Builder().connectTimeout(10, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()
    private val base = BuildConfig.LICENSE_URL.trimEnd('/')

    val enabled: Boolean get() = BuildConfig.EDITION == "pro"

    private fun secret(): String? = prefs.getString("secret", null)?.let { b ->
        runCatching { String(cipher.decrypt(Base64.decode(b, Base64.NO_WRAP)), Charsets.UTF_8) }.getOrNull()
    }

    fun code(): String? = prefs.getString("code", null)

    /** Dernier statut signé connu (vérifié à nouveau à chaque lecture). */
    fun cached(): LicensePayload? {
        val p = prefs.getString("payload", null) ?: return null
        val s = prefs.getString("sig", null) ?: return null
        return LicenseLogic.verify(p, s, BuildConfig.LICENSE_PUBKEY)
    }

    private fun ensureRegistered(): String {
        secret()?.let { return it }
        val body = JSONObject()
            .put("platform", if (ctx.packageManager.hasSystemFeature("android.software.leanback")) "android-tv" else "android")
            .put("model", "${Build.MANUFACTURER} ${Build.MODEL}".take(64))
            .put("appVersion", BuildConfig.VERSION_NAME)
            .toString()
        val req = Request.Builder().url("$base/api/lic/register").post(body.toRequestBody(JSON)).build()
        http.newCall(req).execute().use { r ->
            if (!r.isSuccessful) throw java.io.IOException("register ${r.code}")
            val o = JSONObject(r.body!!.string())
            val sec = o.getString("installSecret")
            prefs.edit()
                .putString("secret", Base64.encodeToString(cipher.encrypt(sec.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP))
                .putString("code", o.getString("code"))
                .apply()
            return sec
        }
    }

    /** Statut à jour depuis le serveur (enregistre l'appareil au besoin). Lève en cas d'échec réseau. */
    suspend fun refresh(): LicensePayload = withContext(Dispatchers.IO) {
        val sec = ensureRegistered()
        val req = Request.Builder().url("$base/api/lic/status?v=${BuildConfig.VERSION_NAME}").header("Authorization", "Bearer $sec").build()
        http.newCall(req).execute().use { r ->
            if (r.code == 401) {
                // Appareil inconnu du serveur (base réinitialisée) : nouvel enregistrement au prochain essai.
                prefs.edit().remove("secret").remove("payload").remove("sig").apply()
                throw java.io.IOException("unknown device")
            }
            if (!r.isSuccessful) throw java.io.IOException("status ${r.code}")
            val o = JSONObject(r.body!!.string())
            val p = o.getString("payload")
            val s = o.getString("sig")
            val parsed = LicenseLogic.verify(p, s, BuildConfig.LICENSE_PUBKEY) ?: throw SecurityException("bad signature")
            prefs.edit().putString("payload", p).putString("sig", s).putString("code", parsed.code).apply()
            parsed
        }
    }

    /** Abonnement IPTV configuré par le revendeur (vide si aucun ou licence inactive) ; null si injoignable. */
    suspend fun sources(): List<ResellerSource>? = withContext(Dispatchers.IO) {
        val sec = secret() ?: return@withContext null
        val req = Request.Builder().url("$base/api/lic/sources").header("Authorization", "Bearer $sec").build()
        runCatching {
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@use null
                val a = JSONObject(r.body!!.string()).optJSONArray("sources") ?: JSONArray()
                (0 until a.length()).map { i -> a.getJSONObject(i) }.map { o ->
                    fun s(k: String) = if (o.isNull(k) || !o.has(k)) null else o.optString(k)
                    ResellerSource(o.getString("id"), o.optString("kind", "xtream"), o.optString("name", "IPTV"), o.optLong("updatedAt"), s("server"), s("username"), s("password"), s("url"))
                }
            }
        }.getOrNull()
    }

    suspend fun inbox(): List<Announcement> = withContext(Dispatchers.IO) {
        val sec = secret() ?: return@withContext emptyList()
        val req = Request.Builder().url("$base/api/lic/inbox").header("Authorization", "Bearer $sec").build()
        runCatching {
            http.newCall(req).execute().use { r ->
                if (!r.isSuccessful) return@use emptyList()
                val a = JSONObject(r.body!!.string()).optJSONArray("messages") ?: JSONArray()
                (0 until a.length()).map { i -> a.getJSONObject(i) }.map {
                    Announcement(it.getString("id"), it.optString("title"), it.optString("body"), it.optLong("at"), it.optBoolean("read"),
                        kind = it.optString("kind", "message").ifBlank { "message" }, until = if (it.has("until") && !it.isNull("until")) it.optLong("until") else null,
                        category = it.optString("category", "info").ifBlank { "info" })
                }
            }
        }.getOrDefault(emptyList())
    }

    suspend fun markRead(ids: List<String>) = withContext(Dispatchers.IO) {
        val sec = secret() ?: return@withContext
        val body = JSONObject().put("ids", JSONArray(ids)).toString()
        runCatching {
            http.newCall(Request.Builder().url("$base/api/lic/inbox/read").header("Authorization", "Bearer $sec").post(body.toRequestBody(JSON)).build()).execute().close()
        }
    }

    private companion object { val JSON = "application/json".toMediaType() }
}
