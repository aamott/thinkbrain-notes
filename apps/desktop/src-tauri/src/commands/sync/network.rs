use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::time::Duration;

use gix::bstr::ByteSlice;
use gix::remote::Direction;

use crate::error::NativeError;

use super::failed;
use super::remote_failure;

/// Where a fetched branch is put.
///
/// Deliberately outside `refs/heads/`, so nothing can mistake the other
/// device's work for our own history.
pub(super) const REMOTE_REF: &str = "refs/thinkbrain/remote";

/// How long one fetch or push may take.
///
/// Held across the per-workspace lane, so a hung remote must not pin that
/// lane forever — every later Sync Now on this vault queues behind it.
pub(super) const NETWORK: Duration = Duration::from_secs(90);

/// What a fetch learned: the full remote ref name it is bound to, and the
/// tip that ref advertised (`None` for an unborn or absent branch).
#[derive(Debug)]
pub(super) struct Fetched {
    /// Full `refs/heads/*` name. Push sends to exactly this.
    pub branch: String,
    pub tip: Option<gix::ObjectId>,
}

/// Brings the selected branch down, source-only: the refspec names only the
/// remote ref, so the fetch writes objects and reports the advertised OID but
/// moves no local ref. Publishing markers -- the durable source ref, the
/// branch binding, and `REMOTE_REF` -- is the caller's job, and only after the
/// fetched graph has been validated and retained. A worker that times out or
/// dies midway can therefore leave unreferenced pack objects at worst, never
/// a ref pointing at history that was not verified.
///
/// `selected` is the persisted remote branch (`refs/heads/*`). `None` asks
/// for the remote's symbolic HEAD exactly once -- the first sync of a new
/// link -- and reports which branch it discovered so the caller can persist
/// it; later fetches always arrive with the choice already made, so a remote
/// default that changes never silently retargets this workspace.
///
/// Uses git protocol v2 by default (gix default). If ref discovery fails on an
/// HTTPS remote that rejects v2 requests (e.g. Cloudflare / middleboxes
/// blocking v2 POSTs or servers without v2 support), retries once with protocol
/// v1 scoped strictly to an in-memory repository config clone. Semantic
/// history failures (`sync.git_history_*`, `sync.branch_*`) and cancellation
/// never retry: they are answers, not transport trouble.
pub(super) fn fetch(
    repo: &gix::Repository,
    destination: &str,
    cancel: &Arc<AtomicBool>,
    selected: Option<&str>,
) -> Result<Fetched, NativeError> {
    if let Some(selected) = selected {
        // A persisted branch name feeds a refspec verbatim; validate before
        // it reaches the wire.
        super::history_source::validate_branch(selected)?;
    }
    let hardened = repo_rejecting_shallow(repo)?;
    // Source-only: no `:REMOTE_REF` colon target, so nothing local moves and
    // no unadvertised fallback is fetched. The advertised OID and the remote's
    // symbolic HEAD both come back in the ref map.
    let spec = selected.unwrap_or("HEAD").to_string();
    match receive(&hardened, destination, cancel, &spec, selected) {
        Ok(result) => Ok(result),
        Err(error) => {
            if cancel.load(Ordering::Relaxed)
                || error.code.starts_with("sync.git_history_")
                || error.code.starts_with("sync.branch_")
            {
                return Err(error);
            }
            if let Some(v1_repo) = repo_with_protocol_v1(&hardened)
                && let Ok(result) = receive(&v1_repo, destination, cancel, &spec, selected)
            {
                return Ok(result);
            }
            Err(error)
        }
    }
}

/// An in-memory clone that refuses shallow remotes. A shallow source cannot
/// deliver a complete reachable graph, and the ref that would name it must
/// never point at truncated history. The setting is never persisted: it is a
/// fetch-time guard, not a repository preference.
fn repo_rejecting_shallow(repo: &gix::Repository) -> Result<gix::Repository, NativeError> {
    let mut cloned = repo.clone();
    let mut config = cloned.config_snapshot_mut();
    let prepare = |error: String| {
        failed(
            "sync.remote_unreachable",
            "Could not prepare to talk to the place these notes sync to.",
            error,
        )
    };
    config
        .set_raw_value("clone.rejectShallow", "true")
        .map_err(|error| prepare(error.to_string()))?;
    config
        .commit()
        .map_err(|error| prepare(error.to_string()))?;
    Ok(cloned)
}

fn repo_with_protocol_v1(repo: &gix::Repository) -> Option<gix::Repository> {
    let mut cloned = repo.clone();
    let mut config = cloned.config_snapshot_mut();
    config.set_raw_value("protocol.version", "1").ok()?;
    config.commit().ok()?;
    Some(cloned)
}

fn receive(
    repo: &gix::Repository,
    destination: &str,
    cancel: &Arc<AtomicBool>,
    spec: &str,
    selected: Option<&str>,
) -> Result<Fetched, NativeError> {
    let normalized = super::normalize_destination(destination);
    let remote = repo
        .remote_at(gix::bstr::BStr::new(&normalized))
        .map_err(remote_failure)?
        .with_refspecs([spec], Direction::Fetch)
        .map_err(remote_failure)?
        .with_fetch_tags(gix::remote::fetch::Tags::None);
    let connection = remote
        .connect(Direction::Fetch)
        .map_err(remote_failure)?
        .with_credentials(super::credentials::provide);
    // The ref list is *not* prefix-filtered by the refspec: "this remote has
    // refs, just not ours" and "this remote has nothing" are different
    // answers, and only the unfiltered handshake can tell them apart.
    let prepared = connection
        .prepare_fetch(
            gix::progress::Discard,
            gix::remote::ref_map::Options {
                prefix_from_spec_as_filter_on_remote: false,
                ..Default::default()
            },
        )
        .map_err(remote_failure)?;

    // The branch is decided from the advertised refs *before* any objects
    // move: discovery reads the symbolic/unborn HEAD, and a bound fetch checks
    // the remote actually has the branch rather than fetching a no-op and
    // letting push recreate it.
    let fetched = resolve(prepared.ref_map(), destination, selected)?;
    if prepared.ref_map().mappings.is_empty() {
        // Nothing advertised matched the refspec. When the handshake still
        // named a tip -- a branch discovered outside it -- there is history
        // but nothing to fetch it by; that is an actionable answer, not an
        // unpopulated one the caller would fail to find objects for.
        if fetched.tip.is_some() {
            return Err(NativeError::new(
                "sync.branch_unknown",
                "The remote's default branch could not be fetched. Check the link and try again.",
            ));
        }
        return Ok(fetched);
    }

    let brought = prepared.receive(gix::progress::Discard, cancel);
    match brought {
        Ok(_) => Ok(fetched),
        Err(
            error @ gix::remote::fetch::Error::Fetch(
                gix::protocol::fetch::Error::RejectShallowRemote,
            ),
        ) => Err(NativeError::with_details(
            "sync.git_history_incomplete",
            "This Git history is incomplete. Fetch its missing history and try again.",
            error,
        )),
        Err(error @ gix::remote::fetch::Error::IncompatibleObjectHash { .. }) => {
            Err(NativeError::with_details(
                "sync.git_history_unsupported",
                "This Git repository uses a history format ThinkBrain cannot import.",
                error,
            ))
        }
        Err(_) if cancel.load(Ordering::Relaxed) => Err(timed_out()),
        Err(error) => Err(remote_failure(error)),
    }
}

/// The advertised refs, read as (full name, object) pairs plus the symbolic
/// or unborn target HEAD names.
struct Advertised<'a> {
    /// HEAD's named target (`Symbolic`, or `Unborn` on a virgin remote).
    head: Option<String>,
    /// Every advertised ref that points at an object.
    born: Vec<&'a gix::protocol::handshake::Ref>,
    /// `remote_refs` slice the caller can still pattern-match on.
    refs: &'a [gix::protocol::handshake::Ref],
}

fn advertised(map: &gix::remote::fetch::RefMap) -> Advertised<'_> {
    let mut head = None;
    let mut born = Vec::new();
    for known in &map.remote_refs {
        use gix::protocol::handshake::Ref;
        match known {
            Ref::Symbolic {
                full_ref_name,
                target,
                ..
            }
            | Ref::Unborn {
                full_ref_name,
                target,
            } if full_ref_name == "HEAD" => head = Some(target.to_string()),
            Ref::Direct { .. } | Ref::Peeled { .. } | Ref::Symbolic { .. } => born.push(known),
            Ref::Unborn { .. } => {}
        }
    }
    Advertised {
        head,
        born,
        refs: &map.remote_refs,
    }
}

/// The OID `name` advertised, if it is a born ref.
fn advertised_id<'a>(
    refs: &'a [gix::protocol::handshake::Ref],
    name: &str,
) -> Option<gix::ObjectId> {
    refs.iter().find_map(|known| match known {
        gix::protocol::handshake::Ref::Direct {
            full_ref_name,
            object,
        }
        | gix::protocol::handshake::Ref::Peeled {
            full_ref_name,
            object,
            ..
        }
        | gix::protocol::handshake::Ref::Symbolic {
            full_ref_name,
            object,
            ..
        } if full_ref_name == name => Some(*object),
        _ => None,
    })
}

/// Turns the advertised refs into the branch/tip answer -- before any pack
/// arrives.
///
/// For a bound fetch (`selected`) the answer is the advertised OID of that
/// exact ref: missing on a populated remote is `sync.branch_missing`, never
/// something push may recreate. For discovery the branch name is the remote's
/// symbolic HEAD target -- never inferred by matching OIDs, which cannot pick
/// a branch when several advertise the same tip -- with the local-file
/// fallback for transports that do not advertise symrefs. `main` is the
/// default only when the remote names no target at all; an advertised unborn
/// default like `trunk` is preserved.
fn resolve(
    map: &gix::remote::fetch::RefMap,
    destination: &str,
    selected: Option<&str>,
) -> Result<Fetched, NativeError> {
    let advertised = advertised(map);
    let populated = !advertised.born.is_empty();

    if let Some(branch) = selected {
        return match advertised_id(advertised.refs, branch) {
            Some(tip) => Ok(Fetched {
                branch: branch.to_string(),
                tip: Some(tip),
            }),
            None if populated => Err(NativeError::new(
                "sync.branch_missing",
                "The remote no longer has the branch this workspace syncs. Check the link or recreate the branch.",
            )),
            // Nothing advertised but an unborn HEAD: a virgin remote, and the
            // bound branch is its to create.
            None => Ok(Fetched {
                branch: branch.to_string(),
                tip: None,
            }),
        };
    }

    // Discovery. A HEAD that names a branch the remote advertises is the
    // answer; one naming a branch the remote does *not* have, while other
    // branches exist, is a dangling default -- an actionable error, not a
    // guess.
    let branch = advertised.head.or_else(|| local_head_target(destination));
    if let Some(branch) = &branch {
        // HEAD may point at anything -- a tag, a detached oid, a symbolic
        // ref. Only a real `refs/heads/*` name may become the binding.
        super::history_source::validate_branch(branch)?;
    }
    match (branch, populated) {
        (Some(branch), _) => {
            let tip = advertised_id(advertised.refs, &branch);
            if tip.is_none() && populated {
                return Err(NativeError::new(
                    "sync.branch_unknown",
                    "The remote's default branch does not exist there. Check the link and try again.",
                ));
            }
            Ok(Fetched { branch, tip })
        }
        (None, false) => Ok(Fetched {
            branch: "refs/heads/main".to_string(),
            tip: None,
        }),
        (None, true) => Err(NativeError::new(
            "sync.branch_unknown",
            "Could not determine which branch the remote is on. Check the link and try again.",
        )),
    }
}

fn local_head_target(destination: &str) -> Option<String> {
    let path = destination.strip_prefix("file://").unwrap_or(destination);
    let repo = gix::open(path).ok()?;
    let head = repo.head().ok()?;
    Some(head.referent_name()?.as_bstr().to_str().ok()?.to_string())
}

fn timed_out() -> NativeError {
    NativeError::new(
        "sync.remote_timeout",
        "The other end took too long to answer.",
    )
}

/// Runs `work` on its own thread so a hung remote cannot pin the caller —
/// and therefore the per-workspace lane — past `limit`.
///
/// A panic inside `work` is caught so it surfaces as a distinct
/// `sync.internal_error` rather than a misleading `sync.remote_unreachable`
/// (a panic used to drop the sender, which the receiver reported as "could not
/// reach the remote"). The panic payload is logged — never any secret — and
/// the original error message is preserved in the log for debugging.
pub(super) fn bounded<T: Send + 'static>(
    limit: Duration,
    cancel: Arc<AtomicBool>,
    work: impl FnOnce() -> Result<T, NativeError> + Send + 'static,
) -> Result<T, NativeError> {
    let (tx, rx) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("thinkbrain-sync-io".into())
        .spawn(move || {
            // `AssertUnwindSafe`: the closure captures remote handles whose
            // `UnwindSafe` impls we do not control, but a sync is single-threaded
            // per workspace lane, so there is no concurrent mutation to corrupt.
            let outcome =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(work)).map_err(|panic| {
                    eprintln!("[sync] worker thread panicked: {panic:?}");
                    NativeError::new(
                        "sync.internal_error",
                        "An internal error occurred during sync.",
                    )
                });
            let _ = tx.send(outcome.and_then(|inner| inner));
        })
        .map_err(|error| {
            failed(
                "sync.remote_unreachable",
                "Could not reach the place these notes sync to.",
                error,
            )
        })?;
    match rx.recv_timeout(limit) {
        Ok(outcome) => outcome,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            cancel.store(true, Ordering::Relaxed);
            Err(timed_out())
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => Err(NativeError::new(
            "sync.remote_unreachable",
            "Could not reach the place these notes sync to.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::sync::test_support;
    use gix::protocol::handshake::Ref;

    fn oid() -> gix::ObjectId {
        gix::ObjectId::from_hex(b"1111111111111111111111111111111111111111").unwrap()
    }

    fn ref_map(refs: Vec<Ref>) -> gix::remote::fetch::RefMap {
        gix::remote::fetch::RefMap {
            mappings: vec![],
            refspecs: vec![],
            extra_refspecs: vec![],
            fixes: vec![],
            remote_refs: refs,
            object_hash: gix::hash::Kind::Sha1,
        }
    }

    fn symbolic(target: &str) -> Ref {
        Ref::Symbolic {
            full_ref_name: "HEAD".into(),
            target: target.into(),
            tag: None,
            object: oid(),
        }
    }

    fn direct(name: &str) -> Ref {
        Ref::Direct {
            full_ref_name: name.into(),
            object: oid(),
        }
    }

    #[test]
    fn a_head_naming_a_tag_is_not_a_branch_to_bind() {
        let map = ref_map(vec![symbolic("refs/tags/v1"), direct("refs/tags/v1")]);
        assert_eq!(
            resolve(&map, "/tmp/remote", None)
                .expect_err("a tag default is not a branch")
                .code,
            "sync.branch_unknown"
        );
    }

    #[test]
    fn an_unborn_default_keeps_its_own_name() {
        let map = ref_map(vec![Ref::Unborn {
            full_ref_name: "HEAD".into(),
            target: "refs/heads/trunk".into(),
        }]);
        let fetched = resolve(&map, "/tmp/remote", None).expect("unborn HEAD is the default");
        assert_eq!(fetched.branch, "refs/heads/trunk");
        assert_eq!(fetched.tip, None);
    }

    #[test]
    fn a_dangling_default_on_a_populated_remote_fails() {
        let map = ref_map(vec![
            Ref::Unborn {
                full_ref_name: "HEAD".into(),
                target: "refs/heads/gone".into(),
            },
            direct("refs/heads/other"),
        ]);
        assert_eq!(
            resolve(&map, "/tmp/remote", None)
                .expect_err("dangling default")
                .code,
            "sync.branch_unknown"
        );
    }

    #[test]
    fn a_missing_bound_branch_fails_only_when_the_remote_is_populated() {
        let populated = ref_map(vec![symbolic("refs/heads/main"), direct("refs/heads/main")]);
        assert_eq!(
            resolve(&populated, "/tmp/remote", Some("refs/heads/gone"))
                .expect_err("missing bound branch")
                .code,
            "sync.branch_missing"
        );
        let virgin = ref_map(vec![Ref::Unborn {
            full_ref_name: "HEAD".into(),
            target: "refs/heads/main".into(),
        }]);
        let fetched =
            resolve(&virgin, "/tmp/remote", Some("refs/heads/work")).expect("virgin remote");
        assert_eq!(fetched.branch, "refs/heads/work");
        assert_eq!(fetched.tip, None);
    }

    #[test]
    fn an_invalid_selected_branch_never_reaches_the_network() {
        let fixture = test_support::repo_fixture("bad-branch", "network");
        let cancel = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        assert_eq!(
            fetch(
                &fixture.repo,
                "/nonexistent/remote",
                &cancel,
                Some("refs/tags/v1")
            )
            .expect_err("invalid branch")
            .code,
            "sync.branch_unknown"
        );
    }

    #[test]
    fn protocol_v1_fallback_does_not_mutate_on_disk_config() {
        let fixture = test_support::repo_fixture("v1-fallback", "network");
        let on_disk_config_path = fixture.repo.git_dir().join("config");
        let initial_config =
            std::fs::read_to_string(&on_disk_config_path).expect("config file exists");
        assert!(!initial_config.contains("protocol.version"));

        let v1_repo = repo_with_protocol_v1(&fixture.repo).expect("in-memory clone succeeds");
        let config_snapshot = v1_repo.config_snapshot();
        let version = config_snapshot
            .string("protocol.version")
            .map(|s| s.to_string());
        assert_eq!(version.as_deref(), Some("1"));

        // Confirm the config file on disk was not touched
        let disk_after = std::fs::read_to_string(&on_disk_config_path).expect("config exists");
        assert!(!disk_after.contains("protocol.version"));
        assert_eq!(initial_config, disk_after);
    }
}
