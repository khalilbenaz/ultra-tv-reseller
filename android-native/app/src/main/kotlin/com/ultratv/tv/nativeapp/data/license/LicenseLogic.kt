package com.ultratv.tv.nativeapp.data.license

import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.json.JSONObject

/** Statut signé renvoyé par le Worker revendeur (ultratv-reseller). */
data class LicensePayload(
    val deviceId: String,
    val code: String,
    val status: String,          // trial | active | expired | suspended
    val until: Long?,
    val graceUntil: Long?,
    val resellerName: String?,
    val whatsapp: String?,
    val telegram: String?,
    val supportText: String?,
    val unread: Int,
    val issuedAt: Long,
    /** Appareils rattachés à la licence / nombre autorisé (null : pas encore de licence). */
    val devicesUsed: Int? = null,
    val devicesMax: Int? = null,
)

/** Règles pures (testables sans Android) : signature Ed25519 et droit d'utiliser l'application. */
object LicenseLogic {
    /** Clé publique SPKI DER (base64) → 32 octets bruts Ed25519. */
    fun rawPublicKey(spkiB64: String): ByteArray {
        val der = java.util.Base64.getDecoder().decode(spkiB64.trim())
        require(der.size >= 32) { "clé publique invalide" }
        return der.copyOfRange(der.size - 32, der.size)
    }

    /** Vérifie `sig` (base64url) sur le texte `payload` (base64url) puis décode la charge utile ; null si invalide. */
    fun verify(payload: String, sig: String, spkiB64: String): LicensePayload? = runCatching {
        val signer = Ed25519Signer()
        signer.init(false, Ed25519PublicKeyParameters(rawPublicKey(spkiB64), 0))
        val msg = payload.toByteArray(Charsets.US_ASCII)
        signer.update(msg, 0, msg.size)
        val s = java.util.Base64.getUrlDecoder().decode(sig)
        if (!signer.verifySignature(s)) return null
        parse(String(java.util.Base64.getUrlDecoder().decode(payload), Charsets.UTF_8))
    }.getOrNull()

    fun parse(json: String): LicensePayload {
        val o = JSONObject(json)
        val r = o.optJSONObject("reseller")
        fun JSONObject.str(k: String) = if (!has(k) || isNull(k)) null else optString(k).takeIf { it.isNotBlank() }
        fun JSONObject.long(k: String) = if (!has(k) || isNull(k)) null else optLong(k)
        return LicensePayload(
            deviceId = o.getString("deviceId"), code = o.getString("code"), status = o.getString("status"),
            until = o.long("until"), graceUntil = o.long("graceUntil"),
            resellerName = r?.str("name"), whatsapp = r?.str("whatsapp"), telegram = r?.str("telegram"), supportText = r?.str("text"),
            unread = o.optInt("unread", 0), issuedAt = o.optLong("issuedAt"),
            devicesUsed = o.optJSONObject("devices")?.optInt("used"), devicesMax = o.optJSONObject("devices")?.optInt("max"),
        )
    }

    /**
     * L'application peut-elle être utilisée ? Essai ou licence active, jusqu'au délai de grâce (hors ligne, on garde
     * le dernier statut signé). Une horloge reculée bien avant la date d'émission ne prolonge rien.
     */
    fun allowed(p: LicensePayload?, now: Long): Boolean {
        if (p == null) return false
        if (p.status != "trial" && p.status != "active") return false
        val limit = p.graceUntil ?: p.until ?: return false
        return now < limit && now >= p.issuedAt - 24 * 3600_000L
    }

    /** Jours restants (arrondis au supérieur) avant `until`, ou null. */
    fun daysLeft(p: LicensePayload?, now: Long): Int? {
        val u = p?.until ?: return null
        if (u <= now) return 0
        return ((u - now + 86_399_999L) / 86_400_000L).toInt()
    }
}
