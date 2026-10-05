package com.ultratv.tv.nativeapp.data.license

import org.junit.Assert.assertEquals
import org.junit.Test

class ResellerPlanTest {
    private fun r(id: String, at: Long) = ResellerSource(id, "xtream", "TV", at, "http://x", "u", "p", null)

    @Test fun ajout_miseAJour_retrait_etSourcesUtilisateurIntactes() {
        val links = mapOf("cs-a" to (2L to 100L), "cs-old" to (3L to 50L))
        val p = ResellerPlan.plan(links, existing = setOf(1L, 2L, 3L), remote = listOf(r("cs-a", 200), r("cs-new", 10)))
        assertEquals(listOf("cs-new"), p.add.map { it.id })
        assertEquals(listOf(2L), p.update.map { it.first })
        assertEquals(listOf(3L), p.remove)          // la source 1 (ajoutée par l'utilisateur) n'est jamais retirée
    }

    @Test fun sourceLieeSupprimeeParLUtilisateur_estRecreee() {
        val p = ResellerPlan.plan(mapOf("cs-a" to (9L to 100L)), existing = setOf(1L), remote = listOf(r("cs-a", 100)))
        assertEquals(listOf("cs-a"), p.add.map { it.id })
        assertEquals(emptyList<Long>(), p.remove)
    }

    @Test fun memeVersion_rienAFaire() {
        val p = ResellerPlan.plan(mapOf("cs-a" to (2L to 100L)), existing = setOf(2L), remote = listOf(r("cs-a", 100)))
        assertEquals(0, p.add.size + p.update.size + p.remove.size)
    }
}
