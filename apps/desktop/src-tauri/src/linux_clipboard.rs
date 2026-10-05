//! Linux file clipboard.
//!
//! A file copy on Linux is not one payload but two, offered under one
//! selection owner:
//!
//! - `text/uri-list` — RFC 2483 `file://` URIs, the oldest file format.
//! - `x-special/gnome-copied-files` — the same URIs behind a `copy`/`cut`
//!   verb line, which is the *only* format GTK file managers (Nautilus,
//!   Nemo, Thunar) read for paste. `text/uri-list` alone pastes nothing
//!   there — which is exactly why `arboard`'s `file_list`, which writes
//!   only that one format, produced a copy no file manager would take.
//!
//! Two backends:
//! - Wayland: `wl-clipboard-rs` offers both mime types in one `copy_multi`
//!   and forks its own serving process, so no state is kept here.
//! - X11: an owner must serve `SelectionRequest` events for as long as it
//!   claims the selection, so a dedicated thread holds the connection, the
//!   payloads, and the request loop. `x11rb` is already a transitive
//!   dependency via `arboard`.
//!
//! Only compiled on non-Android unix (see Cargo.toml target gating).

use percent_encoding::{AsciiSet, CONTROLS, percent_encode};

use crate::NativeError;

/// Bytes that may not appear raw in a `file://` URI — controls plus the
/// ASCII characters the RFC reserves or that common parsers break on.
const URI_ENCODE_SET: &AsciiSet = &CONTROLS
    .add(b' ')
    .add(b'"')
    .add(b'#')
    .add(b'%')
    .add(b'<')
    .add(b'>')
    .add(b'?')
    .add(b'`')
    .add(b'{')
    .add(b'}');

/// Each path percent-encoded to a `file://` URI.
fn file_uris(paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .map(|path| format!("file://{}", percent_encode(path.as_bytes(), URI_ENCODE_SET)))
        .collect()
}

/// `file://` URIs joined as `text/uri-list` wants them (CRLF-separated).
fn uri_list(paths: &[String]) -> Vec<u8> {
    file_uris(paths).join("\r\n").into_bytes()
}

/// The GTK copy verb plus newline-separated URIs, for gnome-copied-files.
fn gnome_copied(paths: &[String]) -> Vec<u8> {
    format!("copy\n{}", file_uris(paths).join("\n")).into_bytes()
}

/// Places `paths` on the system clipboard as a file copy.
///
/// Dispatches by session: Wayland when `WAYLAND_DISPLAY` is set, X11
/// otherwise. A failed Wayland write falls back to X11 when `DISPLAY` is
/// also present — an XWayland-only environment can report both.
pub fn copy_files_to_clipboard(paths: &[String]) -> Result<(), NativeError> {
    if paths.is_empty() {
        return Err(NativeError::new(
            "clipboard.no_files",
            "Nothing to copy to the clipboard.",
        ));
    }
    let uri = uri_list(paths);
    let gnome = gnome_copied(paths);
    if std::env::var_os("WAYLAND_DISPLAY").is_some() {
        match wayland::set(&uri, &gnome) {
            Err(err) if std::env::var_os("DISPLAY").is_some() => {
                eprintln!("[clipboard] wayland write failed, trying X11: {err}");
            }
            result => return result,
        }
    }
    x11::set(uri, gnome)
}

// ---- Wayland: wl-clipboard-rs serves the offer itself ----

mod wayland {
    use wl_clipboard_rs::copy::{ClipboardType, MimeSource, MimeType, Options, Source};

    use crate::NativeError;
    use crate::error::failed;

    pub fn set(uri_list: &[u8], gnome_copied: &[u8]) -> Result<(), NativeError> {
        let mut options = Options::new();
        options.clipboard(ClipboardType::Regular);
        options
            .copy_multi(
                [
                    ("text/uri-list", uri_list),
                    ("x-special/gnome-copied-files", gnome_copied),
                ]
                .into_iter()
                .map(|(mime, bytes)| MimeSource {
                    source: Source::Bytes(bytes.to_vec().into_boxed_slice()),
                    mime_type: MimeType::Specific(mime.to_string()),
                })
                .collect(),
            )
            .map_err(|error| failed("clipboard.set_failed", "Could not copy the file.", error))
    }
}

// ---- X11: a background thread owns the selection and serves requests ----

mod x11 {
    use std::sync::OnceLock;
    use std::sync::mpsc::{Receiver, Sender, channel};
    use std::time::Duration;

    use x11rb::atom_manager;
    use x11rb::connection::Connection;
    use x11rb::errors::ReplyError;
    use x11rb::protocol::Event;
    use x11rb::protocol::xproto::{
        Atom, AtomEnum, ConnectionExt as _, CreateWindowAux, EventMask, GetPropertyReply, PropMode,
        SELECTION_NOTIFY_EVENT, SelectionNotifyEvent, SelectionRequestEvent, Timestamp,
        WindowClass,
    };
    use x11rb::rust_connection::RustConnection;
    use x11rb::wrapper::ConnectionExt as _;
    use x11rb::{COPY_DEPTH_FROM_PARENT, COPY_FROM_PARENT, CURRENT_TIME};

    use crate::NativeError;
    use crate::error::failed;

    atom_manager! {
        Atoms: AtomCookie {
            CLIPBOARD,
            TARGETS,
            TIMESTAMP,
            MULTIPLE,
            URI_LIST: b"text/uri-list",
            GNOME_COPIED: b"x-special/gnome-copied-files",
        }
    }

    /// The two payloads a file copy is: (uri-list bytes, gnome-copied bytes).
    type FilePayloads = (Vec<u8>, Vec<u8>);

    /// Connecting or spawning failed — remembered so every call reports the
    /// same typed error instead of retrying a thread that cannot exist.
    static SERVER: OnceLock<Result<Sender<FilePayloads>, String>> = OnceLock::new();

    pub fn set(uri_list: Vec<u8>, gnome_copied: Vec<u8>) -> Result<(), NativeError> {
        let server = SERVER.get_or_init(start_server).as_ref().map_err(|error| {
            NativeError::new(
                "clipboard.unavailable",
                format!("Could not open the X11 clipboard: {error}"),
            )
        })?;
        server
            .send((uri_list, gnome_copied))
            .map_err(|error| failed("clipboard.set_failed", "Could not copy the file.", error))
    }

    /// Spawns the owner thread and blocks only until it has connected — a
    /// desktop without a display reports the failure here, not as a silent
    /// write into a channel nobody drains.
    fn start_server() -> Result<Sender<FilePayloads>, String> {
        let (tx, rx) = channel::<FilePayloads>();
        let (ready_tx, ready_rx) = channel::<Result<(), String>>();
        std::thread::Builder::new()
            .name("x11-clipboard".to_string())
            .spawn(move || match RustConnection::connect(None) {
                Ok((conn, screen_num)) => {
                    let _ = ready_tx.send(Ok(()));
                    run(conn, screen_num, rx);
                }
                Err(error) => {
                    let _ = ready_tx.send(Err(error.to_string()));
                }
            })
            .map_err(|error| error.to_string())?;
        ready_rx
            .recv()
            .map_err(|error| error.to_string())?
            .map(|()| tx)
    }

    /// The serving loop: own CLIPBOARD, answer SelectionRequest events, and
    /// re-assert ownership whenever a new payload arrives. Fatal errors are
    /// returned rather than logged so the single boundary in `run` reports
    /// them with the connection's context.
    fn run(conn: RustConnection, screen_num: usize, rx: Receiver<FilePayloads>) {
        if let Err(error) = serve(&conn, screen_num, rx) {
            eprintln!("[clipboard] {error}");
        }
    }

    fn serve(
        conn: &RustConnection,
        screen_num: usize,
        rx: Receiver<FilePayloads>,
    ) -> Result<(), String> {
        let root = conn.setup().roots[screen_num].root;
        let atoms = Atoms::new(conn)
            .map_err(ReplyError::from)
            .and_then(|cookie| cookie.reply())
            .map_err(|error| format!("could not intern X11 atoms: {error}"))?;
        let win = conn
            .generate_id()
            .map_err(|error| format!("could not allocate an X11 window: {error}"))?;
        conn.create_window(
            COPY_DEPTH_FROM_PARENT,
            win,
            root,
            0,
            0,
            1,
            1,
            0,
            WindowClass::INPUT_OUTPUT,
            COPY_FROM_PARENT,
            &CreateWindowAux::new(),
        )
        .map_err(|error| format!("could not create the X11 clipboard window: {error}"))?;

        let mut formats: Vec<(Atom, Vec<u8>)> = Vec::new();
        let mut owned_time: Timestamp = CURRENT_TIME;
        loop {
            // New payloads re-assert ownership before the next request is
            // served — a paste must always see the latest copy.
            while let Ok((uri, gnome)) = rx.try_recv() {
                formats = vec![(atoms.URI_LIST, uri), (atoms.GNOME_COPIED, gnome)];
                owned_time = CURRENT_TIME;
                conn.set_selection_owner(win, atoms.CLIPBOARD, owned_time)
                    .map_err(|error| format!("could not claim the X11 selection: {error}"))?;
            }
            conn.flush()
                .map_err(|error| format!("X11 connection lost: {error}"))?;
            match conn.poll_for_event() {
                Ok(Some(Event::SelectionRequest(event))) => {
                    serve_request(conn, &atoms, &formats, owned_time, event);
                }
                // Another owner took the selection (e.g. a text copy in some
                // other app). The payloads stay — the next copy re-claims.
                Ok(_) => {}
                Err(error) => return Err(format!("X11 event error: {error}")),
            }
            // The channel has no wakeup, so poll: clipboard traffic is
            // rare enough that 25ms of latency is invisible.
            std::thread::sleep(Duration::from_millis(25));
        }
    }

    /// Writes one target's data onto the requestor's property. Returns
    /// whether the request could be fulfilled — the caller turns `false`
    /// into a refused SelectionNotify.
    fn serve_target(
        conn: &RustConnection,
        atoms: &Atoms,
        formats: &[(Atom, Vec<u8>)],
        owned_time: Timestamp,
        requestor: u32,
        target: Atom,
        property: Atom,
    ) -> bool {
        let result = if target == atoms.TARGETS {
            let mut offered: Vec<u32> = vec![atoms.TARGETS, atoms.MULTIPLE, atoms.TIMESTAMP];
            offered.extend(formats.iter().map(|(atom, _)| *atom));
            conn.change_property32(
                PropMode::REPLACE,
                requestor,
                property,
                AtomEnum::ATOM,
                &offered,
            )
        } else if target == atoms.TIMESTAMP {
            conn.change_property32(
                PropMode::REPLACE,
                requestor,
                property,
                AtomEnum::INTEGER,
                &[owned_time],
            )
        } else if let Some((_, bytes)) = formats.iter().find(|(atom, _)| *atom == target) {
            conn.change_property8(PropMode::REPLACE, requestor, property, target, bytes)
        } else {
            return false;
        };
        if let Err(error) = result {
            eprintln!("[clipboard] could not answer a selection request: {error}");
            return false;
        }
        true
    }

    /// Converts a MULTIPLE request: a list of (target, property) atom pairs
    /// the requestor wants filled in one round trip. Unfillable pairs get
    /// their property zeroed to NONE inside the same reply.
    fn serve_multiple(
        conn: &RustConnection,
        atoms: &Atoms,
        formats: &[(Atom, Vec<u8>)],
        owned_time: Timestamp,
        requestor: u32,
        property: Atom,
    ) -> bool {
        let reply: GetPropertyReply = match conn
            .get_property(false, requestor, property, AtomEnum::ATOM, 0, u32::MAX)
            .map_err(Into::into)
            .and_then(|cookie| cookie.reply())
        {
            Ok(reply) => reply,
            Err(error) => {
                eprintln!("[clipboard] could not read a MULTIPLE request: {error}");
                return false;
            }
        };
        let Some(pairs) = reply.value32() else {
            return false;
        };
        let mut values: Vec<u32> = pairs.collect();
        for chunk in values.chunks_exact_mut(2) {
            let (target, prop) = (chunk[0], chunk[1]);
            if !serve_target(conn, atoms, formats, owned_time, requestor, target, prop) {
                chunk[1] = u32::from(AtomEnum::NONE);
            }
        }
        if let Err(error) = conn.change_property32(
            PropMode::REPLACE,
            requestor,
            property,
            AtomEnum::ATOM,
            &values,
        ) {
            eprintln!("[clipboard] could not answer a MULTIPLE request: {error}");
            return false;
        }
        true
    }

    /// Answers one SelectionRequest event with a filled property or a refusal.
    fn serve_request(
        conn: &RustConnection,
        atoms: &Atoms,
        formats: &[(Atom, Vec<u8>)],
        owned_time: Timestamp,
        event: SelectionRequestEvent,
    ) {
        // Obsolete clients send property = NONE, meaning "use the target".
        let property = if event.property == Atom::from(AtomEnum::NONE) {
            event.target
        } else {
            event.property
        };
        let fulfilled = if event.target == atoms.MULTIPLE {
            serve_multiple(conn, atoms, formats, owned_time, event.requestor, property)
        } else {
            serve_target(
                conn,
                atoms,
                formats,
                owned_time,
                event.requestor,
                event.target,
                property,
            )
        };
        let notify = SelectionNotifyEvent {
            response_type: SELECTION_NOTIFY_EVENT,
            sequence: 0,
            time: event.time,
            requestor: event.requestor,
            selection: event.selection,
            target: event.target,
            property: if fulfilled {
                event.property
            } else {
                AtomEnum::NONE.into()
            },
        };
        if let Err(error) = conn.send_event(false, event.requestor, EventMask::NO_EVENT, notify) {
            eprintln!("[clipboard] could not notify a selection requestor: {error}");
        }
    }

    #[cfg(test)]
    mod tests {
        use super::super::{gnome_copied, uri_list};
        use super::*;
        use std::time::Instant;

        /// Requests `target` on CLIPBOARD from whoever owns it — a second
        /// connection exercises the serving thread exactly as a file
        /// manager's paste would.
        fn request_format(target: Atom) -> Option<Vec<u8>> {
            let (conn, screen_num) = RustConnection::connect(None).ok()?;
            let win = conn.generate_id().ok()?;
            conn.create_window(
                COPY_DEPTH_FROM_PARENT,
                win,
                conn.setup().roots[screen_num].root,
                0,
                0,
                1,
                1,
                0,
                WindowClass::INPUT_OUTPUT,
                COPY_FROM_PARENT,
                &CreateWindowAux::new(),
            )
            .ok()?;
            let atoms = Atoms::new(&conn).ok()?.reply().ok()?;
            let property = conn
                .intern_atom(false, b"TN_CLIPBOARD_TEST")
                .ok()?
                .reply()
                .ok()?
                .atom;
            conn.convert_selection(win, atoms.CLIPBOARD, target, property, CURRENT_TIME)
                .ok()?;
            conn.flush().ok()?;
            let deadline = Instant::now() + Duration::from_secs(2);
            loop {
                match conn.poll_for_event() {
                    Ok(Some(Event::SelectionNotify(notify))) => {
                        if notify.property == Atom::from(AtomEnum::NONE) {
                            return None;
                        }
                        return conn
                            .get_property(true, win, property, AtomEnum::ANY, 0, u32::MAX)
                            .ok()?
                            .reply()
                            .ok()
                            .map(|reply| reply.value);
                    }
                    Ok(_) if Instant::now() < deadline => {
                        std::thread::sleep(Duration::from_millis(10));
                    }
                    _ => return None,
                }
            }
        }

        /// End-to-end on a real display: claim the selection, then read both
        /// formats back through a second connection. Skipped headless.
        #[test]
        fn serves_uri_list_and_gnome_copied_on_x11() {
            if std::env::var_os("DISPLAY").is_none() {
                return;
            }
            let paths = vec![String::from("/tmp/tn-clip α.md")];
            set(uri_list(&paths), gnome_copied(&paths)).expect("X11 clipboard write failed");
            // Give the serving thread a poll cycle to claim ownership.
            std::thread::sleep(Duration::from_millis(100));
            let (conn, _) = RustConnection::connect(None).expect("no display");
            let atoms = Atoms::new(&conn)
                .expect("could not intern atoms")
                .reply()
                .expect("could not intern atoms");

            let uri = request_format(atoms.URI_LIST).expect("text/uri-list not served");
            assert_eq!(uri, b"file:///tmp/tn-clip%20%CE%B1.md".to_vec());

            let gnome = request_format(atoms.GNOME_COPIED).expect("gnome-copied-files not served");
            assert_eq!(gnome, b"copy\nfile:///tmp/tn-clip%20%CE%B1.md".to_vec());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{gnome_copied, uri_list};

    #[test]
    fn uri_list_percent_encodes_and_joins_with_crlf() {
        let payload = uri_list(&[String::from("/tmp/a b.md"), String::from("/tmp/café#1.md")]);
        assert_eq!(
            payload,
            b"file:///tmp/a%20b.md\r\nfile:///tmp/caf%C3%A9%231.md".to_vec()
        );
    }

    #[test]
    fn gnome_payload_carries_the_copy_verb() {
        let payload = gnome_copied(&[String::from("/tmp/a.md"), String::from("/tmp/b.md")]);
        assert_eq!(
            payload,
            b"copy\nfile:///tmp/a.md\nfile:///tmp/b.md".to_vec()
        );
    }

    #[test]
    fn copy_rejects_an_empty_list() {
        let err = super::copy_files_to_clipboard(&[]).unwrap_err();
        assert_eq!(err.code, "clipboard.no_files");
    }
}
