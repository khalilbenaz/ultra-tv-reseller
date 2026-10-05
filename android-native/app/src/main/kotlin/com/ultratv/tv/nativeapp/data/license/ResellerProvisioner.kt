package com.ultratv.tv.nativeapp.data.license

import android.content.Context
import com.ultratv.tv.nativeapp.data.repo.ProviderRepository
import com.ultratv.tv.nativeapp.data.sync.SyncCoordinator
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/** Abonnement IPTV configuré par le revendeur pour ce client (réponse de /api/lic/sources). */
data class ResellerSource(
    val id: String,
    val kind: String,          // xtream | m3u
    val name: String,
    val updatedAt: Long,
    val server: String?,
    val username: String?,
    val password: String?,
    val url: String?,
)

/** Plan pur (testable) : identifiants distants à créer, à mettre à jour, et sources locales à retirer. */
object ResellerPlan {
    data class Plan(val add: List<ResellerSource>, val update: List<Pair<Long, ResellerSource>>, val remove: List<Long>)

    /** [links] : identifiant distant → (id de source locale, version appliquée) ; [existing] : sources locales présentes. */
    fun plan(links: Map<String, Pair<Long, Long>>, existing: Set<Long>, remote: List<ResellerSource>): Plan {
        val add = remote.filter { r -> links[r.id]?.first?.let { it !in existing } ?: true }
        val update = remote.mapNotNull { r -> links[r.id]?.takeIf { it.first in existing && it.second < r.updatedAt }?.let { it.first to r } }
        val remove = links.filterKeys { k -> remote.none { it.id == k } }.values.map { it.first }.filter { it in existing }
        return Plan(add, update, remove)
    }
}

/**
 * Applique l'abonnement du revendeur : la source est ajoutée (et synchronisée) sans rien saisir sur la TV,
 * mise à jour quand le revendeur la modifie, retirée s'il la supprime. Les sources ajoutées par l'utilisateur
 * ne sont jamais touchées (seules celles liées dans « pro_sources » le sont).
 */
@Singleton
class ResellerProvisioner @Inject constructor(
    @ApplicationContext ctx: Context,
    private val repo: ProviderRepository,
    private val sync: SyncCoordinator,
) {
    private val prefs = ctx.getSharedPreferences("pro_sources", Context.MODE_PRIVATE)

    private fun links(): Map<String, Pair<Long, Long>> = prefs.all.keys.filter { it.startsWith("pid.") }.associate { k ->
        val id = k.removePrefix("pid.")
        id to (prefs.getLong(k, -1L) to prefs.getLong("at.$id", 0L))
    }

    private fun link(remoteId: String, pid: Long, at: Long) = prefs.edit().putLong("pid.$remoteId", pid).putLong("at.$remoteId", at).apply()

    suspend fun apply(remote: List<ResellerSource>) {
        val existing = repo.observeProviders().first().map { it.id }.toSet()
        val current = links()
        val plan = ResellerPlan.plan(current, existing, remote)
        for (pid in plan.remove) {
            repo.delete(pid)
            current.filterValues { it.first == pid }.keys.forEach { prefs.edit().remove("pid.$it").remove("at.$it").apply() }
        }
        if (plan.remove.isNotEmpty() && repo.firstActive() == null) repo.observeProviders().first().firstOrNull()?.let { repo.setDefault(it.id) }
        for (r in plan.add) {
            val id = if (r.kind == "m3u") repo.addM3u(r.name, r.url.orEmpty()) else repo.addXtream(r.name, r.server.orEmpty(), r.username.orEmpty(), r.password.orEmpty())
            link(r.id, id, r.updatedAt)
            if (repo.firstActive() == null) repo.setDefault(id)
            sync.request(id, force = true)
        }
        for ((pid, r) in plan.update) {
            repo.updateFromCloud(pid, r.name, if (r.kind == "m3u") r.url.orEmpty() else r.server.orEmpty(), r.username.orEmpty(), r.password.orEmpty())
            link(r.id, pid, r.updatedAt)
            sync.request(pid, force = true)
        }
    }
}
