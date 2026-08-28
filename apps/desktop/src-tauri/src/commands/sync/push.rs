//! Sending a pack to a remote — the half of git that gitoxide does not have.
//!
//! `gix-protocol` speaks `ls-refs` and `fetch` and nothing else, so there is no
//! push anywhere in the crate graph. What there *is* underneath it is the whole
//! transport: [`Service::ReceivePack`] renders as `git-receive-pack`, and the
//! HTTP transport is generic over the service, so authentication, redirects and
//! rustls all arrive without knowing what they are carrying.
//!
//! So this module is only the protocol on top of that: which objects the far
//! side is missing, a packfile carrying them, and reading what the server says
//! it did. See `plans/auto-sync/pending-send_pack-high-hard.md`.

use std::collections::BTreeSet;
use std::io::{BufRead, Write};

use gix::protocol::transport;
use transport::Service;
use transport::client::blocking_io::Transport as _;
use transport::client::{MessageKind, WriteMode};

use crate::error::NativeError;

use super::failed;
use super::remote_failure;
use super::remote_unreachable;
use super::snapshot;

/// The only pack version anything has spoken for twenty years.
const PACK_VERSION: u32 = 2;

/// What the remote did with the ref we asked it to move.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Landed {
    /// The remote's ref now points at what we sent.
    Moved,
    /// The remote moved underneath us, so it kept what it had.
    ///
    /// Not a fault: it is the far side saying someone else got there first, and
    /// the answer is to fetch, merge and come back — which the caller can only
    /// decide to do if this arrives as something other than an error.
    Refused { reason: String },
    /// The push could not be made at all, and the caller chose to carry on.
    ///
    /// Distinct from `Refused`, which is the remote answering. This is the push
    /// never landing — no write access, no credentials, no route — while
    /// everything before it succeeded. Only an import asks for this; a sync
    /// treats a failed push as a failure, because the user asked to send.
    ///
    /// Reachable only through [`super::round::PushPolicy::Optional`]. The
    /// frontend's `SyncLanded` union (`sync/historyTypes.ts`) deliberately
    /// models only `moved` and `refused`, which is accurate because `sync_now`
    /// always requires a push. If a command that returns `Synced` to the
    /// frontend ever opts into `Optional`, that union has to grow this variant
    /// first.
    NotSent { reason: String },
}

/// What one push carried and what became of it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sent {
    pub landed: Landed,
    /// How many objects the pack held.
    pub objects: usize,
}

/// The objects the remote needs in order to hold `tip`, given it already holds
/// `already`.
///
/// The commit walk does the excluding: hiding the remote's tip drops everything
/// reachable from it, so what remains is exactly the new history. Each of those
/// commits then contributes its tree and whatever a diff against its first
/// parent calls added or changed. A first push is not a special case — the root
/// commit's parent is the empty tree, so every object is named once.
///
/// First-parent diffs are enough even across a merge, because the walk decides
/// what is sent and the diff only decides what a commit adds to it: a merge's
/// second parent is either already on the remote or is itself in the walk.
///
/// `already` is a hint, not a promise. A remote can advertise a commit this
/// repository has never seen — that is precisely what a diverged remote looks
/// like — and there is nothing to exclude from a walk that cannot reach it.
pub fn carried(
    repo: &gix::Repository,
    tip: gix::ObjectId,
    already: Option<gix::ObjectId>,
) -> Result<Vec<gix::ObjectId>, NativeError> {
    fn history(message: &'static str, error: impl std::fmt::Display) -> NativeError {
        failed("sync.history_unreadable", message, error)
    }

    let known = already.filter(|id| repo.find_commit(*id).is_ok());
    let mut walk = repo.rev_walk(Some(tip));
    if let Some(known) = known {
        walk = walk.with_hidden(Some(known));
    }
    let commits = walk
        .all()
        .map_err(|error| history("Could not read this vault's history.", error))?;

    let mut seen = BTreeSet::new();
    let mut carried = Vec::new();
    let mut state = gix::diff::tree::State::default();

    for commit in commits {
        let commit = commit
            .map_err(|error| history("Could not read this vault's history.", error))?
            .id;
        let object = repo
            .find_commit(commit)
            .map_err(|error| history("Could not read this vault's history.", error))?;
        let tree = object
            .tree_id()
            .map_err(|error| history("Could not read a recorded state.", error))?
            .detach();
        let parent = object.parent_ids().next().map(|id| id.detach());

        for id in [commit, tree] {
            if seen.insert(id) {
                carried.push(id);
            }
        }
        for id in newly_reachable(repo, &mut state, parent, tree)? {
            if seen.insert(id) {
                carried.push(id);
            }
        }
    }

    Ok(carried)
}

/// Everything a commit's tree holds that its parent's did not.
///
/// Deletions are left out: a note that went away needs nothing sent for it. So
/// are gitlinks — a folder with a repository of its own is recorded as an entry
/// whose id names a commit in *that* repository, which this one has never had
/// and could not send. Real git skips them for the same reason; looking one up
/// here would fail the whole push over a folder nobody asked us to carry.
fn newly_reachable(
    repo: &gix::Repository,
    state: &mut gix::diff::tree::State,
    parent: Option<gix::ObjectId>,
    tree: gix::ObjectId,
) -> Result<Vec<gix::ObjectId>, NativeError> {
    use gix::diff::tree::recorder::Change;
    Ok(
        snapshot::changes_between(repo, state, snapshot::tree_of(repo, parent)?, tree)?
            .into_iter()
            .filter_map(|record| match record {
                Change::Addition {
                    entry_mode, oid, ..
                }
                | Change::Modification {
                    entry_mode, oid, ..
                } => (!entry_mode.is_commit()).then_some(oid),
                Change::Deletion { .. } => None,
            })
            .collect(),
    )
}

/// The bytes of a packfile carrying exactly `objects`, in order.
///
/// Every object goes out whole. Deltas would shrink a first push and save
/// almost nothing after it, because after the first push we only ever send what
/// changed since the last one.
///
/// The whole pack is materialised in memory before it is sent. That is fine for
/// the local-first notes workload this is built for (megabytes of markdown);
/// a vault carrying hundreds of megabytes of in-vault attachments would make a
/// first push hold a pack of similar size in RAM. Streaming the pack to the
/// transport, the way git does, is the hardening path if that ever becomes the
/// target.
pub fn pack(repo: &gix::Repository, objects: &[gix::ObjectId]) -> Result<Vec<u8>, NativeError> {
    let count = u32::try_from(objects.len()).map_err(|error| {
        failed(
            "sync.pack_failed",
            "There is more history here than one send can carry.",
            error,
        )
    })?;

    let mut out = Vec::new();
    out.extend_from_slice(b"PACK");
    out.extend_from_slice(&PACK_VERSION.to_be_bytes());
    out.extend_from_slice(&count.to_be_bytes());

    for id in objects {
        let object = repo.find_object(*id).map_err(|error| {
            failed(
                "sync.pack_failed",
                "Could not read something this vault's history needs.",
                error,
            )
        })?;
        entry_header(object.kind, object.data.len(), &mut out);

        let unsendable = |error: std::io::Error| {
            failed(
                "sync.pack_failed",
                "Could not prepare notes to send.",
                error,
            )
        };
        let mut deflated =
            flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
        deflated.write_all(&object.data).map_err(unsendable)?;
        out.extend_from_slice(&deflated.finish().map_err(unsendable)?);
    }

    let mut hasher = gix::hash::hasher(repo.object_hash());
    hasher.update(&out);
    let checksum = hasher.try_finalize().map_err(|error| {
        failed(
            "sync.pack_failed",
            "Could not prepare notes to send.",
            error,
        )
    })?;
    out.extend_from_slice(checksum.as_slice());

    Ok(out)
}

/// A pack entry's type and uncompressed size, in git's seven-bits-at-a-time
/// encoding: four size bits share the first byte with the type, and the high
/// bit says another byte follows.
fn entry_header(kind: gix::object::Kind, size: usize, out: &mut Vec<u8>) {
    let kind = match kind {
        gix::object::Kind::Commit => 1u8,
        gix::object::Kind::Tree => 2,
        gix::object::Kind::Blob => 3,
        gix::object::Kind::Tag => 4,
    };
    let mut byte = (kind << 4) | ((size & 0x0f) as u8);
    let mut rest = size >> 4;
    while rest > 0 {
        out.push(byte | 0x80);
        byte = (rest & 0x7f) as u8;
        rest >>= 7;
    }
    out.push(byte);
}

/// Moves `reference` on the remote at `destination` to `tip`.
pub fn send(
    repo: &gix::Repository,
    destination: &str,
    reference: &str,
    tip: gix::ObjectId,
) -> Result<Sent, NativeError> {
    let normalized = super::normalize_destination(destination);
    let url = gix::url::parse(gix::bstr::BStr::new(&normalized)).map_err(|error| {
        failed(
            "sync.remote_unreadable",
            "That does not look like a place notes can be synced to.",
            error,
        )
    })?;
    let mut transport = transport::client::blocking_io::connect::connect(
        url,
        transport::client::blocking_io::connect::Options {
            // Receive-pack has no version two; asking for one avoids a
            // downgrade round trip that some servers answer badly.
            version: transport::Protocol::V1,
            ..Default::default()
        },
    )
    .map_err(remote_unreachable)?;

    let greeting = gix::protocol::handshake(
        &mut transport,
        Service::ReceivePack,
        super::credentials::provide,
        Vec::new(),
        &mut gix::progress::Discard,
    )
    .map_err(handshake_failure)?;

    let dest_ref =
        advertised_head(greeting.refs.as_deref()).unwrap_or_else(|| reference.to_string());
    let null = gix::ObjectId::null(repo.object_hash());
    let old = greeting
        .refs
        .unwrap_or_default()
        .iter()
        .find_map(|known| match known {
            gix::protocol::handshake::Ref::Direct {
                full_ref_name,
                object,
            } if full_ref_name == dest_ref.as_str() => Some(*object),
            gix::protocol::handshake::Ref::Peeled {
                full_ref_name, tag, ..
            } if full_ref_name == dest_ref.as_str() => Some(*tag),
            _ => None,
        })
        .unwrap_or(null);

    if old == tip {
        return Ok(Sent {
            landed: Landed::Moved,
            objects: 0,
        });
    }

    if old != null && !builds_on(repo, old, tip) {
        return Ok(Sent {
            landed: Landed::Refused {
                reason: "the other end holds changes this device has not seen".to_string(),
            },
            objects: 0,
        });
    }

    let objects = carried(repo, tip, (old != null).then_some(old))?;
    let pack = pack(repo, &objects)?;

    let mut request = transport
        .request(WriteMode::Binary, MessageKind::Flush, false)
        .map_err(remote_unreachable)?;
    let sending = |error: std::io::Error| {
        failed(
            "sync.push_failed",
            "Could not send this vault's notes.",
            error,
        )
    };
    request
        .write_all(format!("{old} {tip} {dest_ref}\0report-status\n").as_bytes())
        .and_then(|()| request.write_message(MessageKind::Flush))
        .map_err(sending)?;

    // The commands are packet lines and the pack that follows them is not, so
    // the pack goes out through the raw half of the request.
    let (mut raw, mut report) = request.into_parts();
    raw.write_all(&pack)
        .and_then(|()| raw.flush())
        .map_err(sending)?;
    drop(raw);

    Ok(Sent {
        landed: read_report(&mut report, &dest_ref)?,
        objects: objects.len(),
    })
}

/// The branch HEAD names on the remote, so a nonstandard default is updated.
fn advertised_head(refs: Option<&[gix::protocol::handshake::Ref]>) -> Option<String> {
    refs?.iter().find_map(|known| match known {
        gix::protocol::handshake::Ref::Symbolic {
            full_ref_name,
            target,
            ..
        }
        | gix::protocol::handshake::Ref::Unborn {
            full_ref_name,
            target,
        } if full_ref_name == "HEAD" => Some(target.to_string()),
        _ => None,
    })
}

/// Whether what the remote holds is something this history already contains.
///
/// git's own client asks this rather than leaving it to the server, and so must
/// we: `receive.denyNonFastForwards` is off by default, so a server asked to
/// discard someone else's writing will simply do it. A tip we have never heard
/// of has no merge base with ours and is refused by the same rule, which is
/// right — it is a remote that moved somewhere we cannot see from here.
fn builds_on(repo: &gix::Repository, old: gix::ObjectId, tip: gix::ObjectId) -> bool {
    repo.merge_base(old, tip)
        .is_ok_and(|base| base.detach() == old)
}

fn handshake_failure(error: gix::protocol::handshake::Error) -> NativeError {
    match error {
        gix::protocol::handshake::Error::Credentials(_) => failed(
            "sync.credentials_unavailable",
            "Could not read the saved sign-in from this computer's keychain.",
            error,
        ),
        gix::protocol::handshake::Error::EmptyCredentials
        | gix::protocol::handshake::Error::InvalidCredentials { .. } => failed(
            "sync.credentials_invalid",
            "The username or access token was not accepted.",
            error,
        ),
        gix::protocol::handshake::Error::Transport(transport::client::Error::Io(error)) => {
            remote_failure(error)
        }
        error => remote_failure(error),
    }
}

/// What the server says it did, one status line per ref plus one for the pack.
///
/// A pack the server could not unpack is our fault and an error. A ref it would
/// not move is its own answer, and the caller's cue to fetch and merge.
fn read_report(
    report: &mut (impl BufRead + ?Sized),
    reference: &str,
) -> Result<Landed, NativeError> {
    let mut lines = Vec::new();
    let mut line = String::new();
    loop {
        line.clear();
        let read = report.read_line(&mut line).map_err(|error| {
            failed(
                "sync.push_failed",
                "Could not read what the other end did with these notes.",
                error,
            )
        })?;
        if read == 0 {
            break;
        }
        lines.push(line.trim_end().to_string());
    }

    if let Some(complaint) = lines
        .iter()
        .find_map(|line| line.strip_prefix("unpack ").filter(|rest| *rest != "ok"))
    {
        return Err(failed(
            "sync.push_failed",
            "The other end could not read the notes we sent.",
            complaint,
        ));
    }

    for line in &lines {
        if let Some(rest) = line.strip_prefix("ng ") {
            let (named, reason) = rest.split_once(' ').unwrap_or((rest, ""));
            if named != reference {
                continue;
            }
            return Ok(Landed::Refused {
                reason: if reason.is_empty() {
                    "the other end would not take it".to_string()
                } else {
                    reason.to_string()
                },
            });
        }
        if line
            .strip_prefix("ok ")
            .is_some_and(|named| named == reference)
        {
            return Ok(Landed::Moved);
        }
    }

    Err(failed(
        "sync.push_failed",
        "The other end did not say what it did with these notes.",
        lines.join("; "),
    ))
}

#[cfg(test)]
#[path = "push_tests.rs"]
mod tests;
