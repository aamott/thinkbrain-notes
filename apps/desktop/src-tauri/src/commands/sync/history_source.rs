//! Which imported source feeds the history reader, and which branch a linked
//! remote syncs.
//!
//! Both answers live in one versioned JSON file inside the hidden repository
//! (`git_dir`, never the vault): the active source-ref identity, and per-source
//! branch bindings so a sync keeps using the branch it started with even when
//! the remote's default moves. The file is rewritten atomically by callers
//! already holding the workspace lane, and read freely by anything that only
//! needs to know which history is this workspace's.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::NativeError;

use super::failed;
use super::history_ingest;

/// The metadata file, inside the hidden repository's `git_dir`.
const FILE: &str = "thinkbrain-sources.json";
const VERSION: u32 = 1;

/// The persisted selection: which source is active and what each is bound to.
#[derive(Debug, Default, Serialize, Deserialize)]
struct Meta {
    version: u32,
    /// The source ref the history reader last selected. Kept so a vanished
    /// source still names its retained history rather than going blank.
    #[serde(skip_serializing_if = "Option::is_none")]
    active: Option<String>,
    /// Branch bindings per source ref identity.
    #[serde(default)]
    bindings: BTreeMap<String, Binding>,
}

/// What one source syncs with.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct Binding {
    /// The checked-out local branch (full `refs/heads/*` name) for a clone.
    #[serde(skip_serializing_if = "Option::is_none")]
    local: Option<String>,
    /// The remote branch (full `refs/heads/*` name) fetches and pushes use.
    #[serde(skip_serializing_if = "Option::is_none")]
    remote: Option<String>,
}

fn unreadable(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.branch_source_failed",
        "Could not read this workspace's saved history source. Check app-data access and try again.",
        error,
    )
}

/// Whether `name` is a full `refs/heads/*` branch name -- the only thing a
/// binding, an upstream, or a discovered default may ever name. Anything
/// else (a tag, a bare `main`, a symbolic alias) would push into the wrong
/// namespace, so it is an actionable error rather than a fallback to `main`.
pub(super) fn validate_branch(name: &str) -> Result<(), NativeError> {
    if name.starts_with("refs/heads/") && gix::refs::FullName::try_from(name).is_ok() {
        return Ok(());
    }
    Err(NativeError::new(
        "sync.branch_unknown",
        "The remote does not advertise a usable branch name. Check the link and try again.",
    ))
}

/// Whether `name` is one of our imported-source refs -- never a retained
/// archive ref and never anything outside `refs/thinkbrain/sources/`.
fn validate_source(name: &str) -> Result<(), NativeError> {
    if name.starts_with(history_ingest::SOURCE_REF_PREFIX)
        && !name.contains("/retained/")
        && gix::refs::FullName::try_from(name).is_ok()
    {
        return Ok(());
    }
    Err(unreadable(format!(
        "{name} is not a history source this workspace knows"
    )))
}

fn unwritable(error: impl std::fmt::Display) -> NativeError {
    failed(
        "sync.branch_source_failed",
        "Could not remember which history this workspace syncs with.",
        error,
    )
}

fn load(repo: &gix::Repository) -> Result<Meta, NativeError> {
    let path = repo.git_dir().join(FILE);
    let bytes = match std::fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Meta {
                version: VERSION,
                ..Meta::default()
            });
        }
        Err(error) => return Err(unreadable(error)),
    };
    let meta: Meta = serde_json::from_slice(&bytes).map_err(unreadable)?;
    if meta.version != VERSION {
        return Err(unreadable(format!(
            "version {} of {FILE} is not one this build reads",
            meta.version
        )));
    }
    // Stored names are used verbatim as ref names and refspecs, so validate
    // them rather than trusting a corrupt file to name something sensible.
    let check = |result: Result<(), NativeError>| {
        result.map_err(|_| unreadable(format!("{FILE} names a ref it should not")))
    };
    if let Some(active) = meta.active.as_deref() {
        check(validate_source(active))?;
    }
    for (source, binding) in &meta.bindings {
        check(validate_source(source))?;
        if let Some(local) = binding.local.as_deref() {
            check(validate_branch(local))?;
        }
        if let Some(remote) = binding.remote.as_deref() {
            check(validate_branch(remote))?;
        }
    }
    Ok(meta)
}

fn store(repo: &gix::Repository, meta: &Meta) -> Result<(), NativeError> {
    let contents = serde_json::to_vec_pretty(meta).map_err(unwritable)?;
    super::write_atomically(
        repo.git_dir().join(FILE).as_path(),
        contents,
        "sync.branch_source_failed",
        "Could not remember which history this workspace syncs with.",
    )
}

/// The tip of the imported source the history reader should walk, if any.
///
/// A configured link is canonical: only its destination-hashed source ref is
/// the source -- a link just configured but never fetched yet means *no*
/// imported source, never a stale stand-in from a previous link. Without a
/// link the workspace's own imported `.git` is the source, and only when that
/// is gone does the last active source stand in, so imported history stays
/// readable after a vanishing source.
pub fn selected_source(
    repo: &gix::Repository,
    link: Option<&str>,
) -> Result<Option<gix::ObjectId>, NativeError> {
    match link {
        Some(destination) => tip_of(repo, &history_ingest::remote_source_ref(destination)),
        None => {
            if let Some(tip) = tip_of(repo, history_ingest::WORKSPACE_SOURCE_REF)? {
                return Ok(Some(tip));
            }
            if let Some(active) = load(repo)?.active {
                return tip_of(repo, &active);
            }
            Ok(None)
        }
    }
}

/// Remembers `reference` as the source history reads.
///
/// Called after a source ref is retained, never speculatively: activation
/// follows the same "only once the graph is durable" rule the refs do.
pub fn activate(repo: &gix::Repository, reference: &str) -> Result<(), NativeError> {
    validate_source(reference)?;
    let mut meta = load(repo)?;
    if meta.active.as_deref() == Some(reference) {
        return Ok(());
    }
    meta.active = Some(reference.to_string());
    store(repo, &meta)
}

/// The remote branch `source` is bound to, if one was selected already.
#[cfg(test)]
pub fn bound_remote(repo: &gix::Repository, source: &str) -> Result<Option<String>, NativeError> {
    Ok(binding(repo, source)?.1)
}

/// The local branch `source` was bound to, if the workspace is a clone.
#[cfg(test)]
pub fn bound_local(repo: &gix::Repository, source: &str) -> Result<Option<String>, NativeError> {
    Ok(binding(repo, source)?.0)
}

/// Both halves of `source`'s binding — local checkout, remote branch — from
/// one read of the file, so a caller needing both cannot see them change
/// between two loads.
pub fn binding(
    repo: &gix::Repository,
    source: &str,
) -> Result<(Option<String>, Option<String>), NativeError> {
    let Some(binding) = load(repo)?.bindings.get(source).cloned() else {
        return Ok((None, None));
    };
    Ok((binding.local, binding.remote))
}

/// Persists `source`'s binding. The remote branch is what fetch and push use
/// forever after; the local branch is the clone checkout they are checked
/// against, when the workspace has one.
pub fn bind(
    repo: &gix::Repository,
    source: &str,
    local: Option<String>,
    remote: &str,
) -> Result<(), NativeError> {
    // The binding is written verbatim and trusted verbatim later, so nothing
    // unvalidated reaches the file in the first place.
    validate_source(source)?;
    validate_branch(remote)?;
    if let Some(local) = local.as_deref() {
        validate_branch(local)?;
    }
    let mut meta = load(repo)?;
    let binding = Binding {
        local,
        remote: Some(remote.to_string()),
    };
    // An unchanged binding writes nothing -- otherwise every sync round
    // rewrites the file atomically to persist the same bytes.
    if meta.bindings.get(source) == Some(&binding) {
        return Ok(());
    }
    meta.bindings.insert(source.to_string(), binding);
    store(repo, &meta)
}

/// The branch the vault's own `.git` has checked out, as a full ref name.
///
/// `Ok(None)` means there is no own repository, and an unborn HEAD answers
/// with its named branch -- the ref the first commit will create. A detached
/// HEAD is an error:
/// the clone is pointing at history no branch name can fetch or push to, and
/// silently picking one would write to a branch the user is not on.
pub fn checkout_branch(vault: &Path) -> Result<Option<String>, NativeError> {
    match std::fs::symlink_metadata(vault.join(".git")) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(unreadable(error)),
    }
    let source = gix::open(vault).map_err(unreadable)?;
    let head = source.head().map_err(unreadable)?;
    if head.is_detached() {
        return Err(NativeError::new(
            "sync.branch_detached",
            "This workspace's Git repository is not on a branch. Check out its branch before syncing.",
        ));
    }
    let Some(name) = head.referent_name() else {
        return Ok(None);
    };
    Ok(Some(name.as_bstr().to_string()))
}

/// Whether the vault's own checkout still matches `expected`, the branch this
/// workspace's link was bound to. Detached or switched checkouts block the
/// sync -- never the history, which keeps its own imported copy.
pub fn require_checkout(vault: &Path, expected: Option<&str>) -> Result<(), NativeError> {
    let Some(current) = checkout_branch(vault)? else {
        return Ok(());
    };
    if let Some(expected) = expected {
        if current != expected {
            return Err(NativeError::new(
                "sync.branch_changed",
                "This workspace's Git repository is on a different branch than the one its sync link uses. Check out the bound branch or update the link.",
            ));
        }
    }
    Ok(())
}

/// The remote branch a clone's checked-out branch should sync with.
///
/// The upstream is honored only when the upstream's remote URL is this
/// workspace's configured link -- an upstream pointing at someone else's fork
/// is not where these notes go. Otherwise the remote branch carries the same
/// name as the checkout.
pub fn remote_branch_for(vault: &Path, destination: &str) -> Result<String, NativeError> {
    let source = gix::open(vault).map_err(unreadable)?;
    let checkout = checkout_branch(vault)?
        .ok_or_else(|| unreadable("the workspace repository has no branch checked out"))?;
    let Some(short) = checkout.strip_prefix("refs/heads/") else {
        return Err(unreadable(format!("{checkout} is not a branch")));
    };

    let config = source.config_snapshot();
    let upstream = config
        .string(&format!("branch.{short}.remote"))
        .and_then(|remote| {
            let url = config.string(&format!("remote.{}.url", remote.to_string()))?;
            (super::normalize_destination(&url.to_string())
                == super::normalize_destination(destination))
            .then(|| {
                config
                    .string(&format!("branch.{short}.merge"))
                    .map(|merge| merge.to_string())
            })
            .flatten()
        });

    // Whatever the answer -- upstream `merge` name or the checkout itself --
    // it must be a full branch ref before it can be bound or sent.
    let branch = upstream.unwrap_or(checkout);
    validate_branch(&branch)?;
    Ok(branch)
}

/// What `reference` currently names, if it resolves to a commit.
fn tip_of(repo: &gix::Repository, reference: &str) -> Result<Option<gix::ObjectId>, NativeError> {
    super::snapshot::try_head_of(repo, reference).map_err(unreadable)
}

#[cfg(test)]
#[path = "history_source_tests.rs"]
mod tests;
