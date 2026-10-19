<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowUpRight, CalendarDays, FolderKanban, Plus, Search } from 'lucide-vue-next'
import { useSessionStore } from '../stores/session.js'
import { useUiStore } from '../stores/ui.js'
import { formatDate } from '../lib/format.js'
import EmptyState from '../components/EmptyState.vue'

const router = useRouter()
const session = useSessionStore()
const ui = useUiStore()
const search = ref('')

const filteredProjects = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return session.projects
  return session.projects.filter(
    (project) =>
      project.name.toLowerCase().includes(term) ||
      (project.identifier || '').toLowerCase().includes(term) ||
      (project.description || '').toLowerCase().includes(term),
  )
})

function openIssues(project) {
  router.push({ name: 'issues', query: { project_id: project.id, status_id: 'open' } })
}

function newIssue(project) {
  ui.openIssueComposer({ projectId: project.id })
}
</script>

<template>
  <div class="page projects-page">
    <header class="page-head">
      <div class="page-head-main">
        <h1 class="page-title">Projets</h1>
        <p class="page-subtitle">
          {{ session.projects.length }} projet{{ session.projects.length > 1 ? 's' : '' }} accessible{{ session.projects.length > 1 ? 's' : '' }}
          sur votre Redmine.
        </p>
      </div>
      <div class="page-actions">
        <div class="input-group project-search">
          <Search :size="15" />
          <input v-model="search" class="input" type="search" placeholder="Filtrer les projets…" />
        </div>
        <button class="btn btn-primary" type="button" @click="ui.openIssueComposer()">
          <Plus :size="15" /> Nouveau ticket
        </button>
      </div>
    </header>

    <div v-if="filteredProjects.length" class="projects-grid">
      <article
        v-for="project in filteredProjects"
        :key="project.id"
        class="project-card card"
        :style="{ '--hue': (project.id * 47) % 360 }"
      >
        <div class="project-card-top">
          <span class="project-mark">
            {{ project.name.slice(0, 2).toUpperCase() }}
          </span>
          <span class="project-status" :data-active="project.status === 1">
            {{ project.status === 1 ? 'Actif' : 'Archivé' }}
          </span>
        </div>

        <h2 class="project-name">{{ project.name }}</h2>
        <p class="project-identifier mono">{{ project.identifier }}</p>
        <p class="project-description clamp-2">
          {{ project.description || 'Aucune description pour ce projet.' }}
        </p>

        <div class="project-meta">
          <span v-if="project.parent" class="project-meta-item">
            <FolderKanban :size="12" /> {{ project.parent.name }}
          </span>
          <span v-if="project.created_on" class="project-meta-item">
            <CalendarDays :size="12" /> {{ formatDate(project.created_on) }}
          </span>
        </div>

        <div class="project-actions">
          <button class="project-open" type="button" @click="openIssues(project)">
            Voir les tickets <ArrowUpRight :size="14" />
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" type="button" title="Nouveau ticket dans ce projet" @click="newIssue(project)">
            <Plus :size="14" />
          </button>
        </div>
      </article>
    </div>

    <section v-else class="card">
      <EmptyState
        :icon="FolderKanban"
        :title="search ? 'Aucun projet trouvé' : 'Aucun projet accessible'"
        :text="
          search
            ? 'Essayez un autre terme de recherche.'
            : 'Votre compte Redmine ne donne accès à aucun projet pour le moment.'
        "
      />
    </section>
  </div>
</template>

<style scoped>
.project-search {
  width: 210px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.project-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 18px;
  overflow: hidden;
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
}

.project-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: hsl(var(--hue) 62% 54%);
  opacity: 0.85;
}

.project-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--line-strong);
}

.project-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 13px;
}

.project-mark {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: hsl(var(--hue) 62% 54% / 0.13);
  color: hsl(var(--hue) 55% 38%);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

[data-theme='dark'] .project-mark {
  color: hsl(var(--hue) 70% 72%);
  background: hsl(var(--hue) 62% 54% / 0.16);
}

.project-status {
  font-size: 9.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--surface-3);
  color: var(--muted);
}

.project-status[data-active='true'] {
  background: var(--green-soft);
  color: var(--green);
}

.project-name {
  font-size: 15.5px;
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.3;
}

.project-identifier {
  margin-top: 2px;
  font-size: 10px;
  color: var(--faint);
}

.project-description {
  margin-top: 10px;
  min-height: 38px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--muted);
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 14px;
  font-size: 10px;
  color: var(--faint);
}

.project-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 15px;
  padding-top: 13px;
  border-top: 1px solid var(--line);
}

.project-open {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 600;
  padding: 0;
  text-align: left;
}

.project-open:hover {
  gap: 8px;
}

@media (max-width: 1100px) {
  .projects-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .projects-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .project-search {
    width: 100%;
    order: 2;
  }
  .page-actions {
    width: 100%;
  }
}
</style>
