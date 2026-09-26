/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'
import router from '@adonisjs/core/services/router'

// Root redirects to the dashboard (authenticated users only).
router.get('/', async ({ response }) => response.redirect().toRoute('dashboard'))

router
  .group(() => {
    router.get('login', [controllers.Session, 'create']).as('session.create')
    router.post('login', [controllers.Session, 'store']).as('session.store')
  })
  .use(middleware.guest())

router
  .group(() => {
    router.post('logout', [controllers.Session, 'destroy']).as('session.destroy')

    router.get('/dashboard', [controllers.Dashboard, 'index']).as('dashboard')

    router.get('/rules', [controllers.CacheRules, 'index']).as('cache_rules.index')
    router.get('/rules/create', [controllers.CacheRules, 'create']).as('cache_rules.create')
    router.post('/rules', [controllers.CacheRules, 'store']).as('cache_rules.store')
    router.get('/rules/:id/edit', [controllers.CacheRules, 'edit']).as('cache_rules.edit')
    router.post('/rules/:id', [controllers.CacheRules, 'update']).as('cache_rules.update')
    router.post('/rules/:id/delete', [controllers.CacheRules, 'destroy']).as('cache_rules.destroy')
    router.post('/rules/:id/purge', [controllers.CacheRules, 'purge']).as('cache_rules.purge')
  })
  .use(middleware.auth())

// Public stats ingestion endpoint, called by the APISIX data plane.
router.post('/api/stats/ingest', [controllers.Stats, 'ingest'])
