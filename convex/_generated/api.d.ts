/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as boardElements from "../boardElements.js";
import type * as boardPresence from "../boardPresence.js";
import type * as boards from "../boards.js";
import type * as contacts from "../contacts.js";
import type * as crons from "../crons.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as leads from "../leads.js";
import type * as migrations from "../migrations.js";
import type * as milestones from "../milestones.js";
import type * as notes from "../notes.js";
import type * as organizations from "../organizations.js";
import type * as projects from "../projects.js";
import type * as seed from "../seed.js";
import type * as settings from "../settings.js";
import type * as tasks from "../tasks.js";
import type * as userProfiles from "../userProfiles.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  boardElements: typeof boardElements;
  boardPresence: typeof boardPresence;
  boards: typeof boards;
  contacts: typeof contacts;
  crons: typeof crons;
  helpers: typeof helpers;
  http: typeof http;
  leads: typeof leads;
  migrations: typeof migrations;
  milestones: typeof milestones;
  notes: typeof notes;
  organizations: typeof organizations;
  projects: typeof projects;
  seed: typeof seed;
  settings: typeof settings;
  tasks: typeof tasks;
  userProfiles: typeof userProfiles;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
