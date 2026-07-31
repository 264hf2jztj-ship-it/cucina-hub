"use strict";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXT_RE = /^[a-z0-9]{1,10}$/;

export const STORAGE_BUCKETS = Object.freeze({
  recipeImages: "recipe-images",
  applianceImages: "appliance-images",
  manuals: "manuals",
  courseMaterials: "course-materials"
});

export const RECIPE_IMAGE_ROLES = Object.freeze([
  "cover", "preparation", "cooking", "result", "inside", "problem", "other"
]);

export const APPLIANCE_IMAGE_ROLES = Object.freeze([
  "cover", "front", "control-panel", "accessory", "setup", "other"
]);

export const COURSE_ASSET_SCOPES = Object.freeze(["course", "module", "lesson"]);

function requireUuid(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!UUID_RE.test(normalized)) throw new Error(`${label} non è un UUID valido.`);
  return normalized;
}

function requireChoice(value, allowed, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!allowed.includes(normalized)) throw new Error(`${label} non valido: ${normalized || "vuoto"}.`);
  return normalized;
}

function normalizeExtension(value) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/^\./, "");
  if (!EXT_RE.test(normalized)) throw new Error("Estensione file non valida.");
  return normalized;
}

export function slugifyStorageName(value) {
  const slug = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "file";
}

function fileName({ fileId, label, extension }) {
  return `${requireUuid(fileId, "file_id")}-${slugifyStorageName(label)}.${normalizeExtension(extension)}`;
}

export function buildRecipeImagePath({ ownerUserId, recipeId, role, fileId, label, extension }) {
  return [
    requireUuid(ownerUserId, "owner_user_id"),
    "recipes",
    requireUuid(recipeId, "recipe_id"),
    requireChoice(role, RECIPE_IMAGE_ROLES, "Ruolo immagine ricetta"),
    fileName({ fileId, label, extension })
  ].join("/");
}

export function buildApplianceImagePath({ ownerUserId, applianceId, role, fileId, label, extension }) {
  return [
    requireUuid(ownerUserId, "owner_user_id"),
    "appliances",
    requireUuid(applianceId, "appliance_id"),
    requireChoice(role, APPLIANCE_IMAGE_ROLES, "Ruolo immagine elettrodomestico"),
    fileName({ fileId, label, extension })
  ].join("/");
}

export function buildManualPath({ ownerUserId, applianceId, manualId, fileId, label }) {
  return [
    requireUuid(ownerUserId, "owner_user_id"),
    "appliances",
    requireUuid(applianceId, "appliance_id"),
    "manuals",
    requireUuid(manualId, "manual_id"),
    fileName({ fileId, label, extension: "pdf" })
  ].join("/");
}

export function buildCourseAssetPath({ ownerUserId, courseId, scope, scopeId, fileId, label, extension }) {
  return [
    requireUuid(ownerUserId, "owner_user_id"),
    "courses",
    requireUuid(courseId, "course_id"),
    requireChoice(scope, COURSE_ASSET_SCOPES, "Ambito asset corso"),
    requireUuid(scopeId, "scope_id"),
    fileName({ fileId, label, extension })
  ].join("/");
}

export function validatePrivateStoragePath(path, ownerUserId) {
  const normalizedPath = String(path ?? "").trim();
  const expectedOwner = requireUuid(ownerUserId, "owner_user_id");
  if (!normalizedPath.startsWith(`${expectedOwner}/`)) {
    throw new Error("Il percorso non inizia con owner_user_id.");
  }
  if (normalizedPath.includes("//") || normalizedPath.includes("..") || normalizedPath.startsWith("/")) {
    throw new Error("Il percorso contiene segmenti non validi.");
  }
  return true;
}
