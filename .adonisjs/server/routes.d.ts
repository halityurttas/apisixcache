import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'cache_rules.index': { paramsTuple?: []; params?: {} }
    'cache_rules.create': { paramsTuple?: []; params?: {} }
    'cache_rules.store': { paramsTuple?: []; params?: {} }
    'cache_rules.edit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cache_rules.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cache_rules.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cache_rules.purge': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stats.ingest': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'session.create': { paramsTuple?: []; params?: {} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'cache_rules.index': { paramsTuple?: []; params?: {} }
    'cache_rules.create': { paramsTuple?: []; params?: {} }
    'cache_rules.edit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  HEAD: {
    'session.create': { paramsTuple?: []; params?: {} }
    'dashboard': { paramsTuple?: []; params?: {} }
    'cache_rules.index': { paramsTuple?: []; params?: {} }
    'cache_rules.create': { paramsTuple?: []; params?: {} }
    'cache_rules.edit': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  POST: {
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'cache_rules.store': { paramsTuple?: []; params?: {} }
    'cache_rules.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cache_rules.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'cache_rules.purge': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'stats.ingest': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}