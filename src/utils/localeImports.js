/**
 * Static import map so webpack emits one async chunk per locale.
 * Add a new entry when you add src/locales/<code>.js.
 */
export const LOCALE_IMPORTERS = {
  ar: () => import(/* webpackChunkName: "locale-ar" */ "../locales/ar.js"),
  cs: () => import(/* webpackChunkName: "locale-cs" */ "../locales/cs.js"),
  da: () => import(/* webpackChunkName: "locale-da" */ "../locales/da.js"),
  de: () => import(/* webpackChunkName: "locale-de" */ "../locales/de.js"),
  el: () => import(/* webpackChunkName: "locale-el" */ "../locales/el.js"),
  es: () => import(/* webpackChunkName: "locale-es" */ "../locales/es.js"),
  fi: () => import(/* webpackChunkName: "locale-fi" */ "../locales/fi.js"),
  fr: () => import(/* webpackChunkName: "locale-fr" */ "../locales/fr.js"),
  he: () => import(/* webpackChunkName: "locale-he" */ "../locales/he.js"),
  hi: () => import(/* webpackChunkName: "locale-hi" */ "../locales/hi.js"),
  hu: () => import(/* webpackChunkName: "locale-hu" */ "../locales/hu.js"),
  id: () => import(/* webpackChunkName: "locale-id" */ "../locales/id.js"),
  it: () => import(/* webpackChunkName: "locale-it" */ "../locales/it.js"),
  ja: () => import(/* webpackChunkName: "locale-ja" */ "../locales/ja.js"),
  ko: () => import(/* webpackChunkName: "locale-ko" */ "../locales/ko.js"),
  nl: () => import(/* webpackChunkName: "locale-nl" */ "../locales/nl.js"),
  no: () => import(/* webpackChunkName: "locale-no" */ "../locales/no.js"),
  pl: () => import(/* webpackChunkName: "locale-pl" */ "../locales/pl.js"),
  pt: () => import(/* webpackChunkName: "locale-pt" */ "../locales/pt.js"),
  ro: () => import(/* webpackChunkName: "locale-ro" */ "../locales/ro.js"),
  ru: () => import(/* webpackChunkName: "locale-ru" */ "../locales/ru.js"),
  sr: () => import(/* webpackChunkName: "locale-sr" */ "../locales/sr.js"),
  sv: () => import(/* webpackChunkName: "locale-sv" */ "../locales/sv.js"),
  sw: () => import(/* webpackChunkName: "locale-sw" */ "../locales/sw.js"),
  th: () => import(/* webpackChunkName: "locale-th" */ "../locales/th.js"),
  tr: () => import(/* webpackChunkName: "locale-tr" */ "../locales/tr.js"),
  zh: () => import(/* webpackChunkName: "locale-zh" */ "../locales/zh.js"),
};
