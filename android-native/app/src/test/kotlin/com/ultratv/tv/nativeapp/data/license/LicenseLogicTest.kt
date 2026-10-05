package com.ultratv.tv.nativeapp.data.license

import org.bouncycastle.crypto.generators.Ed25519KeyPairGenerator
import org.bouncycastle.crypto.params.Ed25519KeyGenerationParameters
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters
import org.bouncycastle.crypto.params.Ed25519PublicKeyParameters
import org.bouncycastle.crypto.signers.Ed25519Signer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.SecureRandom
import java.util.Base64

class LicenseLogicTest {
    private val kp = Ed25519KeyPairGenerator().apply { init(Ed25519KeyGenerationParameters(SecureRandom())) }.generateKeyPair()
    // SPKI DER Ed25519 = en-tête fixe de 12 octets + 32 octets de clé (format envoyé par le Worker).
    private val spki = Base64.getEncoder().encodeToString(
        byteArrayOf(0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00) + (kp.public as Ed25519PublicKeyParameters).encoded,
    )

    private fun sign(json: String): Pair<String, String> {
        val p = Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray())
        val s = Ed25519Signer().apply { init(true, kp.private as Ed25519PrivateKeyParameters); val b = p.toByteArray(); update(b, 0, b.size) }.generateSignature()
        return p to Base64.getUrlEncoder().withoutPadding().encodeToString(s)
    }

    private val now = 1_800_000_000_000L
    private fun json(status: String, until: Long?, grace: Long?, issued: Long = now) =
        """{"v":1,"deviceId":"d1","code":"7F3K-92QD","status":"$status","until":${until ?: "null"},"graceUntil":${grace ?: "null"},
           "reseller":{"name":"Basil TV","whatsapp":"+971500000000","telegram":null,"text":null},"unread":2,"issuedAt":$issued}"""

    @Test fun signatureValide_chargeUtileDecodee() {
        val (p, s) = sign(json("active", now + 1000, now + 5000))
        val l = LicenseLogic.verify(p, s, spki)
        assertNotNull(l)
        assertEquals("7F3K-92QD", l!!.code)
        assertEquals("Basil TV", l.resellerName)
        assertEquals("+971500000000", l.whatsapp)
        assertNull(l.telegram)
        assertEquals(2, l.unread)
    }

    @Test fun chargeUtileFalsifiee_refusee() {
        val (_, s) = sign(json("expired", now - 1, null))
        val forged = Base64.getUrlEncoder().withoutPadding().encodeToString(json("active", now + 999_999, now + 999_999).toByteArray())
        assertNull(LicenseLogic.verify(forged, s, spki))
    }

    @Test fun autreCle_refusee() {
        val other = Ed25519KeyPairGenerator().apply { init(Ed25519KeyGenerationParameters(SecureRandom())) }.generateKeyPair()
        val otherSpki = Base64.getEncoder().encodeToString(ByteArray(12) + (other.public as Ed25519PublicKeyParameters).encoded)
        val (p, s) = sign(json("active", now + 1000, now + 5000))
        assertNull(LicenseLogic.verify(p, s, otherSpki))
    }

    @Test fun droitDUtiliser_essaiActifGraceExpireSuspendu() {
        fun parse(st: String, u: Long?, g: Long?, issued: Long = now) = LicenseLogic.parse(json(st, u, g, issued))
        assertTrue(LicenseLogic.allowed(parse("trial", now + 1000, now + 5000), now))
        // Hors ligne après la fin : délai de grâce.
        assertTrue(LicenseLogic.allowed(parse("active", now - 1000, now + 5000), now))
        assertFalse(LicenseLogic.allowed(parse("active", now - 9000, now - 1000), now))
        assertFalse(LicenseLogic.allowed(parse("expired", now - 1, null), now))
        assertFalse(LicenseLogic.allowed(parse("suspended", null, null), now))
        assertFalse(LicenseLogic.allowed(null, now))
        // Horloge reculée de plusieurs jours avant l'émission : refusé.
        assertFalse(LicenseLogic.allowed(parse("active", now + 1000, now + 5000, issued = now + 3 * 86_400_000L), now))
    }

    @Test fun joursRestants_arrondisAuSuperieur() {
        assertEquals(7, LicenseLogic.daysLeft(LicenseLogic.parse(json("trial", now + 6 * 86_400_000L + 1, null)), now))
        assertEquals(0, LicenseLogic.daysLeft(LicenseLogic.parse(json("trial", now - 1, null)), now))
    }
}
