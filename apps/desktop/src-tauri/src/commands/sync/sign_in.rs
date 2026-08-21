//! Labeled git sign-in profiles, stored by opaque ID.
//!
//! The token lives in the keychain under `profile:{id}`. This file keeps the
//! non-secret catalog (id, label, host, username) and the Settings commands
//! that create, reuse, or forget a profile. Workspaces persist the selected
//! ID themselves; this module never assigns a replacement after Forget.

use std::path::Path;
#[cfg(not(test))]
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::lock_or_recover;
use crate::NativeError;

use super::credentials::{
    delete_profile, get_legacy, get_profile, is_clean_https_url, storage_status, store_profile,
    StorageKind,
};

/// Workspace setting naming which saved sign-in this folder uses.
pub const PROFILE_SETTING: &str = "sync.signInProfile";

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static CATALOG_UPDATE: Mutex<()> = Mutex::new(());

#[cfg(test)]
static CATALOG: Mutex<Option<Vec<SignInProfile>>> = Mutex::new(None);
#[cfg(not(test))]
static CATALOG_FILE: Mutex<()> = Mutex::new(());

/// Non-secret description of one reusable sign-in.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInProfile {
    pub id: String,
    pub label: String,
    pub host: String,
    pub username: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)] // Written and read from disk in non-test builds.
struct Catalog {
    #[serde(default)]
    profiles: Vec<SignInProfile>,
}

/// What Settings needs to render storage and selection honestly.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInStatus {
    pub storage: &'static str,
    pub storage_message: String,
    pub host: Option<String>,
    pub selected_id: Option<String>,
    pub selected: Option<SelectedSignIn>,
    pub profiles: Vec<SignInProfile>,
    pub legacy: Option<LegacySignIn>,
}

/// The workspace's chosen profile, plus whether its secret is still there.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectedSignIn {
    #[serde(flatten)]
    pub profile: SignInProfile,
    pub saved: bool,
}

/// A leftover per-repository keychain entry from before labeled profiles.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacySignIn {
    pub host: String,
    pub username: String,
}

/// Result of creating or updating a profile, or of Save link.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSignIn {
    pub profile: SignInProfile,
    pub migrated: bool,
}

/// Host of an HTTPS git link, lowercased, without a path.
pub fn host_of(destination: &str) -> Option<String> {
    let trimmed = destination.trim();
    let rest = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))?;
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.rsplit('@').next().unwrap_or(host);
    if host.is_empty() || host.chars().any(char::is_whitespace) {
        return None;
    }
    Some(host.to_ascii_lowercase())
}

/// Default label, then ` (2)`, ` (3)`, … if that wording is already taken.
pub fn next_label(existing: &[SignInProfile], base: &str) -> String {
    if !existing.iter().any(|profile| profile.label == base) {
        return base.to_string();
    }
    for n in 2usize.. {
        let candidate = format!("{base} ({n})");
        if !existing.iter().any(|profile| profile.label == candidate) {
            return candidate;
        }
    }
    base.to_string()
}

/// The profile ID this workspace last saved, if any.
pub fn selected_profile_id_for(root: &Path) -> Option<String> {
    let home = super::settle::settings_home()?;
    let path = crate::commands::settings::workspace_settings_path(&home, root);
    let contents = crate::commands::settings::read_settings_file(&path).ok()??;
    crate::commands::settings::parse_app_settings_record(Some(&contents))
        .get(PROFILE_SETTING)?
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
}

#[tauri::command]
pub fn sync_sign_in_status(
    app: tauri::AppHandle,
    root_path: String,
    destination: String,
    profile_id: Option<String>,
) -> Result<SignInStatus, NativeError> {
    let _ = app;
    let host = host_of(&destination);
    let (kind, storage_message) = storage_status();
    let storage = match kind {
        StorageKind::Available => "available",
        StorageKind::Unavailable => "unavailable",
        StorageKind::Unsupported => "unsupported",
    };
    let profiles = load_catalog()?;
    let selected_id = profile_id
        .and_then(|id| {
            let trimmed = id.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        })
        .or_else(|| {
            crate::commands::workspace::resolve_workspace_root(&root_path)
                .ok()
                .and_then(|root| selected_profile_id_for(&root))
        });
    let selected = selected_id
        .as_deref()
        .map(|id| describe_selected(id, &profiles, kind == StorageKind::Available))
        .transpose()?;
    let host_profiles = profiles
        .into_iter()
        .filter(|profile| host.as_ref().map_or(true, |host| &profile.host == host))
        .collect();
    let legacy = match kind {
        StorageKind::Available if is_clean_https_url(destination.trim()) => {
            legacy_for(destination.trim())?
        }
        _ => None,
    };
    Ok(SignInStatus {
        storage,
        storage_message,
        host,
        selected_id,
        selected,
        profiles: host_profiles,
        legacy,
    })
}

#[tauri::command]
pub fn save_sync_credentials(
    app: tauri::AppHandle,
    root_path: String,
    destination: String,
    username: String,
    token: String,
    profile_id: Option<String>,
    label: Option<String>,
) -> Result<SavedSignIn, NativeError> {
    let destination = destination.trim().to_string();
    let username = username.trim().to_string();
    let profile = upsert_profile(&destination, &username, &token, profile_id, label)?;
    schedule_setup(&app, &root_path, &destination, Some(profile.id.clone()));
    Ok(SavedSignIn {
        profile,
        migrated: false,
    })
}

/// Writes one profile secret and catalog row. Does not start a round trip.
pub(super) fn upsert_profile(
    destination: &str,
    username: &str,
    token: &str,
    profile_id: Option<String>,
    label: Option<String>,
) -> Result<SignInProfile, NativeError> {
    if !is_clean_https_url(destination) {
        return Err(NativeError::new(
            "sync.credentials_need_https",
            "Paste a secret-free HTTPS git link before saving a sign-in.",
        ));
    }
    if username.is_empty() {
        return Err(NativeError::new(
            "sync.credentials_username_missing",
            "Enter the username this token belongs to.",
        ));
    }
    if token.is_empty() {
        return Err(NativeError::new(
            "sync.credentials_token_missing",
            "Enter an access token.",
        ));
    }
    let host = host_of(destination).ok_or_else(|| {
        NativeError::new(
            "sync.credentials_need_https",
            "Paste a secret-free HTTPS git link before saving a sign-in.",
        )
    })?;
    let _update = lock_or_recover(&CATALOG_UPDATE);
    let mut catalog = load_catalog()?;
    let existing_id = profile_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty());
    let profile = if let Some(id) = existing_id {
        let Some(index) = catalog.iter().position(|profile| profile.id == id) else {
            return Err(NativeError::new(
                "sync.sign_in_missing",
                "The selected sign-in is no longer saved on this computer.",
            ));
        };
        if catalog[index].host != host {
            return Err(wrong_host());
        }
        store_profile(id, username, token)?;
        catalog[index].username = username.to_string();
        if let Some(label) = label
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            catalog[index].label = label.to_string();
        }
        catalog[index].clone()
    } else {
        let id = new_profile_id();
        let base = label
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("{username}@{host}"));
        let profile = SignInProfile {
            id: id.clone(),
            label: next_label(&catalog, &base),
            host,
            username: username.to_string(),
        };
        store_profile(&id, username, token)?;
        catalog.push(profile.clone());
        profile
    };
    save_catalog(catalog)?;
    Ok(profile)
}

#[tauri::command]
pub fn save_sync_link(
    app: tauri::AppHandle,
    root_path: String,
    destination: String,
    profile_id: Option<String>,
) -> Result<SavedSignIn, NativeError> {
    let destination = destination.trim();
    if !is_clean_https_url(destination) {
        return Err(NativeError::new(
            "sync.credentials_need_https",
            "Paste a secret-free HTTPS git link before saving this link.",
        ));
    }
    let requested = profile_id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty());
    let (profile, migrated) = if let Some(id) = requested {
        (require_saved_profile(id, destination)?, false)
    } else {
        let Some(legacy) = get_legacy(destination)? else {
            return Err(NativeError::new(
                "sync.sign_in_needed",
                "Choose a saved sign-in or add a username and access token.",
            ));
        };
        (migrate_legacy(destination, &legacy.0, &legacy.1)?, true)
    };
    schedule_setup(&app, &root_path, destination, Some(profile.id.clone()));
    Ok(SavedSignIn { profile, migrated })
}

/// Confirms the named profile still exists and still has a secret.
///
/// Import and Save link both refuse a missing ID rather than picking another.
pub(super) fn require_saved_profile(
    id: &str,
    destination: &str,
) -> Result<SignInProfile, NativeError> {
    let host = host_of(destination).ok_or_else(wrong_host)?;
    let catalog = load_catalog()?;
    let profile = catalog
        .into_iter()
        .find(|profile| profile.id == id)
        .ok_or_else(|| {
            NativeError::new(
                "sync.sign_in_missing",
                "The selected sign-in is no longer saved on this computer.",
            )
        })?;
    if get_profile(id)?.is_none() {
        return Err(NativeError::new(
            "sync.sign_in_missing",
            "The selected sign-in is no longer saved on this computer.",
        ));
    }
    if profile.host != host {
        return Err(wrong_host());
    }
    Ok(profile)
}

fn wrong_host() -> NativeError {
    NativeError::new(
        "sync.sign_in_wrong_host",
        "The selected sign-in belongs to a different git host.",
    )
}

#[tauri::command]
pub fn forget_sync_sign_in(profile_id: String) -> Result<(), NativeError> {
    let id = profile_id.trim();
    if id.is_empty() {
        return Err(NativeError::new(
            "sync.sign_in_missing",
            "Choose a saved sign-in to forget.",
        ));
    }
    let _update = lock_or_recover(&CATALOG_UPDATE);
    delete_profile(id)?;
    let mut catalog = load_catalog()?;
    catalog.retain(|profile| profile.id != id);
    save_catalog(catalog)
}

fn describe_selected(
    id: &str,
    profiles: &[SignInProfile],
    check_secret: bool,
) -> Result<SelectedSignIn, NativeError> {
    let saved = check_secret && get_profile(id)?.is_some();
    let profile = profiles
        .iter()
        .find(|profile| profile.id == id)
        .cloned()
        .unwrap_or_else(|| SignInProfile {
            id: id.to_string(),
            label: "Unknown sign-in".to_string(),
            host: String::new(),
            username: String::new(),
        });
    Ok(SelectedSignIn { profile, saved })
}

fn legacy_for(destination: &str) -> Result<Option<LegacySignIn>, NativeError> {
    let Some((username, _)) = get_legacy(destination)? else {
        return Ok(None);
    };
    let Some(host) = host_of(destination) else {
        return Ok(None);
    };
    Ok(Some(LegacySignIn { host, username }))
}

fn migrate_legacy(
    destination: &str,
    username: &str,
    secret: &str,
) -> Result<SignInProfile, NativeError> {
    let host = host_of(destination).ok_or_else(|| {
        NativeError::new(
            "sync.credentials_need_https",
            "Paste a secret-free HTTPS git link before saving a sign-in.",
        )
    })?;
    let _update = lock_or_recover(&CATALOG_UPDATE);
    let mut catalog = load_catalog()?;
    let id = new_profile_id();
    store_profile(&id, username, secret)?;
    if get_profile(&id)?.is_none() {
        return Err(NativeError::new(
            "sync.credentials_unavailable",
            "Could not copy the saved sign-in into a named profile.",
        ));
    }
    let profile = SignInProfile {
        id,
        label: next_label(&catalog, &format!("{username}@{host}")),
        host,
        username: username.to_string(),
    };
    catalog.push(profile.clone());
    save_catalog(catalog)?;
    Ok(profile)
}

fn schedule_setup(
    app: &tauri::AppHandle,
    root_path: &str,
    destination: &str,
    profile_id: Option<String>,
) {
    let Ok(root) = crate::commands::workspace::resolve_workspace_root(root_path) else {
        eprintln!("[sync] git link saved but this folder could not be opened for a check");
        return;
    };
    let key = root.to_string_lossy().to_string();
    let Some(engine) = super::registry::engine(&key) else {
        eprintln!("[sync] git link saved; this folder's history is not being kept, so it was not checked yet");
        return;
    };
    super::registry::start_setup_round(
        app.clone(),
        &key,
        &engine,
        root,
        destination.to_string(),
        profile_id,
    );
}

fn new_profile_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0);
    let n = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("p{now:016x}{n:08x}")
}

fn load_catalog() -> Result<Vec<SignInProfile>, NativeError> {
    #[cfg(test)]
    {
        Ok(lock_or_recover(&CATALOG).clone().unwrap_or_default())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&CATALOG_FILE);
        let Some(path) = catalog_path() else {
            return Ok(Vec::new());
        };
        match std::fs::read_to_string(&path) {
            Ok(contents) => serde_json::from_str::<Catalog>(&contents)
                .map(|catalog| catalog.profiles)
                .map_err(|error| {
                    NativeError::with_details(
                        "sync.sign_in_catalog_unreadable",
                        "Could not read the list of saved sign-ins.",
                        error,
                    )
                }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
            Err(error) => Err(NativeError::with_details(
                "sync.sign_in_catalog_unreadable",
                "Could not read the list of saved sign-ins.",
                error,
            )),
        }
    }
}

fn save_catalog(profiles: Vec<SignInProfile>) -> Result<(), NativeError> {
    #[cfg(test)]
    {
        *lock_or_recover(&CATALOG) = Some(profiles);
        Ok(())
    }
    #[cfg(not(test))]
    {
        let _guard = lock_or_recover(&CATALOG_FILE);
        let Some(path) = catalog_path() else {
            return Err(NativeError::new(
                "sync.no_app_data",
                "Could not find where this app keeps its files.",
            ));
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| {
                NativeError::with_details(
                    "sync.sign_in_catalog_unwritable",
                    "Could not save the list of sign-ins.",
                    error,
                )
            })?;
        }
        let written = serde_json::to_string_pretty(&Catalog { profiles }).map_err(|error| {
            NativeError::with_details(
                "sync.sign_in_catalog_unwritable",
                "Could not save the list of sign-ins.",
                error,
            )
        })?;
        crate::commands::workspace::write_file_atomically(&path, format!("{written}\n")).map_err(
            |error| {
                NativeError::with_details(
                    "sync.sign_in_catalog_unwritable",
                    "Could not save the list of sign-ins.",
                    error,
                )
            },
        )
    }
}

#[cfg(not(test))]
fn catalog_path() -> Option<PathBuf> {
    Some(
        super::settle::settings_home()?
            .join("sync")
            .join("sign-in-profiles.json"),
    )
}

#[cfg(test)]
#[path = "sign_in_tests.rs"]
mod tests;
