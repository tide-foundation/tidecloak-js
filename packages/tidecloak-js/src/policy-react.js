/**
 * @deprecated The policy editor is no longer part of @tidecloak/js. This entry
 * point is kept so existing imports still resolve; every component throws when
 * rendered. The @tidecloak/policy package it used to re-export was never
 * published to npm.
 */

const moved = (name) =>
  new Error(
    `${name} from "@tidecloak/js/policy-react" is no longer available: the policy editor has moved out of @tidecloak/js.`
  );

/** @typedef {any} Policy */
/** @typedef {any} PolicyBlock */
/** @typedef {any} Model */
/** @typedef {any} ModelField */
/** @typedef {any} Claim */

/**
 * @deprecated The policy editor has moved out of @tidecloak/js.
 * @param {any} _props
 * @returns {never}
 */
export function PolicyBuilder(_props) {
  throw moved("PolicyBuilder");
}

/**
 * @deprecated The policy editor has moved out of @tidecloak/js.
 * @param {any} _props
 * @returns {never}
 */
export function PolicyCanvas(_props) {
  throw moved("PolicyCanvas");
}

/**
 * @deprecated The policy editor has moved out of @tidecloak/js.
 * @param {any} _props
 * @returns {never}
 */
export function PropertiesPanel(_props) {
  throw moved("PropertiesPanel");
}

/**
 * @deprecated The policy editor has moved out of @tidecloak/js.
 * @param {any} _props
 * @returns {never}
 */
export function BlockPalette(_props) {
  throw moved("BlockPalette");
}
