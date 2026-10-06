package com.ultratv.tv.nativeapp.data.license

import android.content.Context
import com.ultratv.tv.nativeapp.data.config.CloudSyncClient
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/** Règle pure (testable) : quand renvoyer le statut de licence au tableau de bord du compte. */
object ProCloudLicense {
    const val EVERY_MS = 24 * 3_600_000L

    /**
     * Envoi nécessaire : nouveau statut (autre signature), dernier envoi de plus de 24 h, ou horloge reculée depuis.
     * Le Worker de configuration limite à 20 envois par heure et par appareil et refuse un statut de plus de 8 jours.
     */
    fun due(lastSig: String?, lastAt: Long, sig: String?, now: Long): Boolean {
        if (sig.isNullOrEmpty()) return false
        return sig != lastSig || now < lastAt || now - lastAt >= EVERY_MS
    }
}

/**
 * Édition Pro : transmet au tableau de bord du compte le dernier statut de licence signé par le panneau revendeur
 * ({payload, sig} TELS QUELS, jamais re-signés), et marque les sources posées par le revendeur. Sans effet en standard.
 */
@Singleton
class ProCloudReporter @Inject constructor(
    @ApplicationContext private val ctx: Context,
    private val license: LicenseClient,
    private val client: CloudSyncClient,
) {
    private val prefs = ctx.getSharedPreferences("pro_cloud_license", Context.MODE_PRIVATE)

    /** Envoie le statut si nécessaire ; `true` s'il est parti. Lève sur erreur réseau (l'appelant l'ignore). */
    suspend fun report(base: String, token: String, now: Long = System.currentTimeMillis()): Boolean {
        if (!license.enabled) return false
        val (payload, sig) = license.signed() ?: return false
        if (!ProCloudLicense.due(prefs.getString("sig", null), prefs.getLong("at", 0L), sig, now)) return false
        client.postLicense(base, token, payload, sig)
        prefs.edit().putString("sig", sig).putLong("at", now).apply()
        return true
    }

    /** Source locale posée par le revendeur : publiée avec `"managed": "reseller"` (ni lien ni suppression sur le site). */
    fun managed(localId: Long): Boolean = license.enabled && localId in ResellerProvisioner.managedIds(ctx)
}
