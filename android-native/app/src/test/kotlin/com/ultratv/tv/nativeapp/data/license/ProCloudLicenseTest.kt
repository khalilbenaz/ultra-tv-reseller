package com.ultratv.tv.nativeapp.data.license

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ProCloudLicenseTest {
    private val t = 1_000_000_000L

    @Test fun due_premierEnvoi_puisSeulementSiLeStatutChangeOuApres24h() {
        assertTrue(ProCloudLicense.due(null, 0L, "sigA", t))
        assertFalse(ProCloudLicense.due("sigA", t, "sigA", t + 3_600_000L))
        assertTrue(ProCloudLicense.due("sigA", t, "sigB", t + 1))
        assertTrue(ProCloudLicense.due("sigA", t, "sigA", t + ProCloudLicense.EVERY_MS))
    }

    @Test fun due_horlogeReculee_renvoie() {
        assertTrue(ProCloudLicense.due("sigA", t, "sigA", t - 1))
    }

    @Test fun due_aucunStatutSigne_rienAEnvoyer() {
        assertFalse(ProCloudLicense.due(null, 0L, null, t))
        assertFalse(ProCloudLicense.due(null, 0L, "", t))
    }
}
