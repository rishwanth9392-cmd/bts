"use strict";
/**
 * Shared constants used across the BTS system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_BUS_CAPACITY = exports.LOCATION_UPDATE_INTERVAL_MS = exports.DEFAULT_WEB_PORT = exports.DEFAULT_API_PORT = void 0;
/** Default API port when not specified via environment */
exports.DEFAULT_API_PORT = 4000;
/** Default web app port */
exports.DEFAULT_WEB_PORT = 3000;
/** Location update broadcast interval in milliseconds */
exports.LOCATION_UPDATE_INTERVAL_MS = 5_000;
/** Maximum number of passengers a bus can carry (hard cap) */
exports.MAX_BUS_CAPACITY = 80;
